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

// NEW: Auth-related DOM elements
let usernameInput, passwordInput, loginBtn, registerBtn, logoutBtn;
let loginStatusText, authErrorDisplay, authForm, userInfoSection;

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
            statusDiv.textContent = 'Error occurred'; // Generic error for main status
            statusDiv.className = 'status error';
            statusDiv.style.display = 'block';
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
        statusLabel = document.getElementById('recordingStatusLabel') || document.getElementById('statusLabel');
    }
    if (!statsCard) {
        statsCard = document.getElementById('statsCard');
    }
    if (!sessionIdElement) {
        sessionIdElement = document.getElementById('sessionIdDisplay');
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
        durationElement = document.getElementById('durationDisplay');
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
        interactionCountElement = document.getElementById('interactionCountDisplay');
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
    statusLabel = document.getElementById('recordingStatusLabel') || document.getElementById('statusLabel');
    statsCard = document.getElementById('statsCard');
    sessionIdElement = document.getElementById('sessionIdDisplay');
    interactionCountElement = document.getElementById('interactionCountDisplay');
    durationElement = document.getElementById('durationDisplay');
    
    // NEW: Initialize Auth DOM elements
    usernameInput = document.getElementById('usernameInput');
    passwordInput = document.getElementById('passwordInput');
    loginBtn = document.getElementById('loginBtn');
    registerBtn = document.getElementById('registerBtn');
    logoutBtn = document.getElementById('logoutBtn');
    loginStatusText = document.getElementById('loginStatusText');
    authErrorDisplay = document.getElementById('authErrorDisplay');
    authForm = document.getElementById('authForm');
    userInfoSection = document.getElementById('userInfoSection');
    
    // Check server configuration
    await checkServerConfiguration();
    
    // Get current recording status
    await updateCurrentStatus();
    
    // Set up event listeners
    startRecordingBtn.addEventListener('click', startRecording);
    stopRecordingBtn.addEventListener('click', stopRecording);
    
    // NEW: Auth event listeners
    loginBtn.addEventListener('click', handleLogin);
    registerBtn.addEventListener('click', handleRegister);
    logoutBtn.addEventListener('click', handleLogout);
    
    // Initial UI update for auth section
    updateAuthUI();
    
    // Set up save loading states toggle
    const saveLoadingStatesToggle = document.getElementById('saveLoadingStatesToggle');
    const toggleContainer = document.querySelector('.toggle-switch');
    
    if (saveLoadingStatesToggle && toggleContainer) {
        // Load current setting
        const result = await chrome.storage.local.get(['saveLoadingStates']);
        if (result.saveLoadingStates !== undefined) {
            saveLoadingStatesToggle.checked = result.saveLoadingStates;
        }
        
        // Replace change event with click event on the container
        toggleContainer.addEventListener('click', async (e) => {
            // Toggle the checkbox
            saveLoadingStatesToggle.checked = !saveLoadingStatesToggle.checked;
            const value = saveLoadingStatesToggle.checked;
            
            console.log('Toggle clicked, new value:', value);
            
            // Send message to background script to update setting
            chrome.runtime.sendMessage({
                action: 'setSaveLoadingStates',
                value: value
            }, (response) => {
                if (response && response.success) {
                    showStatus(`Loading states will ${value ? 'be saved' : 'not be saved'} to database`, 'success');
                } else {
                    showStatus('Error updating settings', 'error');
                }
            });
            
            // Prevent the event from propagating further
            e.stopPropagation();
        });
    }
    
    // Set up server config form
    const serverForm = document.getElementById('serverConfigForm');
    if (serverForm) {
        serverForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const ipInput = document.getElementById('serverIpInput');
            const portInput = document.getElementById('serverPortInput');
            const configErrorEl = document.getElementById('configErrorDisplay');

            if (ipInput && portInput) {
                serverConfig.ip = ipInput.value.trim();
                serverConfig.port = portInput.value.trim();
                
                // Save to storage
                await chrome.storage.local.set({
                    serverIp: serverConfig.ip,
                    serverPort: serverConfig.port
                });
                
                // Update API URL in background script
                const apiUrl = getApiUrl('extension/ping');
                chrome.runtime.sendMessage({
                    action: 'setApiUrl',
                    url: apiUrl
                }, (response) => {
                    if (configErrorEl) configErrorEl.style.display = 'none';
                    if (response && response.success) {
                        showStatus('Server configuration saved', 'success');
                        testServerConnection();
                    } else {
                        if (configErrorEl) {
                            configErrorEl.textContent = (response && response.error) || 'Error saving server configuration';
                            configErrorEl.style.display = 'block';
                        }
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
        const ipInput = document.getElementById('serverIpInput');
        if (ipInput) {
            ipInput.value = serverConfig.ip;
        }
    }
    
    if (serverConfigResult.serverPort) {
        serverConfig.port = serverConfigResult.serverPort;
        const portInput = document.getElementById('serverPortInput');
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
    const apiUrl = getApiUrl('extension/ping');
    const serverStatusElement = document.getElementById('serverStatusIndicator');
    const configErrorEl = document.getElementById('configErrorDisplay');

    if (!serverStatusElement) return;
    
    try {
        const response = await fetch(apiUrl, {
            method: 'GET'
        });
        
        if (response.ok) {
            const data = await response.json();
            
            if (data.success === true) {
                serverStatusElement.textContent = 'Connected';
                serverStatusElement.className = 'status-indicator connected';
                if (configErrorEl) configErrorEl.style.display = 'none';
            } else {
                const errorText = `Error: ${response.status} - ${(data && data.message) || response.statusText || 'Ping unsuccessful'}`;
                serverStatusElement.textContent = 'Error';
                serverStatusElement.className = 'status-indicator error';
                if (configErrorEl) {
                    configErrorEl.textContent = `Connection failed. ${errorText}`;
                    configErrorEl.style.display = 'block';
                }
            }
        } else {
            throw new Error('Server returned status ' + response.status);
        }
    } catch (error) {
        serverStatusElement.textContent = 'Error';
        serverStatusElement.className = 'status-indicator error';
        if (configErrorEl) {
            configErrorEl.textContent = `Connection error: ${error.message}`;
            configErrorEl.style.display = 'block';
        }
        console.error('[Popup] Server connection test error:', error);
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
    const result = await chrome.storage.local.get(['userId', 'username']);
    // Check if user is logged in OR if anonymous recording is allowed by background.js (implicit)
    // For now, we proceed, and background.js will generate an anon ID if needed.
    // A stricter approach would be to prevent recording if !result.userId and login is mandatory.
    // if (!result.userId) {
    //     if (authErrorDisplay) {
    //         authErrorDisplay.textContent = 'Please login to start recording.';
    //         authErrorDisplay.style.display = 'block';
    //     }
    //     return;
    // }

    showStatus('Starting recording...', 'info');
    chrome.runtime.sendMessage({ action: 'startRecording' }, (response) => {
        if (response && response.success) {
            showStatus('Recording started', 'success');
            updateStatus('recording', response.sessionId);
        } else {
            showStatus('Error starting recording: ' + (response?.error || 'Unknown error'), 'error');
        }
    });
}

// Stop recording
async function stopRecording() {
    showStatus('Stopping recording...', 'info');
    chrome.runtime.sendMessage({ action: 'stopRecording' }, (response) => {
        if (response && response.success) {
            showStatus('Recording stopped', 'success');
            updateStatus('idle');
        } else {
            showStatus('Error stopping recording: ' + (response?.error || 'Unknown error'), 'error');
        }
    });
}

// Get API URL
function getApiUrl(endpoint) {
    // Use serverConfig if populated, otherwise try to get from storage directly or default
    let baseUrl = `http://${serverConfig.ip || 'localhost'}:${serverConfig.port || '3001'}/api`;
    
    // Fallback if serverConfig is somehow not populated from DOM/storage yet
    // This part is mostly a safeguard, initialization should handle it.
    if (!serverConfig.ip) {
        chrome.storage.local.get(['serverIp', 'serverPort']).then(storedConfig => {
            const ip = storedConfig.serverIp || 'localhost';
            const port = storedConfig.serverPort || '3001';
            baseUrl = `http://${ip}:${port}/api`;
        });
    }
    return `${baseUrl}/${endpoint}`;
}

// NEW: Function to update Authentication UI
async function updateAuthUI() {
    const result = await chrome.storage.local.get(['userId', 'username']);
    if (result.userId && result.username) {
        // Logged in
        loginStatusText.textContent = `Logged in as: ${result.username}`;
        authForm.style.display = 'none';
        logoutBtn.style.display = 'block';
        startRecordingBtn.disabled = false; // Enable recording if logged in
    } else {
        // Not logged in
        loginStatusText.textContent = 'Not logged in';
        authForm.style.display = 'block';
        logoutBtn.style.display = 'none';
        // Optionally disable recording if login is mandatory, or allow anonymous based on background.js logic
        // For now, let background.js handle anonymous ID generation if no userId from auth
    }
    if (passwordInput) passwordInput.value = ''; // Clear password field
    if (authErrorDisplay) authErrorDisplay.style.display = 'none'; // Clear previous errors
}

// NEW: Handle Login
function handleLogin() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) {
        if (authErrorDisplay) {
            authErrorDisplay.textContent = 'Username and password are required.';
            authErrorDisplay.style.display = 'block';
        }
        return;
    }
    chrome.runtime.sendMessage({ action: 'login', username, password });
}

// NEW: Handle Register
function handleRegister() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    if (!username || !password) {
        if (authErrorDisplay) {
            authErrorDisplay.textContent = 'Username and password are required.';
            authErrorDisplay.style.display = 'block';
        }
        return;
    }
    chrome.runtime.sendMessage({ action: 'register', username, password });
}

// NEW: Handle Logout
function handleLogout() {
    chrome.runtime.sendMessage({ action: 'logout' });
}

// NEW: Listen for messages from background script (e.g., login/register results)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'authStatusUpdate') {
        updateAuthUI(); // Update UI based on new auth state
        if (message.error && authErrorDisplay) {
            authErrorDisplay.textContent = message.error;
            authErrorDisplay.style.display = 'block';
        } else if (message.successMessage && authErrorDisplay) {
            // Using authErrorDisplay for success messages temporarily, or add a new element
            authErrorDisplay.textContent = message.successMessage;
            authErrorDisplay.className = 'status success'; // Style as success
            authErrorDisplay.style.display = 'block';
            setTimeout(() => { 
                authErrorDisplay.style.display = 'none'; 
                authErrorDisplay.className = 'error-message'; // Reset class
            }, 3000);
        }
    } else if (message.action === 'updatePopupStats') {
        // Handle stats update if needed from other messages
        if (message.interactionCount !== undefined) {
            interactionCount = message.interactionCount;
        }
        updateStatsCard();
    } else if (message.action === 'updateRecordingStatus') {
        updateStatus(message.status, message.sessionId);
        if (message.status === 'recording') {
            interactionCount = message.interactionCount || 0;
            if (message.sessionStartTime) {
                startTime = new Date(message.sessionStartTime);
            } else {
                startTime = new Date(); // Fallback if not provided
            }
            updateDuration(); // Initial duration update
            updateStatsCard();
        }
    }
    return true; // Keep the message channel open for asynchronous sendResponse if needed
}); 