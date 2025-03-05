document.addEventListener("DOMContentLoaded", () => {
  const fileUpload = document.getElementById("file-upload");
  const processButton = document.getElementById("process-button");
  const fileName = document.getElementById("file-name");
  const fileSize = document.getElementById("file-size");
  const transcriptionText = document.getElementById("transcription-text");
  const followUpText = document.getElementById("follow-up-text");
  const insightsText = document.getElementById("insights-text");
  const languageSelect = document.getElementById("language-select");

  // Enhanced language detection and mapping
  const LANGUAGE_NAMES = {
    'en': 'English',
    'hi-IN': 'Hindi',
    'mr-IN': 'Marathi',
    'gu-IN': 'Gujarati',
    'ta-IN': 'Tamil',
    'te-IN': 'Telugu'
  };

  function getLanguageName(languageCode) {
    return LANGUAGE_NAMES[languageCode] || 'Unknown Language';
  }

  // Script detection function
  function detectScript(text) {
    if (!text) return 'No text';
    
    // Basic script detection based on Unicode ranges
    const devanagariRange = /[\u0900-\u097F]/;
    const latinRange = /[A-Za-z]/;
    const gujaratiRange = /[\u0A80-\u0AFF]/;
    const tamilRange = /[\u0B80-\u0BFF]/;
    const teluguRange = /[\u0C00-\u0C7F]/;
    
    if (devanagariRange.test(text)) return 'Devanagari (Hindi/Marathi)';
    if (gujaratiRange.test(text)) return 'Gujarati';
    if (tamilRange.test(text)) return 'Tamil';
    if (teluguRange.test(text)) return 'Telugu';
    if (latinRange.test(text)) return 'Latin (English)';
    
    return 'Mixed/Other Script';
  }

  // Helper function to determine which CSS class to use
  function getScriptClass(scriptName) {
    if (scriptName.includes('Devanagari')) return 'hindi-text';
    if (scriptName.includes('Gujarati')) return 'gujarati-text';
    if (scriptName.includes('Tamil')) return 'tamil-text';
    if (scriptName.includes('Telugu')) return 'telugu-text';
    if (scriptName.includes('Latin')) return 'english-text';
    return 'generic-text'; // Default fallback
  }

  let selectedFile;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max
  const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp3']; 

  function resetUI() {
    processButton.disabled = true;
    transcriptionText.innerHTML = "Your transcription will appear here.";
    followUpText.innerHTML = "Your translated text will appear here.";
    insightsText.innerHTML = "Additional insights will appear here.";
  }

  fileUpload.addEventListener("change", (event) => {
    selectedFile = event.target.files[0];
    resetUI();

    if (selectedFile) {
      // Validate file type
      const fileType = selectedFile.type;
      const fileExtension = selectedFile.name.split('.').pop().toLowerCase();
      const isValidType = ALLOWED_TYPES.includes(fileType) || ['mp3', 'wav'].includes(fileExtension);
      
      if (!isValidType) {
        alert("Please upload an MP3 or WAV audio file.");
        selectedFile = null;
        return;
      }

      if (selectedFile.size > MAX_FILE_SIZE) {
        alert("File is too large. Maximum size is 10MB.");
        selectedFile = null;
        return;
      }

      fileName.textContent = `File Name: ${selectedFile.name}`;
      fileSize.textContent = `File Size: ${(selectedFile.size / 1024).toFixed(2)} KB`;
      
      processButton.disabled = !languageSelect.value;
    }
  });

  languageSelect.addEventListener("change", () => {
    processButton.disabled = !selectedFile || !languageSelect.value;
  });

  processButton.addEventListener("click", async (e) => {
    if (!selectedFile || !languageSelect.value) return;
    e.preventDefault(); // Prevent form submission

    // Show loading state
    transcriptionText.innerHTML = "<div class='loading'>Processing audio... This may take a minute.</div>";
    followUpText.innerHTML = "<div class='loading'>Translating text... Please wait.</div>";
    insightsText.innerHTML = "<div class='loading'>Processing insights...</div>";
    processButton.disabled = true;

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("target_language", languageSelect.value);

    try {
      console.log("Sending request to backend...");
      console.log("Selected language:", languageSelect.value);
      
      // Explicitly set Accept header to expect UTF-8
      const response = await fetch("http://127.0.0.1:8000/process", {
        method: "POST",
        body: formData,
        headers: {
          "Accept": "application/json; charset=utf-8"
        }
      });

      console.log("Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error (${response.status}): ${errorText}`);
      }

      // Use responseText to preserve UTF-8 encoding
      const responseText = await response.text();
      console.log("Response received, length:", responseText.length);
      
      // Parse the JSON manually 
      let result;
      try {
        result = JSON.parse(responseText);
        console.log("Response parsed successfully");
      } catch (parseError) {
        console.error("Failed to parse JSON:", parseError);
        const previewText = responseText.substring(0, 200) + (responseText.length > 200 ? '...' : '');
        console.error("Response preview:", previewText);
        throw new Error(`Failed to parse response: ${parseError.message}`);
      }

      // Log the key fields from the response
      console.log("Source language:", result.source_language);
      console.log("Target language:", result.target_language);
      console.log("Transcription sample:", result.transcription?.substring(0, 50) + "...");
      console.log("Translation sample:", result.translated_text?.substring(0, 50) + "...");
      console.log("Gemini translation sample:", result.gemini_translation?.substring(0, 50) + "...");

      // Display the transcription text with appropriate styling
      if (result.transcription) {
        const transcriptScript = detectScript(result.transcription);
        const transcriptClass = getScriptClass(transcriptScript);
        
        transcriptionText.innerHTML = `
          <div class="transcription-section">
            <h4>Original Transcription (${getLanguageName(result.source_language)})</h4>
            <div class="${transcriptClass}">${result.transcription}</div>
          </div>
        `;
        console.log(`Transcription displayed with ${transcriptClass} styling`);
      } else {
        transcriptionText.innerHTML = "<div class='error'>No transcription available</div>";
      }

      // Display the translated text with appropriate styling based on the target language
      if (result.gemini_translation) {
        const geminiScript = detectScript(result.gemini_translation);
        const geminiClass = getScriptClass(geminiScript);
        
        const sarvamClass = result.translated_text ? 
          getScriptClass(detectScript(result.translated_text)) : 'generic-text';
        
        followUpText.innerHTML = `
          <div class="translation-container">
            <div class="translation-section">
              <h4>Google Gemini Translation (${getLanguageName(result.target_language)})</h4>
              <div class="${geminiClass}">${result.gemini_translation}</div>
            </div>
            ${result.translated_text ? `
              <div class="translation-section">
                <h4>Sarvam AI Translation (${getLanguageName(result.target_language)})</h4>
                <div class="${sarvamClass}">${result.translated_text}</div>
              </div>
            ` : ''}
          </div>
        `;
        console.log(`Translations displayed with ${geminiClass} and ${sarvamClass} styling`);
      } else if (result.translated_text) {
        const textScript = detectScript(result.translated_text);
        const textClass = getScriptClass(textScript);
        
        followUpText.innerHTML = `
          <div class="translation-section">
            <h4>Translation (${getLanguageName(result.target_language)})</h4>
            <div class="${textClass}">${result.translated_text}</div>
          </div>
        `;
        console.log(`Translation displayed with ${textClass} styling`);
      } else {
        followUpText.innerHTML = "<div class='error'>No translation available</div>";
      }
      
      // Enhanced insights section with more detailed language information
      insightsText.innerHTML = `
        <p><strong>Source Language:</strong> ${getLanguageName(result.source_language)}</p>
        <p><strong>Target Language:</strong> ${getLanguageName(result.target_language)}</p>
        <p><strong>Transcription Details:</strong></p>
        <ul>
          <li>Characters: ${result.transcription ? result.transcription.length : 0}</li>
          <li>Script: ${detectScript(result.transcription)}</li>
        </ul>
        <p><strong>Translation Details:</strong></p>
        <ul>
          <li>Sarvam Characters: ${result.translated_text ? result.translated_text.length : 0}</li>
          <li>Sarvam Script: ${detectScript(result.translated_text)}</li>
          ${result.gemini_translation ? `
            <li>Gemini Characters: ${result.gemini_translation.length}</li>
            <li>Gemini Script: ${detectScript(result.gemini_translation)}</li>
          ` : ''}
        </ul>
      `;
      console.log("Enhanced insights displayed");
    
    } catch (error) {
      console.error("Processing error:", error);
      
      transcriptionText.innerHTML = `<div class="error">Error processing audio: ${error.message}</div>`;
      followUpText.innerHTML = `<div class="error">Translation failed</div>`;
      insightsText.innerHTML = `<div class="error">Error details: ${error.message}</div>`;
    
    } finally {
      processButton.disabled = false;
    }
  });
  
  // Add CSS to properly display text in various scripts
  // Add CSS to properly display text in various scripts
const style = document.createElement('style');
style.textContent = `
  /* Base styles for all text */
  .generic-text {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
    font-size: 16px;
    direction: ltr;
    text-align: left;
    color: #000; /* Ensure text is black */
  }
  
  /* English text */
  .english-text {
    font-family: 'Arial', 'Helvetica', sans-serif;
    line-height: 1.6;
    color: #000; /* Ensure text is black */
  }
  
  /* Hindi/Marathi text */
  .hindi-text {
    font-family: 'Noto Sans Devanagari', 'Arial Unicode MS', Arial, sans-serif;
    color: #000; /* Ensure text is black */
  }
  
  /* Gujarati text */
  .gujarati-text {
    font-family: 'Noto Sans Gujarati', 'Arial Unicode MS', Arial, sans-serif;
    color: #000; /* Ensure text is black */
  }
  
  /* Tamil text */
  .tamil-text {
    font-family: 'Noto Sans Tamil', 'Arial Unicode MS', Arial, sans-serif;
    color: #000; /* Ensure text is black */
  }
  
  /* Telugu text */
  .telugu-text {
    font-family: 'Noto Sans Telugu', 'Arial Unicode MS', Arial, sans-serif;
    color: #000; /* Ensure text is black */
  }
  
  /* Common styles for output containers */
  #transcription-text, #follow-up-text, #insights-text {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
    font-size: 16px;
    direction: ltr;
    text-align: left;
    color: #000; /* Ensure text is black */
  }
  
  .text-output {
    background-color: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 5px;
    padding: 15px;
    margin-bottom: 15px;
    overflow-wrap: break-word;
    color: #000; /* Ensure text is black */
  }
  
  .loading {
    color: #2196F3;
    font-style: italic;
  }
  
  .error {
    color: #f44336;
    font-weight: bold;
  }
  
  .translation-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  
  .transcription-section, .translation-section {
    padding: 15px;
    border-radius: 5px;
    background-color: #fff;
    border: 1px solid #e0e0e0;
    margin-bottom: 10px;
    color: #000; /* Ensure text is black */
  }
  
  .transcription-section h4, .translation-section h4 {
    margin-top: 0;
    color: #333;
    border-bottom: 1px solid #eee;
    padding-bottom: 8px;
    margin-bottom: 10px;
  }
  
  /* Ensure all paragraph text is black */
  p, ul, li {
    color: #000;
  }
  
  /* Make sure insights text is also black */
  .insights-transcription {
    color: #000;
  }
`;
document.head.appendChild(style);
  
  // Load fonts for all supported languages
  function loadFonts() {
    const fonts = [
      'Noto+Sans+Devanagari:wght@400;700', // Hindi, Marathi
      'Noto+Sans+Gujarati:wght@400;700',   // Gujarati
      'Noto+Sans+Tamil:wght@400;700',      // Tamil
      'Noto+Sans+Telugu:wght@400;700'      // Telugu
    ];
    
    fonts.forEach(font => {
      const fontLink = document.createElement('link');
      fontLink.href = `https://fonts.googleapis.com/css2?family=${font}&display=swap`;
      fontLink.rel = 'stylesheet';
      document.head.appendChild(fontLink);
    });
  }

  // Call the function to load all required fonts
  loadFonts();
  
  console.log("Audio processing script loaded successfully");
});