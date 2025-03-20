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
let processingMutations = false; // Debounce flag
let lastMutationTime = 0; // Track time of last mutation processing

// Send a message to the background script
function sendToBackground(action, data) {
    console.log(`[DOM Tracker] Sending to background: ${action}`);
    
    // Simple message passing
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action, ...data }, response => {
            if (chrome.runtime.lastError) {
                console.error('[DOM Tracker] Error sending message:', chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
                return;
            }
            
            console.log(`[DOM Tracker] Response from ${action}:`, response);
            resolve(response);
        });
    });
}

// Calculate hash of the DOM - Improved version with better precision
function calculateDomHash() {
    try {
        // Get the URL path
        const urlObj = new URL(window.location.href);
        const pagePath = urlObj.pathname;
        
        // Create a structural representation of the DOM with key elements
        const domFingerprint = generateDOMFingerprint();
        
        // Combine path and fingerprint for the hash input
        const hashInput = pagePath + '_' + domFingerprint;
        
        // Create hash from the combined input
        let hash = 0;
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

// Generate a detailed fingerprint of the DOM's structure and content
function generateDOMFingerprint() {
    const fingerprint = [];
    
    // Capture important structural elements
    const mainElements = document.querySelectorAll('main, section, article, form, .main-content');
    Array.from(mainElements).forEach(element => {
        const elementInfo = getElementInfo(element);
        fingerprint.push(elementInfo);
    });
    
    // Capture interactive elements (buttons, links, form elements)
    const interactiveElements = document.querySelectorAll('button, a, input, select, textarea');
    const interactiveInfo = Array.from(interactiveElements).map(el => {
        const type = el.tagName.toLowerCase();
        const id = el.id || '';
        const name = el.name || '';
        const classes = Array.from(el.classList).join(' ');
        const isVisible = isElementVisible(el);
        
        // For form fields, include whether they have values
        let hasValue = false;
        if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
            hasValue = !!el.value;
        }
        
        return `${type}#${id}.${classes}:${isVisible}:${hasValue}`;
    }).join('|');
    fingerprint.push(`interactive:${interactiveInfo}`);
    
    // Capture key text content from headings
    const headings = document.querySelectorAll('h1, h2, h3');
    const headingTexts = Array.from(headings).map(h => {
        return `${h.tagName.toLowerCase()}:${h.textContent.trim().substring(0, 20)}`;
    }).join('|');
    fingerprint.push(`headings:${headingTexts}`);
    
    // Add visible content sections (paragraphs, lists)
    const contentElements = document.querySelectorAll('p, ul, ol, table');
    const contentInfo = Array.from(contentElements).slice(0, 10).map(el => {
        const type = el.tagName.toLowerCase();
        // For content elements, include a content hash based on text length and first chars
        const contentText = el.textContent.trim();
        const contentHash = contentText.length + ':' + contentText.substring(0, 10).replace(/\s+/g, '');
        return `${type}:${contentHash}`;
    }).join('|');
    fingerprint.push(`content:${contentInfo}`);
    
    // Include details about CSS variables and styles that affect layout
    const computedStyle = window.getComputedStyle(document.body);
    const layoutInfo = {
        width: computedStyle.width,
        height: computedStyle.height,
        display: computedStyle.display,
        position: computedStyle.position
    };
    fingerprint.push(`layout:${JSON.stringify(layoutInfo)}`);
    
    // Count elements by type for additional structure info
    const elementCounts = {
        divs: document.querySelectorAll('div').length,
        spans: document.querySelectorAll('span').length,
        images: document.querySelectorAll('img').length,
        lists: document.querySelectorAll('ul, ol').length,
        tables: document.querySelectorAll('table').length
    };
    fingerprint.push(`counts:${JSON.stringify(elementCounts)}`);
    
    // Combine all fingerprint components
    return fingerprint.join('~');
}

// Get detailed info about a specific element
function getElementInfo(element) {
    if (!element) return '';
    
    const tagName = element.tagName.toLowerCase();
    const id = element.id || '';
    const classes = Array.from(element.classList).join('.');
    const childrenCount = element.children.length;
    
    // Get first-level children info
    const childrenInfo = Array.from(element.children).slice(0, 5).map(child => {
        return child.tagName.toLowerCase() + (child.id ? `#${child.id}` : '');
    }).join(',');
    
    // Create a signature that represents this element and its structure
    return `${tagName}#${id}.${classes}[${childrenCount}]{${childrenInfo}}`;
}

// Check if an element is visible in the viewport
function isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' && 
           element.offsetWidth > 0 && 
           element.offsetHeight > 0;
}

// Create a DOM state snapshot
function createDomState() {
    const url = window.location.href;
    const hash = calculateDomHash();
    
    // Default to new state, but background script will determine if it's really new based on hash
    const isNewState = true; 
    
    // Create a simple state ID - background script will replace with proper sequential ID or reuse existing
    const stateId = 'state_temp';
    console.log(`[DOM Tracker] Creating state with hash: ${hash}`);
    
    const state = createStateObject(stateId, url, hash, isNewState);
    currentStateId = stateId; // This will be replaced by background script's ID
    
    return { state, isNewState };
}

// Create a state object with all necessary properties
function createStateObject(stateId, url, hash, isNewState) {
    // Collect meaningful metrics about the DOM
    const domSize = document.documentElement.outerHTML.length;
    const elementCount = document.querySelectorAll('*').length;
    const formElements = document.querySelectorAll('input, select, textarea').length;
    const visibleElements = document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]').length;
    
    // State number will be assigned by background script
    const stateNumber = 0; 
    
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

// Process mutations and create a new state with debouncing
function processMutations(mutations) {
    if (!isRecording) return;
    
    const now = Date.now();
    
    // Skip if we're already processing mutations or if it's too soon
    if (processingMutations || (now - lastMutationTime < 500)) {
        console.log('[DOM Tracker] Skipping mutation processing - debounced');
        return;
    }
    
    // Set debounce flags
    processingMutations = true;
    lastMutationTime = now;
    
    // Use setTimeout to process after a short delay, allowing batching of multiple mutations
    setTimeout(() => {
        try {
            console.log(`[DOM Tracker] Processing mutations after debounce`);
            
            // Calculate current hash
            const currentHash = calculateDomHash();
            
            console.log(`[DOM Tracker] Current hash: ${currentHash}, Last hash: ${lastDomHash}`);
            
            // Only create a new state if the hash is different AND we haven't seen it before
            if (currentHash !== lastDomHash) {
                console.log(`[DOM Tracker] DOM hash changed: ${lastDomHash} -> ${currentHash}`);
                
                // Check if we've already seen this hash in this session
                if (previousStates[currentHash]) {
                    console.log(`[DOM Tracker] DOM returned to previously seen state with hash: ${currentHash}, stateId: ${previousStates[currentHash]}`);
                    lastDomHash = currentHash;
                    processingMutations = false;
                    return;
                }
                
                const { state, isNewState } = createDomState();
                state.hash = currentHash; // Ensure hash is consistent
                
                // Send the state to background script
                sendToBackground('recordState', {
                    state: state
                })
                .then(response => {
                    console.log(`[DOM Tracker] Background response for recordState:`, response);
                    
                    if (response && response.isDuplicate) {
                        console.log(`[DOM Tracker] *** DUPLICATE DETECTED BY BACKGROUND *** Hash ${currentHash} already exists as ${response.stateId}`);
                        previousStates[currentHash] = response.stateId;
                    } 
                    else if (response && response.stateId) {
                        // Update our map with the real stateId from the server
                        previousStates[currentHash] = response.stateId;
                        currentStateId = response.stateId;
                        console.log(`[DOM Tracker] Added to previousStates: ${currentHash} -> ${response.stateId}`);
                    } else {
                        console.warn('[DOM Tracker] Did not receive valid stateId from background script');
                    }
                    
                    // Always update lastDomHash to the current hash
                    lastDomHash = currentHash;
                })
                .catch(error => {
                    console.error('[DOM Tracker] Error getting stateId from background:', error);
                });
                
                console.log(`[DOM Tracker] Created new state due to DOM change with hash: ${currentHash}`);
            } else {
                console.log('[DOM Tracker] DOM changed but hash remains the same');
                }
            } catch (error) {
            console.error('[DOM Tracker] Error processing mutations:', error);
        } finally {
            // Clear debounce flag
            processingMutations = false;
        }
    }, 300); // Short delay to allow multiple mutations to batch
}

// Set up reload detection
function setupReloadDetection() {
    // Add a session storage flag to detect reloads
    if (sessionStorage.getItem('pageLoadCount')) {
        // If pageLoadCount exists, this is a reload or back/forward navigation
        const count = parseInt(sessionStorage.getItem('pageLoadCount') || '0');
        sessionStorage.setItem('pageLoadCount', (count + 1).toString());
        sessionStorage.setItem('isReload', 'true');
        console.log('[DOM Tracker] Page reload detected (load count: ' + (count + 1) + ')');
            } else {
        // First time loading this page
        sessionStorage.setItem('pageLoadCount', '1');
        sessionStorage.setItem('isReload', 'false');
        console.log('[DOM Tracker] First page load detected');
    }
    
    // Clear reload flag on unload to help detect back/forward navigation
    window.addEventListener('beforeunload', () => {
        sessionStorage.setItem('lastPageUrl', window.location.href);
    });
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
}

// Handle navigation events
function handleNavigation() {
    if (!isRecording) return;
    
    const url = window.location.href;
    console.log(`[DOM Tracker] Page changed to: ${url}`);
    
    // Reset hash for this new page load
    lastDomHash = null;
    
    // Create a new state for the new page
    setTimeout(() => {
        try {
            // Calculate hash once and reuse it
            const currentHash = calculateDomHash();
            console.log(`[DOM Tracker] Navigation state hash: ${currentHash}`);
            
            const { state, isNewState } = createDomState();
            state.hash = currentHash; // Ensure hash is consistent
            state.isNavigation = true; // Mark this as a navigation event
            
            // This is critical - send the isNavigation flag at the top level of the message
            sendToBackground('recordState', {
                state: state,
                isNavigation: true
            })
            .then(response => {
                console.log(`[DOM Tracker] Background response for navigation state:`, response);
                
                if (response && response.stateId) {
                    // Update our map with the real stateId from the server
                    previousStates[currentHash] = response.stateId;
                    currentStateId = response.stateId;
                    console.log(`[DOM Tracker] Added navigation state to previousStates: ${currentHash} -> ${response.stateId}`);
                    
                    // Always update lastDomHash to the current hash
                    lastDomHash = currentHash;
                    } else {
                    console.warn('[DOM Tracker] Did not receive valid stateId from background script for navigation');
                }
            })
            .catch(error => {
                console.error('[DOM Tracker] Error getting stateId for navigation state:', error);
            });
            
            console.log(`[DOM Tracker] Created state after navigation with hash: ${currentHash}`);
        } catch (error) {
            console.error('[DOM Tracker] Error handling navigation state:', error);
        }
    }, 500); // Short delay to allow page to settle
}

// Start recording
function startRecording(newSessionId, newUserId) {
    if (isRecording) return;
    
    sessionId = newSessionId;
    userId = newUserId;
    
    // Reset state tracking
    previousStates = {};
    lastDomHash = null;
    
    // Set up DOM tracking
    setupMutationObserver();
    setupNavigationTracking();
    
    // Create initial state
    const currentHash = calculateDomHash();
    const { state, isNewState } = createDomState();
    state.hash = currentHash; // Ensure consistent hash
    
    // Send initial state and get the real stateId back
    sendToBackground('recordState', {
        state: state,
        isInitial: true
    })
    .then(response => {
        console.log(`[DOM Tracker] Background response for initial state:`, response);
        
        if (response && response.isDuplicate) {
            console.log(`[DOM Tracker] *** DUPLICATE INITIAL STATE DETECTED *** Hash ${currentHash} already exists as ${response.stateId}`);
            previousStates[currentHash] = response.stateId;
        }
        else if (response && response.stateId) {
            // Update our map with the real stateId from the server
            previousStates[currentHash] = response.stateId;
            currentStateId = response.stateId;
            console.log(`[DOM Tracker] Updated initial state tracking with server-assigned ID: ${response.stateId}`);
                        } else {
            console.warn('[DOM Tracker] Did not receive valid stateId from background script');
        }
        
        // Always update lastDomHash to the current hash
        lastDomHash = currentHash;
    })
    .catch(error => {
        console.error('[DOM Tracker] Error capturing initial state ID:', error);
    });
    
    console.log(`[DOM Tracker] Started recording with session ${sessionId}`);
    console.log(`[DOM Tracker] Initial state created with hash: ${currentHash}`);
    
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
    
    // Set up reload detection
    setupReloadDetection();
    
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
            // Calculate hash once and reuse it
            const currentHash = calculateDomHash();
            console.log(`[DOM Tracker] Page load state hash: ${currentHash}`);
            
            // Check if this is a reload
            const isReload = sessionStorage.getItem('isReload') === 'true';
            
            // Capture initial page state
            const { state, isNewState } = createDomState();
            state.hash = currentHash; // Ensure hash is consistent
            
            // Mark the state based on the load type
            if (isReload) {
                state.isReload = true;
                console.log('[DOM Tracker] Setting isReload flag for state');
            } else {
                state.isInitial = true;
                console.log('[DOM Tracker] Setting isInitial flag for state');
            }
            
            // IMPORTANT: Pass the flags at the top level of the message
            sendToBackground('recordState', {
                state: state,
                isInitial: !isReload,
                isReload: isReload
            })
            .then(response => {
                console.log(`[DOM Tracker] Background response for page load state:`, response);
                
                if (response && response.stateId) {
                    // Update our map with the real stateId from the server
                    previousStates[currentHash] = response.stateId;
                    currentStateId = response.stateId;
                    console.log(`[DOM Tracker] Updated page load state tracking with server-assigned ID: ${response.stateId}`);
                    
                    // Always update lastDomHash to the current hash
                    lastDomHash = currentHash;
                    
                    // Reset the reload flag now that we've handled it
                    if (isReload) {
                        sessionStorage.setItem('isReload', 'false');
                    }
                }
            })
            .catch(error => {
                console.error('[DOM Tracker] Error getting stateId for page load state:', error);
            });
            
            const loadType = isReload ? "RELOAD" : "INITIAL LOAD";
            console.log(`[DOM Tracker] Page ${loadType} state created with hash: ${currentHash}`);
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