// Simplified Background Script for DOM State Tracking

// Core configuration
let API_BASE_URL = 'http://localhost:3001/api';
let currentSessionId = null;
let recordingTabId = null;
let recordingStatus = 'idle'; // 'idle', 'recording', 'paused'
let userId = null;
let username = null; // NEW: For authenticated user's name
let sessionStateCounter = 0; // Track state numbers across navigation
let finalStateCounter = 0;  // NEW: Track final states separately
let sessionStateHashes = {}; // Track hashes we've already seen
let stateProcessingLock = {}; // Lock to prevent duplicate processing of same hash
let saveLoadingStates = true; // New setting to control whether loading states are saved
let lastStateId = null; // Track the last state ID
let lastStateHash = null; // Track the last state hash
let interactionQueue = []; // Queue of recent interactions with timestamps
let lastInteractionInfo = null; // Store the last interaction info for navigation

// Initialize state from storage on startup
const initializeState = async () => {
  try {
    const result = await chrome.storage.local.get([
      'recordingStatus', 
      'userId', 
      'currentSessionId', 
      'apiBaseUrl',
      'saveLoadingStates',
      'lastStateId', 
      'lastStateHash',
      'username' // NEW: Load username
    ]);
    
    if (result.recordingStatus) recordingStatus = result.recordingStatus;
    if (result.userId) userId = result.userId;
    if (result.username) username = result.username; // NEW: Set username
    if (result.currentSessionId) currentSessionId = result.currentSessionId;
    
    // Handle API base URL with proper format checking
    if (result.apiBaseUrl) {
      // Normalize the API base URL
      let baseUrl = result.apiBaseUrl;
      
      // Make sure it starts with http:// or https://
      if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
        baseUrl = 'http://' + baseUrl;
      }
      
      // Make sure it includes /api
      if (!baseUrl.includes('/api')) {
        baseUrl = baseUrl.endsWith('/') ? baseUrl + 'api' : baseUrl + '/api';
      }
      
      API_BASE_URL = baseUrl;
      console.log('[Extension] Normalized API_BASE_URL:', API_BASE_URL);
    }
    
    if (result.saveLoadingStates !== undefined) saveLoadingStates = result.saveLoadingStates;
    
    // For better logging of what's happening with state persistence
    console.log('[Extension] Retrieved from storage:', { 
      lastStateId: result.lastStateId, 
      lastStateHash: result.lastStateHash,
      currentSessionId: result.currentSessionId
    });
    
    // Only set last state variables if they belong to the current session
    // This prevents cross-session state references
    if (result.lastStateId && result.currentSessionId === currentSessionId) {
      lastStateId = result.lastStateId;
      lastStateHash = result.lastStateHash;
      console.log('[Extension] Restored previous state tracking for session:', currentSessionId);
    } else {
      // Reset state tracking for new session
      lastStateId = null;
      lastStateHash = null;
      console.log('[Extension] Reset state tracking for new session');
    }
    
    console.log('[Extension] Initialized state from storage');
    console.log('[Extension] Save loading states setting:', saveLoadingStates);
    console.log('[Extension] Last state tracking:', { lastStateId, lastStateHash });
    updateBadge();
    
    // Test the API connection after initialization
    await refreshApiBaseUrl();
  } catch (error) {
    console.error('[Extension] Error initializing state:', error);
  }
};

// Call initialize on startup
initializeState();

// Save state to persistent storage with better error handling
const saveState = async () => {
  try {
    const dataToSave = {
      recordingStatus,
      userId,
      username, // NEW: Save username
      currentSessionId,
      apiBaseUrl: API_BASE_URL,
      saveLoadingStates,
      lastStateId,
      lastStateHash
    };
    
    console.log('[Extension] Saving state to storage:', { 
      lastStateId, 
      lastStateHash,
      currentSessionId 
    });
    
    await chrome.storage.local.set(dataToSave);
    console.log('[Extension] State saved successfully');
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

// Generate a user ID if none exists (or use authenticated one)
const initializeUserId = async () => {
  try {
    console.log('[Extension] initializeUserId called, current userId:', userId);
    
    // If userId is already set (either from auth or previous anon session), use it.
    if (userId) {
      console.log('[Extension] Using existing userId:', userId, 'username:', username);
      return userId;
    }

    // Attempt to load from storage again, in case initializeState hasn't run or was cleared
    const storedData = await chrome.storage.local.get(['userId', 'username']);
    console.log('[Extension] Retrieved from storage:', storedData);
    
    if (storedData.userId) {
      userId = storedData.userId;
      username = storedData.username || null; // Ensure username is also loaded
      console.log('[Extension] Loaded authenticated userId from storage:', userId, 'username:', username);
      return userId;
    }
    
    // If no authenticated userId, generate an anonymous one as a fallback
    console.log('[Extension] No authenticated userId found, generating anonymous ID.');
    userId = 'anon_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    username = null; // Explicitly null for anonymous users
    
    // Save the new anonymous userId (and null username)
    await chrome.storage.local.set({ userId, username: null });
    console.log('[Extension] Generated and saved anonymous userId:', userId);
    
    return userId;
  } catch (error) {
    console.error('[Extension] Error in initializeUserId:', error);
    // Fallback to a basic anonymous ID in case of error
    userId = 'anon_error_' + Date.now();
    return userId;
  }
};

// Start a recording session
const startRecordingSession = async (sessionId, tabInfo = null) => {
  try {
      await initializeUserId();
      
      console.log('[Extension] startRecordingSession: Using userId to save session:', userId);
      console.log('[Extension] startRecordingSession: Username associated with session:', username);
    
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
    // Reset last state tracking to prevent references to previous session states
    lastStateId = null;
    lastStateHash = null;
    interactionQueue = []; // Clear any pending interactions
    lastInteractionInfo = null; // Clear last interaction info
    console.log('[Extension] Reset state counter, hash tracking, and last state references for new session');
    
    // Update recording tab and status
    recordingTabId = tabInfo.id;
    recordingStatus = 'recording';
    currentSessionId = sessionId;
    updateBadge();
    await saveState();
    
    // Try a different approach - use the direct route we added
    const apiBase = API_BASE_URL.split('/api')[0] || API_BASE_URL;
    const saveSessionUrl = `${apiBase}/api/recorder/saveSession`;
    console.log(`[Extension] DIRECT URL - Saving session to: ${saveSessionUrl}`);
    
    // Create request data
    const requestData = {
      sessionId,
      userId,
      url: tabInfo.url,
      browser: 'chrome',
      metadata: { title: tabInfo.title }
    };
    
    console.log(`[Extension] Session request payload:`, requestData);
    
    // Save session to backend with improved error handling
    try {
      const response = await fetch(saveSessionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
      });
      
      // Check for non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`[Extension] Server returned non-JSON response: ${contentType}`);
        const text = await response.text();
        console.error(`[Extension] Response body (first 200 chars): ${text.substring(0, 200)}`);
        throw new Error(`Server returned non-JSON response: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`[Extension] Session save response:`, data);
      
      if (!response.ok) {
        throw new Error(`Server returned error: ${response.status} - ${data.error || response.statusText}`);
      }
      
      console.log(`[Extension] Started recording session ${sessionId} for user ${userId}`);
      
      // Notify content script to start recording
      try {
        chrome.tabs.sendMessage(
          recordingTabId, 
          {
            action: 'startRecording',
            sessionId,
            userId
          }
        );
      } catch (error) {
        console.error('[Extension] Error sending message to content script:', error);
      }
      
      return { success: true, sessionId };
    } catch (error) {
      console.error('[Extension] Error saving session to backend:', error);
      throw error;
    }
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
    
    // Notify server that recording has stopped using the correct API path
    // Use the direct route we added in server.js
    const apiBase = API_BASE_URL.split('/api')[0] || API_BASE_URL;
    const stopSessionUrl = `${apiBase}/api/recorder/stopSession`;
    console.log(`[Extension] DIRECT URL - Stopping session with: ${stopSessionUrl}`);
    
    try {
      const response = await fetch(stopSessionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId,
          userId,
          reason: 'user_stopped'
        })
      });
      
      // Check for non-JSON responses
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error(`[Extension] Server returned non-JSON response: ${contentType}`);
        const text = await response.text();
        console.error(`[Extension] Response body (first 200 chars): ${text.substring(0, 200)}`);
        throw new Error(`Server returned non-JSON response when stopping: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log(`[Extension] Session stop response:`, data);
      
      if (!response.ok) {
        throw new Error(`Server returned error: ${response.status} - ${data.error || response.statusText}`);
      }
      
      console.log(`[Extension] Stopped recording session ${sessionId}`);
      return { success: true, sessionId };
    } catch (error) {
      console.error('[Extension] Error stopping session on server:', error);
      // Return success anyway since we've already cleared local state
      return { success: true, sessionId, serverError: error.message };
    }
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
    
    // Set previous state information based on the last saved state
    state.previousStateId = lastStateId;
    state.previousHash = lastStateHash;
    
    console.log(`[Extension] Saving state with previous info - previousStateId: ${lastStateId}, previousHash: ${lastStateHash}`);
    
    // Add interaction info to mutation states that occur shortly after a button click
    if (!state.interactionInfo && 
        interactionQueue.length > 0 && 
        state.mutationInfo && 
        state.mutationInfo.count > 0) {
      
      // Find the most recent interaction within the threshold time (500ms)
      const now = Date.now();
      const matchingInteraction = interactionQueue.find(interaction => {
        const interactionTime = new Date(interaction.timestamp).getTime();
        return now - interactionTime < 500; // 500ms threshold
      });
      
      if (matchingInteraction) {
        console.log('[Extension] Adding matching interaction to DOM mutation state:', matchingInteraction.type, 'on', matchingInteraction.element);
        state.interactionInfo = matchingInteraction;
        
        // Remove any older interactions from the queue
        const oldestValidTimestamp = now - 500;
        interactionQueue = interactionQueue.filter(interaction => {
          return new Date(interaction.timestamp).getTime() >= oldestValidTimestamp;
        });
      }
    }
    
    // Check for interaction information
    if (state.interactionInfo) {
      console.log(`[Extension] State includes interaction: ${state.interactionInfo.type} on ${state.interactionInfo.element || 'element'}`);
    }
    
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
          if (existingStateId.includes('loading_')) {
            // For loading states like "loading_index.html_1"
            const parts = existingStateId.split('_');
            const loadingNum = parseInt(parts[parts.length - 1]);
            state.stateNumber = finalStateCounter + loadingNum/10; // For example: 1.1
            
            // Update finalStateCounter if this base number is higher
            finalStateCounter = Math.max(finalStateCounter, Math.floor(state.stateNumber));
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
            // Format: loading_index.html_1, loading_register.html_1, etc.
            const loadingNumber = sessionStateCounter % 10 || 1;
            const url = new URL(state.url);
            const pageName = url.pathname.split('/').pop() || 'index.html';
            state.stateId = `loading_${pageName}_${loadingNumber}`;
            
            // Set stateNumber to match loading format
            state.stateNumber = finalStateCounter + loadingNumber/10; // For example: 1.1, 1.2, etc.
            
            console.log(`[Extension][DUPLICATION DEBUG] Created loading state ID: ${state.stateId}, stateNumber: ${state.stateNumber}, pageName: ${pageName}, loadingNumber: ${loadingNumber}`);
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
          if (existingStateId.includes('loading_')) {
            // For loading states like "loading_index.html_1"
            const parts = existingStateId.split('_');
            const loadingNum = parseInt(parts[parts.length - 1]);
            state.stateNumber = finalStateCounter + loadingNum/10; // For example: 1.1
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
            // Format: loading_index.html_1, loading_register.html_1, etc.
            const loadingNumber = sessionStateCounter % 10 || 1;
            const url = new URL(state.url);
            const pageName = url.pathname.split('/').pop() || 'index.html';
            state.stateId = `loading_${pageName}_${loadingNumber}`;
            
            // Set stateNumber to match loading format
            state.stateNumber = finalStateCounter + loadingNumber/10; // For example: 1.1, 1.2, etc.
            
            console.log(`[Extension][DUPLICATION DEBUG] Created loading state ID: ${state.stateId}, stateNumber: ${state.stateNumber}, pageName: ${pageName}, loadingNumber: ${loadingNumber}`);
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
          previousStateId: state.previousStateId,
          previousHash: state.previousHash,
          dom: state.dom,
          metrics: state.metrics || {
            domSize: 0,
            elementCount: 0,
            formElements: 0,
            visibleElements: 0
          },
          title: state.title,
          interactionInfo: state.interactionInfo || null,
          loadingInfo: {
            isNavigation: state.isNavigation || false,
            isInitial: state.isInitial || false,
            isReload: state.isReload || false,
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
        
        // Build correct URL using getApiUrl
        const statesUrl = getApiUrl('states');
        console.log(`[Extension][DUPLICATION DEBUG] Saving state to URL: ${statesUrl}`);
        
        // Send state to backend
        const response = await fetch(statesUrl, {
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
        
        // Only update the lastStateId and lastStateHash AFTER successful save
        // This ensures we don't reference states that haven't been saved yet
        const currentStateId = state.stateId;
        const currentStateHash = state.hash;
        
        // After successfully saving the state, update last state tracking
        lastStateId = currentStateId;
        lastStateHash = currentStateHash;
        console.log(`[Extension] Updated last state tracking - lastStateId: ${lastStateId}, lastStateHash: ${lastStateHash}`);
        await saveState(); // Save to persistent storage
        
        // Notify content script that state was saved
        if (recordingTabId) {
          try {
            chrome.tabs.sendMessage(recordingTabId, {
              action: 'stateSaved',
              state: state
            });
          } catch (error) {
            console.error('[Extension] Error notifying content script:', error);
          }
        }
        
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

// Listen for tab navigation events to preserve state tracking across page loads
chrome.webNavigation.onCommitted.addListener(async (details) => {
  // Only handle navigation in the recording tab
  if (recordingStatus === 'recording' && details.tabId === recordingTabId) {
    console.log('[Extension] Navigation detected in recording tab:', details.url);
    console.log('[Extension] Navigation type:', details.transitionType, details.transitionQualifiers);
    
    // Check if this is a reload
    const isReload = details.transitionType === 'reload' || 
                     details.transitionQualifiers.includes('reload');
    
    console.log(`[Extension] Navigation is reload: ${isReload}`);
    
    // Set appropriate flags in storage based on navigation type
    await chrome.storage.session.set({ 
      isNavigationPending: !isReload, // Only set navigation pending if not a reload
      isReloadPending: isReload,
      navigationDetails: {
        from: details.url,
        timestamp: Date.now(),
        type: details.transitionType,
        qualifiers: details.transitionQualifiers
      }
    });
    
    console.log(`[Extension] Set pending flags - navigation: ${!isReload}, reload: ${isReload}`);
    console.log('[Extension] Preserving state tracking:', { lastStateId, lastStateHash });
    
    // Immediately save state to ensure persistence through navigation
    await saveState();
  }
});

// Listen for messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Extension] Received message:', message);

  // Ensure API_BASE_URL is current before any API calls
  chrome.storage.local.get('apiBaseUrl', (result) => {
    if (result.apiBaseUrl) {
      API_BASE_URL = result.apiBaseUrl;
    }
  });

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
        userId,
        username // NEW: Send username in status
      });
      return true;
      
    case 'setApiUrl':
      (async () => {
        try {
          console.log(`[Extension] Received setApiUrl message with value: ${message.url}`);
          
          let newApiBaseUrl = message.url;
          
          // Make sure it starts with http:// or https://
          if (!newApiBaseUrl.startsWith('http://') && !newApiBaseUrl.startsWith('https://')) {
            newApiBaseUrl = 'http://' + newApiBaseUrl;
          }
          
          // Extract just the base URL and path up to /api
          if (newApiBaseUrl.includes('/api')) {
            // Extract everything up to and including /api
            newApiBaseUrl = newApiBaseUrl.substring(0, newApiBaseUrl.indexOf('/api') + 4);
          } else {
            // No /api in the URL, add it
            newApiBaseUrl = newApiBaseUrl.endsWith('/') ? newApiBaseUrl + 'api' : newApiBaseUrl + '/api';
          }
          
          // Update the global variable
          API_BASE_URL = newApiBaseUrl;
          
          // Save to storage
          await chrome.storage.local.set({ apiBaseUrl: API_BASE_URL });
          
          console.log('[Extension] API_BASE_URL updated to:', API_BASE_URL);
          
          // Test the connection immediately
          let connectionOk = false;
          try {
            const pingUrl = getApiUrl('extension/ping');
            console.log('[Extension] Testing new API URL with ping:', pingUrl);
            
            const response = await fetch(pingUrl, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            });
            
            if (response.ok) {
              const data = await response.json();
              console.log('[Extension] API ping successful:', data);
              connectionOk = true;
            } else {
              console.error('[Extension] API ping failed:', response.status, response.statusText);
              const errorText = await response.text();
              console.error('[Extension] Error response:', errorText.substring(0, 200));
            }
          } catch (error) {
            console.error('[Extension] Error testing API connection:', error);
          }
          
          sendResponse({ 
            success: true, 
            newUrl: API_BASE_URL,
            connectionTested: true,
            connectionOk
          });
        } catch (error) {
          console.error('[Extension] Error in setApiUrl:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
      
    case 'recordState':
      (async () => {
        try {
          const state = message.state;
          console.log(`[Extension][DUPLICATION DEBUG] Received recordState: hash=${state.hash}, timestamp=${state.timestamp}`);
          
          // Check if this is a navigation button click
          const isNavigationButton = 
            message.isInteraction && 
            state.interactionInfo && 
            (state.interactionInfo.element === 'a' || 
             state.interactionInfo.element === 'button[type=button]' ||
             (state.interactionInfo.text && 
              (state.interactionInfo.text.includes('Continue') || 
               state.interactionInfo.text.includes('Next') || 
               state.interactionInfo.text.includes('Go'))));
          
          // Store interaction info when it's a click
          if (state.interactionInfo && message.isInteraction) {
            interactionQueue.push(state.interactionInfo);
            console.log('[DEBUG] Stored interaction:', state.interactionInfo);
            
            // Schedule clearing of lastInteractionInfo after 3 seconds
            setTimeout(() => {
              // Only clear if it's still the same interaction
              if (interactionQueue.length > 0 && interactionQueue[0].timestamp === state.interactionInfo.timestamp) {
                console.log('[DEBUG] Clearing stored interaction after timeout');
                interactionQueue.shift();
              }
            }, 3000);
            
            // Skip recording the interaction state if it's a navigation button
            if (isNavigationButton) {
              console.log('[DEBUG] Skipping recording of navigation button click, will be included in navigation state');
              // Store separately for navigation
              lastInteractionInfo = state.interactionInfo;
              sendResponse({ success: true, skipped: true, reason: 'navigation_button' });
              return true;
            }
          }
          
          // Check for pending navigation or reload
          const navigationInfo = await chrome.storage.session.get([
            'isNavigationPending', 
            'isReloadPending', 
            'navigationDetails'
          ]);
          
          const isNavigationPending = navigationInfo.isNavigationPending === true;
          const isReloadPending = navigationInfo.isReloadPending === true;
          
          console.log(`[Extension][DUPLICATION DEBUG] Pending flags - navigation: ${isNavigationPending}, reload: ${isReloadPending}`);
          
          // If this is a window load event and there's a pending action
          if (message.isInitial && (isNavigationPending || isReloadPending)) {
            if (isReloadPending) {
              console.log(`[Extension][DUPLICATION DEBUG] Converting initial state to reload state due to pending reload`);
              message.isInitial = false;
              message.isReload = true;
              state.isInitial = false;
              state.isReload = true;
            } else if (isNavigationPending) {
              console.log(`[Extension][DUPLICATION DEBUG] Converting initial state to navigation state due to pending navigation`);
              message.isInitial = false;
              message.isNavigation = true;
              state.isInitial = false;
              state.isNavigation = true;
              
              // Add interaction info to navigation state if available
              if (lastInteractionInfo) {
                console.log('[DEBUG] Adding stored navigation interaction to state');
                state.interactionInfo = lastInteractionInfo;
                lastInteractionInfo = null; // Clear after use
              }
            }
            
            // Clear the pending flags
            await chrome.storage.session.remove([
              'isNavigationPending', 
              'isReloadPending', 
              'navigationDetails'
            ]);
            console.log(`[Extension][DUPLICATION DEBUG] Cleared pending flags`);
          }
          
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
      
    case 'login':
      handleLogin(message.username, message.password, sendResponse);
      return true; // Indicates that the response will be sent asynchronously
    case 'register':
      handleRegister(message.username, message.password, sendResponse);
      return true; // Indicates that the response will be sent asynchronously
    case 'logout':
      handleLogout(sendResponse);
      return true; // Indicates that the response will be sent asynchronously
      
    case 'saveNonTransitionalEvents':
      (async () => {
        try {
          // Pass the message directly rather than message.state since it already contains the needed data
          await saveNonTransitionalEvents(message, sendResponse);
        } catch (error) {
          console.error('[Extension] Error saving non-transitional events:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
      return true;
  }
});

// NEW: Handle Login
async function handleLogin(usernameToLogin, password, sendResponse) {
  try {
    console.log(`[Extension] Attempting login for user: ${usernameToLogin}`);
    const url = getApiUrl('auth/login');
    console.log(`[Extension] Login request URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameToLogin, password })
    });

    const data = await response.json();
    console.log('[Extension] Login response:', data);

    if (response.ok && data.success) {
      // Update global variables
      userId = data.userId;
      username = data.username;
      
      // Save to storage
      await chrome.storage.local.set({ 
        userId: data.userId, 
        username: data.username 
      });
      
      console.log('[Extension] Login successful, updated global state and storage:', { userId, username });
      
      // Send message to popup to update its UI
      chrome.runtime.sendMessage({ 
        action: 'authStatusUpdate', 
        successMessage: 'Login successful!', 
        username 
      });
      
      sendResponse({ success: true });
    } else {
      console.error('[Extension] Login failed:', data.message || 'Unknown error');
      // Send error to popup
      chrome.runtime.sendMessage({ action: 'authStatusUpdate', error: data.message || 'Login failed' });
      sendResponse({ success: false, error: data.message || 'Login failed' });
    }
  } catch (error) {
    console.error('[Extension] Error during login:', error);
    chrome.runtime.sendMessage({ action: 'authStatusUpdate', error: 'Login request failed: ' + error.message });
    sendResponse({ success: false, error: 'Login request failed: ' + error.message });
  }
}

// NEW: Handle Register
async function handleRegister(usernameToRegister, password, sendResponse) {
  try {
    console.log(`[Extension] Attempting registration for user: ${usernameToRegister}`);
    const url = getApiUrl('auth/register');
    console.log(`[Extension] Registration request URL: ${url}`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameToRegister, password })
    });

    const data = await response.json();
    console.log('[Extension] Registration response:', data);

    if (response.ok && data.success) {
      // Update global variables
      userId = data.userId;
      username = data.username;
      
      // Save to storage  
      await chrome.storage.local.set({ 
        userId: data.userId, 
        username: data.username 
      });
      
      console.log('[Extension] Registration successful, updated global state and storage:', { userId, username });
      
      chrome.runtime.sendMessage({ 
        action: 'authStatusUpdate', 
        successMessage: 'Registration successful! You are now logged in.', 
        username 
      });
      
      sendResponse({ success: true });
    } else {
      console.error('[Extension] Registration failed:', data.message || 'Unknown error');
      chrome.runtime.sendMessage({ action: 'authStatusUpdate', error: data.message || 'Registration failed' });
      sendResponse({ success: false, error: data.message || 'Registration failed' });
    }
  } catch (error) {
    console.error('[Extension] Error during registration:', error);
    chrome.runtime.sendMessage({ action: 'authStatusUpdate', error: 'Registration request failed: ' + error.message });
    sendResponse({ success: false, error: 'Registration request failed: ' + error.message });
  }
}

// NEW: Handle Logout
async function handleLogout(sendResponse) {
  try {
    console.log('[Extension] Logging out user:', username);
    
    // Clear global variables
    userId = null;
    username = null;
    
    // Clear from storage
    await chrome.storage.local.remove(['userId', 'username']);
    
    console.log('[Extension] User logged out, cleared global state and storage');
    
    chrome.runtime.sendMessage({ action: 'authStatusUpdate', successMessage: 'Logged out successfully.' });
    sendResponse({ success: true });
  } catch (error) {
    console.error('[Extension] Error during logout:', error);
    sendResponse({ success: false, error: 'Logout error: ' + error.message });
  }
}

// Utility to get API URL (ensure it's consistent or passed around if needed)
function getApiUrl(endpoint) {
    // Make sure the endpoint doesn't start with a slash
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;
    
    // Parse the API_BASE_URL to make sure we're not adding double slashes
    const baseUrlWithoutTrailingSlash = API_BASE_URL.endsWith('/') 
        ? API_BASE_URL.slice(0, -1) 
        : API_BASE_URL;
    
    const fullUrl = `${baseUrlWithoutTrailingSlash}/${cleanEndpoint}`;
    console.log('[Extension] Generated API URL:', fullUrl);
    return fullUrl;
}

// Refresh the API_BASE_URL from storage
async function refreshApiBaseUrl() {
    try {
        const result = await chrome.storage.local.get('apiBaseUrl');
        
        if (result.apiBaseUrl) {
            API_BASE_URL = result.apiBaseUrl;
            console.log('[Extension] API_BASE_URL refreshed to:', API_BASE_URL);
            
            // Test connection to the API using the known working endpoint
            try {
                const pingUrl = getApiUrl('extension/ping');
                console.log('[Extension] Testing API connection with:', pingUrl);
                
                const response = await fetch(pingUrl, { 
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    console.log('[Extension] API connection test successful:', data);
                } else {
                    console.error('[Extension] API connection test failed:', response.status, response.statusText);
                    // Try to get error text
                    const errorText = await response.text();
                    console.error('[Extension] Error response:', errorText.substring(0, 200));
                }
            } catch (error) {
                console.error('[Extension] Error testing API connection:', error);
            }
        } else {
            console.log('[Extension] API_BASE_URL not found in storage, using default:', API_BASE_URL);
        }
    } catch (error) {
        console.error('[Extension] Error refreshing API_BASE_URL:', error);
    }
}

// Call it once on load, and potentially before critical API calls if staleness is a concern.
refreshApiBaseUrl();

// Save non-transitional events via the API
async function saveNonTransitionalEvents(data, sendResponse) {
  try {
    console.log('[Extension] Saving non-transitional events for state:', data.stateId);
    
    // Create a clean copy of the data with proper data types
    const cleanData = {
      stateId: data.stateId,
      sessionId: data.sessionId,
      userId: data.userId,
      events: {},
      metrics: {...data.metrics}
    };
    
    // Only include event types that exist
    if (data.events) {
      // Process hover events
      if (data.events.hover && Array.isArray(data.events.hover)) {
        cleanData.events.hover = data.events.hover;
      }
      
      // Process key typing events
      if (data.events.keyTyping && data.events.keyTyping.fields) {
        cleanData.events.keyTyping = {
          fields: data.events.keyTyping.fields
        };
      }
      
      // Process inactivity events
      if (data.events.inactivity && Array.isArray(data.events.inactivity)) {
        cleanData.events.inactivity = data.events.inactivity;
      }
      
      // Process escapeBackspace events
      if (data.events.escapeBackspace && Array.isArray(data.events.escapeBackspace)) {
        cleanData.events.escapeBackspace = data.events.escapeBackspace;
      }
      
      // Process keyTypingCadence events - NEW
      if (data.events.keyTypingCadence && Array.isArray(data.events.keyTypingCadence)) {
        cleanData.events.keyTypingCadence = data.events.keyTypingCadence;
        console.log('[Extension] Processing keyTypingCadence events:', 
          data.events.keyTypingCadence.length);
      }
      
      // Process tabNavigation events - NEW
      if (data.events.tabNavigation && Array.isArray(data.events.tabNavigation)) {
        cleanData.events.tabNavigation = data.events.tabNavigation;
        console.log('[Extension] Processing tabNavigation events:', 
          data.events.tabNavigation.length);
      }
      
      // Process repeatedClicks events - NEW
      if (data.events.repeatedClicks && Array.isArray(data.events.repeatedClicks)) {
        cleanData.events.repeatedClicks = data.events.repeatedClicks;
        console.log('[Extension] Processing repeatedClicks events:', 
          data.events.repeatedClicks.length);
      }
      
      // Process copyText events - NEW
      if (data.events.copyText && Array.isArray(data.events.copyText)) {
        cleanData.events.copyText = data.events.copyText;
        console.log('[Extension] Processing copyText events:', 
          data.events.copyText.length);
      }
      
      // Process pasteWithoutTyping events - NEW
      if (data.events.pasteWithoutTyping && Array.isArray(data.events.pasteWithoutTyping)) {
        cleanData.events.pasteWithoutTyping = data.events.pasteWithoutTyping;
        console.log('[Extension] Processing pasteWithoutTyping events:', 
          data.events.pasteWithoutTyping.length);
      }
      
      // Process repeatedInputs events - NEWLY ADDED
      if (data.events.repeatedInputs && Array.isArray(data.events.repeatedInputs)) {
        cleanData.events.repeatedInputs = data.events.repeatedInputs;
        console.log('[Extension] Processing repeatedInputs events:', 
          data.events.repeatedInputs.length);
      }
      
      // Process oscillatingHovers events
      if (data.events.oscillatingHovers && Array.isArray(data.events.oscillatingHovers)) {
        cleanData.events.oscillatingHovers = data.events.oscillatingHovers;
        console.log('[Extension] Processing oscillatingHovers events:', 
          data.events.oscillatingHovers.length);
      }
      
      // Process inputFieldIdle events
      if (data.events.inputFieldIdle && Array.isArray(data.events.inputFieldIdle)) {
        cleanData.events.inputFieldIdle = data.events.inputFieldIdle;
        console.log('[Extension] Processing inputFieldIdle events:', 
          data.events.inputFieldIdle.length);
      }
      
      // Special handling for mousemove data
      if (data.events.mousemove) {
        // Initialize with default numeric values to prevent NaN
        cleanData.events.mousemove = {
          totalDistance: 0,
          averageSpeed: 0,
          heatmap: []
        };
        
        // Safely assign numeric values with defaults and validation
        const totalDistance = parseFloat(data.events.mousemove.totalDistance);
        cleanData.events.mousemove.totalDistance = isNaN(totalDistance) ? 0 : totalDistance;
        
        const averageSpeed = parseFloat(data.events.mousemove.averageSpeed);
        cleanData.events.mousemove.averageSpeed = isNaN(averageSpeed) ? 0 : averageSpeed;
        
        // Handle heatmap - careful parsing if it's a string
        if (data.events.mousemove.heatmap) {
          if (typeof data.events.mousemove.heatmap === 'string') {
            try {
              const parsedHeatmap = JSON.parse(data.events.mousemove.heatmap);
              if (Array.isArray(parsedHeatmap)) {
                cleanData.events.mousemove.heatmap = parsedHeatmap.map(row => {
                  if (Array.isArray(row)) {
                    return row.map(val => {
                      const num = parseFloat(val);
                      return isNaN(num) ? 0 : num;
                    });
                  } else {
                    return [];
                  }
                });
              }
            } catch (e) {
              console.error('[Extension] Failed to parse heatmap string:', e);
              cleanData.events.mousemove.heatmap = [];
            }
          } else if (Array.isArray(data.events.mousemove.heatmap)) {
            // Make sure each row is an array of numbers
            cleanData.events.mousemove.heatmap = data.events.mousemove.heatmap.map(row => {
              if (Array.isArray(row)) {
                return row.map(val => {
                  const num = parseFloat(val);
                  return isNaN(num) ? 0 : num;
                });
              } else if (typeof row === 'string') {
                try {
                  const parsed = JSON.parse(row);
                  if (Array.isArray(parsed)) {
                    return parsed.map(val => {
                      const num = parseFloat(val);
                      return isNaN(num) ? 0 : num;
                    });
                  }
                } catch (e) {
                  return [];
                }
              } else {
                return [];
              }
            });
          }
        }
      }
    }
    
    // Ensure metrics are valid numbers
    if (cleanData.metrics) {
      for (const key in cleanData.metrics) {
        if (typeof cleanData.metrics[key] === 'number' && isNaN(cleanData.metrics[key])) {
          cleanData.metrics[key] = 0;
        }
      }
    }
    
    // Construct the API endpoint
    const url = getApiUrl('nontransitional-events');
    console.log('[Extension] Non-transitional events API URL:', url);
    
    // Log the detailed cleaned data for debugging
    console.log('[Extension] Sending non-transitional events with data:', 
      JSON.stringify({
        stateId: cleanData.stateId,
        sessionId: cleanData.sessionId,
        userId: cleanData.userId,
        eventTypes: Object.keys(cleanData.events),
        eventCounts: {
          hover: cleanData.events.hover?.length || 0,
          escapeBackspace: cleanData.events.escapeBackspace?.length || 0,
          keyTypingCadence: cleanData.events.keyTypingCadence?.length || 0,
          tabNavigation: cleanData.events.tabNavigation?.length || 0,
          repeatedClicks: cleanData.events.repeatedClicks?.length || 0,
          copyText: cleanData.events.copyText?.length || 0,
          pasteWithoutTyping: cleanData.events.pasteWithoutTyping?.length || 0,
          repeatedInputs: cleanData.events.repeatedInputs?.length || 0,
          oscillatingHovers: cleanData.events.oscillatingHovers?.length || 0,
          inputFieldIdle: cleanData.events.inputFieldIdle?.length || 0,
          heatmapLength: cleanData.events.mousemove?.heatmap?.length || 0,
          keyTyping: Object.keys(cleanData.events.keyTyping?.fields || {}).length || 0,
          inactivity: cleanData.events.inactivity?.length || 0
        }
      })
    );
    
    // Make the API request
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cleanData)
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Server error: ${response.status} - ${text}`);
    }
    
    const responseData = await response.json();
    console.log('[Extension] Non-transitional events saved successfully:', responseData);
    
    sendResponse({
      success: true,
      message: 'Non-transitional events saved'
    });
  } catch (error) {
    console.error('[Extension] Error saving non-transitional events:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
} 