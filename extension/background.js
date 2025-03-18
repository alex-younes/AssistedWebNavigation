// Background script for communication between content script and backend

// Config 
let API_BASE_URL = null;
let currentSessionId = null;
let recordingTabId = null;
let recordingStatus = 'idle'; // 'idle', 'recording', 'paused', 'error'
let interactionBuffer = []; // Buffer to store interactions if connection fails
let interactionCount = 0;

// User identification management
let userId = null;
let connectionId = null;

// Debug configuration
const DEBUG = true;
let lastStateCheck = Date.now();

// Store connections to content scripts
let ports = new Map();
let keepAliveInterval;

// Server configuration state
let isServerConfigured = false;

// Client information
let clientInfo = {
  browser: 'chrome',
  version: chrome.runtime.getManifest().version,
  platform: navigator.platform
};

// Near the top of the file, add persistence for recording state
let lastServerCheck = 0;

// Buffer for batching interactions
const MAX_INTERACTION_BUFFER = 20; // Maximum number of interactions to buffer before sending
const MAX_BUFFER_TIME = 3000;      // Maximum time (ms) to hold interactions before sending
let lastFlushTime = Date.now();    // Time of last buffer flush

// Add a tracker for recent interactions to prevent duplicates
const recentInteractions = new Map(); // timestamp -> type -> hash
const RECENT_INTERACTION_TTL = 3000; // 3 seconds
const lastInteractionsByExactTimestamp = new Map(); // exactTimestamp -> type -> hash

// Add specific tracking for DOM mutations at the millisecond level
const domMutationsByTimestamp = new Map(); // timestamp -> boolean
const DOM_MUTATION_DEDUP_WINDOW = 3000; // 3 seconds deduplication window

// Add specific tracking for page_info events at the millisecond level
const pageInfoByTimestampAndReadyState = new Map(); // timestamp_readyState -> boolean
const PAGE_INFO_DEDUP_WINDOW = 5000; // 5 seconds deduplication window

// Track URLs that have had complete events to ensure we never send duplicates
const processedCompleteEventsByUrl = new Map();

// Add a cleanup interval for the timestamp maps to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  
  // Clean up dom_mutation tracking
  for (const [timestamp, _] of domMutationsByTimestamp) {
    if (now - parseInt(timestamp) > DOM_MUTATION_DEDUP_WINDOW) {
      domMutationsByTimestamp.delete(timestamp);
    }
  }
  
  // Clean up page_info tracking
  for (const [key, _] of pageInfoByTimestampAndReadyState) {
    const timestamp = parseInt(key.split('_')[0]);
    if (now - timestamp > PAGE_INFO_DEDUP_WINDOW) {
      pageInfoByTimestampAndReadyState.delete(key);
    }
  }
}, 30000); // Run cleanup every 30 seconds

// Initialize state from storage on startup
const initializeState = async () => {
  try {
    // Load persistent state
    const result = await chrome.storage.local.get([
      'recordingStatus', 
      'userId', 
      'currentSessionId', 
      'interactionCount',
      'connectionId'
    ]);
    
    // Restore state if available
    if (result.recordingStatus) recordingStatus = result.recordingStatus;
    if (result.userId) userId = result.userId;
    if (result.currentSessionId) currentSessionId = result.currentSessionId;
    if (result.interactionCount) interactionCount = result.interactionCount;
    if (result.connectionId) connectionId = result.connectionId;
    
    console.log('[Extension] Initialized state from storage:', { 
      recordingStatus, 
      userId: userId?.substring(0, 10) + '...',
      currentSessionId: currentSessionId?.substring(0, 10) + '...',
      interactionCount
    });
    
    // Check server connectivity
    await checkServerConnection();
    
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
      interactionCount,
      connectionId
    });
  } catch (error) {
    console.error('[Extension] Error saving state:', error);
  }
};

// Add this function to check server connection
const checkServerConnection = async () => {
  // Only check once every 10 seconds to avoid excessive requests
  const now = Date.now();
  if (now - lastServerCheck < 10000) return;
  lastServerCheck = now;
  
  try {
    checkApiUrl();
    
    // Check if we have connection details
    if (!userId || !connectionId) {
      await initializeUserId();
      connectionId = `${userId}_${Date.now()}`;
      saveState();
    }
    
    // Verify connection with backend
    console.log('[Extension] Checking server connection...');
    const response = await fetch(`${API_BASE_URL}/extension/recorder/verifyConnection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        userId, 
        connectionId,
        timestamp: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      console.error('[Extension] Server verification failed');
      return false;
    }
    
    const data = await response.json();
    console.log('[Extension] Server connection verified:', data);
    
    // If we're recording, check if the session is still active
    if (recordingStatus === 'recording' && currentSessionId) {
      await checkRecordingStatus();
    }
    
    return true;
  } catch (error) {
    console.error('[Extension] Error checking server connection:', error);
    return false;
  }
};

// Modify the original checkRecordingStatus function to improve reliability
const checkRecordingStatus = async () => {
  try {
    checkApiUrl();
    
    if (!currentSessionId) {
      return { status: 'idle' };
    }
    
    const response = await fetch(`${API_BASE_URL}/extension/recorder/status?userId=${userId}`);
    
    if (!response.ok) {
      console.error('[Extension] Failed to check recording status');
      return { status: recordingStatus };
    }
    
    const data = await response.json();
    if (data.success) {
      // Update local status based on server
      recordingStatus = data.status;
      
      // If server says we're not recording but locally we think we are,
      // force a restart of the recording
      if (recordingStatus !== 'recording' && currentSessionId) {
        console.log('[Extension] Server indicates recording stopped, but extension thinks it\'s still recording. Restarting...');
        await startRecordingSession(currentSessionId);
      }
      
      saveState();
      updateBadge();
    }
    
    return data;
  } catch (error) {
    console.error('[Extension] Error checking recording status:', error);
    return { status: recordingStatus };
  }
};

// Modify the updateBadge function to reflect recording state
const updateBadge = () => {
  if (recordingStatus === 'recording') {
    chrome.action.setBadgeText({ text: 'REC' });
    chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
};

// Add the updateRecordingStatus function here
const updateRecordingStatus = (status, sessionId = null) => {
  recordingStatus = status;
  
  if (sessionId) {
    currentSessionId = sessionId;
  }
  
  // Save state
  saveState();
  
  // Update badge
  updateBadge();
  
  // Notify all UI components
  chrome.runtime.sendMessage({
    action: 'recordingStatusUpdate',
    status: recordingStatus,
    sessionId: currentSessionId,
    interactionCount
  });
  
  // Log state change
  logBackgroundState();
};

// Check connection periodically (every 30 seconds)
setInterval(checkServerConnection, 30000);

// Update the start recording function to notify all existing tabs
const startRecordingSession = async (sessionId, tabInfo = null) => {
  try {
    checkApiUrl();
    
    // Make sure we have a user ID
    if (!userId) {
      await initializeUserId();
    }
    
    // Generate a session ID if none provided
    if (!sessionId) {
      sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
    }
    
    // Save session to backend
    console.log(`[Extension] Starting recording session ${sessionId}`);
    
    // Get active tab info if not provided
    if (!tabInfo) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        tabInfo = tabs[0];
      }
    }
    
    // Set recording tab ID
    if (tabInfo && tabInfo.id) {
      recordingTabId = tabInfo.id;
    }
    
    // Update local state
    currentSessionId = sessionId;
    recordingStatus = 'recording';
    interactionCount = 0;
    
    // Save state to storage
    saveState();
    
    // Update badge
    updateBadge();
    
    // Notify all tabs that recording has started
    const allTabs = await chrome.tabs.query({});
    for (const tab of allTabs) {
      try {
        // Don't send to chrome:// or extension:// pages
        if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'recording_status_changed',
            status: 'recording',
            sessionId,
            userId
          }).catch(() => {
            // Ignore errors - tabs without content scripts
          });
        }
      } catch (error) {
        // Ignore errors
      }
    }
    
    // Save to backend
    const metadata = {
      title: tabInfo?.title || 'Unknown',
      favIconUrl: tabInfo?.favIconUrl
    };
    
    const response = await fetch(`${API_BASE_URL}/extension/recorder/saveSession`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId,
        userId,
        url: tabInfo?.url,
        tabId: tabInfo?.id,
        browser: 'chrome',
        timestamp: new Date().toISOString(),
        metadata
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Extension] Failed to start recording:', errorData);
      return false;
    }
    
    console.log(`[Extension] Recording started for session ${sessionId}`);
    return true;
  } catch (error) {
    console.error('[Extension] Error starting recording:', error);
    return false;
  }
};

// Listen for navigation events to ensure content scripts stay active
chrome.webNavigation.onCompleted.addListener(async (details) => {
  try {
    // Only process main frame navigation
    if (details.frameId !== 0) return;
    
    const tab = await chrome.tabs.get(details.tabId);
    
    // Don't try to inject into chrome:// or extension:// pages
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return;
    }

    // If we're recording, check if this is a navigation in the same tab
    if (recordingStatus === 'recording' && currentSessionId) {
      console.log(`[Extension] Navigation detected in tab ${details.tabId} to ${details.url}`);
      
      // Wait briefly to ensure content script is loaded
      setTimeout(() => {
        // Notify content script about recording status
        try {
          chrome.tabs.sendMessage(details.tabId, {
            action: 'recording_status_changed',
            status: 'recording',
            sessionId: currentSessionId,
            userId: userId
          }).catch(error => {
            console.log(`[Extension] Error notifying tab ${details.tabId} about recording:`, error);
          });
        } catch (error) {
          console.log(`[Extension] Error sending message to tab ${details.tabId}:`, error);
        }
      }, 500);
    }
  } catch (error) {
    console.error('[Extension] Error handling navigation:', error);
  }
});

// Helper functions
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
        userId,
        isServerConfigured
    });
}

// Load server configuration from storage
chrome.storage.sync.get(['serverConfig'], (result) => {
    if (result.serverConfig) {
        const { ip, port } = result.serverConfig;
        API_BASE_URL = `http://${ip}:${port}/api`;
        isServerConfigured = true;
        debugLog('Server configured:', API_BASE_URL);
        
        // Verify connection with backend
        verifyBackendConnection();
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
        
        // Verify connection with backend
        verifyBackendConnection();
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
    } else {
      // Generate new user ID if none exists
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      await chrome.storage.local.set({ userId });
      console.log('[Extension] Generated new user ID:', userId);
    }
    
    // Generate a connection ID for this session
    connectionId = userId + '_' + Date.now();
    
    // Log successful initialization
    console.log('[DEBUG] User ID initialized:', userId);
    console.log('[DEBUG] Connection ID:', connectionId);
  } catch (error) {
    console.error('[Extension] Error initializing user ID:', error);
  }
};

// Verify connection with backend
const verifyBackendConnection = async () => {
    try {
        checkApiUrl();
        
        // Ensure we have a user ID
        if (!userId) {
            await initializeUserId();
        }
        
    console.log('[Extension] Verifying connection with backend...');
        
    const response = await fetch(`${API_BASE_URL}/extension/recorder/verifyConnection`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
        userId,
        connectionId,
        clientInfo
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
      console.error('[Extension] Failed to verify connection:', errorData);
            return false;
        }
        
        const data = await response.json();
        if (data.success) {
      console.log('[Extension] Connection verified with backend');
      
      // If we're currently recording, check with backend if the session is valid
      if (currentSessionId && recordingStatus === 'recording') {
        checkRecordingStatus();
      }
      
            return true;
        }
        
    console.error('[Extension] Backend reported failure verifying connection:', data);
        return false;
    } catch (error) {
    console.error('[Extension] Error verifying connection:', error);
        return false;
    }
};

// Filter event types that often occur together with navigation
// This is a helper function for sendInteractionsToBackend
const filterRedundantEvents = (interactions) => {
    // Group events by timestamp (rounded to the nearest second to account for small timing differences)
    const eventGroups = {};
    
    interactions.forEach(interaction => {
        if (!interaction.timestamp) return;
        
        // Round to nearest second
        const timestamp = Math.floor(new Date(interaction.timestamp).getTime() / 1000) * 1000;
        const key = `${timestamp}`;
        
        if (!eventGroups[key]) {
            eventGroups[key] = [];
        }
        
        eventGroups[key].push(interaction);
    });
    
    // For each group of events that occurred in the same second
    const result = [];
    Object.values(eventGroups).forEach(group => {
        // Track specific event types we've added to the result for this group
        const addedTypes = new Set();
        
        // First pass: Get all non-duplicate events by type
        const typeMap = new Map(); // type -> best interaction of that type
        
        // For each interaction in this group
        group.forEach(interaction => {
            const type = interaction.type;
            
            // For page_info events, we want to prioritize 'complete' readyState
            if (type === 'page_info') {
                const readyState = interaction.details?.readyState || '';
                
                // If we already have a page_info event and this one is not 'complete', skip it
                if (typeMap.has(type)) {
                    const existingEvent = typeMap.get(type);
                    const existingReadyState = existingEvent.details?.readyState || '';
                    
                    // Only replace if the new event has a 'complete' readyState and the existing one doesn't
                    if (readyState === 'complete' && existingReadyState !== 'complete') {
                        typeMap.set(type, interaction);
                    }
                    // Otherwise keep existing one
                } else {
                    // First page_info event we've seen
                    typeMap.set(type, interaction);
                }
            } 
            // For DOM mutations, keep the one with the most changes
            else if (type === 'dom_mutation') {
                if (typeMap.has(type)) {
                    const existingEvent = typeMap.get(type);
                    const existingStats = existingEvent.details?.stats || { additions: 0, removals: 0, attributeChanges: 0 };
                    const newStats = interaction.details?.stats || { additions: 0, removals: 0, attributeChanges: 0 };
                    
                    // Calculate total changes for comparison
                    const existingChanges = existingStats.additions + existingStats.removals + existingStats.attributeChanges;
                    const newChanges = newStats.additions + newStats.removals + newStats.attributeChanges;
                    
                    // Replace if the new interaction has more changes
                    if (newChanges > existingChanges) {
                        typeMap.set(type, interaction);
                    }
                } else {
                    typeMap.set(type, interaction);
                }
            }
            // For other event types, keep all events
            else {
                result.push(interaction);
                addedTypes.add(type);
            }
        });
        
        // If we have both navigation and page_info, don't include dom_mutation
        if (addedTypes.has('navigation') && typeMap.has('page_info')) {
            // Add the best page_info event
            result.push(typeMap.get('page_info'));
            addedTypes.add('page_info');
            
            // Skip dom_mutation in this case
            typeMap.delete('dom_mutation');
        }
        
        // Add remaining best events from the typeMap
        typeMap.forEach((interaction, type) => {
            if (!addedTypes.has(type)) {
                result.push(interaction);
            }
        });
    });
    
    return result;
}

// Helper function to create a hash of an interaction for deduplication
const hashInteraction = (interaction) => {
  try {
    // Create a simpler version of the interaction with just the critical fields
    const hashObj = {
      type: interaction.type,
      timestamp: interaction.timestamp,
      url: interaction.url,
      count: interaction.count
    };
    
    // For DOM mutations, include the summary
    if (interaction.type === 'dom_mutation' && interaction.details?.summary) {
      hashObj.summary = interaction.details.summary;
    }
    
    // Convert to string and use as hash
    return JSON.stringify(hashObj);
  } catch (e) {
    console.error('[Extension] Error creating interaction hash:', e);
    // Fallback to timestamp_type as hash
    return `${interaction.timestamp}_${interaction.type}`;
  }
};

// Helper to send interactions to backend with retry logic
const sendInteractionsToBackend = async (interactions) => {
    try {
        checkApiUrl();
        if (!interactions || interactions.length === 0) return;
            
            // Ensure we have a user ID
            if (!userId) {
                await initializeUserId();
            }
            
        // First, filter out complete events as requested, but preserve render_complete events
        const initialFiltered = interactions.filter(interaction => {
            if (interaction.type === 'page_info' && interaction.details.readyState === 'complete') {
                console.log(`Filtering out complete event for URL: ${interaction.details.url}`);
                return false;
            }
            
            // Always keep render_complete events 
            if (interaction.type === 'render_complete') {
                console.log(`Preserving render_complete event for URL: ${interaction.details.url}`);
                return true;
            }
            
            return true;
        });
        
        // Continue with the filtered interactions
        const preprocessedInteractions = filterRedundantEvents(initialFiltered);
        
        // STEP 1: Exact duplicate removal using content hash
        const seen = new Set();
        const uniqueInteractions = preprocessedInteractions.filter(interaction => {
          // Create a hash of interaction content
          const hash = hashInteraction(interaction);
          // Keep if we haven't seen this hash before
          if (seen.has(hash)) {
            console.log(`[Extension] Filtering exact duplicate: ${interaction.type}`);
            return false;
          }
          seen.add(hash);
          return true;
        });
        
        // STEP 2: Pre-process to identify duplicates and track navigation events
        // Track urls we've already seen navigation events for
        const navigationUrls = new Set();
        const pageInfoUrls = new Set();
        
        // Group interactions by URL for efficient filtering
        const interactionsByUrl = {};
        
        // First pass - organize by URL and mark navigation events
        uniqueInteractions.forEach(interaction => {
            const url = interaction.url || '';
            if (!interactionsByUrl[url]) {
                interactionsByUrl[url] = [];
            }
            interactionsByUrl[url].push(interaction);
            
            // Track navigation and page_info URLs
            if (interaction.type === 'navigation') {
                navigationUrls.add(url);
            } else if (interaction.type === 'page_info') {
                pageInfoUrls.add(url);
            }
        });
        
        // STEP 3: Filter out redundant events
        let processedInteractions = [];
        
        // Process each URL group
        Object.values(interactionsByUrl).forEach(urlInteractions => {
            // For each URL, filter specific event types
            
            // Keep only one navigation event per URL
            const navigationEvents = urlInteractions.filter(i => i.type === 'navigation');
            if (navigationEvents.length > 0) {
                // Sort by timestamp (newest first) and keep only the most recent
                navigationEvents.sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                processedInteractions.push(navigationEvents[0]);
            }
            
            // Keep only one page_info event per URL
            const pageInfoEvents = urlInteractions.filter(i => i.type === 'page_info');
            if (pageInfoEvents.length > 0) {
                // Sort by timestamp (newest first) and keep only the most recent
                pageInfoEvents.sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                );
                processedInteractions.push(pageInfoEvents[0]);
            }
            
            // For DOM mutation events, limit the number
            const domMutationEvents = urlInteractions.filter(i => i.type === 'dom_mutation');
            if (domMutationEvents.length > 0) {
                // Further deduplicate DOM mutations with same timestamp
                const mutationsByTimestamp = {};
                domMutationEvents.forEach(mutation => {
                  const ts = mutation.timestamp;
                  if (!mutationsByTimestamp[ts]) {
                    mutationsByTimestamp[ts] = [];
                  }
                  mutationsByTimestamp[ts].push(mutation);
                });
                
                // For each timestamp, keep only one DOM mutation
                Object.values(mutationsByTimestamp).forEach(sameTsMutations => {
                  if (sameTsMutations.length > 0) {
                    // Keep the one with highest count
                    sameTsMutations.sort((a, b) => (b.count || 0) - (a.count || 0));
                    processedInteractions.push(sameTsMutations[0]);
                  }
                });
            }
            
            // Keep all other interaction types
            const otherEvents = urlInteractions.filter(i => 
                !['navigation', 'page_info', 'dom_mutation'].includes(i.type)
            );
            processedInteractions = processedInteractions.concat(otherEvents);
        });
        
        // STEP 4: Apply further click deduplication
        // Filter out unwanted interaction types and deduplicate
        const lastEvents = {};
        const eventPositions = {};
        
        // First pass: gather event positions for click-related events
        processedInteractions.forEach(interaction => {
            if (['click', 'document_click', 'mousedown'].includes(interaction.type) && 
                interaction.details && 
                typeof interaction.details.x === 'number' && 
                typeof interaction.details.y === 'number') {
                
                const x = Math.round(interaction.details.x / 5) * 5; // Round to nearest 5px
                const y = Math.round(interaction.details.y / 5) * 5;
                const key = `${x}_${y}`;
                
                if (!eventPositions[key]) {
                    eventPositions[key] = [];
                }
                eventPositions[key].push(interaction);
            }
        });
        
        // For positions with multiple events, keep only one (prioritizing 'click')
        Object.values(eventPositions).forEach(posEvents => {
            if (posEvents.length > 1) {
                // Sort to prioritize 'click' events over 'document_click' and 'mousedown'
                posEvents.sort((a, b) => {
                    if (a.type === 'click') return -1;
                    if (b.type === 'click') return 1;
                    if (a.type === 'document_click') return -1;
                    if (b.type === 'document_click') return 1;
                    return 0;
                });
                
                // Mark all but the first one for removal
                for (let i = 1; i < posEvents.length; i++) {
                    posEvents[i]._remove = true;
                }
            }
        });
        
        const filteredInteractions = processedInteractions.filter(interaction => {
            // Skip non-meaningful events or events marked for removal
            if (!interaction.type || interaction._remove) return false;
            
            // Skip duplicate events that occur in the same 100ms window
            const key = `${interaction.type}_${JSON.stringify(interaction.targetElement || {})}`;
            const timestamp = new Date(interaction.timestamp || Date.now()).getTime();
            
            if (lastEvents[key] && (timestamp - lastEvents[key] < 100)) {
                return false; // Skip duplicate event
            }
            
            lastEvents[key] = timestamp;
            return true;
        });
        
        if (filteredInteractions.length === 0) {
            console.log('[Extension] No meaningful interactions to send after filtering');
            return true; // Consider this a success since we've processed them
        }
        
        // Log breakdown of event types
        const eventTypeCounts = {};
        filteredInteractions.forEach(i => {
          if (!eventTypeCounts[i.type]) eventTypeCounts[i.type] = 0;
          eventTypeCounts[i.type]++;
        });
        
        console.log(`[Extension] Sending ${filteredInteractions.length} interactions to backend for session ${currentSessionId}`);
        console.log('[Extension] Event type counts:', eventTypeCounts);
        
        // Send batch of interactions with user ID
        const response = await fetch(`${API_BASE_URL}/extension/recorder/saveInteractions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                interactions: filteredInteractions,
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
            console.log(`[Extension] Successfully sent ${filteredInteractions.length} interactions to backend`);
            interactionCount = data.totalCount || interactionCount + filteredInteractions.length;
            return true;
        }
        
        console.error('[Extension] Backend reported failure saving interactions:', data);
        return false;
    } catch (error) {
        console.error('[Extension] Error sending interactions:', error);
        return false;
    }
};

// Add a dedicated filtering function for page_info and dom_mutation events
function filterDuplicatePageInfoAndDomMutations(interactions) {
  console.log(`[Extension] Final filtering before sending to server. Count before: ${interactions.length}`);
  
  // Count render_complete events for logging
  const renderCompleteCount = interactions.filter(event => event.type === 'render_complete').length;
  if (renderCompleteCount > 0) {
    console.log(`[Extension] Found ${renderCompleteCount} render_complete events in final filtering - preserving them`);
  }
  
  // Filter out ALL complete events first, preserve render_complete
  const noCompleteEvents = interactions.filter(event => {
    if (event.type === 'page_info' && event.details?.readyState === 'complete') {
      console.log(`[Extension] Final filter removing complete page_info event for URL: ${event.url || event.details?.url || 'unknown'}`);
      return false; // Filter out all complete events
    }
    
    // Always keep render_complete events
    if (event.type === 'render_complete') {
      console.log(`[Extension] Preserving render_complete event in final filter for URL: ${event.url || event.details?.url || 'unknown'}`);
      return true;
    }
    
    return true; // Keep everything else
  });
  
  // If less than 2 events, just return them
  if (noCompleteEvents.length < 2) {
    return noCompleteEvents;
  }
  
  // First check if we have any page_info events with readyState complete
  const hasCompleteEvents = noCompleteEvents.some(event => 
    event.type === 'page_info' && event.details?.readyState === 'complete'
  );
  
  console.log(`[Extension] Page_info events with readyState 'complete' present after filtering: ${hasCompleteEvents}`);
  
  // Group events by URL to handle each page separately
  const eventsByUrl = {};
  
  // First, organize events by URL
  noCompleteEvents.forEach(interaction => {
    const url = interaction.url || interaction.details?.url || 'unknown';
    if (!eventsByUrl[url]) {
      eventsByUrl[url] = [];
    }
    eventsByUrl[url].push(interaction);
  });
  
  let filteredEvents = [];
  
  // Process events URL by URL
  Object.entries(eventsByUrl).forEach(([url, urlEvents]) => {
    // For each URL, get the different event types
    const pageInfoEvents = urlEvents.filter(e => e.type === 'page_info');
    const domMutationEvents = urlEvents.filter(e => e.type === 'dom_mutation');
    const otherEvents = urlEvents.filter(e => e.type !== 'page_info' && e.type !== 'dom_mutation');
    
    // Always keep other events
    filteredEvents = filteredEvents.concat(otherEvents);
    
    // If we have page_info events, keep at most 1 per URL with readyState 'complete'
    if (pageInfoEvents.length > 0) {
      // First, check if we have any complete events
      const completeEvents = pageInfoEvents.filter(e => e.details?.readyState === 'complete');
      const otherReadyStateEvents = pageInfoEvents.filter(e => e.details?.readyState !== 'complete');
      
      // If we have complete events, keep ONLY ONE - regardless of how many we have
      if (completeEvents.length > 0) {
        // Keep only the latest complete event - this is the one most likely to have full page data
        if (completeEvents.length > 1) {
          console.log(`[Extension] Found ${completeEvents.length} page_info events with readyState complete for URL ${url}, keeping only the latest`);
          
          // Sort by timestamp (descending) and keep the most recent one
          completeEvents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        }
        
        // Check if we've already seen this URL+sessionId combination
        const sessionId = completeEvents[0].sessionId || currentSessionId || 'unknown';
        const urlSessionKey = `${url}_${sessionId}`;
        
        // IMPORTANT: We're now adding session awareness to prevent over-filtering
        const hasProcessedForThisSession = processedCompleteEventsByUrl.has(urlSessionKey);
        
        if (!hasProcessedForThisSession) {
          // First time seeing this URL+session, include it
          const completeEvent = completeEvents[0];
          filteredEvents.push(completeEvent);
          processedCompleteEventsByUrl.set(urlSessionKey, new Date().toISOString());
          console.log(`[Extension] First complete event for ${url} in session ${sessionId}, including it`);
        } else {
          // Only log that we're filtering, but include at least one complete event per batch
          console.log(`[Extension] Already processed a complete event for ${url} in this session, but including for this batch`);
          
          // CHANGED: Always include at least one complete event per batch to ensure we have complete events
          filteredEvents.push(completeEvents[0]);
        }
        
        // For interactive or loading states, keep at most one
        if (otherReadyStateEvents.length > 0) {
          // Sort other events by readyState priority (loading < interactive)
          const readyStatePriority = { loading: 1, interactive: 2 };
          otherReadyStateEvents.sort((a, b) => 
            (readyStatePriority[b.details?.readyState] || 0) - 
            (readyStatePriority[a.details?.readyState] || 0)
          );
          
          // Keep the highest priority non-complete event
          filteredEvents.push(otherReadyStateEvents[0]);
        }
      } 
      // No complete events, keep at most 2 page_info events
      else if (otherReadyStateEvents.length > 0) {
        // Keep at most 2 page_info events
        filteredEvents = filteredEvents.concat(
          otherReadyStateEvents.slice(0, Math.min(2, otherReadyStateEvents.length))
        );
      }
    }
    
    // For DOM mutations, limit to 1 per URL with at least 3 changes
    if (domMutationEvents.length > 0) {
      // Keep the one with the most changes if it's meaningful
      let mostSignificantMutation = domMutationEvents.reduce((prev, current) => {
        const prevChanges = prev.details?.stats ? 
            (prev.details.stats.additions + prev.details.stats.removals + prev.details.stats.attributeChanges) : 0;
        const currentChanges = current.details?.stats ? 
            (current.details.stats.additions + current.details.stats.removals + current.details.stats.attributeChanges) : 0;
        
        return currentChanges > prevChanges ? current : prev;
      }, domMutationEvents[0]);
      
      // Only include if it has some meaningful changes
      const totalChanges = mostSignificantMutation.details?.stats ? 
          (mostSignificantMutation.details.stats.additions + 
           mostSignificantMutation.details.stats.removals + 
           mostSignificantMutation.details.stats.attributeChanges) : 0;
           
      if (totalChanges > 2) {
        filteredEvents.push(mostSignificantMutation);
      } else {
        console.log(`[Extension] Skipping DOM mutation with only ${totalChanges} changes`);
      }
    }
  });
  
  // Clean up old entries from our URL tracker (keep for 1 hour max)
  const now = Date.now();
  processedCompleteEventsByUrl.forEach((timestamp, url) => {
    const age = now - new Date(timestamp).getTime();
    if (age > 60 * 60 * 1000) { // 1 hour
      processedCompleteEventsByUrl.delete(url);
    }
  });
  
  console.log(`[Extension] Final filtering complete. Count after: ${filteredEvents.length}`);
  return filteredEvents;
}

// Additional helper function to filter out complete events we've already processed
function filterCompleteEventsByUrl(interactions) {
  console.log(`[Extension] Filtering all complete events by URL`);
  
  // Count render_complete events
  const renderCompleteEvents = interactions.filter(event => event.type === 'render_complete').length;
  if (renderCompleteEvents > 0) {
    console.log(`[Extension] Found ${renderCompleteEvents} render_complete events in URL filter - keeping them`);
  }
  
  // Filter page_info complete events but preserve render_complete
  return interactions.filter(event => {
    if (event.type === 'page_info' && event.details?.readyState === 'complete') {
      console.log(`[Extension] Removing complete page_info event in URL filter for: ${event.url || event.details?.url || 'unknown'}`);
      return false; // Filter out all complete events
    }
    
    // Always keep render_complete events
    if (event.type === 'render_complete') {
      return true;
    }
    
    return true; // Keep all other events
  });
}

// Flush the interaction buffer if it's not empty
const flushInteractionBuffer = async () => {
    // Skip if we aren't configured yet
    if (!API_BASE_URL) {
        await checkApiUrl();
        
        if (!API_BASE_URL) {
            console.log('[Extension] API URL not configured, cannot flush buffer');
            return false;
        }
    }
    
    // Skip if not recording or buffer is empty
    if (!interactionBuffer || interactionBuffer.length === 0) {
        return true;
    }
    
    // Make a copy of the buffer and clear it first (to prevent duplicates if sending fails)
    let currentBuffer = [...interactionBuffer];
    interactionBuffer = [];
    
    try {
        console.log(`[Extension] Flushing interaction buffer (${currentBuffer.length} items)`);
        
        // Apply a quick pre-filter to remove duplicate complete page_info events
        currentBuffer = preFilterDuplicateCompleteEvents(currentBuffer);
        
        // First apply our standard filtering to remove redundant events
        let filteredBuffer = filterRedundantEvents(currentBuffer);
        
        // Then apply our very aggressive filtering specifically targeting page_info and dom_mutation
        filteredBuffer = filterDuplicatePageInfoAndDomMutations(filteredBuffer);
        
        if (filteredBuffer.length > 0) {
            // Send the filtered interactions
            const success = await sendInteractionsToBackend(filteredBuffer);
            
            if (!success) {
                console.error('[Extension] Failed to send interactions, restoring to buffer');
                // Add the filtered interactions back to the buffer
                interactionBuffer = [...filteredBuffer, ...interactionBuffer];
                return false;
            }
            
            return true;
        }
        
        return true;
    } catch (error) {
        console.error('[Extension] Error flushing interaction buffer:', error);
        
        // Restore buffer (to avoid losing interactions)
        interactionBuffer = [...currentBuffer, ...interactionBuffer];
        return false;
    }
};

// Set up periodic buffer flushing (every 1.5 seconds)
setInterval(flushInteractionBuffer, 1500);

// Handle connections from content scripts
chrome.runtime.onConnect.addListener((port) => {
  // Accept connections from both 'recording-port' and 'content-script'
  if (port.name === 'recording-port' || port.name === 'content-script') {
    // Get the tab ID from the sender
    const tabId = port.sender?.tab?.id;
    
    if (!tabId) {
      console.error('[Extension] Connection from content script missing tabId');
      return;
    }
    
    console.log(`[Extension] Content script connected from tab ${tabId}`);
    
    // Store the port
    ports.set(tabId, port);
    
    // Listen for messages from this content script
    port.onMessage.addListener((message) => {
      console.log(`[Extension] Received message from tab ${tabId}:`, message.action);
      
      if (message.action === 'saveInteraction') {
        // Add interaction to buffer and flush if needed
        if (message.interaction) {
          const interaction = message.interaction;
          
          // Check for duplicates by timestamp and type
          const timestamp = new Date(interaction.timestamp || Date.now()).getTime();
          const roundedTimestamp = Math.floor(timestamp / 100) * 100; // Round to nearest 100ms
          const type = interaction.type;
          
          // Get exact timestamp string for precise deduplication
          const exactTimestamp = timestamp.toString();
          
          // EXTRA CHECK FOR DOM MUTATIONS - Reject if we've seen one with this exact timestamp
          if (type === 'dom_mutation') {
            // Get timestamp range for deduplication (check in a window)
            const startTime = timestamp - 1000; // Check 1 second before
            const endTime = timestamp + 1000;  // Check 1 second after
            
            // Check if we've seen a similar DOM mutation in the time window
            let isDuplicate = false;
            for (const storedTimestamp of domMutationsByTimestamp.keys()) {
              const storedTime = parseInt(storedTimestamp);
              if (storedTime >= startTime && storedTime <= endTime) {
                isDuplicate = true;
                break;
              }
            }
            
            if (isDuplicate) {
              console.log(`[Extension] Skipping duplicate dom_mutation at ${new Date(timestamp).toISOString()}`);
              
              // Send acknowledgment to content script even for duplicates
              port.postMessage({
                action: 'interaction_acknowledged',
                type: interaction.type,
                isDuplicate: true
              });
              
              return;
            }
            
            // Mark that we've seen a dom_mutation with this timestamp
            domMutationsByTimestamp.set(exactTimestamp, true);
          }
          
          // EXTRA CHECK FOR PAGE_INFO - Reject if we've seen one with this exact readyState recently
          if (type === 'page_info') {
            const readyState = interaction.details?.readyState || 'unknown';
            const url = interaction.details?.url || '';
            
            // Create a key that includes URL and readyState for more precise deduplication
            const pageInfoKey = `${url}_${readyState}`;
            
            // Check if we've seen this page_info recently (last 5 seconds)
            let isDuplicate = false;
            for (const [key, value] of pageInfoByTimestampAndReadyState) {
              // Extract the stored URL and readyState
              const [_, storedUrl, storedReadyState] = key.match(/(\S+)_(\w+)$/) || [];
              
              // If we found a matching URL and readyState
              if (storedUrl === url && storedReadyState === readyState) {
                const storedTimestamp = parseInt(key.split('_')[0]);
                // Check if it's within our deduplication window
                if (timestamp - storedTimestamp < PAGE_INFO_DEDUP_WINDOW) {
                  isDuplicate = true;
                  break;
                }
              }
            }
            
            if (isDuplicate) {
              console.log(`[Extension] Skipping duplicate page_info with readyState ${readyState} for URL ${url}`);
              
              // Send acknowledgment to content script even for duplicates
              port.postMessage({
                action: 'interaction_acknowledged',
                type: interaction.type,
                isDuplicate: true
              });
              
              return;
            }
            
            // Mark that we've seen a page_info with this timestamp, URL and readyState
            const pageInfoTrackingKey = `${exactTimestamp}_${url}_${readyState}`;
            pageInfoByTimestampAndReadyState.set(pageInfoTrackingKey, true);
          }
          
          // Create a more detailed hash of the interaction
          let hash;
          try {
            if (type === 'dom_mutation') {
              // For DOM mutations, use a more specific hash based on stats
              if (interaction.details?.stats) {
                const stats = interaction.details.stats;
                hash = `${type}:${stats.additions || 0},${stats.removals || 0},${stats.attributeChanges || 0}:${interaction.details.summary || ''}`;
              } else {
                hash = `${type}:${interaction.details?.summary || ''}`;
              }
            } else if (type === 'click' && interaction.details) {
              // For clicks, use coordinates
              const x = Math.round((interaction.details.x || 0) / 5) * 5;
              const y = Math.round((interaction.details.y || 0) / 5) * 5;
              hash = `${type}:${x},${y}`;
            } else if (type === 'page_info') {
              // For page_info, use url and readyState
              hash = `${type}:${interaction.details?.url || ''}:${interaction.details?.readyState || ''}`;
            } else {
              // For other events, use URL
              hash = `${type}:${interaction.details?.url || ''}`;
            }
          } catch (e) {
            // Fallback
            hash = `${type}:${timestamp}`;
          }
          
          // Check if we've seen this interaction recently (at rounded timestamp level)
          let isDuplicate = false;
          if (recentInteractions.has(roundedTimestamp.toString())) {
            const typeMap = recentInteractions.get(roundedTimestamp.toString());
            if (typeMap.has(type) && typeMap.get(type) === hash) {
              console.log(`[Extension] Skipping duplicate ${type} at ${new Date(timestamp).toISOString()}`);
              isDuplicate = true;
            }
          }
          
          // STRICT DEDUPLICATION: Check at exact millisecond level
          if (!isDuplicate && type) {
            // Check if we've seen an event with exact same timestamp and type
            if (!lastInteractionsByExactTimestamp.has(exactTimestamp)) {
              lastInteractionsByExactTimestamp.set(exactTimestamp, new Map());
            } else {
              const typeMap = lastInteractionsByExactTimestamp.get(exactTimestamp);
              if (typeMap.has(type) && typeMap.get(type) === hash) {
                console.log(`[Extension] Skipping precise duplicate ${type} at exact timestamp ${new Date(timestamp).toISOString()}`);
                isDuplicate = true;
              }
            }
          }
          
          // Only add if not a duplicate
          if (!isDuplicate) {
            // Track this interaction at rounded level
            if (!recentInteractions.has(roundedTimestamp.toString())) {
              recentInteractions.set(roundedTimestamp.toString(), new Map());
            }
            recentInteractions.get(roundedTimestamp.toString()).set(type, hash);
            
            // Also track at exact timestamp level
            lastInteractionsByExactTimestamp.get(exactTimestamp).set(type, hash);
            
            // Add to buffer
            interactionBuffer.push(interaction);
            
            // Auto-flush if buffer gets too large or too old
            if (interactionBuffer.length >= MAX_INTERACTION_BUFFER || Date.now() - lastFlushTime > MAX_BUFFER_TIME) {
      flushInteractionBuffer();
    }
          } else {
            // Send acknowledgment to content script even for duplicates
            port.postMessage({
              action: 'interaction_acknowledged',
              type: interaction.type,
              isDuplicate: true
            });
          }
        }
      } else if (message.action === 'content_recording_status') {
        // Content script is telling us its recording state
        console.log(`[Extension] Tab ${tabId} recording status:`, message.isRecording ? 'recording' : 'idle', message.sessionId);
        
        // If content script thinks it's recording but we're not, tell it to stop
        if (message.isRecording && message.sessionId && (recordingStatus !== 'recording' || currentSessionId !== message.sessionId)) {
          console.log(`[Extension] Tab ${tabId} thinks it's recording session ${message.sessionId} but we're ${recordingStatus} with session ${currentSessionId}. Stopping it.`);
          
          port.postMessage({
            action: 'recording_status_changed',
            status: 'idle'
          });
        } 
        // If content script thinks it's not recording but we are, tell it to start
        else if (recordingStatus === 'recording' && currentSessionId && !message.isRecording) {
          console.log(`[Extension] Tab ${tabId} should be recording session ${currentSessionId}. Starting it.`);
          
          port.postMessage({
            action: 'recording_status_changed',
            status: 'recording',
      sessionId: currentSessionId,
        userId: userId
          });
        }
      } else if (message.action === 'check_recording_status') {
        // Content script is asking if it should be recording
        console.log(`[Extension] Tab ${tabId} checking recording status for session ${message.sessionId}`);
        
        // If we're in recording mode, always tell this tab
        if (recordingStatus === 'recording' && currentSessionId) {
          // If the content script is asking about a specific session, check if it matches
          if (message.sessionId) {
            if (message.sessionId === currentSessionId) {
              // Same session - tell it to continue recording
              port.postMessage({
                action: 'recording_status_changed',
                status: 'recording',
                sessionId: currentSessionId,
                userId: userId
              });
            } else {
              // Different session - tell it to stop old session and start new one
              port.postMessage({
                action: 'recording_status_changed',
                status: 'recording',
                sessionId: currentSessionId,
                userId: userId
              });
            }
          } else {
            // No specific session, just tell it to record
            port.postMessage({
              action: 'recording_status_changed',
              status: 'recording',
            sessionId: currentSessionId,
              userId: userId
            });
          }
        } else {
          // We're not recording, tell it to stop
          port.postMessage({
            action: 'recording_status_changed',
            status: 'idle'
          });
        }
      }
    });
    
    // Handle disconnection
    port.onDisconnect.addListener(() => {
      console.log(`[Extension] Content script disconnected from tab ${tabId}`);
      ports.delete(tabId);
      
      // Check if this was the recording tab
      if (recordingStatus === 'recording') {
        // Don't automatically stop recording as the tab might refresh or navigate
        console.log(`[Extension] Tab ${tabId} disconnected - maintaining recording state for reconnection`);
        
        // If this was due to navigation, the webNavigation listener will handle re-connecting
        // If this was due to page refresh, the content script will reconnect automatically
      }
    });
    
    // If we're recording, notify this newly connected content script
    if (recordingStatus === 'recording' && currentSessionId) {
      port.postMessage({
        action: 'recording_status_changed',
        status: 'recording',
                sessionId: currentSessionId,
        userId: userId
      });
    }
  }
});

// Listen for messages from the popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  debugLog('Received message:', { action: request.action, sender });
  
  // Handle saveInteraction - this is the fallback for port communication
  if (request.action === 'saveInteraction') {
    if (recordingStatus === 'recording' && currentSessionId && request.interaction) {
      // Add to buffer for batch processing
      interactionBuffer.push(request.interaction);
      
      // Auto-flush if buffer gets too large
      if (interactionBuffer.length >= MAX_INTERACTION_BUFFER) {
            flushInteractionBuffer();
        }
      
      // Send acknowledgment
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, reason: 'Not recording' });
    }
    return true; // Keep channel open for async response
  }
  
  // Handle DOM capture request from popup
  else if (request.action === "captureDOM") {
    // Get the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs[0]) {
            console.error('[Extension] No active tab found');
            sendResponse({ 
                success: false, 
                error: 'No active tab found' 
            });
            return;
        }

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
            
            if (!response || !response.success) {
                console.error('[Extension] Failed to capture DOM:', response?.error);
                sendResponse({ 
                    success: false, 
                    error: response?.error || 'Failed to capture DOM' 
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
                    domContent: domData,
                    metadata: {
                        ...domData.metadata,
                        tabId: activeTab.id,
                        timestamp: new Date().toISOString()
                    }
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    console.log('[Extension] DOM capture saved successfully:', data.captureId);
                    sendResponse({ success: true, data });
        } else {
                    throw new Error(data.error || 'Failed to save DOM capture');
                }
            })
            .catch(error => {
                console.error('[Extension] Error sending DOM to backend:', error);
                sendResponse({ success: false, error: error.toString() });
            });
        });
    });
    return true; // Keep the message channel open for async response
  }
  
  // Handle start recording request from popup
  else if (request.action === "startRecording") {
    console.log('[DEBUG] Starting recording...', request);
    
    (async () => {
      try {
        checkApiUrl();
        
        // Use tab info from request if available
        let activeTab;
        
        if (request.tabInfo) {
          // Use tab info from popup
          activeTab = request.tabInfo;
          console.log('[Extension] Using provided tab info:', activeTab);
        } else {
          // Fallback to query if needed
          const tabs = await new Promise(resolve => {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, resolve);
          });
          
          if (!tabs || tabs.length === 0) {
            const error = 'No active tab found';
            console.error('[Extension]', error);
            sendResponse({ success: false, error });
                return;
            }
            
          activeTab = tabs[0];
          console.log('[Extension] Found active tab via query:', activeTab);
        }
        
        // Set recording tab ID
        recordingTabId = activeTab.id;
        
        // Generate a session ID
        const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Clear any previous interactions
        interactionBuffer = [];
        interactionCount = 0;
        
        // Mark as recording before sending to content script
        updateRecordingStatus('recording', sessionId);
        
        // Send message to content script to start recording
                chrome.tabs.sendMessage(activeTab.id, { 
                    action: 'startRecording',
          sessionId: sessionId,
                    userId: userId
        }, async (response) => {
          // Check for any errors
            if (chrome.runtime.lastError) {
                        console.error('[Extension] Error starting recording:', chrome.runtime.lastError);
            updateRecordingStatus('idle');
                        sendResponse({ 
                            success: false, 
              error: chrome.runtime.lastError.message || 'Failed to start recording' 
                        });
                return;
            }
            
          // Save session to backend
          try {
            const response = await fetch(`${API_BASE_URL}/extension/recorder/saveSession`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sessionId: sessionId,
                userId: userId,
                url: activeTab.url,
                tabId: activeTab.id,
                browser: clientInfo.browser,
                timestamp: new Date().toISOString(),
                metadata: {
                  title: activeTab.title,
                  favIconUrl: activeTab.favIconUrl
                }
              })
            });
            
            const data = await response.json();
            if (!data.success) {
              throw new Error(data.error || 'Failed to save session');
            }
            
            console.log('[Extension] Recording session saved successfully:', sessionId);
            
            // Notify popup that recording started successfully
            sendResponse({ 
              success: true, 
              sessionId: sessionId,
              status: 'recording'
            });
    } catch (error) {
            console.error('[Extension] Error saving session to backend:', error);
            
            // Don't stop recording, but log the error - the buffer will retry
        sendResponse({ 
              success: true, 
              sessionId: sessionId,
              status: 'recording',
              warning: 'Session saved locally but not synced to backend: ' + error.message
            });
          }
        });
        } catch (error) {
        console.error('[Extension] Error starting recording:', error);
        updateRecordingStatus('idle');
        sendResponse({ 
            success: false, 
          error: error.toString() 
        });
      }
    })();
    
    return true; // Keep the message channel open for async response
  }
  
  // Handle stop recording request from popup
  else if (request.action === "stopRecording") {
    console.log('[Extension] Stopping recording session:', currentSessionId);
    
    (async () => {
      console.log('[Extension] Stopping recording session:', currentSessionId);
      
      try {
        // Update recording status first to prevent race conditions
        updateRecordingStatus('idle');
        
        // If we have active ports, send messages to all
        // This ensures all active tabs know to stop recording
        Array.from(ports.values()).forEach(port => {
          try {
            port.postMessage({
              action: 'recording_status_changed',
              status: 'idle'
            });
          } catch (e) {
            // Ignore errors for disconnected ports
            console.error('[Extension] Error notifying port about stopped recording:', e);
          }
        });
        
        // If we have a session ID, update its status in the backend
      if (currentSessionId) {
          try {
            checkApiUrl();
            
            // Send request to update session status
            await fetch(`${API_BASE_URL}/extension/recorder/stopSession`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
            body: JSON.stringify({
                sessionId: currentSessionId,
                userId: userId,
                endTime: new Date().toISOString()
              })
            });
            
            console.log('[Extension] Session stopped with backend');
        } catch (error) {
            console.error('[Extension] Error stopping session with backend:', error);
          }
        }
        
        // Clear the current session ID
        currentSessionId = null;
        recordingTabId = null;
        saveState();
        
        // Update badge
        updateBadge();
        
        // Respond with success
        sendResponse({ success: true, status: 'idle' });
      } catch (error) {
        console.error('[Extension] Error stopping recording:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    
    // Return true to indicate we'll send an async response
    return true;
  }
  
  // Handle get recording status request
  else if (request.action === "getRecordingStatus") {
    sendResponse({ 
      success: true, 
      status: recordingStatus,
                sessionId: currentSessionId,
      interactionCount: interactionCount,
    });
  }
  
  // Return false by default (unless we need to keep the message channel open)
            return false;
});

console.log('[Extension] Background script loaded'); 

// Add a pre-filter function specifically for duplicate complete page_info events
function preFilterDuplicateCompleteEvents(interactions) {
  console.log(`[Extension] Filtering out all page_info events with readyState complete`);
  
  // Get count of render_complete events for logging
  const renderCompleteCount = interactions.filter(event => event.type === 'render_complete').length;
  if (renderCompleteCount > 0) {
    console.log(`[Extension] Found ${renderCompleteCount} render_complete events - preserving them`);
  }
  
  // Filter out complete page_info events but keep render_complete events
  return interactions.filter(event => {
    if (event.type === 'page_info' && event.details?.readyState === 'complete') {
      console.log(`[Extension] Removing complete page_info event for URL: ${event.url || event.details?.url || 'unknown'}`);
      return false; // Remove all complete events
    }
    
    // Explicitly keep render_complete events
    if (event.type === 'render_complete') {
      return true;
    }
    
    return true; // Keep everything else
  });
} 