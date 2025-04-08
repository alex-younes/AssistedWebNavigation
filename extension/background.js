// Simplified Background Script for DOM State Tracking

// Core configuration
let API_BASE_URL = 'http://localhost:3001/api';
let currentSessionId = null;
let recordingTabId = null;
let recordingStatus = 'idle'; // 'idle', 'recording', 'paused'
let userId = null;
let sessionStateCounter = 0; // Track state numbers across navigation
let finalStateCounter = 0;  // NEW: Track final states separately
let sessionStateHashes = {}; // Track hashes we've already seen
let stateProcessingLock = {}; // Lock to prevent duplicate processing of same hash
let saveLoadingStates = true; // New setting to control whether loading states are saved

// Initialize state from storage on startup
const initializeState = async () => {
  try {
    const result = await chrome.storage.local.get([
      'recordingStatus', 
      'userId', 
      'currentSessionId', 
      'apiBaseUrl',
      'saveLoadingStates' // Add new setting
    ]);
    
    if (result.recordingStatus) recordingStatus = result.recordingStatus;
    if (result.userId) userId = result.userId;
    if (result.currentSessionId) currentSessionId = result.currentSessionId;
    if (result.apiBaseUrl) API_BASE_URL = result.apiBaseUrl;
    if (result.saveLoadingStates !== undefined) saveLoadingStates = result.saveLoadingStates;
    
    console.log('[Extension] Initialized state from storage');
    console.log('[Extension] Save loading states setting:', saveLoadingStates);
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
      apiBaseUrl: API_BASE_URL,
      saveLoadingStates // Save the new setting
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
    finalStateCounter = 0; // Reset final state counter too
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
  console.log(`[Extension][DUPLICATION DEBUG] Generating lock key for state: sessionId=${state.sessionId}, hash=${state.hash}, timestamp=${state.timestamp}`);
  
  // Log raw timestamp before processing
  console.log(`[Extension][DUPLICATION DEBUG] Raw timestamp: ${state.timestamp}, type: ${typeof state.timestamp}`);
  
  // Create a composite key that includes session, hash and timestamp
  const timestampDate = new Date(state.timestamp);
  console.log(`[Extension][DUPLICATION DEBUG] Parsed timestamp date: ${timestampDate}, time: ${timestampDate.getTime()}`);
  
  const timestampKey = timestampDate.getTime().toString().substring(0, 10);
  console.log(`[Extension][DUPLICATION DEBUG] Generated timestamp key part: ${timestampKey}`);
  
  const lockKey = `${state.sessionId}_${state.hash}_${timestampKey}`;
  console.log(`[Extension][DUPLICATION DEBUG] Final lock key: ${lockKey}`);
  
  return lockKey;
};

// Set save loading states setting
const setSaveLoadingStates = async (value) => {
  console.log(`[Extension] Setting saveLoadingStates to: ${value}`);
  saveLoadingStates = value;
  await saveState();
  console.log(`[Extension] saveLoadingStates saved as: ${saveLoadingStates}`);
  return { success: true, saveLoadingStates };
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
    
    console.log(`[Extension][DUPLICATION DEBUG] Processing state in saveDOMState: hash=${state.hash}, stateId=${state.stateId}, timestamp=${state.timestamp}`);
    console.log(`[Extension][DUPLICATION DEBUG] Generated lock key: ${lockKey}`);
    
    // RACE CONDITION PREVENTION
    if (stateProcessingLock[lockKey]) {
      console.log(`[Extension][DUPLICATION DEBUG] DUPLICATE CALL DETECTED - Already processing state with key: ${lockKey}, waiting for promise to resolve`);
      return await stateProcessingLock[lockKey];
    }
    
    // Log in-progress locks
    console.log(`[Extension][DUPLICATION DEBUG] Current processing locks: ${Object.keys(stateProcessingLock).join(', ')}`);
    
    // Log known state hashes
    console.log(`[Extension][DUPLICATION DEBUG] Known state hashes: ${Object.keys(sessionStateHashes).join(', ')}`);
    
    // Create a promise for this processing task
    stateProcessingLock[lockKey] = (async () => {
      try {
        console.log(`[Extension][DUPLICATION DEBUG] Starting new state processing with hash: ${state.hash}, lockKey: ${lockKey}`);
        
        // Log when we receive an initial state (now only from window load event)
        if (state.isInitial === true) {
          console.log(`[Extension][DUPLICATION DEBUG] Processing initial state from window load event`);
        }
        
        // Check if this is a loading state
        const isLoading = state.loadingInfo?.isPartOfLoading === true;
        console.log(`[Extension][DUPLICATION DEBUG] State isLoading=${isLoading}, saveLoadingStates=${saveLoadingStates}`);
        
        // Check if we should skip saving this loading state
        if (isLoading && !saveLoadingStates) {
          console.log(`[Extension][DUPLICATION DEBUG] Skipping saving loading state (saveLoadingStates is disabled)`);
          return { 
            success: true, 
            stateId: `state_temp_${Date.now()}`,
            skipped: true
          };
        }
        
        // Continue with normal processing...
        // Check if this is a special event
        const isSpecialEvent = 
          state.isNavigation === true || 
          state.isReload === true || 
          state.isInitial === true ||
          state.interactionInfo !== undefined;
        
        console.log(`[Extension][DUPLICATION DEBUG] Is special event: ${isSpecialEvent}, isNavigation=${state.isNavigation}, isReload=${state.isReload}, isInitial=${state.isInitial}, hasInteractionInfo=${state.interactionInfo !== undefined}`);
        
        // Check if we've seen this hash before
        const existingStateId = state.hash && sessionStateHashes[state.hash];
        console.log(`[Extension][DUPLICATION DEBUG] Existing state for hash ${state.hash}: ${existingStateId || 'none'}`);
        
        // Handle special events and duplicates
        if ((isSpecialEvent || state.isDuplicate) && existingStateId) {
          let eventType = '';
          if (state.isNavigation) eventType = 'navigation';
          else if (state.isReload) eventType = 'reload';
          else if (state.isInitial) eventType = 'initial load';
          else if (state.interactionInfo) eventType = `interaction: ${state.interactionInfo.trigger}`;
          else eventType = 'duplicate';
          
          console.log(`[Extension][DUPLICATION DEBUG] Special event (${eventType}) with EXISTING hash: ${state.hash}, using existing stateId: ${existingStateId}`);
          
          state.stateId = existingStateId;
          
          // Extract state number from the existing ID
          if (existingStateId.includes('_loading_')) {
            // For loading states like "state_2_loading_1"
            const baseNum = parseInt(existingStateId.split('_')[1]);
            const loadingNum = parseInt(existingStateId.split('_loading_')[1]);
            state.stateNumber = baseNum + loadingNum/10; // For example: 2.1
            
            // Update finalStateCounter if this base number is higher
            finalStateCounter = Math.max(finalStateCounter, baseNum);
            console.log(`[Extension][DUPLICATION DEBUG] Extracted loading state number: ${state.stateNumber}, updated finalStateCounter: ${finalStateCounter}`);
          } else {
            // For final states like "state_2_1234567890"
            const stateNum = parseInt(existingStateId.split('_')[1]);
            state.stateNumber = stateNum;
            
            // Update finalStateCounter if this state number is higher
            finalStateCounter = Math.max(finalStateCounter, stateNum);
            console.log(`[Extension][DUPLICATION DEBUG] Extracted final state number: ${state.stateNumber}, updated finalStateCounter: ${finalStateCounter}`);
          }
          
          // Mark as duplicate, but don't skip saving
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
          
          console.log(`[Extension][DUPLICATION DEBUG] Special event (${eventType}) with NEW hash: ${state.hash}`);
          
          // Increment the state counter for this session
          sessionStateCounter++;
          console.log(`[Extension][DUPLICATION DEBUG] Incremented sessionStateCounter to: ${sessionStateCounter}`);
          
          // NEW: Check if this is a loading state
          const isLoading = state.loadingInfo?.isPartOfLoading === true;
          
          // NEW: Generate stateId with loading indicator if needed
          const timestamp = Date.now();
          
          if (isLoading) {
            // Format: state_1_loading_1, state_1_loading_2, etc.
            const loadingNumber = sessionStateCounter % 10 || 1;
            const baseStateNumber = finalStateCounter + 1; // Associate with the next final state
            state.stateId = `state_${baseStateNumber}_loading_${loadingNumber}`;
            
            // Set stateNumber to match loading format
            state.stateNumber = baseStateNumber + loadingNumber/10; // For example: 1.1, 1.2, etc.
            
            console.log(`[Extension][DUPLICATION DEBUG] Created loading state ID: ${state.stateId}, stateNumber: ${state.stateNumber}, baseStateNumber: ${baseStateNumber}, loadingNumber: ${loadingNumber}`);
          } else {
            // Increment final state counter for new final states
            finalStateCounter++;
            
            // Format: state_1, state_2, state_3, etc. for final states
            state.stateId = `state_${finalStateCounter}_${timestamp}`;
            state.stateNumber = finalStateCounter; // Whole number for final states
            
            console.log(`[Extension][DUPLICATION DEBUG] Created final state ID: ${state.stateId}, stateNumber: ${state.stateNumber}, finalStateCounter: ${finalStateCounter}`);
          }
          
          state.isNewState = true;
          
          if (state.loadingInfo) {
            if (state.isNavigation) state.loadingInfo.isNavigation = true;
            if (state.isReload) state.loadingInfo.isReload = true;
            if (state.isInitial) state.loadingInfo.isInitial = true;
            if (state.interactionInfo) state.loadingInfo.isInteraction = true;
          }
          
          if (state.hash) {
            sessionStateHashes[state.hash] = state.stateId;
            console.log(`[Extension][DUPLICATION DEBUG] Added new hash to tracking: ${state.hash} -> ${state.stateId}`);
          }
        }
        // Handle duplicate regular states
        else if (existingStateId) {
          console.log(`[Extension][DUPLICATION DEBUG] Duplicate regular state with hash: ${state.hash}, existing stateId: ${existingStateId}`);
          
          // Create a new state based on the duplicate, but with isNewState=false
          state.stateId = existingStateId + '_dup_' + Date.now();
          console.log(`[Extension][DUPLICATION DEBUG] Generated duplicate stateId: ${state.stateId}`);
          
          // Extract state number from the existing ID
          if (existingStateId.includes('_loading_')) {
            // For loading states like "state_2_loading_1"
            const baseNum = parseInt(existingStateId.split('_')[1]);
            const loadingNum = parseInt(existingStateId.split('_loading_')[1]);
            state.stateNumber = baseNum + loadingNum/10; // For example: 2.1
            console.log(`[Extension][DUPLICATION DEBUG] Using loading state number for duplicate: ${state.stateNumber} from ${existingStateId}`);
          } else {
            // For final states like "state_2_1234567890"
            const stateNum = parseInt(existingStateId.split('_')[1]);
            state.stateNumber = stateNum;
            console.log(`[Extension][DUPLICATION DEBUG] Using final state number for duplicate: ${state.stateNumber} from ${existingStateId}`);
          }
          
          // Mark as duplicate, but don't skip saving
          state.isNewState = false;
        }
        // Handle new regular states
        else {
          console.log(`[Extension][DUPLICATION DEBUG] New regular state with hash: ${state.hash}`);
          
          // Increment the state counter for this session
          sessionStateCounter++;
          console.log(`[Extension][DUPLICATION DEBUG] Incremented sessionStateCounter to: ${sessionStateCounter}`);
          
          // NEW: Check if this is a loading state
          const isLoading = state.loadingInfo?.isPartOfLoading === true;
          
          // NEW: Generate stateId with loading indicator if needed
          const timestamp = Date.now();
          
          if (isLoading) {
            // Format: state_1_loading_1, state_1_loading_2, etc.
            const loadingNumber = sessionStateCounter % 10 || 1;
            const baseStateNumber = finalStateCounter + 1; // Associate with the next final state
            state.stateId = `state_${baseStateNumber}_loading_${loadingNumber}`;
            
            // Set stateNumber to match loading format
            state.stateNumber = baseStateNumber + loadingNumber/10; // For example: 1.1, 1.2, etc.
            
            console.log(`[Extension][DUPLICATION DEBUG] Created loading state ID: ${state.stateId}, stateNumber: ${state.stateNumber}, baseStateNumber: ${baseStateNumber}, loadingNumber: ${loadingNumber}`);
          } else {
            // Increment final state counter for new final states
            finalStateCounter++;
            
            // Format: state_1, state_2, state_3, etc. for final states
            state.stateId = `state_${finalStateCounter}_${timestamp}`;
            state.stateNumber = finalStateCounter; // Whole number for final states
            
            console.log(`[Extension][DUPLICATION DEBUG] Created final state ID: ${state.stateId}, stateNumber: ${state.stateNumber}, finalStateCounter: ${finalStateCounter}`);
          }
          
          state.isNewState = true;
          
          if (state.hash) {
            sessionStateHashes[state.hash] = state.stateId;
            console.log(`[Extension][DUPLICATION DEBUG] Added hash to tracking: ${state.hash} -> ${state.stateId}`);
          }
        }
        
        // Format the state data to match the backend model
        const formattedState = {
          stateId: state.stateId,
          sessionId: state.sessionId,
          userId: state.userId,
          url: state.url,
          pathname: state.pathname,
          timestamp: state.timestamp,
          isNewState: state.isNewState,
          stateNumber: state.stateNumber,
          hash: state.hash,
          dom: state.dom,
          metrics: state.metrics || {
            domSize: 0,
            elementCount: 0,
            formElements: 0,
            visibleElements: 0
          },
          title: state.title,
          loadingInfo: {
            isNavigation: state.isNavigation || false,
            isInitial: state.isInitial || false,
            isReload: state.isReload || false,
            isFinalState: state.loadingInfo?.isFinalState || false,
            isPartOfLoading: state.loadingInfo?.isPartOfLoading || false,
            loadTime: state.loadingInfo?.loadTime || 0,
            resourceCount: state.loadingInfo?.resourceCount || 0,
            resourceTypes: state.loadingInfo?.resourceTypes || {},
            errorCount: state.loadingInfo?.errorCount || 0,
            networkInfo: state.loadingInfo?.networkInfo || {},
            timestamp: state.loadingInfo?.timestamp || new Date().toISOString()
          },
          mutationInfo: {
            count: state.mutationInfo?.count || 0,
            types: state.mutationInfo?.types || [],
            timestamp: state.mutationInfo?.timestamp || new Date().toISOString()
          }
        };
        
        console.log(`[Extension][DUPLICATION DEBUG] Sending state to backend: stateId=${formattedState.stateId}, isNewState=${formattedState.isNewState}, stateNumber=${formattedState.stateNumber}, hash=${formattedState.hash}`);
        
        // Send state to backend
        const response = await fetch(`${API_BASE_URL}/states`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formattedState)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Extension][DUPLICATION DEBUG] Backend error: ${response.status}. Details: ${errorText}`);
          throw new Error(`Failed to save DOM state: ${response.status}. Details: ${errorText}`);
        }
        
        const result = await response.json();
        console.log(`[Extension][DUPLICATION DEBUG] Backend response: ${JSON.stringify(result)}`);
        console.log(`[Extension][DUPLICATION DEBUG] Saved DOM state: ${state.stateId} (isNewState: ${state.isNewState}, stateNumber: ${state.stateNumber})`);
        
        return { 
          success: true, 
          stateId: result.stateId || state.stateId,
          isDuplicate: !state.isNewState 
        };
      } finally {
        console.log(`[Extension][DUPLICATION DEBUG] Finished processing state with lockKey: ${lockKey}, will clear lock after short delay`);
        setTimeout(() => {
          delete stateProcessingLock[lockKey];
          console.log(`[Extension][DUPLICATION DEBUG] Removed lock for key: ${lockKey}`);
        }, 1);
      }
    })();
    
    return await stateProcessingLock[lockKey];
  } catch (error) {
    console.error('[Extension][DUPLICATION DEBUG] Error saving DOM state:', error);
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
    
    // Log source if available to help identify where duplicates are coming from
    if (message._source) {
      console.log(`[Extension][DUPLICATION DEBUG] Message source: ${message._source}`);
    }
    
    console.log('[Extension][DUPLICATION DEBUG] Message details:', message); // Log full message for debugging
    
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
            console.log(`[Extension][DUPLICATION DEBUG] Received recordState: hash=${state.hash}, timestamp=${state.timestamp}`);
            
            // Transfer special event flags from message to state if they exist
            if (message.isNavigation === true) {
              state.isNavigation = true;
              console.log(`[Extension][DUPLICATION DEBUG] Setting isNavigation flag`);
            }
            if (message.isReload === true) {
              state.isReload = true;
              console.log(`[Extension][DUPLICATION DEBUG] Setting isReload flag`);
            }
            if (message.isInitial === true) {
              state.isInitial = true;
              console.log(`[Extension][DUPLICATION DEBUG] Setting isInitial flag`);
            }
            if (message.isInteraction === true) {
              state.isInteraction = true;
              console.log(`[Extension][DUPLICATION DEBUG] Setting isInteraction flag`);
            }
            if (message.isDuplicate === true) {
              state.isDuplicate = true;
              console.log(`[Extension][DUPLICATION DEBUG] Setting isDuplicate flag`);
            }
            if (message.reusedStateId) {
              state.reusedStateId = message.reusedStateId;
              console.log(`[Extension][DUPLICATION DEBUG] Setting reusedStateId: ${message.reusedStateId}`);
            }
            
            const result = await saveDOMState(state);
            console.log(`[Extension][DUPLICATION DEBUG] saveDOMState result: ${JSON.stringify(result)}`);
            sendResponse(result);
          } catch (error) {
            console.error('[Extension][DUPLICATION DEBUG] Error saving state:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;
        
      case 'setSaveLoadingStates':
        (async () => {
          try {
            console.log(`[Extension] Received setSaveLoadingStates message with value: ${message.value}`);
            const value = message.value === true || message.value === 'true';
            const result = await setSaveLoadingStates(value);
            console.log(`[Extension] setSaveLoadingStates result:`, result);
            sendResponse(result);
          } catch (error) {
            console.error('[Extension] Error in setSaveLoadingStates:', error);
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