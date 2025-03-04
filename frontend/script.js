document.addEventListener("DOMContentLoaded", () => {
  const fileUpload = document.getElementById("file-upload");
  const processButton = document.getElementById("process-button");
  const fileName = document.getElementById("file-name");
  const fileSize = document.getElementById("file-size");
  const transcriptionText = document.getElementById("transcription-text");
  const followUpText = document.getElementById("follow-up-text");
  const insightsText = document.getElementById("insights-text");
  const languageSelect = document.getElementById("language-select");

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
      
      const response = await fetch("http://127.0.0.1:8000/process", {
        method: "POST",
        body: formData,
      });

      console.log("Response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error (${response.status}): ${errorText}`);
      }

      // Get the raw response text for debugging
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
      console.log("Transcription length:", result.transcription ? result.transcription.length : 0);
      console.log("Translation length:", result.translated_text ? result.translated_text.length : 0);

      // Display the transcription text
      if (result.transcription) {
        transcriptionText.innerHTML = `<div class="hindi-text">${result.transcription}</div>`;
        console.log("Transcription displayed");
      } else {
        transcriptionText.innerHTML = "<div class='error'>No transcription available</div>";
        console.warn("No transcription in response");
      }

      // Display the translated text
      if (result.translated_text) {
        followUpText.innerHTML = `<div class="hindi-text">${result.translated_text}</div>`;
        console.log("Translation displayed");
      } else {
        followUpText.innerHTML = "<div class='error'>No translation available</div>";
        console.warn("No translation in response");
      }
      
      // Display insights
      insightsText.innerHTML = `
        <p><strong>Source Language:</strong> ${result.source_language || 'Unknown'}</p>
        <p><strong>Target Language:</strong> ${result.target_language || 'Unknown'}</p>
        <p><strong>Transcription Length:</strong> ${result.transcription ? result.transcription.length : 0} characters</p>
        <p><strong>Translation Length:</strong> ${result.translated_text ? result.translated_text.length : 0} characters</p>
      `;
      console.log("Insights displayed");
    
    } catch (error) {
      console.error("Processing error:", error);
      
      transcriptionText.innerHTML = `<div class="error">Error processing audio: ${error.message}</div>`;
      followUpText.innerHTML = `<div class="error">Translation failed</div>`;
      insightsText.innerHTML = `<div class="error">Error details: ${error.message}</div>`;
    
    } finally {
      processButton.disabled = false;
    }
  });
  
  // Add CSS to properly display Hindi text
  const style = document.createElement('style');
  style.textContent = `
    .hindi-text {
      font-family: 'Noto Sans Devanagari', 'Arial Unicode MS', Arial, sans-serif;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
      font-size: 16px;
      direction: auto;
      text-align: left;
    }
    
    #transcription-text, #follow-up-text {
      font-family: 'Noto Sans Devanagari', 'Arial Unicode MS', Arial, sans-serif;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.5;
      font-size: 16px;
      direction: ltr;
      text-align: left;
    }
    
    .text-output {
      background-color: #f9f9f9;
      border: 1px solid #ddd;
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 15px;
    }
    
    .loading {
      color: #2196F3;
      font-style: italic;
    }
    
    .error {
      color: #f44336;
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);
  
  // Load Noto Sans font
  const fontLink = document.createElement('link');
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;700&display=swap';
  fontLink.rel = 'stylesheet';
  document.head.appendChild(fontLink);
  
  console.log("Audio processing script loaded successfully");
});