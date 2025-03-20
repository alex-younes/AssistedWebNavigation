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

// Global click tracking to prevent duplicates at all levels
const clickRegistry = {
    lastClickTime: 0,
    lastClickInfo: null,
    clickCount: 0,
    
    // Register a click and determine if it's a duplicate
    registerClick: function(target, x, y) {
        const now = Date.now();
        const clickInfo = {
            tagName: target.tagName,
            id: target.id || '',
            className: target.className || '',
            text: target.textContent?.trim()?.slice(0, 20) || '',
            x: x,
            y: y,
            time: now
        };
        
        // Strict time-based check - if ANY click happened within 800ms, consider it a duplicate
        if (now - this.lastClickTime < 800) {
            console.log('[DOM Tracker] Global click throttling - clicks too close together', 
                       now - this.lastClickTime, 'ms');
            this.clickCount++;
            return true;
        }
        
        // Content-based check - same element clicked within 2 seconds
        if (this.lastClickInfo && 
            now - this.lastClickInfo.time < 2000 &&
            this.lastClickInfo.tagName === clickInfo.tagName &&
            this.lastClickInfo.id === clickInfo.id &&
            this.lastClickInfo.className === clickInfo.className) {
            
            console.log('[DOM Tracker] Global duplicate click detected on same element');
            this.clickCount++;
            return true;
        }
        
        // This is a new unique click
        this.lastClickTime = now;
        this.lastClickInfo = clickInfo;
        this.clickCount = 0;
        console.log('[DOM Tracker] Registered new click:', clickInfo.tagName, 
                   clickInfo.id ? `#${clickInfo.id}` : '', 
                   clickInfo.className ? `.${clickInfo.className}` : '');
        return false;
    }
};

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

// Calculate a better hash of the DOM
function calculateDomHash() {
    try {
        // Get a simplified version of the DOM structure
        // Focus on important elements and their attributes
        const domStructure = getSimplifiedDom();
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < domStructure.length; i++) {
            const char = domStructure.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        
        return 'state_' + Math.abs(hash).toString(36);
    } catch (error) {
        console.error('[DOM Tracker] Error calculating DOM hash:', error);
        return 'state_' + Date.now().toString(36);
    }
}

// Get a simplified representation of the DOM
function getSimplifiedDom() {
    // Focus on structure and visible content, not styling or scripts
    const simplifiedDom = [];
    
    // Prioritize these important elements
    const importantElements = Array.from(document.querySelectorAll(
        'body, div, header, footer, nav, main, section, article, ' +
        'form, input, select, textarea, button, a, h1, h2, h3'
    ));
    
    // For each important element, capture key attributes
    importantElements.forEach(el => {
        try {
            const tagInfo = el.tagName.toLowerCase();
            const idInfo = el.id ? `#${el.id}` : '';
            const textInfo = el.textContent ? el.textContent.trim().substring(0, 20) : '';
            
            // Special handling for form elements
            let specialAttrs = '';
            if (el.tagName === 'INPUT') {
                specialAttrs = `[type=${el.type || 'text'}]`;
                if (el.name) specialAttrs += `[name=${el.name}]`;
                // Don't include values for privacy
            } else if (el.tagName === 'A' && el.href) {
                specialAttrs = `[href]`;
            }
            
            simplifiedDom.push(`${tagInfo}${idInfo}${specialAttrs}:${textInfo}`);
        } catch (e) {
            // Skip this element on error
        }
    });
    
    return simplifiedDom.join('|');
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
        console.log(`[DOM Tracker] Creating new state: ${stateId} with hash ${hash}`);
    } else {
        // Existing state - use the ID we already have
        stateId = previousStates[hash];
        console.log(`[DOM Tracker] Using existing state: ${stateId} with hash ${hash}`);
    }
    
    // Collect meaningful metrics about the DOM
    const domSize = document.documentElement.outerHTML.length;
    const elementCount = document.querySelectorAll('*').length;
    const formElements = document.querySelectorAll('input, select, textarea').length;
    const visibleElements = document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]').length;
    
    const state = {
        stateId,
        sessionId,
        userId,
        url,
        timestamp: new Date().toISOString(),
        isNewState,
        metrics: {
            domSize,
            elementCount,
            formElements,
            visibleElements
        },
        fingerprint: hash,
        title: document.title
    };
    
    currentStateId = stateId;
    return { state, isNewState };
}

// Record interaction and check for DOM state change
function recordInteraction(interaction) {
    if (!isRecording) return;
    
    // Validate the interaction data
    if (!interaction.type) {
        console.warn('[DOM Tracker] Invalid interaction: missing type');
        return;
    }
    
    // For click events, make sure we have target info
    if (interaction.type === 'click' && (!interaction.targetElement || 
        Object.keys(interaction.targetElement).length === 0)) {
        console.warn('[DOM Tracker] Skipping click with empty target element');
        return;
    }
    
    // Queue the interaction with required fields
    interactionQueue.push({
        ...interaction,
        sessionId,
        userId,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        stateId: currentStateId
    });
    
    console.log(`[DOM Tracker] Recorded ${interaction.type} interaction`, 
                interaction.targetElement?.tagName || '');
    
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
        const significantChange = {
            detected: false,
            reason: ''
        };
        
        mutationBuffer.forEach(mutation => {
            if (mutation.type === 'childList') {
                summary.addedNodes += mutation.addedNodes.length;
                summary.removedNodes += mutation.removedNodes.length;
                
                // Track the parent element that had children added/removed
                modifiedElements.add(mutation.target);
                
                // Check if significant elements were added
                Array.from(mutation.addedNodes).forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const tagName = node.tagName?.toLowerCase();
                        if (['div', 'form', 'input', 'button', 'select', 'textarea', 'a', 'iframe'].includes(tagName)) {
                            significantChange.detected = true;
                            significantChange.reason = `Added ${tagName} element`;
                            modifiedElements.add(node);
                        }
                    }
                });
            } else if (mutation.type === 'attributes') {
                summary.attributesChanged++;
                
                // Track elements with changed attributes
                modifiedElements.add(mutation.target);
                
                // Check if important attributes changed
                const attrName = mutation.attributeName?.toLowerCase();
                if (['class', 'style', 'value', 'checked', 'selected', 'disabled'].includes(attrName)) {
                    const tagName = mutation.target.tagName?.toLowerCase();
                    
                    // Changes to form controls or interactive elements are significant
                    if (['input', 'select', 'textarea', 'button', 'a'].includes(tagName)) {
                        significantChange.detected = true;
                        significantChange.reason = `Changed ${attrName} on ${tagName}`;
                    }
                }
            } else if (mutation.type === 'characterData') {
                summary.characterDataChanged++;
                
                // Text changes in these elements are significant
                if (mutation.target.parentElement) {
                    const parentTag = mutation.target.parentElement.tagName?.toLowerCase();
                    modifiedElements.add(mutation.target.parentElement);
                    
                    if (['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'label'].includes(parentTag)) {
                        // Only consider it significant if the text change is substantial
                        const newText = mutation.target.textContent;
                        if (newText && newText.length > 10) {
                            significantChange.detected = true;
                            significantChange.reason = `Changed text in ${parentTag}`;
                        }
                    }
                }
            }
        });
        
        // Clear mutation buffer
        mutationBuffer = [];
        
        // Log summary of mutations
        console.log(`[DOM Tracker] Mutation summary: added=${summary.addedNodes}, removed=${summary.removedNodes}, attrs=${summary.attributesChanged}, text=${summary.characterDataChanged}`);
        console.log(`[DOM Tracker] ${modifiedElements.size} elements were modified. Significant change: ${significantChange.detected}`);
        
        // Check if DOM state has changed
        const currentHash = calculateDomHash();
        if (currentHash !== lastDomHash) {
            console.log(`[DOM Tracker] DOM hash changed: ${lastDomHash} -> ${currentHash}`);
            
            // Only create a new state if it's a significant change or we don't have a hash yet
            if (significantChange.detected || !lastDomHash) {
                const { state, isNewState } = createDomState();
                lastDomHash = currentHash;
                
                // Record mutation as an interaction that created a new state
                recordInteraction({
                    type: 'dom_mutation',
                    details: {
                        summary,
                        reason: significantChange.reason,
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
                
                console.log(`[DOM Tracker] DOM mutation led to new state: ${state.stateId} (new: ${isNewState}, reason: ${significantChange.reason})`);
            } else {
                console.log('[DOM Tracker] DOM changed but not significantly enough to create a new state');
            }
        } else {
            console.log('[DOM Tracker] DOM mutations did not result in a hash change');
        }
    } catch (error) {
        console.error('[DOM Tracker] Error processing mutations:', error);
    }
}

// Track user interactions with event listeners
function setupInteractionTracking() {
    // Keep track of recent events to prevent duplicates
    const recentEvents = new Map();
    
    // Handle clicks - main interaction type
    document.addEventListener('click', event => {
        if (!isRecording) return;
        
        const target = event.target;
        
        // Use global click registry for better deduplication
        if (clickRegistry.registerClick(target, event.clientX, event.clientY)) {
            console.log('[DOM Tracker] Skipping duplicate click event');
            return;
        }
        
        console.log('[DOM Tracker] Recording click on:', target.tagName, 
                    target.id ? `#${target.id}` : '',
                    target.className ? `.${target.className}` : '');
        
        // Create a descriptive target element object
        const targetElement = {
            tagName: target.tagName?.toLowerCase() || 'unknown',
            id: target.id || '',
            className: target.className || '',
            text: target.textContent?.trim()?.slice(0, 50) || '',
            xpath: getXPath(target) || ''
        };
        
        // Add some context for anchor links
        if (target.tagName === 'A' && target.href) {
            targetElement.href = target.href;
        }
        
        // Add info about parent element for better context
        if (target.parentElement) {
            targetElement.parentInfo = {
                tagName: target.parentElement.tagName?.toLowerCase() || '',
                id: target.parentElement.id || '',
                className: target.parentElement.className || ''
            };
        }
        
        // Record the interaction
        recordInteraction({
            type: 'click',
            targetElement,
            details: {
                x: event.clientX,
                y: event.clientY
            }
        });
    }, true);
    
    // Track form inputs with debouncing to avoid too many events
    let inputDebounceTimers = {};
    
    // Handle form inputs with debouncing
    document.addEventListener('input', event => {
        if (!isRecording) return;
        
        const target = event.target;
        if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
        
        // Clear existing timer for this element
        const inputId = `${target.tagName}_${target.id || target.name || Math.random()}`;
        if (inputDebounceTimers[inputId]) {
            clearTimeout(inputDebounceTimers[inputId]);
        }
        
        // Set a new timer
        inputDebounceTimers[inputId] = setTimeout(() => {
            // Create rich targetElement info
            const targetElement = {
                tagName: target.tagName?.toLowerCase(),
                id: target.id || '',
                name: target.name || '',
                type: target.type || 'text',
                form: target.form ? {
                    id: target.form.id || '',
                    action: target.form.action || '',
                    method: target.form.method || ''
                } : null,
                // Safely handle different input types
                value: getInputValue(target)
            };
            
            recordInteraction({
                type: 'input',
                targetElement,
                details: {
                    fieldType: target.type || 'text'
                }
            });
            
            console.log(`[DOM Tracker] Recorded input for ${targetElement.tagName}${targetElement.id ? `#${targetElement.id}` : ''}`);
        }, 800); // Debounce time - only record after user stops typing for a bit
    }, true);
    
    // Get input value but respect privacy
    function getInputValue(input) {
        if (!input) return '';
        
        // Mask sensitive data
        if (input.type === 'password') {
            return '********';
        }
        
        // Mask credit card numbers 
        if (input.type === 'text' && 
            (input.name?.includes('card') || input.id?.includes('card') || 
             input.name?.includes('credit') || input.id?.includes('credit'))) {
            return '****-****-****-****';
        }
        
        // Handle checkbox/radio
        if (input.type === 'checkbox' || input.type === 'radio') {
            return input.checked ? 'checked' : 'unchecked';
        }
        
        // Handle select
        if (input.tagName === 'SELECT') {
            return input.options[input.selectedIndex]?.text || input.value || '';
        }
        
        // For other fields, truncate the value
        return (input.value || '').slice(0, 30);
    }
    
    // Handle form submissions better
    document.addEventListener('submit', event => {
        if (!isRecording) return;
        
        const form = event.target;
        
        // Gather form fields without sensitive data
        const formFields = [];
        const elements = form.elements;
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            
            // Skip buttons and fieldsets
            if (element.tagName === 'BUTTON' || element.tagName === 'FIELDSET') continue;
            
            // Only include fields with names
            if (element.name) {
                formFields.push({
                    name: element.name,
                    type: element.type || 'text',
                    filled: element.value ? true : false,
                    // Don't include actual values for privacy
                });
            }
        }
        
        recordInteraction({
            type: 'submit',
            targetElement: {
                tagName: 'form',
                id: form.id || '',
                action: form.action || '',
                method: form.method || 'get'
            },
            details: {
                fields: formFields,
                fieldCount: formFields.length
            }
        });
        
        console.log(`[DOM Tracker] Recorded form submission: ${form.id || 'unnamed form'} with ${formFields.length} fields`);
    }, true);
    
    // Handle select changes better
    document.addEventListener('change', event => {
        if (!isRecording) return;
        
        const target = event.target;
        
        // Handle select element changes
        if (target.tagName === 'SELECT') {
            const option = target.options[target.selectedIndex];
            
            recordInteraction({
                type: 'change',
                targetElement: {
                    tagName: 'select',
                    id: target.id || '',
                    name: target.name || '',
                    value: target.value || '',
                    text: option ? option.text : '',
                    index: target.selectedIndex
                }
            });
            
            console.log(`[DOM Tracker] Recorded select change: ${target.name || target.id || 'unnamed'} -> ${option ? option.text : ''}`);
        }
        // Handle checkbox/radio changes
        else if (target.tagName === 'INPUT' && (target.type === 'checkbox' || target.type === 'radio')) {
            recordInteraction({
                type: 'change',
                targetElement: {
                    tagName: target.tagName?.toLowerCase(),
                    id: target.id || '',
                    name: target.name || '',
                    type: target.type,
                    checked: target.checked
                }
            });
            
            console.log(`[DOM Tracker] Recorded ${target.type} change: ${target.name || target.id || 'unnamed'} -> ${target.checked ? 'checked' : 'unchecked'}`);
        }
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
        
        // Track page navigations
        setupNavigationTracking();
        
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

// Track page navigation events
function setupNavigationTracking() {
    if (typeof window.navigation !== 'undefined' && window.navigation.addEventListener) {
        // Modern browsers with Navigation API
        console.log('[DOM Tracker] Setting up Navigation API tracking');
        
        // Listen for navigate events (modern browsers)
        window.navigation.addEventListener('navigate', (event) => {
            if (!isRecording) return;
            
            console.log('[DOM Tracker] Navigation event detected:', event.type);
            
            const fromUrl = document.location.href;
            const fromTitle = document.title;
            const toUrl = event.destination.url;
            
            recordNavigation(fromUrl, fromTitle, toUrl, '');
        });
    } else {
        // Fallback for browsers without Navigation API
        console.log('[DOM Tracker] Using fallback navigation tracking');
        
        // Handle URL changes manually
        const handleUrlChange = () => {
            if (!isRecording) return;
            
            const url = window.location.href;
            const title = document.title;
            
            // Store the current URL in sessionStorage
            const previousUrl = sessionStorage.getItem('lastUrl');
            const previousTitle = sessionStorage.getItem('lastTitle');
            
            if (previousUrl && previousUrl !== url) {
                console.log('[DOM Tracker] URL change detected:', previousUrl, '->', url);
                recordNavigation(previousUrl, previousTitle || '', url, title);
            }
            
            // Update stored values
            sessionStorage.setItem('lastUrl', url);
            sessionStorage.setItem('lastTitle', title);
        };
        
        // Listen for popstate events (back/forward navigation)
        window.addEventListener('popstate', () => {
            console.log('[DOM Tracker] Popstate event detected');
            handleUrlChange();
        });
        
        // Use MutationObserver to detect when title changes (often happens during navigation)
        const titleObserver = new MutationObserver(() => {
            if (document.title !== sessionStorage.getItem('lastTitle')) {
                console.log('[DOM Tracker] Title change detected:', document.title);
                handleUrlChange();
            }
        });
        
        // Start observing title changes once DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            titleObserver.observe(document.querySelector('title'), { 
                subtree: true, 
                characterData: true, 
                childList: true 
            });
            
            // Initial URL capture
            handleUrlChange();
        });
        
        // Check after full load too
        window.addEventListener('load', handleUrlChange);
        
        // Intercept anchor clicks to track before navigation happens
        document.addEventListener('click', (event) => {
            const link = event.target.closest('a');
            if (!link || !link.href || link.target === '_blank') return;
            
            // Only handle links that will navigate the page
            if (link.href.startsWith('http') || link.href.startsWith('/')) {
                const fromUrl = window.location.href;
                const fromTitle = document.title;
                const toUrl = link.href;
                const toTitle = link.getAttribute('title') || '';
                
                // Store where we're navigating to
                sessionStorage.setItem('navigationTarget', toUrl);
                sessionStorage.setItem('navigationFromUrl', fromUrl);
                sessionStorage.setItem('navigationFromTitle', fromTitle);
            }
        }, true);
    }
}

// Record a navigation event
function recordNavigation(fromUrl, fromTitle, toUrl, toTitle) {
    console.log('[DOM Tracker] Recording navigation:', fromUrl, '->', toUrl);
    
    // Send this as a special interaction type
    recordInteraction({
        type: 'navigation',
        url: toUrl,
        details: {
            from: fromUrl,
            to: toUrl,
            fromTitle: fromTitle,
            toTitle: toTitle || ''
        }
    });
    
    // Tell background script explicitly about navigation
    sendToBackground('recordNavigation', {
        from: fromUrl,
        to: toUrl,
        fromTitle,
        toTitle: toTitle || ''
    });
    
    // Capture state after navigation once page stabilizes
    setTimeout(() => {
        if (isRecording) {
            captureAndSendPageState('navigation');
        }
    }, 1000);
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