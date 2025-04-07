// Simplified Background Script for DOM State Tracking

// Core configuration
let API_BASE_URL = 'http://localhost:3001/api';
let currentSessionId = null;
let recordingTabId = null;
let recordingStatus = 'idle'; // 'idle', 'recording', 'paused'
let userId = null;
let sessionStateCounter = 0; // Track state numbers across navigation
let sessionStateHashes = {}; // Track hashes we've already seen
let stateProcessingLock = {}; // Lock to prevent duplicate processing of same hash

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
    
    // Reset state counter and hash tracking when starting a new session
    sessionStateCounter = 0;
    sessionStateHashes = {}; // Clear hash tracking
    stateProcessingLock = {}; // Reset processing locks
    console.log('[Extension] Reset state counter and hash tracking for new session');
    
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

// Generate a unique key for state processing lock
const getStateLockKey = (state) => {
  // Create a composite key that includes session, hash and timestamp
  const timestampKey = new Date(state.timestamp).getTime().toString().substring(0, 10);
  return `${state.sessionId}_${state.hash}_${timestampKey}`;
};

// Save DOM state to backend
const saveDOMState = async (state) => {
  try {
    if (!state) {
      throw new Error('Cannot save empty state');
    }
    
    // Ensure the state has required fields
    if (!state.sessionId) state.sessionId = currentSessionId;
    if (!state.userId) state.userId = userId;
    
    // Generate a unique processing key for this state
    const lockKey = getStateLockKey(state);
    
    // RACE CONDITION PREVENTION
    if (stateProcessingLock[lockKey]) {
      console.log(`[Extension] DUPLICATE CALL PREVENTED - Already processing state with key: ${lockKey}`);
      return await stateProcessingLock[lockKey];
    }
    
    // Create a promise for this processing task
    stateProcessingLock[lockKey] = (async () => {
      try {
        console.log(`[Extension] Processing state with hash: ${state.hash}`);
        
        // Check if this is a special event
        const isSpecialEvent = 
          state.isNavigation === true || 
          state.isReload === true || 
          state.isInitial === true ||
          state.interactionInfo !== undefined;
        
        // Check if we've seen this hash before
        const existingStateId = state.hash && sessionStateHashes[state.hash];
        
        // Handle special events and duplicates
        if ((isSpecialEvent || state.isDuplicate) && existingStateId) {
          let eventType = '';
          if (state.isNavigation) eventType = 'navigation';
          else if (state.isReload) eventType = 'reload';
          else if (state.isInitial) eventType = 'initial load';
          else if (state.interactionInfo) eventType = `interaction: ${state.interactionInfo.trigger}`;
          else eventType = 'duplicate';
          
          console.log(`[Extension] Special event (${eventType}) with EXISTING hash: ${state.hash}`);
          
          state.stateId = existingStateId;
          state.stateNumber = parseInt(existingStateId.split('_')[1]);
          state.isNewState = false;
          
          if (state.loadingInfo) {
            state.loadingInfo.isDuplicate = true;
            if (state.isNavigation) state.loadingInfo.isNavigation = true;
            if (state.isReload) state.loadingInfo.isReload = true;
            if (state.isInitial) state.loadingInfo.isInitial = true;
            if (state.interactionInfo) state.loadingInfo.isInteraction = true;
          }
        }
        // Handle new special events
        else if (isSpecialEvent) {
          let eventType = '';
          if (state.isNavigation) eventType = 'navigation';
          else if (state.isReload) eventType = 'reload';
          else if (state.isInitial) eventType = 'initial load';
          else if (state.interactionInfo) eventType = `interaction: ${state.interactionInfo.trigger}`;
          
          console.log(`[Extension] Special event (${eventType}) with NEW hash: ${state.hash}`);
          
          state.stateNumber = sessionStateCounter;
          state.stateId = `state_${sessionStateCounter}`;
          state.isNewState = true;
          
          if (state.loadingInfo) {
            if (state.isNavigation) state.loadingInfo.isNavigation = true;
            if (state.isReload) state.loadingInfo.isReload = true;
            if (state.isInitial) state.loadingInfo.isInitial = true;
            if (state.interactionInfo) state.loadingInfo.isInteraction = true;
          }
          
          if (state.hash) {
            sessionStateHashes[state.hash] = state.stateId;
            console.log(`[Extension] Added new hash to tracking: ${state.hash} -> ${state.stateId}`);
          }
          
          sessionStateCounter++;
        }
        // Handle duplicate regular states
        else if (existingStateId) {
          console.log(`[Extension] Duplicate regular state with hash: ${state.hash}`);
          return { 
            success: true, 
            stateId: existingStateId,
            isDuplicate: true
          };
        }
        // Handle new regular states
        else {
          console.log(`[Extension] New regular state with hash: ${state.hash}`);
          
          state.stateNumber = sessionStateCounter;
          state.stateId = `state_${sessionStateCounter}`;
          state.isNewState = true;
          
          if (state.hash) {
            sessionStateHashes[state.hash] = state.stateId;
            console.log(`[Extension] Added hash to tracking: ${state.hash} -> ${state.stateId}`);
          }
          
          sessionStateCounter++;
        }
        
        // Format the state data to match the backend model
        const formattedState = {
          hash: state.hash,
          dom: state.dom,
          loadingInfo: {
            isNavigation: state.isNavigation || false,
            isInitial: state.isInitial || false,
            isReload: state.isReload || false,
            isFinalState: state.loadingInfo?.isFinalState || false,
            isPartOfLoading: state.loadingInfo?.isPartOfLoading || false, // Include loading state info
            loadTime: state.loadingInfo?.loadTime || 0,
            resourceCount: state.loadingInfo?.resourceCount || 0,
            resourceTypes: state.loadingInfo?.resourceTypes || {},
            errorCount: state.loadingInfo?.errorCount || 0,
            networkInfo: state.loadingInfo?.networkInfo || {},
            timestamp: state.loadingInfo?.timestamp || Date.now()
          },
          mutationInfo: {
            count: state.mutationInfo?.count || 0,
            types: state.mutationInfo?.types || [],
            timestamp: state.mutationInfo?.timestamp || Date.now()
          },
          tabId: state.tabId || null,
          sessionId: state.sessionId || currentSessionId || null,
          userId: state.userId || userId || null
        };
        
        console.log(`[Extension] Sending formatted state to backend:`, formattedState);
        
        // Send state to backend
        const response = await fetch(`${API_BASE_URL}/states`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formattedState)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to save DOM state: ${response.status}. Details: ${errorText}`);
        }
        
        const result = await response.json();
        console.log(`[Extension] Saved DOM state: ${state.stateId} (isNewState: ${state.isNewState})`);
        
        return { 
          success: true, 
          stateId: result.stateId || state.stateId,
          isDuplicate: !state.isNewState 
        };
      } finally {
        setTimeout(() => {
          delete stateProcessingLock[lockKey];
        }, 1);
      }
    })();
    
    return await stateProcessingLock[lockKey];
  } catch (error) {
    console.error('[Extension] Error saving DOM state:', error);
    throw error;
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
    console.log('[Extension] Message details:', message); // Log full message for debugging
    
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
            
            // Transfer special event flags from message to state if they exist
            if (message.isNavigation === true) state.isNavigation = true;
            if (message.isReload === true) state.isReload = true;
            if (message.isInitial === true) state.isInitial = true;
            if (message.isInteraction === true) state.isInteraction = true;
            if (message.isDuplicate === true) state.isDuplicate = true;
            if (message.reusedStateId) state.reusedStateId = message.reusedStateId;
            
            const result = await saveDOMState(state);
            sendResponse(result);
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