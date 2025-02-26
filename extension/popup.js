// Popup script for the extension
let serverConfig = {
    ip: '',
    port: '3001'
};

document.addEventListener('DOMContentLoaded', async () => {
    // Load saved server settings
    const saved = await chrome.storage.sync.get(['serverConfig']);
    if (saved.serverConfig) {
        serverConfig = saved.serverConfig;
        document.getElementById('serverIp').value = `${serverConfig.ip}:${serverConfig.port}`;
        // Test connection on load if we have saved settings
        testServerConnection();
    }
    
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

    // Add test connection handler
    document.getElementById('testConnectionBtn').addEventListener('click', testServerConnection);

    // Update server settings handler
    document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
        const input = document.getElementById('serverIp').value.trim();
        const statusEl = document.getElementById('settingsStatus');
        
        try {
            // Validate input format (IP:PORT or domain:PORT)
            const [ip, port] = input.split(':');
            if (!ip || !port) {
                throw new Error('Please enter the server address in format: IP:PORT or domain:PORT');
            }
            
            // Validate port number
            const portNum = parseInt(port);
            if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
                throw new Error('Invalid port number. Port must be between 1 and 65535');
            }
            
            // Update serverConfig first
            serverConfig = { 
                ip: ip.trim(),
                port: port.trim()
            };
            
            // Save to chrome storage
            await chrome.storage.sync.set({ serverConfig });
            
            // Test connection after saving
            await testServerConnection();
            
        } catch (error) {
            const statusDot = document.querySelector('.status-dot');
            const statusText = document.querySelector('.status-text');
            
            statusDot.className = 'status-dot error';
            statusText.textContent = 'Not Connected';
            
            statusEl.textContent = error.message;
            statusEl.className = 'status error';
            statusEl.style.display = 'block';
        }
    });

    // Add frontend button handler
    document.getElementById('openFrontendBtn').addEventListener('click', () => {
        if (serverConfig.ip && serverConfig.port) {
            // Frontend typically runs on port 3000
            const frontendUrl = `http://${serverConfig.ip}:3000`;
            chrome.tabs.create({ url: frontendUrl });
        }
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

// Test server connection
async function testServerConnection() {
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    const statusEl = document.getElementById('settingsStatus');
    const frontendContainer = document.getElementById('openFrontendContainer');
    
    try {
        // Get the current input value, fall back to saved config if empty
        const input = document.getElementById('serverIp').value.trim();
        let testConfig;
        
        if (input) {
            // Parse the input field value
            const [ip, port] = input.split(':');
            if (!ip || !port) {
                throw new Error('Please enter the server address in format: IP:PORT or domain:PORT');
            }
            testConfig = { ip: ip.trim(), port: port.trim() };
        } else if (serverConfig.ip && serverConfig.port) {
            // Use saved config as fallback
            testConfig = serverConfig;
        } else {
            throw new Error('Server address not configured');
        }

        statusDot.className = 'status-dot';
        statusText.textContent = 'Testing connection...';
        
        const url = `http://${testConfig.ip}:${testConfig.port}/health`;
        console.log('Testing connection to:', url); // Debug log
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.status === 'ok') {
            statusDot.className = 'status-dot connected';
            statusText.textContent = 'Connected';
            
            statusEl.textContent = 'Connection successful!';
            statusEl.className = 'status success';
            statusEl.style.display = 'block';
            
            // Show the frontend button when connected
            frontendContainer.style.display = 'block';
        } else {
            throw new Error('Unexpected server response');
        }
    } catch (error) {
        console.error('Connection test failed:', error); // Debug log
        statusDot.className = 'status-dot error';
        statusText.textContent = 'Not Connected';
        
        statusEl.textContent = `Connection failed: ${error.message}`;
        statusEl.className = 'status error';
        statusEl.style.display = 'block';
        
        // Hide the frontend button when not connected
        frontendContainer.style.display = 'none';
    }
    
    // Hide status message after 3 seconds
    setTimeout(() => {
        statusEl.style.display = 'none';
    }, 3000);
}

// Function to get the API URL
function getApiUrl(endpoint) {
    if (!serverConfig.ip) {
        throw new Error('Server address not configured. Please set it in the settings.');
    }
    return `http://${serverConfig.ip}:${serverConfig.port}/api${endpoint}`;
}

// Update all existing API calls to use getApiUrl()
async function sendRequest(endpoint, method = 'GET', data = null) {
    try {
        const url = getApiUrl(endpoint);
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (data) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);
        
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// Update your existing API calls to use sendRequest
// Example:
async function captureDOM() {
    return sendRequest('/extension/capture', 'POST', { /* your data */ });
} 