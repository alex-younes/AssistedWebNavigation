// This file handles interaction recording in the active tab
// It will capture DOM events and send them to the backend

let isRecording = false;
let sessionId = null;
let userId = null;
let interactionCount = 0;
let previousUrl = null;
let lastNavigationTime = 0; // Add this to track last navigation

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
const saveRecordingState = () => {
    if (sessionId && userId) {
        sessionStorage.setItem('recordingState', JSON.stringify({
            isRecording,
            sessionId,
            userId,
            previousUrl: window.location.href,
            lastNavigationTime
        }));
    }
};

// Restore recording state after page reload
const restoreRecordingState = () => {
    const state = sessionStorage.getItem('recordingState');
    if (state) {
        const { isRecording: wasRecording, sessionId: savedSessionId, userId: savedUserId, previousUrl: savedUrl, lastNavigationTime: savedNavTime } = JSON.parse(state);
        if (wasRecording && savedSessionId && savedUserId) {
            console.log('[Extension] Restoring recording state after reload');
            isRecording = true;
            sessionId = savedSessionId;
            userId = savedUserId;
            previousUrl = savedUrl;
            lastNavigationTime = savedNavTime || 0;
            window._recordingUserId = savedUserId;
            setupInteractionRecording();
            
            // Only send navigation event if enough time has passed
            if (shouldRecordNavigation()) {
                chrome.runtime.sendMessage({
                    action: "tabNavigated",
                    previousUrl: savedUrl,
                    isReload: true,
                    currentUrl: window.location.href
                });
            }
        }
    }
};

// Store page load information for tracking navigation
window.addEventListener('load', function() {
    restoreRecordingState();
    
    const isReload = window.performance && 
                    window.performance.navigation && 
                    window.performance.navigation.type === 1;
    
    // If we're recording, inform the background script of navigation
    if (isRecording && sessionId && shouldRecordNavigation()) {
        chrome.runtime.sendMessage({
            action: "tabNavigated", 
            previousUrl: previousUrl,
            isReload: isReload,
            currentUrl: window.location.href
        });
    }
    
    // Store current URL for next navigation event
    previousUrl = window.location.href;
    
    console.log('[Extension] Page loaded, isReload:', isReload, 'isRecording:', isRecording);
});

// Save state before unload
window.addEventListener('beforeunload', function() {
    if (isRecording) {
        saveRecordingState();
    }
});

// Store interaction handler to remove it when stopping recording
function setupInteractionRecording() {
    if (window._interactionHandler) return;

    window._interactionHandler = function(event) {
        if (!isRecording) {
            console.log('[Extension] Event ignored - not recording');
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
            
            // Send the interaction to the background script
            chrome.runtime.sendMessage({
                action: "saveInteraction",
                interaction: interaction
            }, response => {
                if (chrome.runtime.lastError) {
                    console.error('[Extension] Error sending interaction:', chrome.runtime.lastError);
                } else {
                    console.log('[Extension] Interaction sent successfully');
                }
            });
            
            interactionCount++;
            
            // Log the interaction
            console.log(`[Extension] Recorded interaction: ${interaction.type}`, interaction);
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
                    
                    chrome.runtime.sendMessage({
                        action: "saveInteraction",
                        interaction: interaction
                    });
                    
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
            
            chrome.runtime.sendMessage({
                action: "saveInteraction",
                interaction: interaction
            });
            
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
    chrome.runtime.sendMessage({
        action: "saveInteraction",
        interaction: pageLoadInteraction
    });
    
    interactionCount++;
    console.log('[Extension] Recorded page load interaction', pageLoadInteraction);
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[Extension] Content script received message:', request);
    
    if (request.action === 'startRecording') {
        if (!request.sessionId || !request.userId) {
            console.error('[Extension] Missing sessionId or userId in startRecording request');
            sendResponse({ success: false, error: 'Missing sessionId or userId' });
            return;
        }
        
        sessionId = request.sessionId;
        userId = request.userId;
        window._recordingUserId = request.userId;
        isRecording = true;
        setupInteractionRecording();
        
        // Save state immediately in case of reload
        saveRecordingState();
        
        console.log(`[Extension] Started recording for session ${sessionId}`);
        sendResponse({ success: true });
        
        // If this is a page reload, record it
        if (request.isPageReload) {
            recordPageInfo();
        }
    } else if (request.action === 'stopRecording') {
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