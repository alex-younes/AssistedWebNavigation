// Popup script for the extension
document.addEventListener('DOMContentLoaded', function() {
  const statusDiv = document.getElementById('status');
  const statusLabel = document.getElementById('statusLabel');
  const captureBtn = document.getElementById('captureBtn');
  const startRecordingBtn = document.getElementById('startRecordingBtn');
  const stopRecordingBtn = document.getElementById('stopRecordingBtn');
  const statsCard = document.getElementById('statsCard');
  const sessionIdElement = document.getElementById('sessionId');
  const interactionCountElement = document.getElementById('interactionCount');
  const durationElement = document.getElementById('duration');

  let startTime = null;
  let recordingTimer = null;
  let interactionCount = 0;
  
  // Initialize by checking current recording status
  chrome.runtime.sendMessage({ action: "getRecordingStatus" }, (response) => {
    if (response && response.success) {
      updateStatus(response.status, response.sessionId);
    }
  });

  // Listen for status updates from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'recordingStatusUpdate') {
      updateStatus(message.status, message.sessionId);
    }
    return false;
  });

  // DOM capture button
  captureBtn.addEventListener('click', () => {
    showStatus('Capturing page...', 'idle');
    
    chrome.runtime.sendMessage({ action: "captureDOM" }, (response) => {
      if (response && response.success) {
        showStatus('Page captured successfully! View the analysis in the web app.', 'success');
      } else {
        showStatus('Error: ' + (response?.error || 'Unknown error'), 'error');
      }
    });
  });

  // Start recording button
  startRecordingBtn.addEventListener('click', () => {
    showStatus('Starting recording...', 'idle');
    
    chrome.runtime.sendMessage({ action: "startRecording" }, (response) => {
      if (response && response.success) {
        startTime = new Date();
        updateStatus('recording', response.sessionId);
        interactionCount = 0;
        updateStatsCard();
        
        // Start timer for duration
        recordingTimer = setInterval(updateDuration, 1000);
        
        showStatus('Recording started. Interact with the page to record actions.', 'recording');
      } else {
        showStatus('Error: ' + (response?.error || 'Failed to start recording'), 'error');
      }
    });
  });

  // Stop recording button
  stopRecordingBtn.addEventListener('click', () => {
    showStatus('Stopping recording...', 'idle');
    
    chrome.runtime.sendMessage({ action: "stopRecording" }, (response) => {
      if (response && response.success) {
        updateStatus('idle');
        clearInterval(recordingTimer);
        recordingTimer = null;
        
        // Update stats
        interactionCount = response.interactionCount || 0;
        updateStatsCard();
        
        showStatus(`Recording stopped. Recorded ${interactionCount} interaction(s).`, 'success');
      } else {
        showStatus('Error: ' + (response?.error || 'Failed to stop recording'), 'error');
      }
    });
  });

  // Helper function to update recording status
  function updateStatus(status, sessionId = null) {
    const wasRecording = startRecordingBtn.disabled;
    
    // Update session ID
    if (sessionId) {
      sessionIdElement.textContent = sessionId.substring(0, 8) + '...';
    }
    
    // Update UI based on status
    if (status === 'recording') {
      startRecordingBtn.disabled = true;
      stopRecordingBtn.disabled = false;
      captureBtn.disabled = true;
      statusLabel.className = 'status-label recording';
      statusLabel.textContent = 'Recording';
      
      if (!wasRecording && !recordingTimer) {
        startTime = new Date();
        recordingTimer = setInterval(updateDuration, 1000);
      }
      
      statsCard.style.display = 'block';
    } else {
      startRecordingBtn.disabled = false;
      stopRecordingBtn.disabled = true;
      captureBtn.disabled = false;
      statusLabel.className = 'status-label idle';
      statusLabel.textContent = 'Idle';
      
      if (wasRecording && recordingTimer) {
        clearInterval(recordingTimer);
        recordingTimer = null;
      }
    }
  }
  
  // Helper function to show status message
  function showStatus(message, type = null) {
    statusDiv.textContent = message;
    
    // Reset status classes
    statusDiv.className = 'status';
    
    // Add specific class if type is provided
    if (type) {
      statusDiv.classList.add(type);
    }
  }
  
  // Helper function to update duration in stats card
  function updateDuration() {
    if (startTime) {
      const duration = Math.floor((new Date() - startTime) / 1000);
      let formattedDuration = '';
      
      if (duration < 60) {
        formattedDuration = `${duration}s`;
      } else {
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        formattedDuration = `${minutes}m ${seconds}s`;
      }
      
      durationElement.textContent = formattedDuration;
    }
  }
  
  // Helper function to update stats card
  function updateStatsCard() {
    interactionCountElement.textContent = interactionCount;
    statsCard.style.display = interactionCount > 0 || startTime ? 'block' : 'none';
  }
}); 