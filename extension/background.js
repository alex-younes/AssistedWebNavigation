// Background script for communication between content script and backend

// Core configuration
let API_BASE_URL = null;
let currentSessionId = null;
let recordingTabId = null;
let recordingStatus = 'idle'; // 'idle', 'recording', 'paused'
let userId = null;
let interactionBuffer = [];
let lastFlushTime = Date.now();
let contentScriptConnected = false;

// Constants for batching
const MAX_BUFFER_SIZE = 20;  // Maximum interactions to buffer before sending
const MAX_BUFFER_TIME = 3000; // Maximum time (ms) to hold interactions

// Initialize state from storage on startup
const initializeState = async () => {
  try {
    // Load persistent state
    const result = await chrome.storage.local.get([
      'recordingStatus',
      'userId',
      'currentSessionId',
      'apiBaseUrl'
    ]);
    
    // Restore state if available
    if (result.recordingStatus) recordingStatus = result.recordingStatus;
    if (result.userId) userId = result.userId;
    if (result.currentSessionId) currentSessionId = result.currentSessionId;
    if (result.apiBaseUrl) API_BASE_URL = result.apiBaseUrl;
    
    console.log('[Extension] Initialized state from storage');
    
    // Update badge based on restored state
    updateBadge();
  } catch (error) {
    console.error('[Extension] Error initializing state:', error);
  }
};

// Call initialize on startup
initializeState();

// Save state to persistent storage whenever it changes
const saveState = async () => {
  try {
    await chrome.storage.local.set({
      recordingStatus,
      userId,
      currentSessionId,
      apiBaseUrl: API_BASE_URL
    });
  } catch (error) {
    console.error('[Extension] Error saving state:', error);
  }
};

// Update badge to reflect recording state
const updateBadge = () => {
  if (recordingStatus === 'recording') {
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
};

// Update recording status
const updateRecordingStatus = (status, sessionId = null) => {
  recordingStatus = status;
  
  if (sessionId) {
    currentSessionId = sessionId;
  }
  
  // Save state
  saveState();
  
  // Update badge
  updateBadge();
};

// Check if API URL is set, if not use default
const checkApiUrl = () => {
  if (!API_BASE_URL) {
    API_BASE_URL = 'http://localhost:3001/api';
  }
  return API_BASE_URL;
};

// Generate a user ID if none exists
const initializeUserId = async () => {
  if (userId) return userId;
  
  userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
  await saveState();
  return userId;
};

// Helper function to ensure content script is loaded
const ensureContentScriptLoaded = async (tabId) => {
  console.log(`[Extension] Ensuring content script is loaded in tab ${tabId}`);
  
  try {
    // Try to ping the content script
    return new Promise(resolve => {
      chrome.tabs.sendMessage(tabId, { action: 'ping' }, response => {
        if (chrome.runtime.lastError) {
          // Content script not loaded, inject it now
          console.log('[Extension] Content script not found, injecting it now...');
          
          chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
          })
          .then(() => {
            console.log('[Extension] Content script injected successfully');
            contentScriptConnected = true;
            setTimeout(resolve, 500); // Wait a bit for initialization
          })
          .catch(error => {
            console.error('[Extension] Failed to inject content script:', error);
            contentScriptConnected = false;
            resolve(false);
          });
        } else {
          console.log('[Extension] Content script is already loaded');
          contentScriptConnected = true;
          resolve(true);
        }
      });
    });
  } catch (error) {
    console.error('[Extension] Error checking for content script:', error);
    return false;
  }
};

// Start a recording session
const startRecordingSession = async (sessionId, tabInfo = null) => {
  try {
    // Make sure we have an API URL
    checkApiUrl();
    
    // Make sure we have a user ID
    await initializeUserId();
    
    // Get current tab if not provided
    if (!tabInfo) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs.length === 0) {
        throw new Error('No active tab found');
      }
      tabInfo = tabs[0];
    }
    
    // Update recording tab and status
    recordingTabId = tabInfo.id;
    updateRecordingStatus('recording', sessionId);
    
    // Save session to backend
    await fetch(`${API_BASE_URL}/extension/recorder/saveSession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        userId,
        url: tabInfo.url,
        browser: 'chrome',
        metadata: {
          title: tabInfo.title
        }
      })
    });
    
    console.log(`[Extension] Started recording session ${sessionId}`);
    
    // Make sure content script is loaded before sending message
    const contentLoaded = await ensureContentScriptLoaded(recordingTabId);
    
    if (contentLoaded || contentScriptConnected) {
      // Notify content script to start recording
      console.log(`[Extension] Sending startRecording message to tab ${recordingTabId}`);
      
      chrome.tabs.sendMessage(recordingTabId, {
        action: 'startRecording',
        sessionId,
        userId
      }, response => {
        if (chrome.runtime.lastError) {
          console.error('[Extension] Error starting recording in content script:', chrome.runtime.lastError);
        } else {
          console.log('[Extension] Content script started recording:', response);
        }
      });
    } else {
      console.error('[Extension] Cannot start recording: content script not available');
    }
    
    return { success: true, sessionId };
  } catch (error) {
    console.error('[Extension] Error starting recording session:', error);
    updateRecordingStatus('idle');
    return { success: false, error: error.message };
  }
};

// Stop a recording session
const stopRecordingSession = async () => {
  try {
    if (recordingStatus !== 'recording') {
      return { success: false, error: 'Not currently recording' };
    }
    
    // Flush any pending interactions
    await flushInteractionBuffer();
    
    // Update status
    const sessionId = currentSessionId;
    updateRecordingStatus('idle', null);
    
    // Notify content script to stop recording
    if (recordingTabId && contentScriptConnected) {
      try {
        console.log(`[Extension] Sending stopRecording message to tab ${recordingTabId}`);
        
        chrome.tabs.sendMessage(recordingTabId, {
          action: 'stopRecording'
        }, response => {
          if (chrome.runtime.lastError) {
            console.warn('[Extension] Error stopping recording in content script:', chrome.runtime.lastError);
          } else {
            console.log('[Extension] Content script stopped recording:', response);
          }
        });
      } catch (error) {
        console.log('[Extension] Error sending stop message to content script:', error);
      }
    } else {
      console.warn('[Extension] Not sending stop message: tab or content script not available');
    }
    
    // Notify server that recording has stopped
    await fetch(`${API_BASE_URL}/extension/recorder/stopSession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        userId,
        reason: 'user_stopped'
      })
    });
    
    console.log(`[Extension] Stopped recording session ${sessionId}`);
    
    return { success: true, sessionId };
  } catch (error) {
    console.error('[Extension] Error stopping recording session:', error);
    return { success: false, error: error.message };
  }
};

// Handle connections from content scripts
chrome.runtime.onConnect.addListener(port => {
  if (port.name === "recording-port") {
    console.log('[Extension] Content script connected via port');
    contentScriptConnected = true;
    
    port.onDisconnect.addListener(() => {
      console.log('[Extension] Content script disconnected');
      contentScriptConnected = false;
    });
    
    port.onMessage.addListener(message => {
      console.log('[Extension] Received port message:', message);
      
      if (message.action === 'recordInteraction' && message.interaction) {
        addInteraction(message.interaction);
      }
    });
  }
});

// Receive message from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      console.log('[Extension] Received message:', message.action, sender.tab ? `from tab ${sender.tab.id}` : 'from popup');
      
      // If message is from a content script in a tab, update the recordingTabId
      if (sender.tab && recordingStatus === 'recording') {
        recordingTabId = sender.tab.id;
        contentScriptConnected = true;
      }
      
      // Handle message based on action
      switch (message.action) {
        case 'ping':
          // Just respond to verify content script connection
          sendResponse({ pong: true });
          break;
          
        case 'startRecording':
          const sessionId = 'session_' + Date.now();
          const result = await startRecordingSession(sessionId);
          sendResponse(result);
          break;
          
        case 'stopRecording':
          const stopResult = await stopRecordingSession();
          sendResponse(stopResult);
          break;
          
        case 'getStatus':
          sendResponse({
            recordingStatus,
            currentSessionId,
            userId
          });
          break;
          
        case 'setApiUrl':
          API_BASE_URL = message.url;
          await saveState();
          sendResponse({ success: true });
          break;
          
        case 'recordInteraction':
          console.log('[Extension] Received recordInteraction message:', message.interaction?.type);
          addInteraction(message.interaction);
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
          break;
      }
    } catch (error) {
      console.error('[Extension] Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();
  
  // Required for async sendResponse
  return true;
});

// Add interaction to buffer
const addInteraction = (interaction) => {
  console.log('[Extension] Processing interaction:', interaction.type);

  // Special handling for DOM state interactions
  if (interaction.type === 'dom_state' && interaction.stateData) {
    console.log('[Extension] Received DOM state data:', interaction.stateData.stateId);
    
    // Send DOM state to backend directly
    fetch(`${API_BASE_URL}/extension/recorder/saveDOMState`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        state: interaction.stateData,
        sessionId: currentSessionId || interaction.sessionId,
        userId: userId || interaction.userId
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to save DOM state: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log(`[Extension] Saved DOM state: ${interaction.stateData.stateId}`);
    })
    .catch(error => {
      console.error('[Extension] Error saving DOM state:', error);
    });
    
    return; // Skip regular interaction handling for DOM states
  }
  
  // For normal interactions
  // Add timestamp if not provided
  if (!interaction.timestamp) {
    interaction.timestamp = new Date().toISOString();
  }
  
  // Add session and user IDs if not already present
  if (!interaction.sessionId) {
    interaction.sessionId = currentSessionId;
  }
  
  if (!interaction.userId) {
    interaction.userId = userId;
  }
  
  // Add to buffer
  interactionBuffer.push(interaction);
  console.log(`[Extension] Added ${interaction.type} interaction to buffer (buffer size: ${interactionBuffer.length})`);
  
  // Check if buffer should be flushed
  const now = Date.now();
  if (interactionBuffer.length >= MAX_BUFFER_SIZE || now - lastFlushTime >= MAX_BUFFER_TIME) {
    flushInteractionBuffer();
  }
};

// Send interactions to backend
const flushInteractionBuffer = async () => {
  if (interactionBuffer.length === 0) return;
  
  try {
    const interactions = [...interactionBuffer]; // Make a copy
    interactionBuffer = []; // Clear buffer
    lastFlushTime = Date.now();
    
    console.log(`[Extension] Flushing ${interactions.length} interactions to backend...`);
    
    // Send to backend
    const response = await fetch(`${API_BASE_URL}/extension/recorder/saveInteractions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        interactions,
        sessionId: currentSessionId,
        userId
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save interactions: ${response.status} ${response.statusText}`);
    }
    
    console.log(`[Extension] Successfully sent ${interactions.length} interactions to backend`);
  } catch (error) {
    console.error('[Extension] Error sending interactions to backend:', error);
    
    // Add interactions back to the buffer
    interactionBuffer = [...interactionBuffer, ...interactions];
    
    // Limit buffer size to prevent memory issues
    if (interactionBuffer.length > MAX_BUFFER_SIZE * 3) {
      interactionBuffer = interactionBuffer.slice(-MAX_BUFFER_SIZE * 3);
    }
  }
};

// Flush buffer periodically
setInterval(flushInteractionBuffer, MAX_BUFFER_TIME);

// Listen for tab close events to stop recording if necessary
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recordingTabId && recordingStatus === 'recording') {
    console.log('[Extension] Recording tab closed, stopping recording');
    stopRecordingSession();
  }
});

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabId === recordingTabId && recordingStatus === 'recording' && changeInfo.status === 'complete') {
    console.log('[Extension] Recording tab updated, ensuring content script is loaded');
    ensureContentScriptLoaded(tabId).then(loaded => {
      if (loaded && currentSessionId) {
        chrome.tabs.sendMessage(tabId, {
          action: 'startRecording',
          sessionId: currentSessionId,
          userId
        });
      }
    });
  }
});