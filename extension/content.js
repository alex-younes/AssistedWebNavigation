// Streamlined DOM State Tracker - Content Script
// Tracks user interactions, DOM mutations, and state changes

// Core state variables
let isRecording = false;
let sessionId = null;
let userId = null;
let currentStateId = null;
let stateCounter = 0;
let port = null;
let lastDomHash = null;
let interactionQueue = [];
let lastMutationTime = 0;
let mutationBuffer = [];
let mutationObserver = null;
let previousStates = {}; // StateHash -> StateId mapping

// Connect to background script
function connectToBackground() {
    try {
        if (port) {
            try {
                // Try to disconnect old port cleanly
                console.log('[DOM Tracker] Cleaning up old port connection');
                port.disconnect();
            } catch (e) {
                // Ignore any errors
            }
        }

        console.log('[DOM Tracker] Connecting to background script...');
        port = chrome.runtime.connect({ name: "recording-port" });
        
        port.onMessage.addListener((message) => {
            console.log('[DOM Tracker] Received message via port:', message);
            
            if (message.action === 'startRecording') {
                startRecording(message.sessionId, message.userId);
            } else if (message.action === 'stopRecording') {
                stopRecording();
            }
        });
        
        port.onDisconnect.addListener(() => {
            console.log('[DOM Tracker] Port disconnected from background');
            port = null;
            
            // Try to reconnect if we were recording
            if (isRecording) {
                console.log('[DOM Tracker] We were recording, trying to reconnect...');
                setTimeout(connectToBackground, 1000);
            }
        });
        
        // Send a test message to verify connection is working
        port.postMessage({ action: 'connectionTest', status: 'connected' });
        console.log('[DOM Tracker] Successfully connected to background via port');
        
        return true;
    } catch (error) {
        console.error('[DOM Tracker] Error connecting to background via port:', error);
        port = null;
        return false;
    }
}

// Send a message to the background script
function sendToBackground(action, data) {
    console.log(`[DOM Tracker] Sending to background: ${action}`);
    
    if (!port) {
        console.log('[DOM Tracker] No port connection, trying to reconnect...');
        const connected = connectToBackground();
        
        if (!connected) {
            console.log('[DOM Tracker] Could not establish port connection, using fallback');
            // Fallback to non-port messaging
            return sendMessageFallback(action, data);
        }
    }
    
    try {
        port.postMessage({ action, ...data });
        return true;
    } catch (error) {
        console.error('[DOM Tracker] Error sending via port:', error);
        port = null; // Reset port on error
        
        // Try fallback messaging
        return sendMessageFallback(action, data);
    }
}

// Fallback messaging when port isn't available
function sendMessageFallback(action, data) {
    console.log(`[DOM Tracker] Using fallback messaging for ${action}`);
    
    try {
        chrome.runtime.sendMessage({ action, ...data }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[DOM Tracker] Fallback message error:', chrome.runtime.lastError);
                return false;
            }
            
            console.log('[DOM Tracker] Fallback message sent successfully:', response);
            return true;
        });
    } catch (error) {
        console.error('[DOM Tracker] Fallback messaging failed:', error);
        return false;
    }
}

// Calculate a simple hash of the DOM
function calculateDomHash() {
    const dom = document.documentElement.outerHTML;
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < dom.length; i++) {
        const char = dom.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    
    return 'state_' + Math.abs(hash).toString(36);
}

// Create a DOM state snapshot
function createDomState() {
    const url = window.location.href;
    const hash = calculateDomHash();
    
    // Check if this is a new state or one we've seen before
    const isNewState = !previousStates[hash];
    let stateId;
    
    if (isNewState) {
        // New state - generate a new ID
        stateId = `state_${sessionId}_${stateCounter++}`;
        previousStates[hash] = stateId;
    } else {
        // Existing state - use the ID we already have
        stateId = previousStates[hash];
    }
    
    const domSize = document.documentElement.outerHTML.length;
    const elementCount = document.querySelectorAll('*').length;
    
    const state = {
        stateId,
        sessionId,
        userId,
        url,
        timestamp: new Date().toISOString(),
        isNewState,
        domSize,
        elementCount,
        fingerprint: hash
    };
    
    currentStateId = stateId;
    return { state, isNewState };
}

// Record interaction and check for DOM state change
function recordInteraction(interaction) {
    if (!isRecording) return;
    
    // Queue the interaction
    interactionQueue.push({
        ...interaction,
        sessionId,
        userId,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        stateId: currentStateId
    });
    
    // Flush immediately if it's a significant interaction
    if (['click', 'submit', 'change'].includes(interaction.type)) {
        flushInteractionQueue(true);
    } else {
        // Otherwise flush on a delay
        setTimeout(() => flushInteractionQueue(false), 500);
    }
}

// Send queued interactions to background
function flushInteractionQueue(checkState = true) {
    if (!isRecording || interactionQueue.length === 0) return;
    
    // Copy and clear the queue
    const interactions = [...interactionQueue];
    interactionQueue = [];
    
    // Check for DOM state change
    if (checkState) {
        const currentHash = calculateDomHash();
        
        if (currentHash !== lastDomHash) {
            const { state, isNewState } = createDomState();
            lastDomHash = currentHash;
            
            // Send state first, then interactions
            sendToBackground('recordInteraction', {
                interaction: {
                    type: 'dom_state',
                    stateData: state,
                    isNewState
                }
            });
            
            console.log(`[DOM Tracker] Recorded new DOM state: ${state.stateId} (new: ${isNewState})`);
        }
    }
    
    // Send each interaction
    interactions.forEach(interaction => {
        sendToBackground('recordInteraction', { interaction });
    });
    
    console.log(`[DOM Tracker] Sent ${interactions.length} interactions to background`);
}

// Set up DOM mutation observer
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
    
    // Create a observer instance
    mutationObserver = new MutationObserver(mutations => {
        if (!isRecording) return;
        
        const now = Date.now();
        mutationBuffer.push(...mutations);
        
        // Debounce rapid mutations (wait until mutations stop for a short time)
        if (now - lastMutationTime > 300) {
            processMutations();
        } else {
            // Reset any existing timeout
            clearTimeout(window._mutationTimeout);
            window._mutationTimeout = setTimeout(processMutations, 300);
        }
        
        lastMutationTime = now;
    });
    
    // Start observing the entire document
    mutationObserver.observe(document.documentElement, config);
    
    return mutationObserver;
}

// Process buffered mutations
function processMutations() {
    if (!isRecording || mutationBuffer.length === 0) return;
    
    console.log(`[DOM Tracker] Processing ${mutationBuffer.length} DOM mutations`);
    
    try {
        // Record a summary of the mutations
        const summary = {
            totalCount: mutationBuffer.length,
            addedNodes: 0,
            removedNodes: 0,
            attributesChanged: 0,
            characterDataChanged: 0
        };
        
        // Track which elements were modified for more accurate state change detection
        const modifiedElements = new Set();
        
        mutationBuffer.forEach(mutation => {
            if (mutation.type === 'childList') {
                summary.addedNodes += mutation.addedNodes.length;
                summary.removedNodes += mutation.removedNodes.length;
                
                // Track the parent element that had children added/removed
                modifiedElements.add(mutation.target);
                
                // If significant elements like divs, forms, inputs were added
                Array.from(mutation.addedNodes).forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const tagName = node.tagName?.toLowerCase();
                        if (['div', 'form', 'input', 'button', 'select', 'textarea', 'a'].includes(tagName)) {
                            modifiedElements.add(node);
                        }
                    }
                });
            } else if (mutation.type === 'attributes') {
                summary.attributesChanged++;
                
                // Track elements with changed attributes
                modifiedElements.add(mutation.target);
                
                // If important attributes changed (class, style, value, checked)
                const attrName = mutation.attributeName?.toLowerCase();
                if (['class', 'style', 'value', 'checked', 'selected', 'disabled'].includes(attrName)) {
                    // These are more likely to represent visual/functional changes
                    modifiedElements.add(mutation.target);
                }
            } else if (mutation.type === 'characterData') {
                summary.characterDataChanged++;
                
                // Track elements with changed text
                if (mutation.target.parentElement) {
                    modifiedElements.add(mutation.target.parentElement);
                }
            }
        });
        
        // Clear mutation buffer
        mutationBuffer = [];
        
        // Log summary of mutations
        console.log(`[DOM Tracker] Mutation summary: added=${summary.addedNodes}, removed=${summary.removedNodes}, attrs=${summary.attributesChanged}, text=${summary.characterDataChanged}`);
        console.log(`[DOM Tracker] ${modifiedElements.size} elements were modified`);
        
        // Check if DOM state has changed
        const currentHash = calculateDomHash();
        if (currentHash !== lastDomHash) {
            console.log(`[DOM Tracker] DOM hash changed: ${lastDomHash} -> ${currentHash}`);
            
            const { state, isNewState } = createDomState();
            lastDomHash = currentHash;
            
            // Record mutation as an interaction that created a new state
            recordInteraction({
                type: 'dom_mutation',
                details: {
                    summary,
                    modifiedElementsCount: modifiedElements.size,
                    resultingStateId: state.stateId
                }
            });
            
            // Also send the state itself
            sendToBackground('recordInteraction', {
                interaction: {
                    type: 'dom_state',
                    stateData: state,
                    isNewState
                }
            });
            
            console.log(`[DOM Tracker] DOM mutation led to new state: ${state.stateId} (new: ${isNewState})`);
        } else {
            console.log('[DOM Tracker] DOM mutations did not result in a state change');
        }
        
        // After sending the state data and interaction
        console.log(`[DOM Tracker] DOM change processing complete. Current State ID: ${currentStateId}`);
    } catch (error) {
        console.error('[DOM Tracker] Error processing mutations:', error);
    }
}

// Track user interactions with event listeners
function setupInteractionTracking() {
    // Handle clicks - main interaction type
    document.addEventListener('click', event => {
        if (!isRecording) return;
        
        const target = event.target;
        recordInteraction({
            type: 'click',
            targetElement: {
                tagName: target.tagName?.toLowerCase() || 'unknown',
                id: target.id || '',
                className: target.className || '',
                text: target.textContent?.slice(0, 50) || '',
                xpath: getXPath(target) || ''
            },
            details: {
                x: event.clientX,
                y: event.clientY
            }
        });
    }, true);
    
    // Handle form inputs
    document.addEventListener('input', event => {
        if (!isRecording) return;
        
        const target = event.target;
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
        
        recordInteraction({
            type: 'input',
            targetElement: {
                tagName: target.tagName?.toLowerCase(),
                id: target.id || '',
                name: target.name || '',
                type: target.type || 'text',
                value: target.type === 'password' ? '*****' : (target.value || '').slice(0, 30)
            }
        });
    }, true);
    
    // Handle form submissions
    document.addEventListener('submit', event => {
        if (!isRecording) return;
        
        const form = event.target;
        recordInteraction({
            type: 'submit',
            targetElement: {
                tagName: 'form',
                id: form.id || '',
                action: form.action || '',
                method: form.method || 'get'
            }
        });
    }, true);
    
    // Handle select changes
    document.addEventListener('change', event => {
        if (!isRecording) return;
        
        const target = event.target;
        if (target.tagName !== 'SELECT') return;
        
        recordInteraction({
            type: 'change',
            targetElement: {
                tagName: 'select',
                id: target.id || '',
                name: target.name || '',
                value: target.value || ''
            }
        });
    }, true);
    
    console.log('[DOM Tracker] Interaction tracking set up');
}

// Get XPath of an element (for better element identification)
function getXPath(element) {
    if (!element) return '';
    
    try {
        // If element has ID, use that for simplicity
        if (element.id) {
            return `//*[@id="${element.id}"]`;
        }
        
        // Otherwise, build XPath
        const paths = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let index = 0;
            let sibling = element.previousSibling;
            
            while (sibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === element.tagName) {
                    index++;
                }
                sibling = sibling.previousSibling;
            }
            
            const tagName = element.tagName.toLowerCase();
            const pathIndex = (index ? `[${index + 1}]` : '');
            paths.unshift(tagName + pathIndex);
            
            element = element.parentNode;
        }
        
        return '/' + paths.join('/');
    } catch (e) {
        return '';
    }
}

// Start recording
function startRecording(newSessionId, newUserId) {
    sessionId = newSessionId;
    userId = newUserId;
    stateCounter = 0;
    previousStates = {};
    lastDomHash = null;
    interactionQueue = [];
    mutationBuffer = [];
    
    // Set up all the tracking
    setupMutationObserver();
    setupInteractionTracking();
    
    // Create initial state
    const { state, isNewState } = createDomState();
    lastDomHash = state.fingerprint;
    
    // Send initial state
    sendToBackground('recordInteraction', {
        interaction: {
            type: 'dom_state',
            stateData: state,
            isNewState: true // First state is always new
        }
    });
    
    // Record page load as first interaction
    recordInteraction({
        type: 'page_load',
        targetElement: {
            tagName: 'document',
            url: window.location.href,
            title: document.title
        }
    });
    
    isRecording = true;
    console.log(`[DOM Tracker] Started recording session ${sessionId}`);
}

// Stop recording
function stopRecording() {
    if (!isRecording) return;
    
    // Flush any queued interactions
    flushInteractionQueue(true);
    
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
    
    try {
        // Connect to background script
        const connected = connectToBackground();
        
        if (!connected) {
            console.warn('[DOM Tracker] Failed to connect to background script, retrying in 1s...');
            setTimeout(initialize, 1000);
            return;
        }
        
        // Handle clicks on important elements even before recording starts
        // This helps us detect when users interact with the page
        document.addEventListener('click', event => {
            console.log('[DOM Tracker] Click detected on:', event.target.tagName, 
                        event.target.id ? `#${event.target.id}` : '',
                        event.target.className ? `.${event.target.className}` : '');
            
            // No need to record if not recording
            if (!isRecording) return;
        }, true);
        
        // Check if we should already be recording by querying background script
        chrome.runtime.sendMessage({ action: 'getStatus' }, response => {
            console.log('[DOM Tracker] Got status from background:', response);
            
            if (response && response.recordingStatus === 'recording') {
                console.log('[DOM Tracker] Auto-starting recording based on existing session:', response.currentSessionId);
                startRecording(response.currentSessionId, response.userId);
            } else {
                console.log('[DOM Tracker] Not currently recording');
            }
        });
        
        // Also set up a page load event to create an initial state if recording starts later
        document.addEventListener('DOMContentLoaded', () => {
            console.log('[DOM Tracker] Page DOMContentLoaded event');
            
            // If we're already recording, capture the initial state
            if (isRecording) {
                captureAndSendPageState('domContentLoaded');
            }
        });
        
        // Set up load event as well for completely loaded page
        window.addEventListener('load', () => {
            console.log('[DOM Tracker] Page fully loaded');
            
            // If we're recording, capture the fully loaded state
            if (isRecording) {
                captureAndSendPageState('pageFullyLoaded');
            }
        });
        
        console.log('[DOM Tracker] Content script fully initialized');
    } catch (error) {
        console.error('[DOM Tracker] Error during initialization:', error);
    }
}

// Helper function to capture and send the current page state
function captureAndSendPageState(trigger) {
    try {
        // Create a state for the current page state
        const { state, isNewState } = createDomState();
        
        if (!lastDomHash || state.fingerprint !== lastDomHash) {
            lastDomHash = state.fingerprint;
            
            // Send the state
            sendToBackground('recordInteraction', {
                interaction: {
                    type: 'dom_state',
                    stateData: state,
                    isNewState: true // Treat page load states as new
                }
            });
            
            console.log(`[DOM Tracker] Created ${trigger} state: ${state.stateId}`);
            
            // Also record this as an interaction
            recordInteraction({
                type: 'page_state',
                trigger,
                targetElement: {
                    tagName: 'document',
                    url: window.location.href,
                    title: document.title
                }
            });
        }
    } catch (error) {
        console.error(`[DOM Tracker] Error capturing page state (${trigger}):`, error);
    }
}

// Start the content script when the document is ready
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
        if (message.action === 'ping') {
            // Just respond to confirm content script is loaded
            sendResponse({ pong: true, url: window.location.href });
            return true;
        }
        
        if (message.action === 'startRecording') {
            startRecording(message.sessionId, message.userId);
            sendResponse({ success: true, message: 'Recording started' });
            return true;
        } 
        
        if (message.action === 'stopRecording') {
            stopRecording();
            sendResponse({ success: true, message: 'Recording stopped' });
            return true;
        } 
        
        if (message.action === 'getStatus') {
            sendResponse({
                isRecording,
                sessionId,
                currentStateId,
                interactionCount: interactionQueue.length,
                url: window.location.href
            });
            return true;
        }
        
        // If we get here, we didn't handle the message
        sendResponse({ success: false, error: 'Unknown action' });
    } catch (error) {
        console.error('[DOM Tracker] Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }
    
    return true; // Required for async sendResponse
}); 