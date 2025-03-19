// This file handles interaction recording in the active tab
// It will capture DOM events and send them to the background script

let isRecording = false;
let sessionId = null;
let userId = null;
let interactionCount = 0;
let previousUrl = null;
let lastNavigationTime = 0;

// Add new tracking variables for page loading phase
let pageLoadingPhase = false;
let initialLoadState = null;

// State Management System
const stateManager = {
    states: new Map(), // Map of stateId -> state
    currentState: null,
    stateCounter: 0,
    stateHistory: [], // Array of state transitions
    fingerprints: new Map(), // Map of fingerprint -> stateId

    // Generate a fingerprint for the current DOM state
    generateFingerprint() {
        try {
            const dom = document.documentElement;
            const fingerprint = {
                url: window.location.href,
                domSize: dom.outerHTML.length,
                elementCount: dom.querySelectorAll('*').length,
                structure: this.getDomStructure(dom),
                contentHash: this.hashContent(dom)
            };
            return JSON.stringify(fingerprint);
        } catch (error) {
            console.error('[FYP Tracker] Error generating fingerprint:', error);
            return null;
        }
    },

    // Get a simplified structure of the DOM
    getDomStructure(element) {
        const structure = {
            tagName: element.tagName?.toLowerCase(),
            id: element.id,
            className: element.className,
            childCount: element.childElementCount,
            children: []
        };

        // Only process first 5 children to keep fingerprint manageable
        Array.from(element.children).slice(0, 5).forEach(child => {
            structure.children.push(this.getDomStructure(child));
        });

        return structure;
    },

    // Create a hash of the content
    hashContent(element) {
        // Get text content from important elements
        const content = Array.from(element.querySelectorAll('h1, h2, h3, p, a, button, input, textarea'))
            .map(el => el.textContent?.trim())
            .filter(text => text && text.length > 0)
            .join('|');

        // Simple hash function
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    },

    // Create a new state
    createState() {
        const fingerprint = this.generateFingerprint();
        if (!fingerprint) return null;

        // Check if we already have a state with this fingerprint
        const existingStateId = this.fingerprints.get(fingerprint);
        if (existingStateId) {
            const existingState = this.states.get(existingStateId);
            debugLog('Reusing existing state', { stateId: existingStateId, url: window.location.href });
            this.currentState = existingState;
            this.recordStateTransition(existingState, false);
            
            // Send state information to background script
            this.sendStateInfo(existingState, false);
            
            return existingState;
        }

        // Create new state
        const stateId = `state_${this.stateCounter++}`;
        const newState = {
            id: stateId,
            url: window.location.href,
            fingerprint,
            timestamp: new Date().toISOString(),
            domSize: document.documentElement.outerHTML.length,
            elementCount: document.querySelectorAll('*').length
        };

        this.states.set(stateId, newState);
        this.fingerprints.set(fingerprint, stateId);
        this.currentState = newState;
        this.recordStateTransition(newState, true);
        
        // Send state information to background script
        this.sendStateInfo(newState, true);

        debugLog('Created new state', { stateId, url: window.location.href });
        return newState;
    },

    // Send state information to background script
    sendStateInfo(state, isNew) {
        if (!isRecording || !sessionId || !port) return;
        
        try {
            port.postMessage({
                action: 'saveState',
                state: {
                    stateId: state.id,
                    url: state.url,
                    timestamp: state.timestamp,
                    isNewState: isNew,
                    domSize: state.domSize,
                    elementCount: state.elementCount,
                    fingerprint: state.fingerprint // Send full fingerprint
                },
                sessionId,
                userId
            });
            
            debugLog(`Sent ${isNew ? 'new' : 'existing'} state info to background script: ${state.id}`);
        } catch (error) {
            console.error('[FYP Tracker] Error sending state info:', error);
        }
    },

    // Record a state transition in history
    recordStateTransition(state, isNewState) {
        const transition = {
            id: this.stateHistory.length + 1,
            stateId: state.id,
            url: state.url,
            timestamp: state.timestamp,
            isNewState,
            domSize: state.domSize,
            elementCount: state.elementCount
        };
        
        this.stateHistory.push(transition);

        // Keep history manageable
        if (this.stateHistory.length > 100) {
            this.stateHistory.shift();
        }
        
        // Send state transition to background script
        if (isRecording && sessionId && port) {
            try {
                port.postMessage({
                    action: 'saveStateTransition',
                    transition,
                    sessionId,
                    userId
                });
                
                debugLog('Sent state transition to background script');
            } catch (error) {
                console.error('[FYP Tracker] Error sending state transition:', error);
            }
        }
    },

    // Check if current DOM state is different from current state
    isStateChanged() {
        if (!this.currentState) return true;

        const currentFingerprint = this.generateFingerprint();
        return currentFingerprint !== this.currentState.fingerprint;
    },

    // Get current state info
    getCurrentState() {
        return this.currentState;
    },

    // Get state history
    getStateHistory() {
        return this.stateHistory;
    },

    // Clear all states (useful when stopping recording)
    clear() {
        this.states.clear();
        this.fingerprints.clear();
        this.stateHistory = [];
        this.currentState = null;
        this.stateCounter = 0;
    }
};

// Add tracking for last event times to prevent duplicates
const lastEventTimes = {
    page_info: 0,
    dom_mutation: 0,
    navigation: 0
};

// Track page_info events by readyState with longer deduplication windows
const pageInfoDedupeTimeouts = {
    loading: 2000,    // 2 seconds for loading state
    interactive: 3000, // 3 seconds for interactive state
    complete: 5000    // 5 seconds for complete state
};

// Keep track of DOM mutation stats for deduplication
const lastDomMutationStats = {
    additions: 0,
    removals: 0,
    attributeChanges: 0,
    timestamp: 0
};

// DOM mutation deduplication window (3 seconds)
const DOM_MUTATION_DEDUP_WINDOW = 3000;

// Debug configuration
const DEBUG = true;

// Connection to background script
let port = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Track initialization
let isInitialized = false;

// Helper functions for element identification
// Simple XPath generation
function getXPath(element) {
    if (!element) return '';
    
    try {
        // If element has ID, use that
        if (element.id) {
            return `//*[@id="${element.id}"]`;
        }
        
        // Otherwise, build path
        let path = '';
        let current = element;
        while (current && current.nodeType === Node.ELEMENT_NODE) {
            let selector = current.nodeName.toLowerCase();
            
            // Add index among siblings if needed
            if (current.parentNode) {
                let sibCount = 0;
                let siblings = current.parentNode.childNodes;
                
                for (let i = 0; i < siblings.length; i++) {
                    let sibling = siblings[i];
                    if (sibling.nodeName === current.nodeName) {
                        if (sibling === current) {
                            selector += `[${sibCount + 1}]`;
                            break;
                        }
                        sibCount++;
                    }
                }
            }
            
            path = `/${selector}${path}`;
            current = current.parentNode;
            
            // Stop at body to keep paths manageable
            if (current && (current.nodeName.toLowerCase() === 'body' || path.length > 200)) {
                path = `/${current.nodeName.toLowerCase()}${path}`;
                break;
            }
        }
        
        return path;
    } catch (e) {
        return 'Error calculating xpath';
    }
}

// Generate CSS selector for the element
function getCssSelector(element) {
    if (!element) return '';
    
    try {
        // If element has ID, use that
        if (element.id) {
            return `#${element.id}`;
        }
        
        // If has class, use first stable class
        if (element.className && typeof element.className === 'string') {
            const classes = element.className.trim().split(/\s+/).filter(c => 
                // Filter out dynamic-looking classes
                c && c.length > 2 && !c.match(/^(active|selected|hover|focus|open|close|show|hide|d-|js-|_|md-|animate)/i)
            );
            
            if (classes.length > 0) {
                return `${element.nodeName.toLowerCase()}.${classes[0]}`;
            }
        }
        
        // Try with parent
        if (element.parentNode && element.parentNode.nodeType === Node.ELEMENT_NODE) {
            const parentSelector = getCssSelector(element.parentNode);
            if (parentSelector) {
                let index = 1;
                let sibling = element.previousElementSibling;
                
                while (sibling) {
                    if (sibling.nodeName === element.nodeName) {
                        index++;
                    }
                    sibling = sibling.previousElementSibling;
                }
                
                return `${parentSelector} > ${element.nodeName.toLowerCase()}${index > 1 ? `:nth-child(${index})` : ''}`;
            }
        }
        
        return element.nodeName.toLowerCase();
    } catch (e) {
        return 'Error calculating CSS selector';
    }
}

// Simplified logging
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

// Helper to prevent duplicate navigation events
const shouldRecordNavigation = () => {
    const now = Date.now();
    if (now - lastNavigationTime < 1000) { // Prevent multiple events within 1 second
        return false;
    }
    lastNavigationTime = now;
    lastEventTimes.navigation = now; // Also update in our global tracker
    return true;
};

// Save recording state to persist across page reloads
function saveRecordingState() {
    try {
        if (!isRecording || !sessionId) {
            // Clear saved state if not recording
            localStorage.removeItem('fypTracker_recordingState');
            return;
        }
        
    const state = {
        isRecording,
        sessionId,
        userId,
            timestamp: new Date().toISOString()
        };
        
        // Save to localStorage with the fypTracker_ prefix to avoid conflicts
        localStorage.setItem('fypTracker_recordingState', JSON.stringify(state));
        
        debugLog('Saved recording state');
    } catch (error) {
        console.error('[FYP Tracker] Error saving recording state:', error);
    }
}

// Restore recording state on page reload or content script reinitialization
function restoreRecordingState() {
    try {
        // Get recording state from localStorage
        const savedState = localStorage.getItem('fypTracker_recordingState');
        
        if (!savedState) {
            return false;
        }
        
        const state = JSON.parse(savedState);
        
        if (!state || !state.isRecording || !state.sessionId) {
            return false;
        }
        
        // Don't automatically restore, instead check with background script
        // This ensures we respect the stop recording command even after page refresh
        if (port) {
            console.log('[FYP Tracker] Found saved recording state, checking with background script...');
            
            // Ask background script if this session should be recording
            port.postMessage({
                action: 'check_recording_status',
                sessionId: state.sessionId,
                userId: state.userId
            });
            
            // Wait for background to tell us to start via the message handler
            // (The background will send recording_status_changed if we should record)
            return false;
        }
        
        return false;
    } catch (error) {
        console.error('[FYP Tracker] Error restoring recording state:', error);
        return false;
    }
}

// Initialize content script
function initializeContentScript() {
    if (isInitialized) return;
    
    debugLog('Initializing content script');
    
    // Initialize previousUrl with the current location
    previousUrl = window.location.href;
    
    // Save previous URL to session storage before unload
    try {
        // Check if we have a stored previousUrl
        const storedPreviousUrl = sessionStorage.getItem('fypTracker_previousUrl');
        if (storedPreviousUrl) {
            previousUrl = storedPreviousUrl;
            debugLog(`Restored previous URL: ${previousUrl}`);
        }
    } catch (e) {
        debugLog('Error restoring previous URL', e);
    }
    
    // Set up event listeners for page lifecycle
    window.addEventListener('load', handlePageLoad);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    window.addEventListener('pageshow', handlePageShow);
    
    // Connect to background script immediately
    connectToBackground();
    
    // Mark as initialized
    isInitialized = true;
    debugLog('Content script initialized');
}

// Initialize immediately
initializeContentScript();

// Event handlers
function handlePageLoad() {
    debugLog('Page loaded');
    
    // Set page loading phase to true
    pageLoadingPhase = true;
    initialLoadState = null;
    
    // Reconnect to background if needed
    if (!port) {
        connectToBackground();
    }
    
    // Get previousUrl from session storage if available
    try {
        const storedPreviousUrl = sessionStorage.getItem('fypTracker_previousUrl');
        if (storedPreviousUrl && storedPreviousUrl !== window.location.href) {
            previousUrl = storedPreviousUrl;
            debugLog(`Using stored previous URL: ${previousUrl}`);
        }
    } catch (e) {
        debugLog('Error retrieving previous URL', e);
    }
    
    // Check if this is a navigation during recording
    const storedState = localStorage.getItem('fypTracker_recordingState');
    if (storedState) {
        try {
            const state = JSON.parse(storedState);
            if (state && state.isRecording && state.sessionId) {
                // Ask background if we should still be recording
                if (port) {
                    port.postMessage({
                        action: 'check_recording_status',
                        sessionId: state.sessionId,
                        userId: state.userId
                    });
                }
            }
        } catch (e) {
            debugLog('Error parsing stored recording state', e);
        }
    }
    
    const isReload = window.performance && 
                    window.performance.navigation && 
                    window.performance.navigation.type === 1;
    
    // Track if this URL is the same as previous to avoid duplicate navigation events
    const sameAsPrevious = previousUrl === window.location.href;
    
    // Only send navigation event if:
    // 1. We're recording
    // 2. The URL is different from previous (or it's a reload)
    // 3. We haven't sent a navigation event recently (throttle)
    if (isRecording && sessionId && (!sameAsPrevious || isReload) && shouldRecordNavigation()) {
        // Log the navigation event - only one per page load
        debugLog(`Recording navigation from ${previousUrl || 'new session'} to ${window.location.href}`);
        
        // Send just one navigation event
        sendInteraction({
            type: 'navigation',
            timestamp: new Date().toISOString(),
            details: {
                fromUrl: previousUrl || document.referrer || null,
                toUrl: window.location.href,
                isReload,
                referrer: document.referrer || null
            }
        });

        // Create initial state for the new page - MODIFY THIS
        // Don't create state yet, let DOM mutations handle it during loading phase
        // stateManager.createState();

        // Add special handling to detect DOM changes after page load
        // Take a snapshot of the DOM right after navigation
        const initialDomSize = document.documentElement.outerHTML.length;
        const initialElementCount = document.querySelectorAll('*').length;
        
        debugLog(`Initial DOM state: ${initialElementCount} elements, ${initialDomSize} bytes`);
        
        // Set a timeout to check for DOM changes shortly after load
        setTimeout(() => {
            if (!isRecording || !sessionId) return;
            
            const currentDomSize = document.documentElement.outerHTML.length;
            const currentElementCount = document.querySelectorAll('*').length;
            
            debugLog(`After load DOM state: ${currentElementCount} elements, ${currentDomSize} bytes`);
            
            // Calculate changes
            const sizeChange = Math.abs(currentDomSize - initialDomSize);
            const sizeChangePercentage = (sizeChange / initialDomSize) * 100;
            const elementCountChange = Math.abs(currentElementCount - initialElementCount);
            
            // If there are substantial changes to the DOM after load, report it as a mutation
            if (sizeChangePercentage > 10 || elementCountChange > 5) {
                debugLog(`Detected DOM mutation during page load: ${elementCountChange} elements changed, ${sizeChangePercentage.toFixed(2)}% size change`);
                
                // Send a special dom_mutation event
                sendInteraction({
                    type: 'dom_mutation',
                    timestamp: new Date().toISOString(),
                    details: {
                        summary: `DOM changed during page load: ${elementCountChange} elements changed`,
                        stats: {
                            additions: elementCountChange > 0 ? elementCountChange : 0,
                            removals: elementCountChange < 0 ? Math.abs(elementCountChange) : 0,
                            attributeChanges: 0,
                            isCompleteReplacement: sizeChangePercentage > 30  // Flag as complete replacement if significant
                        },
                        sizeChange: {
                            previousSize: initialDomSize,
                            currentSize: currentDomSize,
                            changePercentage: sizeChangePercentage.toFixed(2),
                            source: 'page_load'
                        }
                    }
                });

                // Check if we need to create a new state after page load mutations
                if (stateManager.isStateChanged()) {
                    stateManager.createState();
                }
            }
        }, 300);
        
        // Send a render_complete event after a short delay to ensure DOM has had time to render
        setTimeout(() => {
            if (isRecording && sessionId) {
                debugLog(`Sending render_complete event for ${window.location.href}`);
                
                // Check if we have an initial load state from DOM mutations
                if (pageLoadingPhase) {
                    if (initialLoadState === null) {
                        // No DOM mutations happened during loading, create first state now
                        debugLog('No DOM mutations during loading, creating initial state at render_complete');
                        initialLoadState = stateManager.createState();
                    } else {
                        // We already have a state from DOM mutations, update it
                        debugLog('Using existing state from DOM mutations for render_complete');
                        // Update timestamp to mark as finalized
                        initialLoadState.timestamp = new Date().toISOString();
                        stateManager.sendStateInfo(initialLoadState, false);
                    }
                    
                    // End loading phase
                    pageLoadingPhase = false;
                    
                    debugLog('Page loading phase complete, normal state tracking resumes');
                }
                
                sendInteraction({
                    type: 'render_complete',
                    timestamp: new Date().toISOString(),
                    details: {
                        url: window.location.href,
                        readyState: document.readyState,
                        timing: {
                            navigationStart: window.performance?.timing?.navigationStart,
                            renderComplete: Date.now(),
                            loadEventStart: window.performance?.timing?.loadEventStart,
                            loadEventEnd: window.performance?.timing?.loadEventEnd
                        },
                        contentStats: {
                            bodyElementCount: document.body?.childElementCount || 0,
                            hasImages: !!document.querySelectorAll('img').length,
                            hasMainContent: !!document.querySelector('main, #content, .content, article, section, .container')
                        }
                    }
                });
                
                // No need to create new state after render_complete if we're using the loading state
                // Final state check after render complete
                // if (stateManager.isStateChanged()) {
                //     stateManager.createState();
                // }
            }
        }, 500);
    }
    
    // Update previousUrl after navigation event is sent
    previousUrl = window.location.href;
    // Store in session storage for persistence
    try {
        sessionStorage.setItem('fypTracker_previousUrl', window.location.href);
    } catch (e) {
        debugLog('Error saving current URL to session storage', e);
    }
}

// Handle pageshow event - called when page is shown from the back/forward cache
function handlePageShow(event) {
    debugLog('Page shown', { persisted: event.persisted });
    
    // If from bfcache, we need to reconnect to background script
    if (event.persisted) {
        debugLog('Page restored from back/forward cache, reconnecting...');
        connectToBackground();
    }
}

// Handle pagehide event - called when page is hidden or unloaded
function handlePageHide(event) {
    debugLog('Page hidden', { persisted: event.persisted });
    
    // If going to bfcache, save state
    if (event.persisted && isRecording) {
        saveRecordingState();
    }
}

function handleBeforeUnload() {
    if (isRecording) {
        saveRecordingState();
    }
    
    // Store the current URL before the page unloads
    try {
        sessionStorage.setItem('fypTracker_previousUrl', window.location.href);
        debugLog(`Saved current URL before unload: ${window.location.href}`);
    } catch (e) {
        debugLog('Error saving current URL', e);
    }
}

// Connect to the background script
function connectToBackground() {
    try {
        if (port) {
            // Try to disconnect old port cleanly
            try {
                port.disconnect();
            } catch (e) {
                // Ignore any errors
            }
        }

        console.log('[FYP Tracker] Connecting to background script...');
        port = chrome.runtime.connect({ name: "recording-port" });
        
        port.onMessage.addListener((message) => {
            try {
                console.log('[FYP Tracker] Received message from background:', message);
                
                if (message.action === 'recording_status_changed') {
                    // Handle recording status change from background
                    const { status, sessionId: newSessionId, userId: newUserId } = message;
                    
                    debugLog(`Received recording status: ${status}, sessionId: ${newSessionId}`);
                    
                    if (status === 'recording' && newSessionId) {
                        if (!isRecording) {
                            startRecording(newSessionId, newUserId);
                        } else if (sessionId !== newSessionId) {
                            // Session changed, restart recording
                            stopRecording();
                            startRecording(newSessionId, newUserId);
                        }
                    } else if (status === 'idle' && isRecording) {
                        stopRecording();
                    }
                }
            } catch (error) {
                console.error('[FYP Tracker] Error handling message from background:', error);
            }
        });
        
        port.onDisconnect.addListener(() => {
            console.log('[FYP Tracker] Disconnected from background script, attempting to reconnect...');
            port = null;
            
            // If we were recording, save the state before reconnecting
            if (isRecording) {
                saveRecordingState();
            }
            
            // Attempt to reconnect with backoff
                reconnectAttempts++;
            if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
                const delay = Math.min(1000 * reconnectAttempts, 10000);
                setTimeout(() => {
                    connectToBackground();
                    
                    // If we were recording, restore after reconnect
                    if (isRecording) {
                        // Notify background about our recording state
                        if (port) {
                            port.postMessage({
                                action: 'content_recording_status',
                                isRecording,
                                sessionId,
                                userId
                            });
                        }
                    }
                }, delay);
            } else {
                console.error('[FYP Tracker] Max reconnection attempts reached. Giving up.');
            }
        });
        
        // Reset reconnect counter on successful connection
        reconnectAttempts = 0;
        
        // Immediately after connecting, check if we should be recording
        // This helps with page reloads or extension restarts
        restoreRecordingState();
        
        // If we are recording, let the background script know
        if (isRecording && sessionId) {
            console.log('[FYP Tracker] Notifying background about active recording');
            port.postMessage({
                action: 'content_recording_status',
                isRecording,
                sessionId,
                userId
            });
        }
        
        return true;
    } catch (error) {
        console.error('[FYP Tracker] Error connecting to background script:', error);
        return false;
    }
}

// Send interaction to the background script
let lastEventTypeTime = {}; // Keep track of the last time each event type was sent
const EVENT_DEDUPE_WINDOW = 300; // ms window to deduplicate events

function sendInteraction(interaction) {
    if (!isRecording || !sessionId) {
        debugLog('Not sending interaction - recording inactive');
        return;
    }
    
    try {
        // Deduplicate events
        const now = Date.now();
        const eventType = interaction.type;
        
        // Special deduplication for click-related events (click, document_click, mousedown)
        if (['click', 'document_click', 'mousedown'].includes(eventType)) {
            // Create a unique key based on position and target to identify similar clicks
            const details = interaction.details || {};
            const x = details.x || 0;
            const y = details.y || 0;
            
            // Create a more specific deduplication key
            const clickKey = `click_${Math.round(x/5)}_${Math.round(y/5)}`; // Round to 5px areas
            
            // Check if we've had a similar click event recently
            if (lastEventTypeTime[clickKey] && (now - lastEventTypeTime[clickKey] < EVENT_DEDUPE_WINDOW)) {
                debugLog(`Skipping duplicate ${eventType} event at (${x},${y})`);
                return; // Skip this duplicate event
            }
            
            // Update the last time we saw this event
            lastEventTypeTime[clickKey] = now;
            
            // For document_click, only send if we haven't seen a regular click
            if (eventType === 'document_click') {
                const regularClickKey = `click_${Math.round(x/5)}_${Math.round(y/5)}`;
                
                // If we recently processed a regular click at this position, skip the document_click
                if (lastEventTypeTime[regularClickKey] && 
                    (now - lastEventTypeTime[regularClickKey] < EVENT_DEDUPE_WINDOW)) {
                    debugLog('Skipping document_click due to recent regular click at same position');
                    return;
                }
            }
        } else {
            // For non-click events, deduplicate based on event type only
            if (lastEventTypeTime[eventType] && (now - lastEventTypeTime[eventType] < EVENT_DEDUPE_WINDOW)) {
                debugLog(`Skipping duplicate ${eventType} event`);
                return;
            }
            lastEventTypeTime[eventType] = now;
        }
        
        // Ensure connection is established
    if (!port) {
            console.log('[FYP Tracker] Port not available, attempting to reconnect...');
        connectToBackground();
            
            // If still not connected, use fallback
            if (!port) {
                sendMessageFallback(interaction);
            return;
        }
        }
        
        // Get current state info
        const currentState = stateManager.getCurrentState();
        const stateId = currentState ? currentState.id : null;
        
        // Add session info and state info to interaction
        const enrichedInteraction = {
            ...interaction,
            sessionId,
            userId,
            url: window.location.href,
            timestamp: interaction.timestamp || new Date().toISOString(),
            stateId // Add the current state ID to the interaction
        };
        
        // For certain events, add more detailed state information
        if (['navigation', 'dom_mutation', 'page_info', 'render_complete'].includes(eventType)) {
            if (!enrichedInteraction.details) {
                enrichedInteraction.details = {};
            }
            
            // Add state information to details
            enrichedInteraction.details.state = {
                id: stateId,
                isNewState: currentState ? 
                    stateManager.stateHistory.length > 0 && 
                    stateManager.stateHistory[stateManager.stateHistory.length - 1].isNewState : false,
                domSize: currentState ? currentState.domSize : null,
                elementCount: currentState ? currentState.elementCount : null,
                fingerprint: currentState ? currentState.fingerprint : null // Add fingerprint to state details
            };
        }
        
        try {
            // Try to send via port
            port.postMessage({
                action: 'saveInteraction',
                interaction: enrichedInteraction
            });
            
            interactionCount++;
            
            // Log successful event sending
            debugLog(`Sent ${eventType} interaction to background script with stateId: ${stateId}`);
        } catch (portError) {
            console.error('[FYP Tracker] Error sending via port, will reconnect:', portError);
            
            // Port may be disconnected, try to reconnect
            port = null;
            connectToBackground();
            
            // Use fallback
            sendMessageFallback(enrichedInteraction);
        }
    } catch (error) {
        console.error('[FYP Tracker] Error sending interaction:', error);
    }
}

// Fallback method to send interactions via chrome.runtime.sendMessage
function sendMessageFallback(interaction) {
    try {
        // Get current state info for fallback method
        const currentState = stateManager.getCurrentState();
        const stateId = currentState ? currentState.id : null;
        
        chrome.runtime.sendMessage({
            action: 'saveInteraction',
            interaction: {
                ...interaction,
                sessionId,
                userId,
                url: window.location.href,
                timestamp: interaction.timestamp || new Date().toISOString(),
                stateId // Add state ID to fallback method as well
            }
        });
        debugLog(`Sent interaction via fallback method: ${interaction.type} with stateId: ${stateId}`);
    } catch (error) {
        console.error('[FYP Tracker] Error using fallback send method:', error);
    }
}

// Set up DOM mutation observer
function setupMutationObserver() {
    // This will capture DOM changes for replay
    let pendingMutations = [];
    let mutationTimeout = null;
    let lastMutationTime = 0;
    const MUTATION_MIN_INTERVAL = 2000; // Decrease to 2 seconds to capture more mutations
    
    // Track DOM mutation sources for better filtering
    const seenMutationSources = new Set();
    
    // Track the previous DOM snapshot size to detect complete replacements
    let previousDOMSize = document.documentElement.outerHTML.length;
    
    const observer = new MutationObserver((mutations) => {
        if (!isRecording) return;
        
        // Don't record mutations too frequently, but be more lenient
        const now = Date.now();
        if (now - lastMutationTime < MUTATION_MIN_INTERVAL) {
            return;
        }
        
        // Check if this might be a complete DOM replacement
        const currentDOMSize = document.documentElement.outerHTML.length;
        const sizeChange = Math.abs(currentDOMSize - previousDOMSize);
        const sizeChangePercentage = (sizeChange / previousDOMSize) * 100;
        
        // Lower the threshold for detecting complete replacements to 30%
        const mightBeCompleteReplacement = sizeChangePercentage > 30;
        
        if (mightBeCompleteReplacement) {
            debugLog(`Detected potential complete DOM replacement: ${sizeChangePercentage.toFixed(2)}% size change`);
            
            // Count actual elements changed
            let addedElements = 0;
            let removedElements = 0;
            
            mutations.forEach(m => {
                if (m.type === 'childList') {
                    // Count only element nodes
                    addedElements += Array.from(m.addedNodes).filter(node => 
                        node.nodeType === 1 && node.tagName
                    ).length;
                    
                    removedElements += Array.from(m.removedNodes).filter(node => 
                        node.nodeType === 1 && node.tagName
                    ).length;
                }
            });
            
            // Lower the threshold for element changes to 20
            const totalElementChanges = addedElements + removedElements;
            if (totalElementChanges > 20) {  // Lower threshold for significant element changes
                debugLog(`Confirmed complete DOM replacement: ${addedElements} elements added, ${removedElements} elements removed`);
                
                // Create a special dom_mutation event for complete replacement
                sendInteraction({
                    type: 'dom_mutation',
                    timestamp: new Date().toISOString(),
                    count: mutations.length,
                    details: {
                        summary: `Complete DOM replacement: ${addedElements} elements added, ${removedElements} elements removed`,
                        stats: {
                            additions: addedElements,
                            removals: removedElements,
                            attributeChanges: 0,
                            isCompleteReplacement: true
                        },
                        sizeChange: {
                            previousSize: previousDOMSize,
                            currentSize: currentDOMSize,
                            changePercentage: sizeChangePercentage.toFixed(2)
                        }
                    }
                });

                // MODIFY THE STATE CREATION LOGIC
                // Check if we're in the loading phase
                if (pageLoadingPhase) {
                    if (initialLoadState === null) {
                        // First significant mutation during loading
                        debugLog('Creating initial state from significant DOM mutation during page load');
                        initialLoadState = stateManager.createState();
                    } else {
                        // Update existing state during loading phase
                        debugLog('Updating initial state with new DOM mutation during page load');
                        const currentFingerprint = stateManager.generateFingerprint();
                        if (currentFingerprint !== initialLoadState.fingerprint) {
                            // DOM changed, update state data but keep same ID
                            initialLoadState.fingerprint = currentFingerprint;
                            initialLoadState.domSize = document.documentElement.outerHTML.length;
                            initialLoadState.elementCount = document.querySelectorAll('*').length;
                            initialLoadState.timestamp = new Date().toISOString();
                            // Notify background of update
                            stateManager.sendStateInfo(initialLoadState, false);
                        }
                    }
                } else {
                    // Normal state tracking after loading is complete
                    if (stateManager.isStateChanged()) {
                        stateManager.createState();
                    }
                }
                
                // Update tracking data
                lastMutationTime = now;
                lastEventTimes.dom_mutation = now;
                previousDOMSize = currentDOMSize;
                
                // Clear pending mutations to avoid duplicate events
                pendingMutations = [];
                if (mutationTimeout) {
                    clearTimeout(mutationTimeout);
                }
                
                return;
            }
        }
        
        // Update DOM size for future comparisons
        previousDOMSize = currentDOMSize;
        
        // Continue with normal mutation processing for non-complete replacements
        
        // Filter for significant mutations - be less selective to catch more mutations
        const significantMutations = mutations.filter(m => {
            // Only capture significant mutations
            if (m.type === 'childList') {
                // For childList, accept more types of changes
                const hasSignificantAddedNodes = Array.from(m.addedNodes).some(node => {
                    if (node.nodeType !== 1) return false; // Not an element
                    if (!node.tagName) return false;
                    
                    // Shorter exclusion list to catch more changes
                    if (['SCRIPT', 'STYLE', 'META', 'LINK'].includes(node.tagName)) {
                        return false;
                    }
                    
                    // Accept more nodes, even small ones
                    return true;
                });
                
                return hasSignificantAddedNodes || m.removedNodes.length > 0; // Accept any removals
            } 
            else if (m.type === 'attributes') {
                // Accept more attribute changes
                return true;
            }
            return false;
        });
        
        if (significantMutations.length > 0) {
            pendingMutations = pendingMutations.concat(significantMutations);
            
            // Debounce to avoid sending too many events but respond faster
            if (mutationTimeout) {
                clearTimeout(mutationTimeout);
            }
            
            mutationTimeout = setTimeout(() => {
                // If we have pending mutations to process
                if (pendingMutations.length >= 1) {
                    // Less strict deduplication - allow more mutations through
                    const currentTime = Date.now();
                    if (currentTime - lastEventTimes.dom_mutation < 1000) { // Reduced from 3000ms
                        debugLog(`Skipping DOM mutation event - too soon after previous (${currentTime - lastEventTimes.dom_mutation}ms)`);
                        pendingMutations = [];
                        return;
                    }
                    
                    // Lower threshold for minimum changes
                    if (pendingMutations.length < 2) { // Reduced from 3
                        debugLog(`Skipping DOM mutation batch - only ${pendingMutations.length} changes`);
                        pendingMutations = [];
                        return;
                    }
                    
                    // Count the types of changes
                    const stats = {
                        additions: 0,
                        removals: 0,
                        attributeChanges: 0
                    };
                    
                    pendingMutations.forEach(m => {
                        if (m.type === 'childList') {
                            stats.additions += m.addedNodes.length;
                            stats.removals += m.removedNodes.length;
                        } else if (m.type === 'attributes') {
                            stats.attributeChanges++;
                        }
                    });
                    
                    // Lower threshold for total changes
                    const totalChanges = stats.additions + stats.removals + stats.attributeChanges;
                    if (totalChanges < 2) { // Reduced from 5
                        debugLog(`Skipping minor DOM mutation with only ${totalChanges} changes`);
                        pendingMutations = [];
                        return;
                    }
                    
                    // Update tracking for mutations
                    lastMutationTime = currentTime;
                    lastEventTimes.dom_mutation = currentTime;
                    
                    // Store the stats for future comparison
                    lastDomMutationStats.additions = stats.additions;
                    lastDomMutationStats.removals = stats.removals;
                    lastDomMutationStats.attributeChanges = stats.attributeChanges;
                    lastDomMutationStats.timestamp = currentTime;
                    
                    // Create a useful summary of the changes
                    const summary = `DOM changed: ${stats.additions} additions, ${stats.removals} removals, ${stats.attributeChanges} attribute changes`;
                    
                    // Capture more detailed information about the mutations
                    const mutationDetails = pendingMutations.slice(0, 10).map(m => {
                        if (m.type === 'childList') {
                            return {
                                type: 'childList',
                                target: getXPath(m.target),
                                addedNodes: Array.from(m.addedNodes)
                                    .filter(n => n.nodeType === 1 && n.tagName)
                                    .map(n => ({
                                        tagName: n.tagName.toLowerCase(),
                                        id: n.id,
                                        className: n.className,
                                        text: n.textContent?.trim().substring(0, 50)
                                    }))
                                    .slice(0, 3),
                                removedNodes: m.removedNodes.length
                            };
                        } else if (m.type === 'attributes') {
                            return {
                                type: 'attribute',
                                target: getXPath(m.target),
                                attribute: m.attributeName,
                                tagName: m.target.tagName?.toLowerCase()
                            };
                        }
                        return { type: m.type };
                    });
                    
                    sendInteraction({
                        type: 'dom_mutation',
                        count: pendingMutations.length,
                        details: {
                            summary,
                            stats,
                            mutations: mutationDetails
                        }
                    });

                    // MODIFY STATE CREATION LOGIC
                    // Check if we're in the loading phase
                    if (pageLoadingPhase) {
                        if (initialLoadState === null) {
                            // First significant mutation during loading
                            debugLog('Creating initial state from DOM mutation during page load');
                            initialLoadState = stateManager.createState();
                        } else {
                            // Update existing state during loading phase
                            debugLog('Updating initial state with new DOM mutation during page load');
                            const currentFingerprint = stateManager.generateFingerprint();
                            if (currentFingerprint !== initialLoadState.fingerprint) {
                                // DOM changed, update state data but keep same ID
                                initialLoadState.fingerprint = currentFingerprint;
                                initialLoadState.domSize = document.documentElement.outerHTML.length;
                                initialLoadState.elementCount = document.querySelectorAll('*').length;
                                initialLoadState.timestamp = new Date().toISOString();
                                // Notify background of update
                                stateManager.sendStateInfo(initialLoadState, false);
                            }
                        }
                    } else {
                        // Normal state tracking after loading is complete
                        if (stateManager.isStateChanged()) {
                            stateManager.createState();
                        }
                    }
                }
                pendingMutations = [];
            }, 500); // Reduce to 500ms to capture changes more quickly
        }
    });
    
    observer.observe(document.documentElement, {
        childList: true,
        attributes: true,
        subtree: true,
        attributeFilter: ['class', 'id', 'style', 'src', 'href', 'value', 'checked', 'selected', 'disabled']
    });
    
    return observer;
}

// Set up scroll capture (only for significant scrolls)
function setupScrollCapture() {
    let lastScrollTime = 0;
    let lastScrollY = window.scrollY;
    let lastScrollX = window.scrollX;
    const SCROLL_THROTTLE = 1000; // 1 second
    const SCROLL_THRESHOLD = 100; // pixels
    
    const scrollHandler = () => {
        if (!isRecording) return;
        
        const now = Date.now();
        if (now - lastScrollTime < SCROLL_THROTTLE) return;
        
        // Check if scroll distance is significant
        const scrollDiffY = Math.abs(window.scrollY - lastScrollY);
        const scrollDiffX = Math.abs(window.scrollX - lastScrollX);
        
        if (scrollDiffY < SCROLL_THRESHOLD && scrollDiffX < SCROLL_THRESHOLD) return;
        
            lastScrollTime = now;
        lastScrollY = window.scrollY;
        lastScrollX = window.scrollX;
            
        sendInteraction({
                type: 'scroll',
                details: {
                    scrollX: window.scrollX,
                    scrollY: window.scrollY,
                    scrollHeight: document.documentElement.scrollHeight,
                scrollWidth: document.documentElement.scrollWidth,
                viewportHeight: window.innerHeight,
                viewportWidth: window.innerWidth
            }
        });
    };
    
    window.addEventListener('scroll', scrollHandler, { passive: true });
    
    return scrollHandler;
}

// Set up all interaction recording mechanisms
function setupInteractionRecording() {
    // Connect to background script
    connectToBackground();
    
    // Set up observers and handlers
    const observer = setupMutationObserver();
    
    // MODIFIED: Instead of using two separate click handlers, we'll use a single comprehensive one
    const eventHandlers = {};
    
    // Set up a single document-level click handler to capture ALL clicks
    const documentClickHandler = (event) => {
        if (!isRecording) return;
        
        const target = event.target;
        
        // Create a simplified representation of the event
        const eventData = {
            type: 'click', // Simplified to just 'click' (no more mousedown or document_click)
            timestamp: new Date().toISOString(),
            targetElement: {
                tagName: target.tagName?.toLowerCase() || 'text',
                className: target.className,
                id: target.id,
                type: target.type,
                name: target.name,
                value: target.type === 'password' ? '********' : 
                      target.value?.length > 100 ? target.value.substring(0, 100) + '...' : target.value
            },
            details: {
                x: event.clientX,
                y: event.clientY,
                text: target.textContent?.trim().substring(0, 100),
                innerText: target.innerText?.trim().substring(0, 100),
                textContent: target.textContent?.trim().substring(0, 100),
                href: target.href,
                ariaLabel: target.getAttribute('aria-label'),
                parentElement: target.parentElement ? {
                    tagName: target.parentElement.tagName?.toLowerCase(),
                    className: target.parentElement.className,
                    id: target.parentElement.id,
                    text: target.parentElement.textContent?.trim().substring(0, 50)
                } : null,
                xpath: getXPath(target),
                cssSelector: getCssSelector(target),
                elementAttributes: Array.from(target.attributes || [])
                    .reduce((attrs, attr) => {
                        attrs[attr.name] = attr.value;
                        return attrs;
                    }, {})
            }
        };
        
        // Get elements at the click position for better context
        const elementsAtPoint = document.elementsFromPoint(event.clientX, event.clientY);
        if (elementsAtPoint && elementsAtPoint.length > 0) {
            eventData.details.elementsAtPoint = elementsAtPoint.slice(0, 3).map(el => ({
                tagName: el.tagName?.toLowerCase(),
                id: el.id,
                className: el.className,
                text: el.textContent?.trim().substring(0, 50),
                xpath: getXPath(el)
            }));
        }
        
        // Log for debugging
        console.log('[FYP Tracker] Click captured:', {
            element: target.tagName?.toLowerCase() || 'text',
            text: target.textContent?.trim().substring(0, 50),
            xpath: eventData.details.xpath
        });
        
        // Send the interaction data
        sendInteraction(eventData);
    };
    
    // Use capturing phase to ensure we get all clicks
    document.addEventListener('click', documentClickHandler, { capture: true, passive: true });
    eventHandlers.click = documentClickHandler;
    
    // Set up other event types (but not mousedown or regular click since we handle that above)
    const otherEventTypes = ['submit', 'input', 'change'];
    
    otherEventTypes.forEach(type => {
        eventHandlers[type] = (event) => {
    if (!isRecording) return;
    
            const target = event.target;
            
            // For input/change/submit events, we want to filter
            if (!['INPUT', 'SELECT', 'TEXTAREA', 'FORM'].includes(target.tagName)) {
                return;
            }
            
            // Create a simplified representation of the event
            const eventData = {
                type: event.type,
        timestamp: new Date().toISOString(),
                targetElement: {
                    tagName: target.tagName?.toLowerCase(),
                    className: target.className,
                    id: target.id,
                    type: target.type,
                    name: target.name,
                    value: target.type === 'password' ? '********' : 
                          target.value?.length > 100 ? target.value.substring(0, 100) + '...' : target.value
                }
            };
            
            // Add specific details based on event type
            if (type === 'submit') {
                eventData.details = {
                    formId: target.id,
                    formAction: target.action,
                    formElements: Array.from(target.elements || [])
                        .filter(el => el.name)
                        .map(el => ({ 
                            name: el.name, 
                            type: el.type,
                            value: el.type === 'password' ? '********' : 
                                  el.value?.length > 100 ? el.value.substring(0, 100) + '...' : el.value
                        }))
                };
            } else if (['input', 'change'].includes(type)) {
                // Throttle input events - only record after user stops typing
                if (type === 'input' && eventHandlers.inputTimeout) {
                    clearTimeout(eventHandlers.inputTimeout);
                }
                
                eventHandlers.inputTimeout = setTimeout(() => {
                    eventData.details = {
                        fieldType: target.type,
                        fieldName: target.name,
                        value: target.type === 'password' ? '********' : 
                              target.value?.length > 100 ? target.value.substring(0, 100) + '...' : target.value
                    };
                    
                    sendInteraction(eventData);
                }, 500); // 500ms debounce
                
                // For input events, return early as we'll send when debounced
                if (type === 'input') {
                    return;
                }
            }
            
            sendInteraction(eventData);
        };
        
        // Attach event listener
        document.addEventListener(type, eventHandlers[type], { capture: true, passive: true });
    });
    
    const scrollHandler = setupScrollCapture();
    
    // Store cleanup function
    window._interactionCleanup = () => {
        observer.disconnect();
        
        // Remove event handlers
        for (const [type, handler] of Object.entries(eventHandlers)) {
            document.removeEventListener(type, handler, { capture: true });
        }
        
        window.removeEventListener('scroll', scrollHandler);
    };
    
    debugLog('Interaction recording set up');
}

// Clean up all event handlers
function cleanupInteractionRecording() {
    if (window._interactionCleanup) {
        window._interactionCleanup();
        window._interactionCleanup = null;
    }
}

// Start recording user interactions
function startRecording(sessionID, userID) {
    if (isRecording) {
        // Already recording (could be handled by updating session)
        if (sessionID !== sessionId) {
            // Session ID changed, update and continue
            debugLog(`Switching to session ${sessionID} from ${sessionId}`);
            sessionId = sessionID;
            userId = userID;
            saveRecordingState();
        }
        return;
    }
    
    debugLog(`Starting recording with session ${sessionID}`);
    
    // Set recording flags
    isRecording = true;
    sessionId = sessionID;
    userId = userID;
    
    // Save recording state
    saveRecordingState();
    
    // Set up page info interaction
    sendPageInfo();
    
    // Set up all interaction recording mechanisms
            setupInteractionRecording();
    
    debugLog('Recording started');
}

// Stop recording user interactions
function stopRecording() {
    if (!isRecording) {
        return;
    }
    
    debugLog('Stopping recording');
    
    // Clean up event listeners and observers
    if (window._interactionCleanup) {
        window._interactionCleanup();
    }
    
    // Reset state
    isRecording = false;
    sessionId = null;
    userId = null;
    interactionCount = 0;
    
    // Clear stored state
    try {
        localStorage.removeItem('fypTracker_recordingState');
    } catch (error) {
        debugLog('Error clearing recording state', error);
    }
    
    // Clear state management system
    stateManager.clear();
    
    // Notify background script that recording has stopped
    if (port) {
        port.postMessage({
            action: 'content_recording_status',
            isRecording: false
        });
    }
    
    debugLog('Recording stopped');
}

// Capture DOM for analysis
function captureDom() {
    try {
        debugLog('Capturing DOM');
        
        // Get entire DOM as string
        const domString = document.documentElement.outerHTML;
        
        // Extract key page information
        const pageInfo = {
            url: window.location.href,
            title: document.title,
            meta: Array.from(document.querySelectorAll('meta'))
                .map(meta => ({
                    name: meta.getAttribute('name'),
                    property: meta.getAttribute('property'),
                    content: meta.getAttribute('content')
                }))
                .filter(meta => meta.name || meta.property)
        };
        
        return {
            success: true,
            domContent: {
                html: domString,
            title: document.title,
            url: window.location.href,
            timestamp: new Date().toISOString(),
                metadata: pageInfo
            }
        };
    } catch (error) {
        debugLog('Error capturing DOM', error);
        return {
            success: false,
            error: error.toString()
        };
    }
}

// Send page information interaction
function sendPageInfo(source = 'default') {
    if (!isRecording || !sessionId) return;
    
    // Get current readyState
    const currentReadyState = document.readyState;
    
    // Create a global tracker for complete events - truly global across all pages
    if (!window._fypGlobalPageInfoTracking) {
        window._fypGlobalPageInfoTracking = {
            completeEventURLs: new Set(), // Track URLs that have had complete events
        };
    }
    
    // Create a page-specific tracker if it doesn't exist
    if (!window._fypPageInfoTracking) {
        window._fypPageInfoTracking = {
            lastSent: {},
            pageCompleteCount: 0
        };
    }
    
    // Get the appropriate timeout based on readyState
    const dedupeTimeout = pageInfoDedupeTimeouts[currentReadyState] || 2000;
    const now = Date.now();
    
    // For readyState complete, enforce a strict single event policy
    if (currentReadyState === 'complete') {
        const urlKey = window.location.href;
        
        // If we've already sent a complete event for this URL, skip it (unless forced)
        if (window._fypGlobalPageInfoTracking.completeEventURLs.has(urlKey) && source !== 'forced') {
            debugLog(`Strict policy: Skipping duplicate complete page_info - already sent one for this URL`);
            return;
        }
        
        // Mark that we've sent a complete event for this URL
        window._fypGlobalPageInfoTracking.completeEventURLs.add(urlKey);
        debugLog(`Strict policy: Sending ONE complete page_info for URL: ${urlKey}`);
        
        // Limit the size of the URL set to prevent memory leaks
        if (window._fypGlobalPageInfoTracking.completeEventURLs.size > 50) {
            // Remove oldest entries by converting to array and back
            const urls = Array.from(window._fypGlobalPageInfoTracking.completeEventURLs);
            window._fypGlobalPageInfoTracking.completeEventURLs = new Set(urls.slice(-50));
        }
    } 
    // For non-complete readyStates, use normal deduplication
    else if (source !== 'forced') {
        const urlKey = `${window.location.href}:${currentReadyState}`;
        const lastSentTime = window._fypPageInfoTracking.lastSent[urlKey] || 0;
        
        if (lastSentTime && now - lastSentTime < dedupeTimeout) {
            debugLog(`Skipping duplicate page_info with readyState: ${currentReadyState} (${now - lastSentTime}ms < ${dedupeTimeout}ms)`);
            return;
        }
        
        // Update tracking for this readyState and URL
        window._fypPageInfoTracking.lastSent[urlKey] = now;
    } else {
        debugLog(`Proceeding with ${source} forced page_info event for readyState: ${currentReadyState}`);
    }
    
    // Also update the previous event tracking system for all events
    lastEventTimes[`page_info:${currentReadyState}`] = now;
    lastEventTimes.page_info = now;
    
    debugLog(`Sending page_info with readyState: ${currentReadyState}, source: ${source}`);

    // Get performance data if available
    let performanceData = {};
    try {
        if (window.performance) {
            const timing = window.performance.timing;
            if (timing) {
                performanceData = {
                    navigationStart: timing.navigationStart,
                    unloadEventStart: timing.unloadEventStart,
                    unloadEventEnd: timing.unloadEventEnd,
                    redirectStart: timing.redirectStart,
                    redirectEnd: timing.redirectEnd,
                    fetchStart: timing.fetchStart,
                    domainLookupStart: timing.domainLookupStart,
                    domainLookupEnd: timing.domainLookupEnd,
                    connectStart: timing.connectStart,
                    connectEnd: timing.connectEnd,
                    secureConnectionStart: timing.secureConnectionStart,
                    requestStart: timing.requestStart,
                    responseStart: timing.responseStart,
                    responseEnd: timing.responseEnd,
                    domLoading: timing.domLoading,
                    domInteractive: timing.domInteractive,
                    domContentLoadedEventStart: timing.domContentLoadedEventStart,
                    domContentLoadedEventEnd: timing.domContentLoadedEventEnd,
                    domComplete: timing.domComplete,
                    loadEventStart: timing.loadEventStart,
                    loadEventEnd: timing.loadEventEnd
                };
            }
            
            // Navigation type
            if (window.performance.navigation) {
                performanceData.navigationType = window.performance.navigation.type;
                performanceData.navigationTypeText = [
                    'navigate',
                    'reload',
                    'back_forward',
                    'reserved'
                ][window.performance.navigation.type] || 'unknown';
            }
        }
    } catch (e) {
        debugLog('Error getting performance data', e);
    }

    // Get resource timing data for critical resources
    let resourceTiming = [];
    try {
        if (window.performance && window.performance.getEntriesByType) {
            const entries = window.performance.getEntriesByType('resource');
            resourceTiming = entries
                .filter(entry => {
                    // Only include critical resources
                    const url = entry.name || '';
                    return url.endsWith('.js') || url.endsWith('.css') || 
                           url.endsWith('.png') || url.endsWith('.jpg') || 
                           url.endsWith('.svg') || url.includes('critical');
                })
                .slice(0, 10) // Limit to 10 entries
                .map(entry => ({
                    name: entry.name,
                    entryType: entry.entryType,
                    startTime: entry.startTime,
                    duration: entry.duration,
                    initiatorType: entry.initiatorType
                }));
        }
    } catch (e) {
        debugLog('Error getting resource timing', e);
    }

    // Gather meta information
    let metaInfo = [];
    try {
        const metaTags = document.querySelectorAll('meta');
        metaInfo = Array.from(metaTags)
            .filter(tag => tag.getAttribute('name') || tag.getAttribute('property'))
            .map(tag => ({
                name: tag.getAttribute('name'),
                property: tag.getAttribute('property'),
                content: tag.getAttribute('content')
            }))
            .slice(0, 10); // Limit to 10 entries
    } catch (e) {
        debugLog('Error getting meta information', e);
    }

    sendInteraction({
        type: 'page_info',
        details: {
            url: window.location.href,
            title: document.title,
            readyState: document.readyState,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            userAgent: navigator.userAgent,
            referrer: document.referrer || null,
            previousUrl: previousUrl || null,
            performance: performanceData,
            resourceTiming: resourceTiming,
            meta: metaInfo,
            documentUrlChanged: previousUrl !== window.location.href
        }
    });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    debugLog('Received message', request);
    
    if (request.action === 'startRecording') {
        const result = startRecording(request.sessionId, request.userId);
        sendResponse(result);
    }
    
    else if (request.action === 'stopRecording') {
        const result = stopRecording();
        sendResponse(result);
    }
    
    else if (request.action === 'captureDom') {
        const result = captureDom();
        sendResponse(result);
    }
    
    else if (request.action === 'ping') {
        // Used to check if content script is loaded
        sendResponse({ success: true });
    }
    
    return true; // Keep the message channel open for async responses
});

// Log that content script is loaded
debugLog('Content script loaded'); 