from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import requests
from dotenv import load_dotenv
import os
import json
import logging
import io

load_dotenv()
app = FastAPI()

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Enable CORS with broader settings to ensure frontend can access
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
        url = "https://api.sarvam.ai/speech-to-text-translate"
        
        # Payload configuration
        payload = {
            'model': 'saaras:v1',
            'prompt': '',
            'target_language_code': target_language
        }
        
        # Prepare files for upload - ensure we provide file-like object
        files = [('file', (file.filename, io.BytesIO(file_content), mime_type))]
        
        # API key from environment
        headers = {
            'api-subscription-key': os.getenv('SARVAM_API_KEY')
        }

        # Make the API call
        logger.info(f"Sending request to {url}")
        
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
                detail="Invalid response from translation service"
            )
        
        # Extract transcription details
        transcription = response_json.get('transcript', 'No transcription found')
        source_language = response_json.get('language_code', 'unknown')
        
        logger.info(f"Transcription obtained. Source language: {source_language}")
        logger.debug(f"Full transcription text: {transcription}")

        # If the source language is the same as the target language, no need to translate
        if source_language == target_language:
            logger.info("Source language same as target language. No translation needed.")
            translated_text = transcription
        else:
            logger.info(f"Translating from {source_language} to {target_language}")
            # Split the text into smaller chunks to meet the 500 character limit
            text_chunks = split_text(transcription)
            translated_chunks = []
            
            # Translate each chunk
            for i, chunk in enumerate(text_chunks):
                logger.info(f"Translating chunk {i+1} of {len(text_chunks)}")
                # Sarvam Text Translation endpoint
                translation_url = "https://api.sarvam.ai/translate"
                translation_payload = {
                    "input_text": chunk,
                    "target_language_code": target_language,
                    "mode": "formal"
                }

                translation_response = requests.post(translation_url, headers=headers, json=translation_payload)
                
                # Check for successful response
                if translation_response.status_code != 200:
                    logger.error(f"Translation API returned non-200 status: {translation_response.status_code}")
                    logger.error(f"Translation Response content: {translation_response.text}")
                    raise HTTPException(
                        status_code=translation_response.status_code, 
                        detail=f"Translation API error: {translation_response.text}"
                    )

                # Parse the translation response
                try:
                    translation_response_json = translation_response.json()
                    logger.debug(f"Translation response for chunk {i+1}: {translation_response_json}")
                except json.JSONDecodeError:
                    logger.error("Failed to decode JSON translation response")
                    logger.error(f"Raw translation response text: {translation_response.text}")
                    raise HTTPException(
                        status_code=500, 
                        detail="Invalid response from translation service"
                    )

                chunk_translation = translation_response_json.get('translated_text', 'No translation available')
                translated_chunks.append(chunk_translation)
            
            # Combine all translated chunks
            translated_text = ' '.join(translated_chunks)
            logger.debug(f"Full translated text: {translated_text}")

        # Create the result with both transcription and translation
        result = {
            "transcription": transcription,
            "translated_text": translated_text,
            "source_language": source_language,
            "target_language": target_language
        }

        # Final log of the complete result structure
        logger.info(f"Sending response with transcription and translation")
        
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