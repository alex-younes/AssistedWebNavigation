// Popup script for the extension
let serverConfig = {
    ip: '',
    port: '3001'
};

// Global variables for DOM elements
let startRecordingBtn, stopRecordingBtn, captureBtn, statusLabel;
let statsCard, sessionIdElement, interactionCountElement, durationElement;
let startTime = null;
let recordingTimer = null;
let interactionCount = 0;

// Helper function to show status message
function showStatus(message, type = null) {
    const statusDiv = document.getElementById('status');
    const errorDiv = document.getElementById('error-message');
    
    if (type === 'error') {
        // Show error message
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
            
            // Hide error after 5 seconds
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 5000);
        }
        
        // Also update status with error state
        if (statusDiv) {
            statusDiv.textContent = 'Error occurred';
            statusDiv.className = 'status error';
        }
    } else {
        // Hide error message
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
        
        // Update status
        if (statusDiv) {
            statusDiv.textContent = message;
            statusDiv.className = 'status' + (type ? ' ' + type : '');
        }
    }
}

// Helper function to update recording status
function updateStatus(status, sessionId = null) {
    // Make sure DOM elements are initialized
    if (!startRecordingBtn) {
        startRecordingBtn = document.getElementById('startRecordingBtn');
    }
    if (!stopRecordingBtn) {
        stopRecordingBtn = document.getElementById('stopRecordingBtn');
    }
    if (!captureBtn) {
        captureBtn = document.getElementById('captureBtn');
    }
    if (!statusLabel) {
        statusLabel = document.getElementById('statusLabel');
    }
    if (!statsCard) {
        statsCard = document.getElementById('statsCard');
    }
    if (!sessionIdElement) {
        sessionIdElement = document.getElementById('sessionId');
    }
    
    const wasRecording = startRecordingBtn.disabled;
    
    // Update session ID
    if (sessionId && sessionIdElement) {
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
        
        if (statsCard) {
            statsCard.style.display = 'block';
        }
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

// Helper function to update duration in stats card
function updateDuration() {
    if (!durationElement) {
        durationElement = document.getElementById('duration');
    }
    
    if (startTime && durationElement) {
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
    if (!interactionCountElement) {
        interactionCountElement = document.getElementById('interactionCount');
    }
    if (!statsCard) {
        statsCard = document.getElementById('statsCard');
    }
    
    if (interactionCountElement && statsCard) {
        interactionCountElement.textContent = interactionCount;
        statsCard.style.display = interactionCount > 0 || startTime ? 'block' : 'none';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize DOM element references
    startRecordingBtn = document.getElementById('startRecordingBtn');
    stopRecordingBtn = document.getElementById('stopRecordingBtn');
    captureBtn = document.getElementById('captureBtn');
    statusLabel = document.getElementById('statusLabel');
    statsCard = document.getElementById('statsCard');
    sessionIdElement = document.getElementById('sessionId');
    interactionCountElement = document.getElementById('interactionCount');
    durationElement = document.getElementById('duration');

    // Load saved server settings
    const saved = await chrome.storage.sync.get(['serverConfig']);
    if (saved.serverConfig) {
        serverConfig = saved.serverConfig;
        document.getElementById('serverIp').value = `${serverConfig.ip}:${serverConfig.port}`;
        // Test connection on load if we have saved settings
        testServerConnection();
    }
    
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
      
      startRecording();
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
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');
        const openFrontendContainer = document.getElementById('openFrontendContainer');
        
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
            const isConnected = await testServerConnection();
            
            if (isConnected) {
                // Success state is handled by testServerConnection
                console.log('[Extension] Server settings saved and connection verified');
            } else {
                // Error state
                statusDot.className = 'status-dot error';
                statusText.textContent = 'Not Connected';
                openFrontendContainer.style.display = 'none';
                
                statusEl.textContent = 'Could not connect to server. Please check the address and try again.';
                statusEl.className = 'status error';
                statusEl.style.display = 'block';
            }
            
        } catch (error) {
            console.error('[Extension] Settings error:', error);
            statusDot.className = 'status-dot error';
            statusText.textContent = 'Not Connected';
            openFrontendContainer.style.display = 'none';
            
            statusEl.textContent = error.message;
            statusEl.className = 'status error';
            statusEl.style.display = 'block';
        }
    });

    // Add frontend button handler
    document.getElementById('openFrontendBtn').addEventListener('click', async () => {
        try {
            // Get server config
            const config = await new Promise(resolve => {
                chrome.storage.sync.get(['serverConfig'], result => resolve(result.serverConfig));
            });
            
            if (!config) {
                alert('Please configure server settings first');
                return;
            }
            
            // Get user ID
            const userData = await new Promise(resolve => {
                chrome.storage.local.get(['userId'], result => resolve(result));
            });
            
            if (!userData.userId) {
                alert('User ID not found. Please try reloading the extension.');
                return;
            }
            
            // Construct frontend URL with user ID - using port 3000 for frontend
            const frontendUrl = `http://${config.ip}:3000?userId=${userData.userId}`;
            console.log('[Extension] Opening frontend URL:', frontendUrl);
            
            // Open in new tab
            chrome.tabs.create({ url: frontendUrl });
            
        } catch (error) {
            console.error('Error opening frontend:', error);
            alert('Error opening frontend. Please check your configuration.');
        }
    });
});

// Add server configuration check
async function checkServerConfiguration() {
    try {
        const result = await chrome.storage.sync.get(['serverConfig']);
        if (!result.serverConfig) {
            throw new Error('Server not configured');
        }
        return true;
    } catch (error) {
        console.error('Server configuration error:', error);
        return false;
    }
}

// Add server connection test
async function testServerConnection() {
    try {
        const result = await chrome.storage.sync.get(['serverConfig']);
        if (!result.serverConfig) {
            throw new Error('Server not configured');
        }
        
        const { ip, port } = result.serverConfig;
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');
        const openFrontendContainer = document.getElementById('openFrontendContainer');
        
        try {
            const response = await fetch(`http://${ip}:${port}/api/extension/recorder/verifyConnection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ test: true })
            });
            
            if (!response.ok) {
                throw new Error('Server connection failed');
            }
            
            const data = await response.json();
            if (data.success) {
                console.log('[Extension] Server connection verified:', data);
                statusDot.className = 'status-dot connected';
                statusText.textContent = 'Connected';
                openFrontendContainer.style.display = 'block';
                
                // Show success message
                const statusEl = document.getElementById('settingsStatus');
                statusEl.textContent = 'Connected successfully!';
                statusEl.className = 'status success';
                statusEl.style.display = 'block';
                
                // Hide status message after 3 seconds
                setTimeout(() => {
                    statusEl.style.display = 'none';
                }, 3000);
                
                return true;
            }
        } catch (error) {
            console.error('Server connection error:', error);
            statusDot.className = 'status-dot error';
            statusText.textContent = 'Not Connected';
            openFrontendContainer.style.display = 'none';
            
            // Show error message
            const statusEl = document.getElementById('settingsStatus');
            statusEl.textContent = 'Could not connect to server. Please check the address and try again.';
            statusEl.className = 'status error';
            statusEl.style.display = 'block';
            
            throw error;
        }
    } catch (error) {
        console.error('Server connection error:', error);
        return false;
    }
}

// Update startRecording function
async function startRecording() {
    try {
        // Check server configuration first
        const isConfigured = await checkServerConfiguration();
        if (!isConfigured) {
            showStatus('Please configure server settings first', 'error');
            return;
        }
        
        // Test server connection
        const isConnected = await testServerConnection();
        if (!isConnected) {
            showStatus('Could not connect to server. Please check server settings.', 'error');
            return;
        }
        
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
            showStatus('No active tab found', 'error');
            return;
        }
        
        showStatus('Starting recording...', 'idle');
        
        // Start recording
        const response = await chrome.runtime.sendMessage({ 
            action: "startRecording",
            tab: tab
        });
        
        if (!response || !response.success) {
            const errorMsg = response?.error || 'Failed to start recording';
            console.error('[Extension] Recording error:', errorMsg);
            showStatus(errorMsg, 'error');
            return;
        }
        
        // Update UI for recording state
        updateStatus('recording', response.sessionId);
        showStatus('Recording started successfully', 'success');
        
    } catch (error) {
        console.error('Start recording error:', error);
        showStatus('An error occurred while starting recording: ' + error.message, 'error');
    }
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