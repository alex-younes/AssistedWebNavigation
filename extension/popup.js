// Popup script for the extension
let serverConfig = {
    ip: '',
    port: '3001'
};

// Global variables for DOM elements
let startRecordingBtn, stopRecordingBtn, statusLabel;
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
    statusLabel = document.getElementById('statusLabel');
    statsCard = document.getElementById('statsCard');
    sessionIdElement = document.getElementById('sessionId');
    interactionCountElement = document.getElementById('interactionCount');
    durationElement = document.getElementById('duration');
    
    // Check server configuration
    await checkServerConfiguration();
    
    // Get current recording status
    await updateCurrentStatus();
    
    // Set up event listeners
    startRecordingBtn.addEventListener('click', startRecording);
    stopRecordingBtn.addEventListener('click', stopRecording);
    
    // Set up server config form
    const serverForm = document.getElementById('serverConfigForm');
    if (serverForm) {
        serverForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const ipInput = document.getElementById('serverIp');
            const portInput = document.getElementById('serverPort');
            
            if (ipInput && portInput) {
                serverConfig.ip = ipInput.value.trim();
                serverConfig.port = portInput.value.trim();
                
                // Save to storage
                await chrome.storage.local.set({
                    serverIp: serverConfig.ip,
                    serverPort: serverConfig.port
                });
                
                // Update API URL in background script
                const apiUrl = `http://${serverConfig.ip}:${serverConfig.port}/api`;
                chrome.runtime.sendMessage({
                    action: 'setApiUrl',
                    url: apiUrl
                }, (response) => {
                    if (response && response.success) {
                        showStatus('Server configuration saved', 'success');
                        testServerConnection();
                    } else {
                        showStatus('Error saving server configuration', 'error');
                    }
                });
            }
        });
    }
    
    // Load server config from storage
    const serverConfigResult = await chrome.storage.local.get(['serverIp', 'serverPort']);
    if (serverConfigResult.serverIp) {
        serverConfig.ip = serverConfigResult.serverIp;
        const ipInput = document.getElementById('serverIp');
        if (ipInput) {
            ipInput.value = serverConfig.ip;
        }
    }
    
    if (serverConfigResult.serverPort) {
        serverConfig.port = serverConfigResult.serverPort;
        const portInput = document.getElementById('serverPort');
        if (portInput) {
            portInput.value = serverConfig.port;
        }
    }
    
    // Test server connection
    await testServerConnection();
});

// Check if server configuration is set
async function checkServerConfiguration() {
    const result = await chrome.storage.local.get(['serverIp', 'serverPort']);
    
    if (result.serverIp && result.serverPort) {
        serverConfig.ip = result.serverIp;
        serverConfig.port = result.serverPort;
        return true;
    }
    
    return false;
}

// Test connection to server
async function testServerConnection() {
    const serverStatusElement = document.getElementById('serverStatus');
    if (!serverStatusElement) return;
    
    try {
        // Use direct URL for health check without the /api prefix
        const healthUrl = `http://${serverConfig.ip}:${serverConfig.port}/health`;
        serverStatusElement.textContent = 'Connecting...';
        
        const response = await fetch(healthUrl, {
            method: 'GET'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.status === 'ok') {
                serverStatusElement.textContent = 'Connected';
                serverStatusElement.className = 'status-indicator connected';
            } else {
                serverStatusElement.textContent = 'Error';
                serverStatusElement.className = 'status-indicator error';
            }
        } else {
            throw new Error('Server returned status ' + response.status);
        }
    } catch (error) {
        console.error('Error connecting to server:', error);
        serverStatusElement.textContent = 'Disconnected';
        serverStatusElement.className = 'status-indicator disconnected';
    }
}

// Get current recording status
async function updateCurrentStatus() {
    try {
        const result = await chrome.runtime.sendMessage({
            action: 'getStatus'
        });
        
        if (result) {
            updateStatus(result.recordingStatus, result.currentSessionId);
            
            // If we're recording, start the timer
            if (result.recordingStatus === 'recording') {
                startTime = new Date();
                recordingTimer = setInterval(updateDuration, 1000);
            }
        }
    } catch (error) {
        console.error('Error getting status:', error);
    }
}

// Start recording
async function startRecording() {
    try {
        showStatus('Starting recording...', 'info');
        
        // Make sure server is configured
        if (!await checkServerConfiguration()) {
            showStatus('Please configure server first', 'error');
            return;
        }
        
        // Tell background script to start recording
        const result = await chrome.runtime.sendMessage({
            action: 'startRecording'
        });
        
        if (result && result.success) {
            showStatus('Recording started', 'success');
            updateStatus('recording', result.sessionId);
        } else {
            showStatus('Error starting recording: ' + (result?.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error starting recording:', error);
        showStatus('Error starting recording: ' + error.message, 'error');
    }
}

// Stop recording
async function stopRecording() {
    try {
        showStatus('Stopping recording...', 'info');
        
        // Tell background script to stop recording
        const result = await chrome.runtime.sendMessage({
            action: 'stopRecording'
        });
        
        if (result && result.success) {
            showStatus('Recording stopped', 'success');
            updateStatus('idle');
        } else {
            showStatus('Error stopping recording: ' + (result?.error || 'Unknown error'), 'error');
        }
    } catch (error) {
        console.error('Error stopping recording:', error);
        showStatus('Error stopping recording: ' + error.message, 'error');
    }
}

// Get API URL
function getApiUrl(endpoint) {
    const baseUrl = `http://${serverConfig.ip}:${serverConfig.port}/api`;
    return baseUrl + (endpoint ? `/${endpoint}` : '');
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateInteractionCount') {
        interactionCount = message.count;
        updateStatsCard();
    } else if (message.action === 'updateStatus') {
        updateStatus(message.status, message.sessionId);
    }
    
    // Required for async response
    return true;
}); 