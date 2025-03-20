// Simplified DOM State Tracker - Content Script
// Tracks DOM changes and state only

// Core state variables
let isRecording = false;
let sessionId = null;
let userId = null;
let currentStateId = null;
let stateCounter = 0;
let lastDomHash = null;
let mutationObserver = null;
let previousStates = {}; // StateHash -> StateId mapping

// Send a message to the background script
function sendToBackground(action, data) {
    console.log(`[DOM Tracker] Sending to background: ${action}`);
    
    // Simple message passing
    return chrome.runtime.sendMessage({ action, ...data })
        .then(response => {
            if (chrome.runtime.lastError) {
                console.error('[DOM Tracker] Error sending message:', chrome.runtime.lastError);
                return false;
            }
            console.log(`[DOM Tracker] Sent ${action} successfully`);
            return true;
        })
        .catch(error => {
            console.error('[DOM Tracker] Error sending message:', error);
            return false;
        });
}

// Calculate hash of the DOM
function calculateDomHash() {
    try {
        // Get a simplified version of the DOM structure
        const domStructure = document.documentElement.innerHTML;
        
        // Add URL to make the hash page-specific
        const urlObj = new URL(window.location.href);
        const pagePath = urlObj.pathname;
        
        // Simple hash function
        let hash = 0;
        const hashInput = pagePath + '_' + domStructure.length;
        
        for (let i = 0; i < hashInput.length; i++) {
            const char = hashInput.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        // Format hash to be readable
        const baseHash = Math.abs(hash).toString(36);
        const pageId = pagePath.replace(/[^a-z0-9]/gi, '').toLowerCase();
        
        return `${baseHash}_${pageId}`;
    } catch (error) {
        console.error('[DOM Tracker] Error calculating DOM hash:', error);
        // Fallback to path-based identifier
        return `page_${window.location.pathname.replace(/[^a-z0-9]/gi, '')}`;
    }
}

// Create a DOM state snapshot
function createDomState() {
    const url = window.location.href;
    const hash = calculateDomHash();
    const isNewState = true; // Always create a new state for now
    
    // Create a new state ID with sequential number
    const stateId = `state_${stateCounter}`;
    console.log(`[DOM Tracker] Creating NEW state: ${stateId} (hash: ${hash})`);
    stateCounter++; // Increment for next state
    
    const state = createStateObject(stateId, url, hash, isNewState);
    currentStateId = stateId;
    
    // Store the state for reference
    previousStates[hash] = stateId;
    
    // Save in session storage
    try {
        sessionStorage.setItem('domTracker_stateCounter', stateCounter.toString());
        sessionStorage.setItem('domTracker_states', JSON.stringify(previousStates));
    } catch (e) {
        console.error('[DOM Tracker] Error saving to sessionStorage:', e);
    }
    
    return { state, isNewState };
}

// Create a state object with all necessary properties
function createStateObject(stateId, url, hash, isNewState) {
    // Collect meaningful metrics about the DOM
    const domSize = document.documentElement.outerHTML.length;
    const elementCount = document.querySelectorAll('*').length;
    const formElements = document.querySelectorAll('input, select, textarea').length;
    const visibleElements = document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]').length;
    
    // Extract state number from ID
    const stateNumber = parseInt(stateId.split('_')[1], 10);
    
    return {
        stateId,
        sessionId,
        userId,
        url,
        timestamp: new Date().toISOString(),
        isNewState,
        stateNumber,
        metrics: {
            domSize,
            elementCount,
            formElements,
            visibleElements
        },
        hash: hash,
        title: document.title
    };
}

// Set up DOM mutation observer to detect changes
function setupMutationObserver() {
    if (mutationObserver) {
        mutationObserver.disconnect();
    }
    
    // Configuration for the observer (observe everything)
    const config = {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true
    };
    
    // Create an observer instance
    mutationObserver = new MutationObserver(mutations => {
        if (!isRecording) return;
        
        console.log(`[DOM Tracker] DOM changed: ${mutations.length} mutations`);
        
        // Create a new state for any DOM change
        processMutations(mutations);
    });
    
    // Start observing the entire document
    mutationObserver.observe(document.documentElement, config);
    
    return mutationObserver;
}

// Process mutations and create a new state
function processMutations(mutations) {
    if (!isRecording) return;
    
    console.log(`[DOM Tracker] Processing ${mutations.length} DOM mutations`);
    
    try {
        // For simplicity: ANY DOM change creates a new state
        const currentHash = calculateDomHash();
        
        // Only create a new state if the hash is different
        if (currentHash !== lastDomHash) {
            console.log(`[DOM Tracker] DOM hash changed: ${lastDomHash} -> ${currentHash}`);
            
            const { state, isNewState } = createDomState();
            lastDomHash = currentHash;
            
            // Send the state to background
            sendToBackground('recordState', {
                state: state
            });
            
            console.log(`[DOM Tracker] Created new state due to DOM change: ${state.stateId}`);
        } else {
            console.log('[DOM Tracker] DOM changed but hash remains the same');
        }
    } catch (error) {
        console.error('[DOM Tracker] Error processing mutations:', error);
    }
}

// Track URL/page changes
function setupNavigationTracking() {
    // Listen for URL changes
    window.addEventListener('popstate', () => {
        console.log('[DOM Tracker] Navigation detected (popstate)');
        handleNavigation();
    });
    
    // For single-page apps and other navigation methods
    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        console.log('[DOM Tracker] Navigation detected (pushState)');
        handleNavigation();
    };
    
    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        console.log('[DOM Tracker] Navigation detected (replaceState)');
        handleNavigation();
    };
    
    // Handle navigation events
    function handleNavigation() {
        if (!isRecording) return;
        
        const url = window.location.href;
        console.log(`[DOM Tracker] Page changed to: ${url}`);
        
        // Reset state counter for new page
        stateCounter = 0;
        lastDomHash = null;
        
        // Create a new state for the new page
        setTimeout(() => {
            const { state, isNewState } = createDomState();
            lastDomHash = state.hash;
            
            sendToBackground('recordState', {
                state: state,
                isNavigation: true
            });
            
            console.log(`[DOM Tracker] Created new state after navigation: ${state.stateId}`);
        }, 500); // Short delay to allow page to settle
    }
}

// Start recording
function startRecording(newSessionId, newUserId) {
    if (isRecording) return;
    
    sessionId = newSessionId;
    userId = newUserId;
    stateCounter = 0;
    previousStates = {};
    lastDomHash = null;
    
    // Set up DOM tracking
    setupMutationObserver();
    setupNavigationTracking();
    
    // Create initial state
    const { state, isNewState } = createDomState();
    lastDomHash = state.hash;
    
    // Send initial state
    sendToBackground('recordState', {
        state: state,
        isInitial: true
    });
    
    console.log(`[DOM Tracker] Started recording with session ${sessionId}`);
    console.log(`[DOM Tracker] Initial state created: ${state.stateId}`);
    
    isRecording = true;
}

// Stop recording
function stopRecording() {
    if (!isRecording) return;
    
    // Stop the mutation observer
    if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
    }
    
    isRecording = false;
    console.log(`[DOM Tracker] Stopped recording session ${sessionId}`);
}

// Initialize when the content script loads
function initialize() {
    console.log('[DOM Tracker] Content script initializing...');
    
    // Check if we should already be recording
    chrome.runtime.sendMessage({ action: 'getStatus' }, response => {
        console.log('[DOM Tracker] Got status from background:', response);
        
        if (response && response.recordingStatus === 'recording') {
            console.log('[DOM Tracker] Auto-starting recording based on existing session');
            startRecording(response.currentSessionId, response.userId);
        }
    });
    
    // Create initial state when page is fully loaded
    window.addEventListener('load', () => {
        console.log('[DOM Tracker] Page fully loaded');
        if (isRecording) {
            // Capture initial page state
            const { state, isNewState } = createDomState();
            lastDomHash = state.hash;
            
            // Send initial state
            sendToBackground('recordState', {
                state: state,
                isInitial: true
            });
            
            console.log(`[DOM Tracker] Page load state created: ${state.stateId}`);
        }
    });
}

// Start the content script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    // Page already loaded
    initialize();
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[DOM Tracker] Received message from background:', message);
    
    try {
        if (message.action === 'startRecording') {
            startRecording(message.sessionId, message.userId);
            sendResponse({ success: true });
            return true;
        } 
        
        if (message.action === 'stopRecording') {
            stopRecording();
            sendResponse({ success: true });
            return true;
        } 
        
        if (message.action === 'getStatus') {
            sendResponse({
                isRecording,
                sessionId,
                currentStateId
            });
            return true;
        }
        
        // Default response
        sendResponse({ success: false, error: 'Unknown action' });
    } catch (error) {
        console.error('[DOM Tracker] Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }
    
    return true;
}); 