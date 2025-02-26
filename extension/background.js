// Background script for communication between content script and backend

// Config 
let API_BASE_URL = null;
let currentSessionId = null;
let recordingTabId = null;
let recordingStatus = 'idle'; // 'idle', 'recording', 'paused', 'error'
let interactionBuffer = []; // Buffer to store interactions if connection fails
let interactionCount = 0;
let lastSyncTime = null;

// Initialize API URL from storage
chrome.storage.sync.get(['serverConfig'], (result) => {
  if (result.serverConfig) {
    const { ip, port } = result.serverConfig;
    API_BASE_URL = `http://${ip}:${port}/api`;
    console.log('[Extension] Using API URL:', API_BASE_URL);
  } else {
    console.warn('[Extension] No server configuration found. Please configure server settings.');
  }
});

// Listen for changes to server config
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes.serverConfig) {
    const { ip, port } = changes.serverConfig.newValue;
    API_BASE_URL = `http://${ip}:${port}/api`;
    console.log('[Extension] Updated API URL:', API_BASE_URL);
  }
});

// Helper function to check if API URL is configured
const checkApiUrl = () => {
  if (!API_BASE_URL) {
    throw new Error('Server not configured. Please set server IP and port in extension settings.');
  }
};

// Helper to send interactions to backend with retry logic
const sendInteractionsToBackend = async (interactions) => {
  try {
    checkApiUrl();
    if (!interactions || interactions.length === 0) return;
    
    // Send batch of interactions
    const response = await fetch(`${API_BASE_URL}/extension/recorder/saveInteractions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        interactions,
        sessionId: currentSessionId
      })
    });
    
    const data = await response.json();
    if (data.success) {
      console.log(`[Extension] Sent ${interactions.length} interactions to backend`);
      lastSyncTime = Date.now();
      return true;
    }
    return false;
  } catch (error) {
    console.error('[Extension] Error sending interactions:', error);
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
  console.log('[Extension] Background received message:', request.action);
  
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
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      recordingTabId = activeTab.id;
      
      // Reset counters
      interactionCount = 0;
      interactionBuffer = [];
      lastSyncTime = Date.now();
      
      // Create a new recording session on the backend
      fetch(`${API_BASE_URL}/extension/recorder/saveSession`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: `ext-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          url: activeTab.url,
          title: activeTab.title,
          startTime: new Date().toISOString(),
          source: 'extension'
        })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          currentSessionId = data.sessionId;
          recordingStatus = 'recording';
          
          // Start recording on the content script
          chrome.tabs.sendMessage(activeTab.id, { 
            action: 'startRecording',
            sessionId: currentSessionId
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
            
            // Update popup with recording status
            sendResponse({ 
              success: true, 
              sessionId: currentSessionId,
              status: recordingStatus,
              message: 'Recording started'
            });
            
            // Notify the backend that we've started recording
            fetch(`${API_BASE_URL}/extension/recorder/notifyRecordingStatus`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                status: 'recording',
                sessionId: currentSessionId,
                tabUrl: activeTab.url,
                tabTitle: activeTab.title
              })
            }).catch(err => console.error('[Extension] Failed to notify recording status:', err));
            
            // Update the recording status in backend
            updateRecordingStatus('recording');
          });
        } else {
          recordingStatus = 'error';
          sendResponse({ 
            success: false, 
            error: data.error || 'Failed to create recording session'
          });
        }
      })
      .catch(error => {
        console.error('[Extension] Error creating recording session:', error);
        recordingStatus = 'error';
        sendResponse({ 
          success: false, 
          error: error.toString() 
        });
      });
    });
    
    return true;
  }
  
  // Handle stop recording request from popup
  if (request.action === "stopRecording") {
    if (recordingTabId && currentSessionId) {
      chrome.tabs.sendMessage(recordingTabId, { action: 'stopRecording' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Extension] Error stopping recording:', chrome.runtime.lastError);
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
    
    if (!interaction || !interaction.sessionId) {
      console.error('[Extension] Invalid interaction data:', interaction);
      return false;
    }
    
    // Increment counter
    interactionCount++;
    
    // Add to buffer for batch sending
    interactionBuffer.push(interaction);
    
    // If we have enough interactions or it's been a while, flush immediately
    if (interactionBuffer.length >= 5 || (lastSyncTime && Date.now() - lastSyncTime > 2000)) {
      flushInteractionBuffer();
    }
    
    return false; // No response needed
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
  
  // Handle tab navigation
  if (request.action === "tabNavigated" && sender.tab) {
    if (recordingStatus === 'recording' && sender.tab.id === recordingTabId) {
      // Tab being recorded has navigated, need to reinitialize recording
      console.log('[Extension] Recording tab navigated, reinitializing recording');
      
      // Reinitialize recording on the new page
      chrome.tabs.sendMessage(recordingTabId, {
        action: 'startRecording',
        sessionId: currentSessionId,
        isPageReload: true
      });
      
      // Record a navigation interaction
      const navigationInteraction = {
        sessionId: currentSessionId,
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
    return false;
  }
});

// Function to update recording status in backend
function updateRecordingStatus(status) {
  try {
    const requestData = {
      status: status,
      sessionId: currentSessionId,
      sessionData: {
        interactionCount: interactionCount,
        lastSyncTime: lastSyncTime
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
  if (tabId === recordingTabId && recordingStatus === 'recording' && changeInfo.status === 'complete') {
    console.log('[Extension] Recording tab navigated/reloaded');
    
    // Reinitialize recording on this tab
    setTimeout(() => {
      chrome.tabs.sendMessage(tabId, {
        action: 'startRecording',
        sessionId: currentSessionId,
        isPageReload: true
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[Extension] Could not initialize content script after navigation, will retry');
          
          // Content script might not be ready yet, try again
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
              action: 'startRecording',
              sessionId: currentSessionId,
              isPageReload: true
            });
          }, 500);
        }
      });
    }, 200);
  }
});

console.log('[Extension] Background script loaded'); 