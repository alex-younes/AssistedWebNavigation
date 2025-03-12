// Background script for communication between content script and backend

// Config 
let API_BASE_URL = null;
let currentSessionId = null;
let recordingTabId = null;
let recordingStatus = 'idle'; // 'idle', 'recording', 'paused', 'error'
let interactionBuffer = []; // Buffer to store interactions if connection fails
let interactionCount = 0;
let lastSyncTime = null;

// User identification management
let userId = null;

// Add debugging at the top
const DEBUG = true;
let lastStateCheck = Date.now();

// Add at the top of the file after initial declarations
let ports = new Map(); // Store connections to content scripts
let keepAliveInterval;

// Add server configuration state
let isServerConfigured = false;

function debugLog(message, data = null) {
    if (!DEBUG) return;
    const timestamp = new Date().toISOString();
    const logMessage = `[DEBUG][${timestamp}] ${message}`;
    if (data) {
        console.log(logMessage, data);
    } else {
        console.log(logMessage);
    }
}

function logBackgroundState() {
    if (!DEBUG) return;
    debugLog('Background State:', {
        currentSessionId,
        recordingTabId,
        recordingStatus,
        interactionCount,
        bufferSize: interactionBuffer.length,
        timeSinceLastSync: lastSyncTime ? Date.now() - lastSyncTime : null,
        timeSinceLastStateCheck: Date.now() - lastStateCheck
    });
    lastStateCheck = Date.now();
}

// Modify the server config handling
chrome.storage.sync.get(['serverConfig'], (result) => {
    if (result.serverConfig) {
        const { ip, port } = result.serverConfig;
        API_BASE_URL = `http://${ip}:${port}/api`;
        isServerConfigured = true;
        debugLog('Server configured:', API_BASE_URL);
    } else {
        debugLog('No server configuration found');
        isServerConfigured = false;
    }
});

// Update server config listener
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.serverConfig) {
        const { ip, port } = changes.serverConfig.newValue;
        API_BASE_URL = `http://${ip}:${port}/api`;
        isServerConfigured = true;
        debugLog('Server configuration updated:', API_BASE_URL);
    }
});

// Helper function to check if API URL is configured
const checkApiUrl = () => {
  if (!API_BASE_URL) {
    throw new Error('Server not configured. Please set server IP and port in extension settings.');
  }
};

// Initialize user ID on extension install or startup
const initializeUserId = async () => {
  try {
    console.log('[DEBUG] Initializing user ID...');
    // Try to get existing user ID
    const data = await chrome.storage.local.get('userId');
    if (data.userId) {
      userId = data.userId;
      console.log('[Extension] Retrieved existing user ID:', userId);
      console.log('[DEBUG] Retrieved existing user ID:', userId);
    } else {
      // Generate new user ID if none exists
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      await chrome.storage.local.set({ userId });
      console.log('[Extension] Generated new user ID:', userId);
      console.log('[DEBUG] Generated new user ID:', userId);
    }
  } catch (error) {
    console.error('[Extension] Error initializing user ID:', error);
    console.log('[DEBUG] Error initializing user ID:', error.message);
  }
};

// Initialize user ID when extension loads
initializeUserId();

// Helper to send interactions to backend with retry logic
const sendInteractionsToBackend = async (interactions) => {
    try {
        checkApiUrl();
        if (!interactions || interactions.length === 0) return;
        
        // Ensure we have a user ID
        if (!userId) {
            await initializeUserId();
        }
        
        console.log(`[Extension] Sending ${interactions.length} interactions to backend for session ${currentSessionId} and user ${userId}`);
        console.log('[Extension] Sample interaction:', interactions[0]);
        
        // Send batch of interactions with user ID
        const response = await fetch(`${API_BASE_URL}/extension/recorder/saveInteractions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                interactions,
                sessionId: currentSessionId,
                userId: userId
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('[Extension] Failed to save interactions:', errorData);
            return false;
        }
        
        const data = await response.json();
        if (data.success) {
            console.log(`[Extension] Successfully sent ${interactions.length} interactions to backend`);
            lastSyncTime = Date.now();
            return true;
        }
        
        console.error('[Extension] Backend reported failure saving interactions:', data);
        return false;
    } catch (error) {
        console.error('[Extension] Error sending interactions:', error);
        // Log the actual interactions that failed to send
        console.error('[Extension] Failed interactions:', JSON.stringify(interactions, null, 2));
        return false;
    }
};

// Send any buffered interactions
const flushInteractionBuffer = async () => {
  if (interactionBuffer.length > 0) {
    const success = await sendInteractionsToBackend([...interactionBuffer]);
    if (success) {
      interactionBuffer = [];
    }
  }
};

// Set up periodic buffer flushing (every 1.5 seconds)
setInterval(flushInteractionBuffer, 1500);

// Listen for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('Received message:', { action: request.action, sender });
  logBackgroundState();
  
  // Handle DOM capture request from popup
  if (request.action === "captureDOM") {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      
      // Execute script to capture DOM via content script
      chrome.tabs.sendMessage(activeTab.id, { action: 'captureDom' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Extension] Error capturing DOM:', chrome.runtime.lastError);
          sendResponse({ 
            success: false, 
            error: chrome.runtime.lastError.message || 'Failed to capture DOM' 
          });
          return;
        }
        
        // Send DOM to backend
        const domData = response.domContent;
        fetch(`${API_BASE_URL}/extension/capture`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            url: activeTab.url,
            domContent: {
              html: domData.html,
              title: domData.title
            },
            metadata: {
              title: domData.title,
              url: activeTab.url,
              timestamp: new Date().toISOString()
            }
          })
        })
        .then(response => response.json())
        .then(data => {
          sendResponse({ success: true, data });
        })
        .catch(error => {
          console.error('[Extension] Error sending DOM to backend:', error);
          sendResponse({ success: false, error: error.toString() });
        });
      });
    });
    
    // Keep the message channel open for the async response
    return true;
  }
  
  // Handle start recording request from popup
  if (request.action === "startRecording") {
    console.log('[DEBUG] Starting recording...');
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        try {
            if (!tabs || !tabs[0]) {
                console.error('[Extension] No active tab found');
                console.log('[DEBUG] Error: No active tab found');
                sendResponse({ 
                    success: false, 
                    error: 'No active tab found' 
                });
                return;
            }

            const activeTab = tabs[0];
            
            // Check if already recording
            if (recordingStatus === 'recording') {
                sendResponse({
                    success: false,
                    error: 'Already recording in another tab'
                });
                return;
            }
            
            // Reset counters
            interactionCount = 0;
            interactionBuffer = [];
            lastSyncTime = Date.now();
            
            // Ensure we have a user ID
            if (!userId) {
                await initializeUserId();
            }
            
            // Create a new session ID
            const newSessionId = `ext-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            try {
                // Verify server connection before proceeding
                debugLog('Verifying server connection');
                const response = await fetch(`${API_BASE_URL}/extension/recorder/verifyConnection`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ test: true })
                });
                
                if (!response.ok) {
                    throw new Error('Server connection failed');
                }
                
                // Create new recording session on backend
                const sessionResponse = await fetch(`${API_BASE_URL}/extension/recorder/saveSession`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: newSessionId,
                        userId: userId,
                        url: activeTab.url,
                        title: activeTab.title,
                        startTime: new Date().toISOString(),
                        source: 'extension'
                    })
                });
                
                if (!sessionResponse.ok) {
                    throw new Error('Failed to create recording session on server');
                }
                
                const sessionData = await sessionResponse.json();
                
                if (!sessionData.success) {
                    throw new Error(sessionData.error || 'Failed to create recording session');
                }
                
                // Set session state
                currentSessionId = newSessionId;
                recordingTabId = activeTab.id;
                recordingStatus = 'recording';
                
                // Start recording on the content script
                chrome.tabs.sendMessage(activeTab.id, { 
                    action: 'startRecording',
                    sessionId: currentSessionId,
                    userId: userId
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        console.error('[Extension] Error starting recording:', chrome.runtime.lastError);
                        recordingStatus = 'error';
                        sendResponse({ 
                            success: false, 
                            error: chrome.runtime.lastError.message || 'Failed to communicate with page' 
                        });
                        return;
                    }
                    
                    if (!response || !response.success) {
                        recordingStatus = 'error';
                        sendResponse({
                            success: false,
                            error: response?.error || 'Content script failed to start recording'
                        });
                        return;
                    }
                    
                    // Start keepalive
                    keepAlive();
                    
                    // Update popup with recording status
                    sendResponse({ 
                        success: true, 
                        sessionId: currentSessionId,
                        status: recordingStatus,
                        message: 'Recording started'
                    });
                    
                    // Notify the backend that we've started recording
                    updateRecordingStatus('recording');
                });
            } catch (error) {
                console.error('[Extension] Error starting recording:', error);
                recordingStatus = 'error';
                sendResponse({ 
                    success: false, 
                    error: error.message || 'Failed to start recording'
                });
            }
        } catch (error) {
            console.error('[Extension] Error in start recording handler:', error);
            sendResponse({ 
                success: false, 
                error: error.message || 'Unknown error starting recording'
            });
        }
    });
    
    return true; // Keep the message channel open for the async response
  }
  
  // Handle stop recording request from popup
  if (request.action === "stopRecording") {
    console.log('[DEBUG] Stopping recording...');
    if (recordingTabId && currentSessionId) {
      console.log(`[DEBUG] Stopping recording for session ${currentSessionId} in tab ${recordingTabId}`);
      chrome.tabs.sendMessage(recordingTabId, { action: 'stopRecording' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Extension] Error stopping recording:', chrome.runtime.lastError);
          console.log('[DEBUG] Error stopping recording:', chrome.runtime.lastError.message);
          sendResponse({ 
            success: false, 
            error: chrome.runtime.lastError.message || 'Failed to communicate with page' 
          });
          return;
        }
        
        recordingStatus = 'idle';
        
        // Final flush of buffer
        flushInteractionBuffer().then(() => {
          // Send completion notification to backend
          fetch(`${API_BASE_URL}/extension/recorder/completeSession`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              sessionId: currentSessionId,
              endTime: new Date().toISOString(),
              interactionCount: interactionCount
            })
          })
          .then(response => response.json())
          .then(data => {
            // Reset session state
            const completedSessionId = currentSessionId;
            currentSessionId = null;
            recordingTabId = null;
            
            sendResponse({ 
              success: true, 
              sessionId: completedSessionId,
              status: 'completed',
              data: data,
              interactionCount: interactionCount
            });
            
            // Notify the backend recording has stopped
            fetch(`${API_BASE_URL}/extension/recorder/notifyRecordingStatus`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                status: 'idle',
                sessionId: completedSessionId
              })
            }).catch(err => console.error('[Extension] Failed to notify recording status:', err));
            
            // Update the recording status in backend
            updateRecordingStatus('idle');
          })
          .catch(error => {
            console.error('[Extension] Error completing session:', error);
            
            // Reset session state even on error
            currentSessionId = null;
            recordingTabId = null;
            
            sendResponse({ 
              success: false, 
              error: error.toString() 
            });
          });
        });
      });
    } else {
      sendResponse({ 
        success: false, 
        error: 'No active recording to stop' 
      });
    }
    
    return true;
  }
  
  // Handle incoming interaction from content script
  if (request.action === "saveInteraction" && sender.tab) {
    const interaction = request.interaction;
    
    console.log('[Extension] Received interaction from content script:', {
        type: interaction?.type,
        sessionId: interaction?.sessionId,
        userId: interaction?.userId
    });
    
    if (!interaction || !interaction.sessionId) {
        console.error('[Extension] Invalid interaction data:', interaction);
        sendResponse({ success: false, error: 'Invalid interaction data' });
        return true;
    }
    
    if (!currentSessionId) {
        console.error('[Extension] No active recording session');
        // Send response to content script so it can stop recording locally
        sendResponse({ 
            success: false, 
            error: 'No active recording session',
            shouldStopRecording: true
        });
        return true;
    }
    
    if (interaction.sessionId !== currentSessionId) {
        console.error('[Extension] Session ID mismatch:', {
            received: interaction.sessionId,
            current: currentSessionId
        });
        // Send response to content script so it can stop recording locally
        sendResponse({ 
            success: false, 
            error: 'Session ID mismatch',
            shouldStopRecording: true
        });
        return true;
    }
    
    // Increment counter
    interactionCount++;
    console.log(`[Extension] Added interaction to buffer. Total count: ${interactionCount}`);
    
    // Add to buffer for batch sending
    interactionBuffer.push(interaction);
    
    // If we have enough interactions or it's been a while, flush immediately
    if (interactionBuffer.length >= 5 || (lastSyncTime && Date.now() - lastSyncTime > 2000)) {
        console.log('[Extension] Triggering immediate buffer flush');
        flushInteractionBuffer();
    }
    
    sendResponse({ success: true });
    return true; // Keep message channel open
  }
  
  // Handle get status request from popup
  if (request.action === "getRecordingStatus") {
    sendResponse({ 
      success: true, 
      status: recordingStatus,
      sessionId: currentSessionId,
      tabId: recordingTabId,
      interactionCount: interactionCount
    });
    return false;
  }
  
  // Listen for tab updates to detect navigation
  if (request.action === "tabNavigated" && sender.tab) {
    if (recordingStatus === 'recording' && sender.tab.id === recordingTabId) {
      // Tab being recorded has navigated, maintain recording state
      console.log('[Extension] Recording tab navigated, maintaining recording state');
      
      // Record a navigation interaction
      const navigationInteraction = {
        sessionId: currentSessionId,
        userId: userId,
        type: 'navigation',
        timestamp: new Date().toISOString(),
        url: sender.tab.url,
        pageTitle: sender.tab.title || 'Unknown',
        details: {
          fromUrl: request.previousUrl,
          toUrl: sender.tab.url,
          navigationType: request.isReload ? 'reload' : 'navigation'
        }
      };
      
      interactionBuffer.push(navigationInteraction);
      interactionCount++;
      flushInteractionBuffer();
    }
    return true; // Keep message channel open
  }
});

// Function to update recording status in backend
function updateRecordingStatus(status) {
  try {
    const requestData = {
      status: status,
      sessionId: currentSessionId,
      userId: userId,
      sessionData: {
        interactionCount: interactionCount,
        lastSyncTime: lastSyncTime,
        userId: userId
      }
    };
    
    console.log(`Updating recording status to ${status}`);
    
    // Update backend about status change
    fetch(`${API_BASE_URL}/extension/recorder/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    })
    .then(response => response.json())
    .then(data => {
      console.log('Status update sent to backend:', data);
    })
    .catch(error => {
      console.error('Error updating status:', error);
    });
  } catch (error) {
    console.error('Error in updateRecordingStatus:', error);
  }
}

// Listen for tab close events
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
  if (tabId === recordingTabId && recordingStatus === 'recording') {
    // Recording tab was closed
    console.log('[Extension] Recording tab closed, stopping recording');
    console.log('[DEBUG] Recording tab closed, stopping recording. TabId:', tabId);
    
    // Final buffer flush
    flushInteractionBuffer().then(() => {
      // Notify backend that recording was interrupted
      if (currentSessionId) {
        fetch(`${API_BASE_URL}/extension/recorder/completeSession`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            sessionId: currentSessionId,
            endTime: new Date().toISOString(),
            status: 'interrupted',
            reason: 'Tab closed',
            interactionCount: interactionCount
          })
        })
        .then(response => response.json())
        .then(data => {
          console.log('[Extension] Session marked as interrupted:', data);
        })
        .catch(error => {
          console.error('[Extension] Error completing interrupted session:', error);
        })
        .finally(() => {
          // Reset recording state
          currentSessionId = null;
          recordingTabId = null;
          recordingStatus = 'idle';
          updateRecordingStatus('idle');
          
          // Notify the backend recording has stopped
          fetch(`${API_BASE_URL}/extension/recorder/notifyRecordingStatus`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: 'idle',
              sessionId: currentSessionId
            })
          }).catch(err => console.error('[Extension] Failed to notify recording status:', err));
        });
      }
    });
  }
});

// Listen for tab updates to detect navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    debugLog('Tab Update Event:', { tabId, changeInfo, tab });
    logBackgroundState();
    
    // Only handle tabs that are part of the recording
    if (!currentSessionId || tabId !== recordingTabId) {
        debugLog('Ignoring tab update - not recording tab');
        return;
    }

    // Track loading states
    if (changeInfo.status) {
        debugLog('Tab loading status changed:', {
            status: changeInfo.status,
            url: tab.url,
            isRecordingTab: tabId === recordingTabId
        });
    }

    // Only handle complete loads
    if (changeInfo.status === 'complete') {
        debugLog('Tab load complete, checking recording state');
        
        // Small delay to ensure content script is ready
        setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
                action: 'startRecording',
                sessionId: currentSessionId,
                userId: userId,
                isRestore: true
            }, (response) => {
                if (chrome.runtime.lastError) {
                    debugLog('Error reinitializing recording:', chrome.runtime.lastError);
                    return;
                }
                debugLog('Recording reinitialized successfully');
            });
        }, 200);
    }
});

// Update the saveInteraction handler to be more resilient
function saveInteraction(interaction) {
    if (!interaction.sessionId) {
        console.log('[DEBUG] Received interaction without sessionId');
        return;
    }

    // If we have a valid session ID, accept the interaction
    if (interaction.sessionId === currentSessionId) {
        console.log('[DEBUG] Processing interaction for current session');
        interactionBuffer.push(interaction);
        interactionCount++;

        // Trigger immediate flush if buffer is getting full
        if (interactionBuffer.length >= 10) {
            flushInteractionBuffer();
        }
    }
}

// Track tab activation
chrome.tabs.onActivated.addListener((activeInfo) => {
    debugLog('Tab activated:', activeInfo);
    logBackgroundState();
    
    if (recordingTabId && activeInfo.tabId !== recordingTabId) {
        debugLog('Switched away from recording tab');
    } else if (recordingTabId && activeInfo.tabId === recordingTabId) {
        debugLog('Switched back to recording tab');
    }
});

// Keep service worker alive
function keepAlive() {
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
    }
    
    keepAliveInterval = setInterval(() => {
        if (currentSessionId) {
            chrome.runtime.getPlatformInfo(() => {});
        } else {
            clearInterval(keepAliveInterval);
        }
    }, 20000); // Ping every 20 seconds while recording
}

// Handle port connections from content scripts
chrome.runtime.onConnect.addListener((port) => {
    debugLog('New port connection', { name: port.name });
    
    if (port.name === 'recording-port') {
        const tabId = port.sender.tab.id;
        ports.set(tabId, port);
        
        port.onMessage.addListener((msg) => {
            handlePortMessage(msg, port);
        });
        
        port.onDisconnect.addListener(() => {
            debugLog('Port disconnected', { tabId });
            ports.delete(tabId);
            
            // If this was the recording tab, handle cleanup
            if (tabId === recordingTabId) {
                handleRecordingTabDisconnect();
            }
        });
    }
});

// Handle messages from ports
function handlePortMessage(msg, port) {
    debugLog('Received port message', msg);
    
    if (msg.action === "saveInteraction") {
        saveInteraction(msg.interaction);
    }
}

// Handle recording tab disconnect
function handleRecordingTabDisconnect() {
    if (currentSessionId) {
        debugLog('Recording tab disconnected, attempting to reconnect');
        
        // Try to reconnect to the tab
        chrome.tabs.get(recordingTabId, (tab) => {
            if (chrome.runtime.lastError) {
                debugLog('Tab no longer exists, stopping recording');
                stopRecording();
                return;
            }
            
            // Reinitialize recording in the tab
            chrome.tabs.sendMessage(recordingTabId, {
                action: 'startRecording',
                sessionId: currentSessionId,
                userId: userId,
                isRestore: true
            });
        });
    }
}

// Add this helper function at the top
async function injectContentScriptIfNeeded(tabId) {
    try {
        // Check if content script is already injected
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        debugLog('Content script already injected');
        return true;
    } catch (error) {
        debugLog('Content script not injected, injecting now');
        
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            debugLog('Content script injected successfully');
            return true;
        } catch (error) {
            debugLog('Failed to inject content script:', error);
            return false;
        }
    }
}

// Add retry helper
async function retryOperation(operation, maxAttempts = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            debugLog(`Attempt ${attempt} of ${maxAttempts}`);
            return await operation();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            debugLog(`Attempt ${attempt} failed, retrying in ${delay}ms`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// Update startRecording function with better error handling
async function startRecording(tab) {
    try {
        debugLog('Starting recording');
        
        // Check server configuration first
        if (!isServerConfigured) {
            throw new Error('Server not configured. Please configure server settings first.');
        }
        
        // Make sure we have a valid tab
        if (!tab || !tab.id) {
            throw new Error('Invalid tab');
        }
        
        // Make sure we have a user ID
        if (!userId) {
            await initializeUserId();
        }
        
        // Ensure content script is injected
        debugLog('Checking content script injection');
        const injected = await injectContentScriptIfNeeded(tab.id);
        if (!injected) {
            throw new Error('Failed to inject content script');
        }
        
        // Create new session
        const newSessionId = `ext-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Verify server connection before proceeding
        try {
            debugLog('Verifying server connection');
            const response = await fetch(`${API_BASE_URL}/extension/recorder/verifyConnection`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ test: true })
            });
            
            if (!response.ok) {
                throw new Error('Server connection failed');
            }
        } catch (error) {
            throw new Error(`Server connection error: ${error.message}`);
        }
        
        // Set session state
        currentSessionId = newSessionId;
        recordingTabId = tab.id;
        recordingStatus = 'recording';
        
        // Start keepalive
        keepAlive();
        
        // Initialize content script with retry
        debugLog('Initializing content script');
        await retryOperation(async () => {
            const response = await chrome.tabs.sendMessage(tab.id, {
                action: 'startRecording',
                sessionId: currentSessionId,
                userId: userId
            });
            
            if (!response || !response.success) {
                throw new Error('Content script failed to start recording');
            }
            
            return response;
        });
        
        debugLog('Recording started successfully');
        return { success: true, sessionId: currentSessionId };
    } catch (error) {
        const errorMessage = error.message || 'Unknown error starting recording';
        debugLog('Error starting recording:', errorMessage);
        recordingStatus = 'error';
        currentSessionId = null;
        recordingTabId = null;
        return { 
            success: false, 
            error: errorMessage,
            details: error.toString()
        };
    }
}

// Modify stopRecording function
function stopRecording() {
    debugLog('Stopping recording');
    
    if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
    
    // Rest of existing stopRecording code...
}

console.log('[Extension] Background script loaded'); 