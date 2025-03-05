from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
from dotenv import load_dotenv
import os
import json
import logging
import io
import google.generativeai as genai  # Add this import

load_dotenv()
app = FastAPI()

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Configure Google Gemini
genai.configure(api_key=os.getenv('GEMINI_API_KEY'))
generation_config = {
    "temperature": 0.2,
    "top_p": 0.8,
    "top_k": 40
}

# Enable CORS with broader settings
origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "*"  # Be cautious with this in production
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def split_text(text, max_length=450):
    """Split text into chunks of max_length characters."""
    chunks = []
    for i in range(0, len(text), max_length):
        chunks.append(text[i:i + max_length])
    return chunks

async def translate_with_gemini(text: str, target_language: str) -> str:
    """Translate text using Google Gemini API"""
    try:
        logger.info(f"Translating with Gemini to {target_language}")
        
        model = genai.GenerativeModel('gemini-pro', generation_config=generation_config)
        
        prompt = f"""
        Translate the following text to {target_language}. 
        Keep the original meaning and tone. Preserve any formatting.
        
        Text to translate: {text}
        
        Translated text:
        """
        
        response = model.generate_content(prompt)
        
        # Extract the translated text from the response
        translated_text = response.text.strip()
        logger.info(f"Gemini translation completed, length: {len(translated_text)}")
        
        return translated_text
    except Exception as e:
        logger.error(f"Gemini translation error: {str(e)}")
        # Return empty string on error, we'll fall back to Sarvam
        return ""

@app.post("/process")
async def process(file: UploadFile = File(...), target_language: str = Form(...)):
    try:
        logger.info(f"Processing file: {file.filename} with target language: {target_language}")
        
        # Read the file content
        file_content = await file.read()
        
        # Store the file size for logging
        file_size = len(file_content)
        logger.info(f"File size: {file_size} bytes")

        # Determine the MIME type based on the file extension
        if file.filename.endswith('.mp3'):
            mime_type = 'audio/mpeg'
        elif file.filename.endswith('.wav'):
            mime_type = 'audio/wav'
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        # Sarvam Speech to Text Translate endpoint
        url = "https://api.sarvam.ai/speech-to-text"
        
        # Payload configuration
        payload = {
            'model': 'saarika:v2',
            'language_code': 'unknown',
            'with_timestamps': 'false'
        }
        
        # Prepare files for upload - ensure we provide file-like object
        files = [('file', (file.filename, io.BytesIO(file_content), mime_type))]
        
        # API key from environment
        headers = {
            'api-subscription-key': os.getenv('SARVAM_API_KEY')
        }

        # Make the API call
        logger.info(f"Sending speech-to-text request to {url}")
        
        response = requests.post(url, headers=headers, data=payload, files=files)
        
        # Log the response status and headers
        logger.info(f"Response Status Code: {response.status_code}")
        
        # Check for successful response
        if response.status_code != 200:
            logger.error(f"API returned non-200 status: {response.status_code}")
            logger.error(f"Response content: {response.text}")
            raise HTTPException(
                status_code=response.status_code, 
                detail=f"API error: {response.text}"
            )

        # Parse the response
        try:
            response_json = response.json()
        except json.JSONDecodeError:
            logger.error("Failed to decode JSON response")
            logger.error(f"Raw response text: {response.text}")
            raise HTTPException(
                status_code=500, 
                detail="Invalid response from transcription service"
            )
        
        # Extract transcription details
        transcription = response_json.get('transcript', 'No transcription found')
        source_language = response_json.get('language_code', 'unknown')
        
        logger.info(f"Transcription obtained. Source language: {source_language}")
        
        # If source and target languages differ, translate with both Sarvam and Gemini
        translated_text = transcription
        gemini_translation = ""
        
        if source_language != target_language:
            # First try Gemini translation
            gemini_translation = await translate_with_gemini(transcription, target_language)
            
            # Then do Sarvam translation
            logger.info(f"Translating with Sarvam from {source_language} to {target_language}")
            text_chunks = split_text(transcription)
            translated_chunks = []
            
            for i, chunk in enumerate(text_chunks):
                logger.info(f"Translating chunk {i+1} of {len(text_chunks)}")
                translation_url = "https://api.sarvam.ai/translate"
                translation_payload = {
                    "input": chunk,
                    "source_language_code": source_language,  # This line was missing!
                    "target_language_code": target_language,
                    "mode": "formal"
                }

                translation_response = requests.post(translation_url, headers=headers, json=translation_payload)
                
                if translation_response.status_code != 200:
                    logger.error(f"Translation API returned non-200 status: {translation_response.status_code}")
                    logger.error(f"Translation Response content: {translation_response.text}")
                    raise HTTPException(
                        status_code=translation_response.status_code, 
                        detail=f"Translation API error: {translation_response.text}"
                    )

                try:
                    translation_response_json = translation_response.json()
                except json.JSONDecodeError:
                    logger.error("Failed to decode JSON translation response")
                    logger.error(f"Raw translation response text: {translation_response.text}")
                    raise HTTPException(
                        status_code=500, 
                        detail="Invalid response from translation service"
                    )

                chunk_translation = translation_response_json.get('translated_text', 'No translation available')
                translated_chunks.append(chunk_translation)
            
            # Combine all translated chunks from Sarvam
            translated_text = ' '.join(translated_chunks)
            logger.debug(f"Sarvam translation complete, length: {len(translated_text)}")

        # Create the result with both transcription and translations
        result = {
            "transcription": transcription,
            "translated_text": translated_text,
            "gemini_translation": gemini_translation,  # Add Gemini translation
            "source_language": source_language,
            "target_language": target_language
        }

        logger.info(f"Sending response with transcription and translations")
        return result
    
    except requests.RequestException as req_error:
        logger.error(f"Request Error: {req_error}")
        raise HTTPException(
            status_code=500, 
            detail=f"Network error connecting to translation service: {str(req_error)}"
        )
    except Exception as e:
        logger.error(f"Unexpected Error: {e}")
        raise HTTPException(
            status_code=500, 
            detail=f"Unexpected error in processing: {str(e)}"
        )