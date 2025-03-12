// This file handles interaction recording in the active tab
// It will capture DOM events and send them to the backend

let isRecording = false;
let sessionId = null;
let userId = null;
let interactionCount = 0;
let previousUrl = null;
let lastNavigationTime = 0; // Add this to track last navigation

// Add debugging variables at the top
let DEBUG = true;
let lastStateCheck = Date.now();

// Add after the initial variable declarations
let port = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

// Add at the top after initial declarations
let isInitialized = false;

// Add persistent logging at the top after DEBUG declaration
function persistentLog(message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        message,
        data,
        url: window.location.href,
        recordingState: {
            isRecording,
            sessionId,
            userId,
            interactionCount
        }
    };

    // Get existing logs
    let logs = [];
    try {
        const storedLogs = localStorage.getItem('extensionDebugLogs');
        if (storedLogs) {
            logs = JSON.parse(storedLogs);
        }
    } catch (e) {
        console.error('Error reading logs:', e);
    }

    // Add new log
    logs.push(logEntry);
    
    // Keep only last 100 logs
    if (logs.length > 100) {
        logs = logs.slice(-100);
    }

    // Save logs
    localStorage.setItem('extensionDebugLogs', JSON.stringify(logs));
}

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

// Add state tracking
function logState() {
    if (!DEBUG) return;
    debugLog('Current State:', {
        isRecording,
        sessionId,
        userId,
        interactionCount,
        hasInteractionHandler: !!window._interactionHandler,
        timeElapsedSinceLastCheck: Date.now() - lastStateCheck
    });
    lastStateCheck = Date.now();
}

// Helper to prevent duplicate navigation events
const shouldRecordNavigation = () => {
    const now = Date.now();
    if (now - lastNavigationTime < 1000) { // Prevent multiple events within 1 second
        return false;
    }
    lastNavigationTime = now;
    return true;
};

// Store recording state in sessionStorage to persist across page reloads
function saveRecordingState() {
    if (!isRecording || !sessionId) return;

    persistentLog('Saving recording state');
    debugLog('Saving recording state');
    const state = {
        isRecording,
        sessionId,
        userId,
        timestamp: Date.now(),
        url: window.location.href
    };

    try {
        localStorage.setItem('recordingState', JSON.stringify(state));
        sessionStorage.setItem('recordingState', JSON.stringify(state));
        debugLog('State saved successfully', state);
    } catch (error) {
        debugLog('Error saving state:', error);
    }
    logState();
}

// Restore recording state after page reload
function restoreRecordingState() {
    try {
        // Try to get state from either storage
        const state = JSON.parse(sessionStorage.getItem('recordingState')) || 
                     JSON.parse(localStorage.getItem('recordingState'));

        if (state && state.sessionId) {
            console.log('[DEBUG] Restoring recording state:', state);
            isRecording = true;
            sessionId = state.sessionId;
            userId = state.userId;

            // Re-initialize recording handlers
            setupInteractionRecording();
            saveRecordingState(); // Update timestamp
        }
    } catch (error) {
        console.log('[DEBUG] Error restoring recording state:', error);
    }
}

// Add initialization function
function initializeContentScript() {
    if (isInitialized) return;
    
    persistentLog('Initializing content script');
    
    // Set up all the event listeners
    window.addEventListener('load', handlePageLoad);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    // Mark as initialized
    isInitialized = true;
    persistentLog('Content script initialized');
}

// Initialize immediately
initializeContentScript();

// Extract event handlers into named functions
function handlePageLoad() {
    persistentLog('Page loaded');
    restoreRecordingState();
    
    const isReload = window.performance && 
                    window.performance.navigation && 
                    window.performance.navigation.type === 1;
    
    if (isRecording && sessionId && shouldRecordNavigation()) {
        chrome.runtime.sendMessage({
            action: "tabNavigated", 
            previousUrl: previousUrl,
            isReload: isReload,
            currentUrl: window.location.href
        });
    }
    
    previousUrl = window.location.href;
}

function handleBeforeUnload() {
    if (isRecording) {
        saveRecordingState();
    }
}

function handleVisibilityChange() {
    persistentLog('Visibility changed', {
        isHidden: document.hidden,
        visibilityState: document.visibilityState
    });
    logState();
}

function handleFocus() {
    persistentLog('Tab gained focus');
    logState();
}

function handleBlur() {
    persistentLog('Tab lost focus');
    logState();
}

// Add connection management
function connectToBackground() {
    try {
        port = chrome.runtime.connect({ name: 'recording-port' });
        
        port.onDisconnect.addListener(() => {
            persistentLog('Port disconnected', { reconnectAttempts });
            
            if (chrome.runtime.lastError) {
                persistentLog('Disconnection error', chrome.runtime.lastError);
            }
            
            port = null;
            
            // Try to reconnect if we're still recording
            if (isRecording && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts++;
                setTimeout(connectToBackground, 1000);
            }
        });
        
        // Reset reconnect attempts on successful connection
        reconnectAttempts = 0;
        
        persistentLog('Connected to background script');
    } catch (error) {
        persistentLog('Connection error', error);
    }
}

// Modify the interaction sending logic
function sendInteraction(interaction) {
    if (!isRecording || !sessionId) {
        persistentLog('Not sending interaction - recording inactive');
        return;
    }
    
    try {
        if (port) {
            port.postMessage({
                action: 'saveInteraction',
                interaction: interaction
            });
        } else {
            // Fallback to one-time message if port is not available
            chrome.runtime.sendMessage({
                action: 'saveInteraction',
                interaction: interaction
            });
        }
        interactionCount++;
        persistentLog('Interaction sent', { type: interaction.type });
    } catch (error) {
        persistentLog('Error sending interaction', error);
    }
}

// Modify setupInteractionRecording to use the new sendInteraction
function setupInteractionRecording() {
    if (window._interactionHandler) return;
    
    // Connect to background script when starting recording
    if (!port) {
        connectToBackground();
    }
    
    window._interactionHandler = function(event) {
        if (!isRecording) {
            persistentLog('Event ignored - not recording');
            return;
        }
        
        if (!sessionId || !window._recordingUserId) {
            console.error('[Extension] Missing sessionId or userId:', { sessionId, userId: window._recordingUserId });
            return;
        }
        
        console.log(`[Extension] Capturing ${event.type} event`);
        
        try {
            const now = new Date();
            const timestamp = now.toISOString();
            
            // Create basic interaction data
            const interaction = {
                sessionId: sessionId,
                userId: window._recordingUserId,
                type: event.type,
                timestamp: timestamp,
                url: window.location.href,
                pageTitle: document.title
            };
            
            // Add event-specific data
            if (event.type === 'click') {
                const target = event.target;
                
                interaction.details = {
                    elementType: target.tagName.toLowerCase(),
                    elementClass: target.className,
                    elementId: target.id,
                    elementText: target.textContent?.trim().substring(0, 100) || '',
                    xpath: getXPath(target),
                    selector: getCssSelector(target),
                    position: {
                        x: event.clientX,
                        y: event.clientY
                    }
                };
                
                // Add attributes
                if (target.attributes && target.attributes.length > 0) {
                    interaction.details.attributes = {};
                    for (let i = 0; i < target.attributes.length; i++) {
                        const attr = target.attributes[i];
                        interaction.details.attributes[attr.name] = attr.value;
                    }
                }
            } else if (event.type === 'submit') {
                const form = event.target;
                
                interaction.details = {
                    elementType: 'form',
                    elementId: form.id,
                    elementClass: form.className,
                    action: form.action,
                    method: form.method,
                    xpath: getXPath(form),
                    selector: getCssSelector(form)
                };
                
                // Get form data (excluding passwords)
                const formData = {};
                for (const element of form.elements) {
                    if (element.name && element.type !== 'password') {
                        formData[element.name] = element.type === 'checkbox' ? element.checked : element.value;
                    }
                }
                interaction.details.formData = formData;
            }
            
            console.log('[Extension] Sending interaction to background script:', interaction);
            
            // Use the new sendInteraction function
            sendInteraction(interaction);
        } catch (error) {
            console.error('[Extension] Error recording interaction:', error);
        }
    };
    
    // Add event listeners with capture to catch events before they bubble
    document.addEventListener('click', window._interactionHandler, true);
    document.addEventListener('submit', window._interactionHandler, true);
    
    // Additional events we want to track
    document.addEventListener('keyup', function(e) {
        // Only track key interactions on input elements
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            // For privacy, we don't log the actual keys pressed, just that a key was pressed
            const input = e.target;
            const now = new Date();
            
            if (!window._lastInputEvent || (now - window._lastInputEvent > 1000)) {
                window._lastInputEvent = now;
                
                if (isRecording) {
                    const interaction = {
                        sessionId: sessionId,
                        type: 'input',
                        timestamp: now.toISOString(),
                        url: window.location.href,
                        pageTitle: document.title,
                        details: {
                            elementType: input.tagName.toLowerCase(),
                            elementId: input.id,
                            elementClass: input.className,
                            inputType: input.type || 'text',
                            isPassword: input.type === 'password',
                            xpath: getXPath(input),
                            selector: getCssSelector(input)
                        }
                    };
                    
                    sendInteraction(interaction);
                    
                    interactionCount++;
                    console.log(`[Extension] Recorded input interaction`, interaction);
                }
            }
        }
    }, true);
    
    // Add scroll event (throttled)
    let lastScrollTime = 0;
    window.addEventListener('scroll', function() {
        const now = Date.now();
        if (isRecording && now - lastScrollTime > 500) { // Limit to every 500ms
            lastScrollTime = now;
            
            const interaction = {
                sessionId: sessionId,
                type: 'scroll',
                timestamp: new Date().toISOString(),
                url: window.location.href,
                pageTitle: document.title,
                details: {
                    scrollX: window.scrollX,
                    scrollY: window.scrollY,
                    scrollTop: document.documentElement.scrollTop,
                    scrollHeight: document.documentElement.scrollHeight,
                    viewportHeight: window.innerHeight
                }
            };
            
            sendInteraction(interaction);
            
            interactionCount++;
            console.log(`[Extension] Recorded scroll interaction`, interaction);
        }
    }, { passive: true });
    
    console.log('[Extension] Interaction recording handlers set up');
    
    // Record initial page load
    recordPageInfo();
}

// Helper function to get XPath of an element
function getXPath(element) {
    if (!element) return '';
    if (element.id) return `//*[@id="${element.id}"]`;
    
    let path = '';
    while (element && element.nodeType === 1) {
        let index = 1;
        let sibling = element.previousSibling;
        while (sibling) {
            if (sibling.nodeType === 1 && sibling.tagName === element.tagName) {
                index++;
            }
            sibling = sibling.previousSibling;
        }
        path = `/${element.tagName.toLowerCase()}[${index}]${path}`;
        element = element.parentNode;
    }
    return path;
}

// Helper function to get CSS selector of an element
function getCssSelector(element) {
    if (!element) return '';
    if (element.id) return `#${element.id}`;
    
    const selectors = [];
    while (element && element.nodeType === 1) {
        let selector = element.tagName.toLowerCase();
        if (element.id) {
            selector += `#${element.id}`;
            selectors.unshift(selector);
            break;
        } else {
            if (element.className) {
                const classes = element.className.split(' ').filter(c => c.length > 0);
                if (classes.length > 0) {
                    selector += `.${classes.join('.')}`;
                }
            }
            
            let index = 1;
            let sibling = element.previousElementSibling;
            while (sibling) {
                if (sibling.tagName === element.tagName) index++;
                sibling = sibling.previousElementSibling;
            }
            
            if (index > 1) {
                selector += `:nth-of-type(${index})`;
            }
            
            selectors.unshift(selector);
            element = element.parentNode;
        }
    }
    
    return selectors.join(' > ');
}

// Record page info on initial load
function recordPageInfo() {
    if (!isRecording) return;
    
    const pageLoadInteraction = {
        sessionId: sessionId,
        type: 'pageLoad',
        timestamp: new Date().toISOString(),
        url: window.location.href,
        pageTitle: document.title,
        details: {
            userAgent: navigator.userAgent,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            referrer: document.referrer,
            pageElements: {
                links: document.getElementsByTagName('a').length,
                buttons: document.getElementsByTagName('button').length,
                forms: document.getElementsByTagName('form').length,
                images: document.getElementsByTagName('img').length
            }
        }
    };
    
    // Send the interaction to the background script
    sendInteraction(pageLoadInteraction);
    
    interactionCount++;
    console.log('[Extension] Recorded page load interaction', pageLoadInteraction);
}

// Add message handler for ping
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
        sendResponse({ success: true });
        return;
    }
    
    // Make sure we're initialized
    if (!isInitialized) {
        initializeContentScript();
    }
    
    if (request.action === 'startRecording') {
        persistentLog('Received startRecording message');
        
        if (!request.sessionId || !request.userId) {
            persistentLog('Missing sessionId or userId');
            sendResponse({ success: false, error: 'Missing sessionId or userId' });
            return;
        }
        
        try {
            sessionId = request.sessionId;
            userId = request.userId;
            window._recordingUserId = request.userId;
            isRecording = true;
            
            setupInteractionRecording();
            saveRecordingState();
            
            persistentLog('Recording started successfully');
            sendResponse({ success: true });
            
            if (request.isPageReload) {
                recordPageInfo();
            }
        } catch (error) {
            persistentLog('Error starting recording', error);
            sendResponse({ success: false, error: error.message });
        }
    } else if (request.action === 'stopRecording') {
        console.log('[DEBUG] Content script received stopRecording message');
        isRecording = false;
        sessionId = null;
        userId = null;
        if (window._interactionHandler) {
            document.removeEventListener('click', window._interactionHandler, true);
            document.removeEventListener('submit', window._interactionHandler, true);
            delete window._interactionHandler;
            delete window._recordingUserId;
        }
        // Clear saved state
        sessionStorage.removeItem('recordingState');
        console.log('[Extension] Stopped recording');
        console.log('[DEBUG] Stopped recording and cleared event handlers');
        sendResponse({ success: true });
    }
    
    if (request.action === 'captureDom') {
        const domContent = {
            html: document.documentElement.outerHTML,
            title: document.title
        };
        sendResponse({ success: true, domContent });
    }
    
    return true; // Keep the message channel open for async response
});

// Initialize previousUrl
previousUrl = window.location.href;

console.log('[Extension] Content script loaded');

// Add visibility change detection
document.addEventListener('visibilitychange', function() {
    persistentLog('Visibility changed', {
        isHidden: document.hidden,
        visibilityState: document.visibilityState
    });
    debugLog('Visibility changed:', {
        isHidden: document.hidden,
        visibilityState: document.visibilityState
    });
    logState();
});

// Track tab focus
window.addEventListener('focus', function() {
    persistentLog('Tab gained focus');
    debugLog('Tab gained focus');
    logState();
});

window.addEventListener('blur', function() {
    persistentLog('Tab lost focus');
    debugLog('Tab lost focus');
    logState();
});

// Add helper function to view logs
window.viewExtensionLogs = function() {
    try {
        const logs = localStorage.getItem('extensionDebugLogs');
        if (logs) {
            console.log('Extension Debug Logs:', JSON.parse(logs));
            return JSON.parse(logs);
        }
        return 'No logs found';
    } catch (e) {
        console.error('Error reading logs:', e);
        return 'Error reading logs';
    }
};

// Add helper to clear logs
window.clearExtensionLogs = function() {
    localStorage.removeItem('extensionDebugLogs');
    console.log('Extension debug logs cleared');
};

// Add periodic connection check
setInterval(() => {
    if (isRecording && !port) {
        persistentLog('Periodic connection check - attempting reconnect');
        connectToBackground();
    }
}, 30000); // Check every 30 seconds

// Add state tracking
function logState() {
    if (!DEBUG) return;
    debugLog('Current State:', {
        isRecording,
        sessionId,
        userId,
        interactionCount,
        hasInteractionHandler: !!window._interactionHandler,
        timeElapsedSinceLastCheck: Date.now() - lastStateCheck
    });
    lastStateCheck = Date.now();
} 