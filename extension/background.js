// Simplified Background Script for DOM State Tracking

// Core configuration
let API_BASE_URL = 'http://localhost:3001/api';
let currentSessionId = null;
let recordingTabId = null;
let recordingStatus = 'idle'; // 'idle', 'recording', 'paused'
let userId = null;

// Initialize state from storage on startup
const initializeState = async () => {
  try {
    const result = await chrome.storage.local.get([
      'recordingStatus',
      'userId',
      'currentSessionId',
      'apiBaseUrl'
    ]);
    
    if (result.recordingStatus) recordingStatus = result.recordingStatus;
    if (result.userId) userId = result.userId;
    if (result.currentSessionId) currentSessionId = result.currentSessionId;
    if (result.apiBaseUrl) API_BASE_URL = result.apiBaseUrl;
    
    console.log('[Extension] Initialized state from storage');
    updateBadge();
  } catch (error) {
    console.error('[Extension] Error initializing state:', error);
  }
};

// Call initialize on startup
initializeState();

// Save state to persistent storage
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

// Generate a user ID if none exists
const initializeUserId = async () => {
  if (userId) return userId;
  
  userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
  await saveState();
  return userId;
};

// Start a recording session
const startRecordingSession = async (sessionId, tabInfo = null) => {
  try {
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
    recordingStatus = 'recording';
    currentSessionId = sessionId;
    updateBadge();
    await saveState();
    
    // Save session to backend
    await fetch(`${API_BASE_URL}/extension/recorder/saveSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        userId,
        url: tabInfo.url,
        browser: 'chrome',
        metadata: { title: tabInfo.title }
      })
    });
    
    console.log(`[Extension] Started recording session ${sessionId}`);
    
    // Notify content script to start recording
    try {
      chrome.tabs.sendMessage(recordingTabId, {
        action: 'startRecording',
        sessionId,
        userId
      });
    } catch (error) {
      console.error('[Extension] Error sending message to content script:', error);
    }
    
    return { success: true, sessionId };
  } catch (error) {
    console.error('[Extension] Error starting recording session:', error);
    recordingStatus = 'idle';
    updateBadge();
    await saveState();
    return { success: false, error: error.message };
  }
};

// Stop a recording session
const stopRecordingSession = async () => {
  try {
    if (recordingStatus !== 'recording') {
      return { success: false, error: 'Not currently recording' };
    }
    
    const sessionId = currentSessionId;
    recordingStatus = 'idle';
    currentSessionId = null;
    updateBadge();
    await saveState();
    
    // Notify content script to stop recording
    if (recordingTabId) {
      try {
        chrome.tabs.sendMessage(recordingTabId, {
          action: 'stopRecording'
        });
      } catch (error) {
        console.log('[Extension] Error sending stop message to content script:', error);
      }
    }
    
    // Notify server that recording has stopped
    await fetch(`${API_BASE_URL}/extension/recorder/stopSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

// Save DOM state to backend
const saveDOMState = async (state) => {
  try {
    if (!state) {
      console.error('[Extension] Cannot save empty state');
      return false;
    }
    
    // Ensure the state has required fields
    if (!state.sessionId) state.sessionId = currentSessionId;
    if (!state.userId) state.userId = userId;
    
    console.log(`[Extension] Saving DOM state: ${state.stateId}`);
    
    // Send DOM state to backend
    const response = await fetch(`${API_BASE_URL}/extension/recorder/saveDOMState`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state,
        sessionId: currentSessionId,
        userId
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to save DOM state: ${response.status}`);
    }
    
    console.log(`[Extension] Successfully saved DOM state: ${state.stateId}`);
    return true;
  } catch (error) {
    console.error('[Extension] Error saving DOM state:', error);
    return false;
  }
};

// Listen for tab close events to stop recording if necessary
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recordingTabId && recordingStatus === 'recording') {
    console.log('[Extension] Recording tab closed, stopping recording');
    stopRecordingSession();
  }
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log('[Extension] Received message:', message.action);
    
    // If message is from a content script in a tab, update the recordingTabId
    if (sender.tab && recordingStatus === 'recording') {
      recordingTabId = sender.tab.id;
    }
    
    switch (message.action) {
      case 'startRecording':
        (async () => {
          try {
            const sessionId = 'session_' + Date.now();
            const result = await startRecordingSession(sessionId);
            sendResponse(result);
          } catch (error) {
            console.error('[Extension] Error starting recording:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;
        
      case 'stopRecording':
        (async () => {
          try {
            const result = await stopRecordingSession();
            sendResponse(result);
          } catch (error) {
            console.error('[Extension] Error stopping recording:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;
        
      case 'getStatus':
        sendResponse({
          recordingStatus,
          currentSessionId,
          userId
        });
        return true;
        
      case 'setApiUrl':
        (async () => {
          API_BASE_URL = message.url;
          await saveState();
          sendResponse({ success: true });
        })();
        return true;
        
      case 'recordState':
        (async () => {
          try {
            const state = message.state;
            const result = await saveDOMState(state);
            sendResponse({ success: result });
          } catch (error) {
            console.error('[Extension] Error saving state:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
        return true;
    }
  } catch (error) {
    console.error('[Extension] Error handling message:', error);
    sendResponse({ success: false, error: error.message });
    return true;
  }
});