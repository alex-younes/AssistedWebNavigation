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
let pendingStateSends = {}; // Track pending state sends to prevent duplicates
let isPageLoading = false; // Track if page is in loading state
let loadingStartTime = 0; // When loading started
let loadingCheckInterval = null; // Interval for checking loading state
let lastDomSnapshot = ''; // Last DOM snapshot for comparison
let lastStateId = null; // Track the last state ID
let lastStateHash = null; // Track the last state hash
let stateSequenceNumber = 0; // Track the sequence of state captures
let pendingStateSaves = {}; // Track in-progress state saves

// Input history for repeated inputs tracking - NEW
let fieldInputHistory = {};
const MIN_PATTERN_LENGTH = 3;
const MAX_PATTERN_LENGTH = 10;
const INPUT_HISTORY_MAX_LEN = 50;

// =============== NON-TRANSITIONAL EVENT TRACKING ===============
// Variables for tracking non-transitional events
let nonTransitionalEvents = {
    hover: [],
    mousemove: {
        heatmap: [],
        totalDistance: 0,
        averageSpeed: 0
    },
    keyTyping: {
        fields: {}
    },
    inactivity: [],
    escapeBackspace: [],
    keyTypingCadence: [],
    tabNavigation: [],
    repeatedClicks: [],
    copyText: [],
    pasteWithoutTyping: [],
    repeatedInputs: [],
    // Removed formDwellTime, readingTime, and menuOpenCloseWithoutSelect as requested
    oscillatingHovers: [],
    keydownWithoutSubmit: [],
    inputFieldIdle: []
    // Removed: interactionWithHiddenElement, rapidContextSwitch, pauseBeforeSubmit
};

// Metrics tracking
let nonTransitionalMetrics = {
    totalIdleTime: 0,
    longestIdlePeriod: 0,
    dwellTimeBeforeAction: 0,
    totalMouseDistance: 0,
    totalKeystrokes: 0,
    totalClicks: 0,
    totalHoverTime: 0
    // Removed readingTime metric
};

// Throttling and batching variables
let lastNonTransitionalSendTime = 0;
let nonTransitionalBatchInterval = 2000; // Send every 2 seconds
let nonTransitionalSendTimer = null;

// Variables for tracking hover state
let currentHoverElement = null;
let hoverStartTime = null;
let lastMousePosition = { x: 0, y: 0 };
let lastMouseMoveTime = 0;
let idleStartTime = null;
let isIdle = false;
let idleThreshold = 2000; // 2 seconds of no movement = idle
let viewportHeight = window.innerHeight;
let viewportWidth = window.innerWidth;
let scrollPosition = { x: window.scrollX, y: window.scrollY };

// Variables for input field idle tracking
let currentFocusedInput = null;
let inputFocusTime = null;
let lastInputActivityTime = null;
let inputIdleThreshold = 3000; // 3 seconds of no typing = input field idle
let inputIdleTimer = null;

// --- Key Typing Cadence Tracking ---
let keyCadenceTimers = {};
let lastKeyTime = {};

// Generate heatmap grid - 10x10 grid of the viewport
function initializeHeatmap() {
    const heatmap = [];
    const gridSize = 10;
    for (let i = 0; i < gridSize; i++) {
        heatmap[i] = [];
        for (let j = 0; j < gridSize; j++) {
            heatmap[i][j] = 0;
        }
    }
    return heatmap;
}

// Convert absolute mouse position to heatmap grid position
function positionToHeatmapCoord(x, y) {
    const gridSize = 10;
    // Adjust for scroll position
    const adjustedX = x + scrollPosition.x;
    const adjustedY = y + scrollPosition.y;
    
    // Calculate grid position
    const gridX = Math.floor((adjustedX / document.documentElement.scrollWidth) * gridSize);
    const gridY = Math.floor((adjustedY / document.documentElement.scrollHeight) * gridSize);
    
    // Ensure values are within bounds
    return {
        x: Math.max(0, Math.min(gridX, 9)),
        y: Math.max(0, Math.min(gridY, 9))
    };
}

// Calculate distance between two points
function calculateDistance(p1, p2) {
    // Check for invalid inputs
    if (!p1 || !p2 || 
        typeof p1.x !== 'number' || typeof p1.y !== 'number' || 
        typeof p2.x !== 'number' || typeof p2.y !== 'number' ||
        isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) {
        return 0;
    }
    
    // Calculate Euclidean distance
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Ensure the result is a valid number
    return isNaN(distance) || !isFinite(distance) ? 0 : distance;
}

// Get element path for better identification
function getElementPath(element) {
    const selector = generateCssSelector(element);
    return selector;
}

// Function to get the label text for an input field
function getFieldLabel(element) {
    // Check if field has an explicit label using for/id
    if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label && label.textContent.trim()) {
            return label.textContent.trim();
        }
    }
    
    // Check for parent label (when input is inside a label)
    let parent = element.parentElement;
    while (parent) {
        if (parent.tagName.toLowerCase() === 'label') {
            // Extract label text but exclude the text from the input itself
            const cloneNode = parent.cloneNode(true);
            const inputs = cloneNode.querySelectorAll('input, select, textarea');
            inputs.forEach(input => input.remove());
            const labelText = cloneNode.textContent.trim();
            if (labelText) {
                return labelText;
            }
            break;
        }
        parent = parent.parentElement;
    }
    
    // Check for aria-label or aria-labelledby
    if (element.getAttribute('aria-label')) {
        return element.getAttribute('aria-label');
    }
    
    if (element.getAttribute('aria-labelledby')) {
        const labelId = element.getAttribute('aria-labelledby');
        const labelElement = document.getElementById(labelId);
        if (labelElement && labelElement.textContent.trim()) {
            return labelElement.textContent.trim();
        }
    }
    
    // Check for preceding label or heading
    const previousSibling = element.previousElementSibling;
    if (previousSibling) {
        if (previousSibling.tagName.toLowerCase() === 'label' || 
            ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(previousSibling.tagName.toLowerCase())) {
            return previousSibling.textContent.trim();
        }
    }
    
    // Default to field name or placeholder as fallback
    return element.name || element.placeholder || '';
}

// Send non-transitional events to the backend
async function sendNonTransitionalEvents() {
    if (!isRecording || !lastStateId) return;
    
    // Clone the events and metrics to avoid race conditions
    // Use a shallow copy instead of JSON.stringify/parse which can cause type issues
    const events = {
        hover: [...nonTransitionalEvents.hover],
        mousemove: {
            heatmap: nonTransitionalEvents.mousemove.heatmap.map(row => [...row]),
            totalDistance: nonTransitionalEvents.mousemove.totalDistance,
            averageSpeed: nonTransitionalEvents.mousemove.averageSpeed
        },
        keyTyping: {
            fields: {...nonTransitionalEvents.keyTyping.fields}
        },
        inactivity: [...nonTransitionalEvents.inactivity],
        escapeBackspace: [...nonTransitionalEvents.escapeBackspace],
        keyTypingCadence: [...nonTransitionalEvents.keyTypingCadence],
        tabNavigation: [...nonTransitionalEvents.tabNavigation],
        repeatedClicks: [...nonTransitionalEvents.repeatedClicks],
        copyText: [...nonTransitionalEvents.copyText],
        pasteWithoutTyping: [...nonTransitionalEvents.pasteWithoutTyping],
        repeatedInputs: [...nonTransitionalEvents.repeatedInputs],
        inputFieldIdle: [...nonTransitionalEvents.inputFieldIdle]
    };
    
    const metrics = {...nonTransitionalMetrics};
    
    // Reset the events and metrics
    nonTransitionalEvents = {
        hover: [],
        mousemove: {
            heatmap: initializeHeatmap(),
            totalDistance: 0,
            averageSpeed: 0
        },
        keyTyping: {
            fields: {}
        },
        inactivity: [],
        escapeBackspace: [],
        keyTypingCadence: [],
        tabNavigation: [],
        repeatedClicks: [],
        copyText: [],
        pasteWithoutTyping: [],
        repeatedInputs: [],
        // Added the extra properties to match the initialization above
        oscillatingHovers: [],
        keydownWithoutSubmit: [],
        inputFieldIdle: []
        // Removed: interactionWithHiddenElement, rapidContextSwitch, pauseBeforeSubmit
    };
    
    // Only reset cumulative metrics that should be per-batch
    nonTransitionalMetrics.totalMouseDistance = 0;
    
    // If there are no events to send, don't bother
    if (events.hover.length === 0 && 
        Object.keys(events.keyTyping.fields).length === 0 &&
        events.inactivity.length === 0 &&
        events.escapeBackspace.length === 0 &&
        events.keyTypingCadence.length === 0 &&
        events.tabNavigation.length === 0 &&
        events.repeatedClicks.length === 0 &&
        events.copyText.length === 0 &&
        events.pasteWithoutTyping.length === 0 &&
        events.repeatedInputs.length === 0 &&
        events.inputFieldIdle.length === 0) {
        return;
    }
    
    try {
        console.log(`[DOM Tracker] Sending non-transitional events for state: ${lastStateId}`);
        
        // Use the background script to make the API call instead of direct call
        // This ensures we use the correct API base URL from the background script
        const result = await sendToBackground('saveNonTransitionalEvents', {
            stateId: lastStateId,
            sessionId: sessionId,
            userId: userId,
            events: events,
            metrics: metrics
        });
        
        console.log(`[DOM Tracker] Non-transitional events sent result:`, result);
    } catch (error) {
        console.error(`[DOM Tracker] Error sending non-transitional events:`, error);
    }
}

// Schedule a send of non-transitional events
function scheduleNonTransitionalSend() {
    if (nonTransitionalSendTimer) {
        clearTimeout(nonTransitionalSendTimer);
    }
    
    nonTransitionalSendTimer = setTimeout(() => {
        sendNonTransitionalEvents();
        lastNonTransitionalSendTime = Date.now();
    }, nonTransitionalBatchInterval);
}

// Setup hover detection
function setupHoverTracking() {
    // Track mouseover for hover
    document.addEventListener('mouseover', event => {
        if (!isRecording) return;
        
        // End previous hover if there is one
        if (currentHoverElement && hoverStartTime) {
            const hoverEndTime = Date.now();
            const duration = hoverEndTime - hoverStartTime;
            
            // Only record if hover was longer than 100ms to avoid tracking quick mouse movements
            if (duration > 100) {
                const elementInfo = getElementInfo(currentHoverElement);
                
                nonTransitionalEvents.hover.push({
                    element: currentHoverElement.tagName.toLowerCase(),
                    selector: elementInfo.selector,
                    duration: duration,
                    timestamp: new Date(hoverStartTime)
                });
                
                // Update total hover time
                nonTransitionalMetrics.totalHoverTime += duration;
                
                scheduleNonTransitionalSend();
            }
        }
        
        // Start new hover
        currentHoverElement = event.target;
        hoverStartTime = Date.now();
    });
    
    // Track mouseout to end hover
    document.addEventListener('mouseout', event => {
        if (!isRecording) return;
        
        if (currentHoverElement === event.target && hoverStartTime) {
            const hoverEndTime = Date.now();
            const duration = hoverEndTime - hoverStartTime;
            
            // Only record if hover was longer than 100ms
            if (duration > 100) {
                const elementInfo = getElementInfo(currentHoverElement);
                
                nonTransitionalEvents.hover.push({
                    element: currentHoverElement.tagName.toLowerCase(),
                    selector: elementInfo.selector,
                    duration: duration,
                    timestamp: new Date(hoverStartTime)
                });
                
                // Update total hover time
                nonTransitionalMetrics.totalHoverTime += duration;
                
                scheduleNonTransitionalSend();
            }
            
            // Reset hover tracking
            currentHoverElement = null;
            hoverStartTime = null;
        }
    });
}

// Setup mouse movement tracking
function setupMouseMoveTracking() {
    // Initialize heatmap
    nonTransitionalEvents.mousemove.heatmap = initializeHeatmap();
    
    // Ensure proper initialization of tracking variables
    lastMousePosition = { x: 0, y: 0 };
    lastMouseMoveTime = null;
    
    // Track mousemove events
    document.addEventListener('mousemove', event => {
        if (!isRecording) return;
        
        // Get current time and position
        const currentTime = Date.now();
        const mouseX = event.clientX;
        const mouseY = event.clientY;
        
        // Update scroll position
        scrollPosition = { x: window.scrollX, y: window.scrollY };
        
        // Exit idle state if we were idle
        if (isIdle) {
            const idleEndTime = currentTime;
            const idleDuration = idleEndTime - idleStartTime;
            
            // Record idle period if it was longer than the threshold
            if (idleDuration >= idleThreshold) { // idleThreshold is 2000ms (2 seconds)
                nonTransitionalEvents.inactivity.push({
                    duration: idleDuration,
                    timestamp: new Date(idleStartTime),
                    trigger: "mouse_idle_2s" // Added trigger
                });
                
                // Update idle metrics
                nonTransitionalMetrics.totalIdleTime += idleDuration;
                nonTransitionalMetrics.longestIdlePeriod = Math.max(nonTransitionalMetrics.longestIdlePeriod, idleDuration);
                
                scheduleNonTransitionalSend();
            }
            
            isIdle = false;
            idleStartTime = null;
        }
        
        // If this is the first movement or it's been a while since the last one
        if (!lastMouseMoveTime || currentTime - lastMouseMoveTime > 100) {
            // Record the position for the path
            const position = { x: mouseX, y: mouseY };
            
            // Don't calculate distance if this is the first point
            if (lastMousePosition.x !== 0 || lastMousePosition.y !== 0) {
                const distance = calculateDistance(
                    lastMousePosition,
                    position
                );
                
                // Ensure distance is a valid number
                if (!isNaN(distance) && isFinite(distance)) {
                    // Update metrics
                    nonTransitionalEvents.mousemove.totalDistance += distance;
                    nonTransitionalMetrics.totalMouseDistance += distance;
                }
            }
            
            // Update heatmap
            const heatmapCoord = positionToHeatmapCoord(mouseX, mouseY);
            if (nonTransitionalEvents.mousemove.heatmap[heatmapCoord.y]) {
                if (nonTransitionalEvents.mousemove.heatmap[heatmapCoord.y][heatmapCoord.x] !== undefined) {
                    nonTransitionalEvents.mousemove.heatmap[heatmapCoord.y][heatmapCoord.x]++;
                }
            }
            
            // Update last position and time
            lastMousePosition = position;
            lastMouseMoveTime = currentTime;
        }
        
        // Reset the idle detection timer
        if (idleDetectionInterval) {
            clearTimeout(idleDetectionInterval);
        }
        
        idleDetectionInterval = setTimeout(() => {
            if (!isIdle) {
                isIdle = true;
                idleStartTime = Date.now();
            }
        }, idleThreshold);
    });
    
    // Track window resize for viewport changes
    window.addEventListener('resize', () => {
        viewportHeight = window.innerHeight;
        viewportWidth = window.innerWidth;
    });
    
    // Track scroll events
    document.addEventListener('scroll', () => {
        if (!isRecording) return;
        
        // Update scroll position
        scrollPosition = { x: window.scrollX, y: window.scrollY };
    });
}

// Setup keyboard typing tracking
function setupKeyboardTracking() {
    // Track keydown events
    document.addEventListener('keydown', event => {
        if (!isRecording) return;
        
        const element = event.target;
        const key = event.key;
        const isInputField = element && (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea');
        const fieldId = isInputField ? (element.id || element.name || getElementPath(element)) : null;

        // Reset input idle timer when typing occurs
        if (isInputField && fieldId) {
            // Update the last activity time
            lastInputActivityTime = Date.now();
            
            // Clear any existing idle timer
            if (inputIdleTimer) {
                clearTimeout(inputIdleTimer);
            }
            
            // Set a new idle timer
            inputIdleTimer = setTimeout(() => {
                // Only record idle if we're still focused on the same element
                if (currentFocusedInput === element && lastInputActivityTime) {
                    const idleDuration = Date.now() - lastInputActivityTime;
                    if (idleDuration >= inputIdleThreshold) {
                        // Get enhanced field information
                        const fieldId = element.id || element.name || getElementPath(element);
                        const fieldLabel = getFieldLabel(element);
                        const fieldType = element.type || 'text';
                        const formId = element.form ? (element.form.id || element.form.name || getElementPath(element.form)) : 'standalone';
                        const formName = element.form ? element.form.getAttribute('name') || 'unnamed-form' : 'standalone';
                        
                        // Get current value to compare with initial
                        const currentValue = element.type === 'checkbox' || element.type === 'radio' 
                            ? element.checked 
                            : element.value;
                        const initialValue = element.dataset.initialValue || '';
                        const valueChanged = currentValue !== initialValue;
                        
                        nonTransitionalEvents.inputFieldIdle.push({
                            field: fieldId,
                            label: fieldLabel,
                            placeholder: element.placeholder || '',
                            fieldType: fieldType,
                            formId: formId,
                            formName: formName,
                            url: window.location.href,
                            page: document.title,
                            eventType: 'threshold_reached',
                            duration: idleDuration,
                            valueChanged: valueChanged,
                            initialValue: initialValue,
                            currentValue: currentValue,
                            timestamp: new Date(lastInputActivityTime)
                        });
                        
                        scheduleNonTransitionalSend();
                        console.log(`[DOM Tracker] Input field idle threshold reached for ${fieldId}: ${idleDuration}ms`);
                    }
                }
            }, inputIdleThreshold);
        }

        // --- Repeated Inputs Tracking --- 
        if (isInputField && fieldId) {
            if (!fieldInputHistory[fieldId]) {
                fieldInputHistory[fieldId] = '';
            }

            if (key.length === 1) { // Handle printable characters
                fieldInputHistory[fieldId] += key;
                if (fieldInputHistory[fieldId].length > INPUT_HISTORY_MAX_LEN) {
                    fieldInputHistory[fieldId] = fieldInputHistory[fieldId].slice(-INPUT_HISTORY_MAX_LEN);
                }

                // Check for repeated patterns
                const currentHistory = fieldInputHistory[fieldId];
                for (let len = MIN_PATTERN_LENGTH; len <= MAX_PATTERN_LENGTH; len++) {
                    if (currentHistory.length >= len * 2) {
                        const lastPattern = currentHistory.slice(-len);
                        const previousPattern = currentHistory.slice(-len * 2, -len);
                        if (lastPattern === previousPattern) {
                            nonTransitionalEvents.repeatedInputs.push({
                                field: fieldId,
                                pattern: lastPattern,
                                timestamp: new Date()
                            });
                            scheduleNonTransitionalSend();
                            // Clear history for this field after detection to avoid spamming for sub-patterns
                            fieldInputHistory[fieldId] = ''; 
                            break; // Found a repeat, no need to check shorter patterns for this key press
                        }
                    }
                }
            } else if (key === 'Backspace') {
                if (fieldInputHistory[fieldId].length > 0) {
                    fieldInputHistory[fieldId] = fieldInputHistory[fieldId].slice(0, -1);
                }
            }
        }
        // --- End Repeated Inputs Tracking ---
        
        // Key typing cadence tracking (existing logic)
        const now = Date.now();
        const cadenceFieldId = isInputField ? fieldId : 'document';
        
        if (lastKeyTime[cadenceFieldId]) {
            const timeBetweenKeystrokes = now - lastKeyTime[cadenceFieldId];
            if (timeBetweenKeystrokes >= 10 && timeBetweenKeystrokes <= 5000) {
                nonTransitionalEvents.keyTypingCadence.push({
                    field: cadenceFieldId,
                    key: key.length === 1 ? 'key' : key, 
                    timeSinceLast: timeBetweenKeystrokes,
                    timestamp: new Date()
                });
                scheduleNonTransitionalSend();
            }
        }
        lastKeyTime[cadenceFieldId] = now;
        if (keyCadenceTimers[cadenceFieldId]) {
            clearTimeout(keyCadenceTimers[cadenceFieldId]);
        }
        keyCadenceTimers[cadenceFieldId] = setTimeout(() => {
            if (lastKeyTime[cadenceFieldId]) {
                const endTime = Date.now();
                const typingDuration = endTime - lastKeyTime[cadenceFieldId];
                if (typingDuration > 500) {
                    nonTransitionalEvents.keyTypingCadence.push({
                        field: cadenceFieldId,
                        key: 'sequence_end',
                        timeSinceLast: typingDuration,
                        timestamp: new Date()
                    });
                    scheduleNonTransitionalSend();
                }
                delete lastKeyTime[cadenceFieldId];
            }
        }, 1500);
        
        // Track Escape and Backspace keys for all elements (existing logic for escapeBackspace event)
        if (key === 'Escape' || key === 'Backspace') {
            let escBkspFieldId = '';
            if (element && (element.tagName.toLowerCase() === 'input' || 
                          element.tagName.toLowerCase() === 'textarea' ||
                          element.tagName.toLowerCase() === 'select')) {
                escBkspFieldId = element.id || element.name || getElementPath(element);
            }
            if (!nonTransitionalEvents.escapeBackspace) {
                nonTransitionalEvents.escapeBackspace = [];
            }
            nonTransitionalEvents.escapeBackspace.push({
                field: escBkspFieldId,
                key: key,
                timestamp: new Date()
            });
            scheduleNonTransitionalSend();
            // Do not return here if it's backspace and an input field, 
            // as repeatedInput logic needs to handle backspace too.
            if (key === 'Escape') return;
        }
        
        // Only track keystrokes in input elements for regular typing (keyTyping.fields - existing logic)
        if (!isInputField) {
            return;
        }
        const inputFieldId = fieldId; // Already derived
        if (!nonTransitionalEvents.keyTyping.fields[inputFieldId]) {
            nonTransitionalEvents.keyTyping.fields[inputFieldId] = {
                keystrokes: 0,
                lastUpdated: new Date()
            };
        }
        nonTransitionalEvents.keyTyping.fields[inputFieldId].keystrokes++;
        nonTransitionalEvents.keyTyping.fields[inputFieldId].lastUpdated = new Date();
        nonTransitionalMetrics.totalKeystrokes++;
        scheduleNonTransitionalSend();
    });

    // Track focus events on input fields
    document.addEventListener('focus', event => {
        if (!isRecording) return;
        
        const element = event.target;
        if (element && (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea')) {
            const fieldId = element.id || element.name || getElementPath(element);
            
            // Store current value as previous value (existing code)
            let currentValue = element.value;
            if (element.type === 'checkbox' || element.type === 'radio') {
                currentValue = element.checked ? 'checked' : 'unchecked';
            }
            element.dataset.previousValue = currentValue;
            
            // Start tracking input field idle time
            currentFocusedInput = element;
            inputFocusTime = Date.now();
            lastInputActivityTime = Date.now();
            
            // Store initial value for later comparison
            const initialValue = element.type === 'checkbox' || element.type === 'radio' 
                ? element.checked 
                : element.value;
            element.dataset.initialValue = initialValue;
            
            // Set idle timer
            if (inputIdleTimer) {
                clearTimeout(inputIdleTimer);
            }
            
            inputIdleTimer = setTimeout(() => {
                const idleDuration = Date.now() - lastInputActivityTime;
                if (idleDuration >= inputIdleThreshold) {
                    // Get enhanced field information
                    const fieldLabel = getFieldLabel(element);
                    const fieldType = element.type || 'text';
                    const formId = element.form ? (element.form.id || element.form.name || getElementPath(element.form)) : 'standalone';
                    const formName = element.form ? element.form.getAttribute('name') || 'unnamed-form' : 'standalone';
                    
                    // Get current value to compare with initial
                    const currentValue = element.type === 'checkbox' || element.type === 'radio' 
                        ? element.checked 
                        : element.value;
                    const valueChanged = currentValue !== initialValue;
                    
                    nonTransitionalEvents.inputFieldIdle.push({
                        field: fieldId,
                        label: fieldLabel,
                        placeholder: element.placeholder || '',
                        fieldType: fieldType,
                        formId: formId,
                        formName: formName,
                        url: window.location.href,
                        page: document.title,
                        eventType: 'threshold_reached',
                        duration: idleDuration,
                        valueChanged: valueChanged,
                        initialValue: initialValue,
                        currentValue: currentValue,
                        timestamp: new Date(lastInputActivityTime)
                    });
                    
                    scheduleNonTransitionalSend();
                    console.log(`[DOM Tracker] Input field idle threshold reached for ${fieldId}: ${idleDuration}ms`);
                }
            }, inputIdleThreshold);
            
            console.log(`[DOM Tracker] Started tracking input field: ${fieldId}`);
        }
    }, true);
    
    // Track blur events on input fields
    document.addEventListener('blur', event => {
        if (!isRecording) return;
        
        const element = event.target;
        if (element && (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea')) {
            const fieldId = element.id || element.name || getElementPath(element);
            
            // Clear input idle timer
            if (inputIdleTimer) {
                clearTimeout(inputIdleTimer);
                inputIdleTimer = null;
            }
            
            // If this field has been focused for a while and had no recent activity,
            // record an idle period that ends now
            if (element === currentFocusedInput && lastInputActivityTime) {
                const timeSinceLastActivity = Date.now() - lastInputActivityTime;
                if (timeSinceLastActivity >= inputIdleThreshold) {
                    // Get enhanced field information
                    const fieldId = element.id || element.name || getElementPath(element);
                    const fieldLabel = getFieldLabel(element);
                    const fieldType = element.type || 'text';
                    const formId = element.form ? (element.form.id || element.form.name || getElementPath(element.form)) : 'standalone';
                    const formName = element.form ? element.form.getAttribute('name') || 'unnamed-form' : 'standalone';
                    
                    // Get current value to compare with initial
                    const currentValue = element.type === 'checkbox' || element.type === 'radio' 
                        ? element.checked 
                        : element.value;
                    const initialValue = element.dataset.initialValue || '';
                    const valueChanged = currentValue !== initialValue;
                    
                    nonTransitionalEvents.inputFieldIdle.push({
                        field: fieldId,
                        label: fieldLabel,
                        placeholder: element.placeholder || '',
                        fieldType: fieldType,
                        formId: formId,
                        formName: formName,
                        url: window.location.href,
                        page: document.title,
                        eventType: 'total_idle_on_blur',
                        duration: timeSinceLastActivity,
                        valueChanged: valueChanged,
                        initialValue: initialValue,
                        currentValue: currentValue,
                        timestamp: new Date(lastInputActivityTime)
                    });
                    
                    scheduleNonTransitionalSend();
                    console.log(`[DOM Tracker] Input field idle recorded on blur for ${fieldId}: ${timeSinceLastActivity}ms`);
                }
            }
            
            // Reset field tracking
            if (currentFocusedInput === element) {
                currentFocusedInput = null;
                inputFocusTime = null;
                lastInputActivityTime = null;
            }
            
            // Existing code for clearing input history
            if (fieldInputHistory[fieldId]) {
                delete fieldInputHistory[fieldId];
            }
            
            console.log(`[DOM Tracker] Stopped tracking input field: ${fieldId}`);
        }
    }, true);
    
    // Add blur event listener to clear history when field loses focus - NEW
    document.addEventListener('blur', (event) => {
        if (!isRecording) return;
        const element = event.target;
        if (element && (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea')) {
            const fieldId = element.id || element.name || getElementPath(element);
            if (fieldInputHistory[fieldId]) {
                // console.log(`[DOM Tracker] Clearing input history for field on blur: ${fieldId}`);
                delete fieldInputHistory[fieldId];
            }
        }
    }, true); // Use capture phase for blur
}

// Setup click tracking
function setupClickTracking() {
    document.addEventListener('click', event => {
        if (!isRecording) return;
        
        // Update metrics
        nonTransitionalMetrics.totalClicks++;
        
        scheduleNonTransitionalSend();
    });
}

// Setup user inactivity tracking
let userActivityTimeout = null;
let lastActivityTime = Date.now();
let inactivityThreshold = 30000; // 30 seconds of no activity = inactivity

function setupInactivityTracking() {
    // Track user activity events
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'click', 'touchstart'];
    
    activityEvents.forEach(eventType => {
        document.addEventListener(eventType, () => {
            if (!isRecording) return;
            
            const currentTime = Date.now();
            
            // If user was inactive, record it
            if (currentTime - lastActivityTime > inactivityThreshold) {
                const inactiveDuration = currentTime - lastActivityTime;
                
                nonTransitionalEvents.inactivity.push({
                    duration: inactiveDuration,
                    timestamp: new Date(lastActivityTime),
                    trigger: "activity_resumed" // Added trigger
                });
                
                scheduleNonTransitionalSend();
            }
            
            // Reset activity time
            lastActivityTime = currentTime;
            
            // Clear and reset inactivity timeout
            if (userActivityTimeout) {
                clearTimeout(userActivityTimeout);
            }
            
            userActivityTimeout = setTimeout(() => {
                const inactiveTime = Date.now() - lastActivityTime;
                if (inactiveTime > inactivityThreshold) {
                    // We trigger send here to ensure inactivity is recorded even if user never returns
                    nonTransitionalEvents.inactivity.push({
                        duration: inactiveTime,
                        timestamp: new Date(lastActivityTime),
                        trigger: "timeout_30s" // Added trigger
                    });
                    
                    scheduleNonTransitionalSend();
                }
            }, inactivityThreshold);
        });
    });
}

// Setup all non-transitional event tracking
function setupNonTransitionalTracking() {
    setupHoverTracking();
    setupMouseMoveTracking();
    setupKeyboardTracking();
    setupClickTracking();
    setupInactivityTracking();
    setupTabNavigationTracking();
    setupRepeatedClicksTracking();
    setupCopyTextTracking();
    setupPasteTracking();
    
    // Initial timer for sending events
    nonTransitionalSendTimer = setTimeout(() => {
        sendNonTransitionalEvents();
        lastNonTransitionalSendTime = Date.now();
    }, nonTransitionalBatchInterval);
    
    console.log('[DOM Tracker] Non-transitional event tracking initialized');
}

// Setup tab navigation tracking
function setupTabNavigationTracking() {
    let tabNavSequence = [];
    document.addEventListener('keydown', event => {
        if (!isRecording) return;
        if (event.key === 'Tab') {
            const element = document.activeElement;
            const fieldId = element ? (element.id || element.name || getElementPath(element)) : '';
            tabNavSequence.push(fieldId);
            // If sequence gets long or after 2s pause, record
            clearTimeout(tabNavSequence._timeout);
            if (tabNavSequence.length >= 5) {
                nonTransitionalEvents.tabNavigation.push({
                    sequence: [...tabNavSequence],
                    timestamp: new Date()
                });
                tabNavSequence = [];
                scheduleNonTransitionalSend();
            } else {
                tabNavSequence._timeout = setTimeout(() => {
                    if (tabNavSequence.length > 0) {
                        nonTransitionalEvents.tabNavigation.push({
                            sequence: [...tabNavSequence],
                            timestamp: new Date()
                        });
                        tabNavSequence = [];
                        scheduleNonTransitionalSend();
                    }
                }, 2000);
            }
        }
    });
}

// Setup repeated clicks tracking
function setupRepeatedClicksTracking() {
    let lastClick = { selector: '', time: 0, count: 0 };
    document.addEventListener('click', event => {
        if (!isRecording) return;
        const element = event.target;
        const selector = getElementPath(element);
        const now = Date.now();
        if (lastClick.selector === selector && now - lastClick.time < 1000) {
            lastClick.count++;
        } else {
            if (lastClick.count > 1) {
                nonTransitionalEvents.repeatedClicks.push({
                    element: element.tagName.toLowerCase(),
                    selector: lastClick.selector,
                    count: lastClick.count,
                    timestamp: new Date(lastClick.time)
                });
                scheduleNonTransitionalSend();
            }
            lastClick = { selector, time: now, count: 1 };
        }
    });
}

// Setup copy text tracking
function setupCopyTextTracking() {
    document.addEventListener('copy', event => {
        if (!isRecording) return;
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) {
            nonTransitionalEvents.copyText.push({
                text: selection.toString(),
                source: document.activeElement ? getElementPath(document.activeElement) : '',
                timestamp: new Date()
            });
            scheduleNonTransitionalSend();
        }
    });
}

// Setup paste tracking
function setupPasteTracking() {
    document.addEventListener('paste', event => {
        if (!isRecording) return;
        const element = event.target;
        if (!element || (element.tagName.toLowerCase() !== 'input' && element.tagName.toLowerCase() !== 'textarea')) return;
        const fieldId = element.id || element.name || getElementPath(element);
        
        // Always record paste events as non-transitional events
        nonTransitionalEvents.pasteWithoutTyping.push({
            field: fieldId,
            content: (event.clipboardData ? event.clipboardData.getData('text') : ''),
            timestamp: new Date()
        });
        scheduleNonTransitionalSend();
    });
}

// Variables for idle detection
let idleDetectionInterval = null;

// Send a message to the background script
function sendToBackground(action, data) {
    // Add call stack info to identify where the call is coming from
    const stackTrace = new Error().stack;
    const callerInfo = stackTrace.split('\n')[2]?.trim() || 'unknown';
    
    console.log(`[DOM Tracker] Sending to background: ${action} from: ${callerInfo}`);
    
    // Simple message passing with improved error handling
    return new Promise((resolve, reject) => {
        try {
            chrome.runtime.sendMessage({ action, ...data, _source: callerInfo }, response => {
                // Check for runtime errors first
                if (chrome.runtime.lastError) {
                    console.error('[DOM Tracker] Error sending message:', chrome.runtime.lastError);
                    return resolve({ success: false, error: chrome.runtime.lastError.message });
                }
                
                // Handle null or undefined response
                if (!response) {
                    console.error('[DOM Tracker] No response received from background');
                    return resolve({ success: false, error: 'No response from background script' });
                }
                
                console.log(`[DOM Tracker] Response from ${action}:`, response);
                
                // Update local state tracking when we receive state save confirmation
                if (action === 'recordState' && response && response.stateId) {
                    console.log(`[DOM Tracker] Updating local state tracking:`, {
                        lastStateId: response.stateId,
                        lastStateHash: data.state.hash
                    });
                    lastStateId = response.stateId;
                    lastStateHash = data.state.hash;
                }
                
                resolve(response);
            });
        } catch (error) {
            console.error('[DOM Tracker] Exception in sendToBackground:', error);
            resolve({ success: false, error: error.message });
        }
    });
}

// Calculate hash of the DOM - Improved version with better precision and sensitivity
function calculateDomHash() {
    try {
        // Get the URL path
        const urlObj = new URL(window.location.href);
        const pagePath = urlObj.pathname;
        
        // Create a more detailed structural representation of the DOM with key elements
        const domFingerprint = generateEnhancedDOMFingerprint();
        
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

// Generate a more detailed fingerprint of the DOM's structure and content
function generateEnhancedDOMFingerprint() {
    const fingerprint = [];
    
    // Capture all visible structural elements
    const mainElements = document.querySelectorAll('main, section, article, form, div[role="main"], .main-content, div.container');
    Array.from(mainElements).forEach(element => {
        const elementInfo = getElementInfo(element);
        fingerprint.push(elementInfo.signature); // Use signature property
    });
    
    // Get ALL images with their attributes for more sensitivity to image changes
    const imageElements = document.querySelectorAll('img');
    const imageInfo = Array.from(imageElements).map(img => {
        const src = img.src || '';
        const alt = img.alt || '';
        const width = img.width || 0;
        const height = img.height || 0;
        const classes = Array.from(img.classList).join(' ');
        return `img:${src.substring(src.lastIndexOf('/') + 1)}:${width}x${height}:${alt}:${classes}`;
    }).join('|');
    fingerprint.push(`images:${imageInfo}`);
    
    // ENHANCED: Capture form element states with special focus on checkboxes and radio buttons
    const formElements = document.querySelectorAll('input, select, textarea');
    const formInfo = Array.from(formElements).map(el => {
        const type = el.type || el.tagName.toLowerCase();
        const id = el.id || '';
        const name = el.name || '';
        
        // Special handling for different input types to capture their state accurately
        let stateInfo = '';
        
        if (type === 'checkbox' || type === 'radio') {
            // For checkable elements, include checked state
            stateInfo = el.checked ? 'checked' : 'unchecked';
        } else if (type === 'select-one' || type === 'select-multiple') {
            // For select elements, include selected options
            const selectedOptions = Array.from(el.selectedOptions || []).map(opt => opt.value).join(',');
            stateInfo = `selected:${selectedOptions}`;
        } else {
            // For other inputs, include value hint
            stateInfo = el.value ? `value:${el.value.substring(0, 5)}` : 'empty';
        }
        
        return `${type}#${id}[name=${name}]::${stateInfo}`;
    }).join('|');
    fingerprint.push(`forms:${formInfo}`);
    
    // Capture ALL interactive elements (buttons, links, form elements) in more detail
    const interactiveElements = document.querySelectorAll('button, a, [role="button"]');
    const interactiveInfo = Array.from(interactiveElements).map(el => {
        const type = el.tagName.toLowerCase();
        const id = el.id || '';
        const classes = Array.from(el.classList).join(' ');
        const isVisible = isElementVisible(el);
        
        // For buttons and links, include text content
        const textContent = (el.textContent || '').trim().substring(0, 15);
        const disabled = el.disabled ? 'disabled' : 'enabled';
        
        return `${type}#${id}.${classes}:${isVisible}:${disabled}:${textContent}`;
    }).join('|');
    fingerprint.push(`interactive:${interactiveInfo}`);
    
    // Capture key text content from headings and text nodes
    const headings = document.querySelectorAll('h1, h2, h3');
    const headingTexts = Array.from(headings).map(h => {
        return `${h.tagName.toLowerCase()}:${h.textContent.trim().substring(0, 30)}`;
    }).join('|');
    fingerprint.push(`headings:${headingTexts}`);
    
    // Add visible content sections (paragraphs, lists) with more detail
    const contentElements = document.querySelectorAll('p, ul, ol, table, div.content');
    const contentInfo = Array.from(contentElements).slice(0, 20).map(el => {
        const type = el.tagName.toLowerCase();
        // For content elements, include a content hash based on text length and first/last chars
        const contentText = el.textContent.trim();
        const contentLength = contentText.length;
        const contentStart = contentText.substring(0, 15).replace(/\s+/g, '');
        const contentEnd = contentText.length > 15 ? 
            contentText.substring(contentText.length - 15).replace(/\s+/g, '') : '';
        const contentHash = `${contentLength}:${contentStart}:${contentEnd}`;
        return `${type}:${contentHash}`;
    }).join('|');
    fingerprint.push(`content:${contentInfo}`);
    
    // Include details about DOM size and structure
    const domStats = {
        bodyChildren: document.body.children.length,
        totalElements: document.querySelectorAll('*').length,
        forms: document.querySelectorAll('form').length,
        inputs: document.querySelectorAll('input').length,
        images: document.querySelectorAll('img').length
    };
    fingerprint.push(`stats:${JSON.stringify(domStats)}`);
    
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
    if (!element) return { signature: '', selector: '' };
    
    const tagName = element.tagName.toLowerCase();
    const id = element.id || '';
    const classes = Array.from(element.classList).join('.');
    const childrenCount = element.children.length;
    
    // Get first-level children info
    const childrenInfo = Array.from(element.children).slice(0, 5).map(child => {
        return child.tagName.toLowerCase() + (child.id ? `#${child.id}` : '');
    }).join(',');
    
    // Create a signature that represents this element and its structure
    const signature = `${tagName}#${id}.${classes}[${childrenCount}]{${childrenInfo}}`;
    
    // Generate a CSS selector for this element
    const selector = generateCssSelector(element);
    
    return { signature, selector };
}

// Generate a CSS selector for an element
function generateCssSelector(element) {
    if (!element || element === document || element === document.documentElement) {
        return '';
    }
    
    // If the element has an ID, use that (it's the most specific selector)
    if (element.id && element.id.length > 0) {
        return `#${element.id}`;
    }
    
    // Start with the element's tag name
    let selector = element.tagName.toLowerCase();
    
    // Add classes if available
    if (element.className && typeof element.className === 'string') {
        const classes = element.className.trim().split(/\s+/);
        if (classes.length > 0 && classes[0] !== '') {
            selector += '.' + classes.join('.');
        }
    }
    
    // Check if we need to add a nth-child selector for more specificity
    if (!element.id) {
        // Find the element's position among its siblings
        const parent = element.parentNode;
        if (parent && parent.children.length > 1) {
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(element) + 1;
            if (index > 0) {
                selector += `:nth-child(${index})`;
            }
        }
    }
    
    // Recursively add parent selectors for more specificity,
    // but limit depth to avoid extremely long selectors
    const maxDepth = 3;
    let currentElement = element;
    let depth = 0;
    
    while (currentElement.parentNode && 
           currentElement.parentNode.nodeType === Node.ELEMENT_NODE && 
           currentElement.parentNode !== document && 
           depth < maxDepth) {
        
        currentElement = currentElement.parentNode;
        depth++;
        
        // For parent, use simpler selector
        let parentSelector = currentElement.tagName.toLowerCase();
        
        if (currentElement.id) {
            parentSelector = `#${currentElement.id}`;
            // If parent has ID, we can stop here as it's unique
            selector = `${parentSelector} > ${selector}`;
            break;
        } else if (currentElement.className && typeof currentElement.className === 'string') {
            const classes = currentElement.className.trim().split(/\s+/);
            if (classes.length > 0 && classes[0] !== '') {
                parentSelector += '.' + classes.join('.');
            }
        }
        
        selector = `${parentSelector} > ${selector}`;
    }
    
    return selector;
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
    
    // Capture the current DOM immediately
    const currentDom = document.documentElement.outerHTML;
    
    // Double-check loading state right before creating the state
    // If we haven't seen DOM changes for a while, then it's probably not loading
    if (isPageLoading) {
        // Check if the DOM has actually changed in the last 100ms
        const now = Date.now();
        if (now - lastMutationTime > 100) {
            console.log('[DOM Tracker] No recent mutations detected, overriding loading state to false');
            isPageLoading = false;
        }
    }
    
    // Create the state object with the captured DOM
    const state = createStateObject(stateId, url, hash, isNewState);
    
    // Ensure the DOM is included in the state
    state.dom = currentDom;
    
    // Log the state for debugging
    console.log(`[DOM Tracker] Created state with DOM size: ${state.dom.length} bytes, isLoading: ${isPageLoading}`);
    
    currentStateId = stateId; // This will be replaced by background script's ID
    
    return { state, isNewState };
}

// Check if page is still loading by comparing DOM snapshots
function checkLoadingState() {
    if (!isRecording) return;
    
    const currentDom = document.documentElement.outerHTML;
    
    // If DOM has changed since last check, page is still loading
    if (currentDom !== lastDomSnapshot) {
        isPageLoading = true;
        lastDomSnapshot = currentDom;
    } else {
        // If no changes for a while, page is done loading
        isPageLoading = false;
        if (loadingCheckInterval) {
            clearInterval(loadingCheckInterval);
            loadingCheckInterval = null;
        }
    }
}

// Start loading detection
function startLoadingDetection() {
    // Mark as loading initially - this is important for actual navigation events
    isPageLoading = true;
    loadingStartTime = Date.now();
    lastDomSnapshot = document.documentElement.outerHTML;
    
    console.log('[DOM Tracker] Starting loading detection - initially set to loading');
    
    // Check every 10ms for DOM changes
    if (loadingCheckInterval) {
        clearInterval(loadingCheckInterval);
    }
    
    // Set up interval to check for continued loading
    loadingCheckInterval = setInterval(() => {
        const currentDom = document.documentElement.outerHTML;
        
        // If DOM has changed since last check, page is still loading
        if (currentDom !== lastDomSnapshot) {
            isPageLoading = true;
            lastDomSnapshot = currentDom;
            console.log('[DOM Tracker] DOM changed, still loading');
        } else {
            // If DOM hasn't changed for 100ms, consider it stable
            const timeSinceChange = Date.now() - loadingStartTime;
            if (timeSinceChange > 100) {
                isPageLoading = false;
                console.log('[DOM Tracker] DOM stable for 100ms, loading complete');
                
                // Stop checking once we've determined loading is complete
                if (loadingCheckInterval) {
                    clearInterval(loadingCheckInterval);
                    loadingCheckInterval = null;
                }
            }
        }
    }, 10);
    
    // Set an overall timeout to ensure we don't check forever
    setTimeout(() => {
        if (loadingCheckInterval) {
            clearInterval(loadingCheckInterval);
            loadingCheckInterval = null;
            isPageLoading = false;
            console.log('[DOM Tracker] Forced end of loading state detection after timeout');
        }
    }, 5000);
}

// Create state object with all required fields
const createStateObject = (stateId, url, hash, isNewState) => {
    // Get current DOM metrics
    const domSize = document.documentElement.outerHTML.length;
    const elementCount = document.getElementsByTagName('*').length;
    const formElements = document.getElementsByTagName('form').length;
    const visibleElements = Array.from(document.getElementsByTagName('*')).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    }).length;

    // Get current URL and path
    const currentUrl = url || window.location.href;
    const urlPath = window.location.pathname;
    const urlHash = window.location.hash;
    const urlSearch = window.location.search;

    // Get page title
    const pageTitle = document.title;

    // Get resource information
    const performanceEntries = performance.getEntriesByType('resource');
    const resourceCount = performanceEntries.length;
    const resourceTypes = performanceEntries.reduce((acc, resource) => {
        const type = resource.initiatorType || 'other';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    // Get network information
    const networkInfo = {
        effectiveType: navigator.connection ? navigator.connection.effectiveType : 'unknown',
        downlink: navigator.connection ? navigator.connection.downlink : 0,
        rtt: navigator.connection ? navigator.connection.rtt : 0
    };

    // Get current DOM
    const currentDom = document.documentElement.outerHTML;

    // Calculate load time
    const loadTime = Math.max(0, performance.timing.loadEventEnd - performance.timing.navigationStart);

    // Use the current isPageLoading state
    console.log(`[DOM Tracker] Creating state object with isPageLoading=${isPageLoading}`);

    // Create loading info
    const loadingInfo = {
        isNavigation: false,
        isInitial: false,
        isReload: false,
        isPartOfLoading: isPageLoading, // Use the current loading state
        loadTime: loadTime,
        resourceCount: resourceCount,
        resourceTypes: resourceTypes,
        errorCount: 0,
        networkInfo: networkInfo,
        timestamp: new Date().toISOString()
    };

    // Create mutation info
    const mutationInfo = {
        count: 0,
        types: [],
        timestamp: new Date().toISOString()
    };

    // Create metrics
    const metrics = {
        domSize: domSize,
        elementCount: elementCount,
        formElements: formElements,
        visibleElements: visibleElements
    };

    // Create the complete state object
    const state = {
        stateId: stateId || `state_${Date.now()}`,
        sessionId: sessionId,
        userId: userId,
        url: currentUrl,
        pathname: urlPath,
        urlHash: urlHash,
        urlSearch: urlSearch,
        title: pageTitle,
        timestamp: new Date().toISOString(),
        isNewState: isNewState !== undefined ? isNewState : true,
        stateNumber: 0, // Will be assigned by background script
        hash: hash || generateHash(currentDom),
        previousStateId: lastStateId, // Add previous state ID
        previousHash: lastStateHash, // Add previous state hash
        dom: currentDom,
        metrics: metrics,
        loadingInfo: loadingInfo,
        mutationInfo: mutationInfo
    };

    console.log(`[DOM Tracker] Created state with previous state info - previousStateId: ${lastStateId}, previousHash: ${lastStateHash}`);
    return state;
};

// Update the state tracking after successful state creation
const updateStateTracking = (state) => {
    if (state && state.stateId && state.hash) {
        lastStateId = state.stateId;
        lastStateHash = state.hash;
        lastDomHash = state.hash;
        console.log(`[DOM Tracker] Updated state tracking - lastStateId: ${lastStateId}, lastStateHash: ${lastStateHash}`);
    }
};

// Process mutations and create a new state with debouncing
function processMutations(mutations) {
    if (!isRecording) return;
    
    const now = Date.now();
    console.log(`[DOM Tracker][DUPLICATION DEBUG] processMutations called at ${now}, with ${mutations.length} mutations`);
    
    // Increase debounce time to prevent duplicate captures from single actions
    // This prevents multiple states being created for a single page load/navigation
    if (processingMutations || (now - lastMutationTime < 250)) {
        console.log(`[DOM Tracker][DUPLICATION DEBUG] Queuing mutation processing due to debounce - processingMutations=${processingMutations}, timeSinceLastMutation=${now - lastMutationTime}ms`);
        
        // Queue another check if we're not already processing
        if (!processingMutations) {
            setTimeout(() => processMutations(mutations), 100);
        }
        return;
    }
    
    // Set debounce flags
    processingMutations = true;
    lastMutationTime = now;
    
    // Process immediately for responsive detection
    try {
        console.log(`[DOM Tracker][DUPLICATION DEBUG] Processing mutations - ${mutations.length} changes`);
        
        // Filter meaningful mutations
        const significantMutations = mutations.filter(mutation => {
            // Always consider childList changes significant
            if (mutation.type === 'childList') return true;
            
            // For attribute changes, only consider certain attributes significant
            if (mutation.type === 'attributes') {
                const significantAttrs = ['src', 'href', 'class', 'id', 'style', 'value', 'checked', 'selected', 'disabled'];
                return significantAttrs.includes(mutation.attributeName);
            }
            
            // Consider all characterData changes significant
            return mutation.type === 'characterData';
        });
        
        if (significantMutations.length === 0) {
            console.log('[DOM Tracker][DUPLICATION DEBUG] No significant mutations found, skipping state creation');
            processingMutations = false;
            return;
        }
        
        // Calculate current hash
        const currentHash = calculateDomHash();
        
        console.log(`[DOM Tracker][DUPLICATION DEBUG] Current hash: ${currentHash}, Last hash: ${lastDomHash}`);
        console.log(`[DOM Tracker][DUPLICATION DEBUG] Known states: ${Object.keys(previousStates).join(', ')}`);
        
        // Enhanced check for rapid duplicate captures
        // If this is the same hash as last one and it came very quickly, skip it
        const isDuplicate = currentHash === lastDomHash;
        const isPreviouslySeen = previousStates[currentHash] !== undefined;
        const isVeryRecentDuplicate = isDuplicate && (now - lastMutationTime < 350);
        
        if (isVeryRecentDuplicate) {
            console.log(`[DOM Tracker][DUPLICATION DEBUG] *** RAPID DUPLICATE PREVENTED *** Same hash detected within 350ms: ${currentHash}`);
            processingMutations = false;
            return;
        }
        
        if (isDuplicate) {
            console.log(`[DOM Tracker][DUPLICATION DEBUG] DOM hash is the same as last state, will create duplicate record with isNewState=false`);
        } else if (isPreviouslySeen) {
            console.log(`[DOM Tracker][DUPLICATION DEBUG] *** PREVIOUSLY SEEN STATE DETECTED *** hash: ${currentHash}, previous stateId: ${previousStates[currentHash]}`);
        } else {
            console.log(`[DOM Tracker][DUPLICATION DEBUG] New unseen state with hash: ${currentHash}`);
        }
        
        // Check for pending state sends with the same hash to prevent duplicates
        if (pendingStateSends[currentHash]) {
            console.log(`[DOM Tracker][DUPLICATION DEBUG] *** DUPLICATE SEND PREVENTED *** Already sending state with hash: ${currentHash}`);
            processingMutations = false;
            return;
        }
        
        // Create a state regardless of whether it's a duplicate
        const { state, isNewState } = createDomState();
        state.hash = currentHash; // Ensure hash is consistent
        
        console.log(`[DOM Tracker][DUPLICATION DEBUG] Created state object with stateId=${state.stateId}, hash=${state.hash}, isNewState=${state.isNewState}`);
        
        // If it's a duplicate or previously seen state, mark it appropriately
        if (isDuplicate || isPreviouslySeen) {
            state.isNewState = false;
            state.originalStateId = isPreviouslySeen ? previousStates[currentHash] : currentStateId;
            console.log(`[DOM Tracker][DUPLICATION DEBUG] Marked state as duplicate, originalStateId=${state.originalStateId}`);
        }
        
        // Add information about what changed
        state.mutationInfo = {
            count: significantMutations.length,
            types: [...new Set(significantMutations.map(m => m.type))],
            timestamp: now
        };
        
        // Mark this hash as pending to prevent duplicate sends
        pendingStateSends[currentHash] = true;
        console.log(`[DOM Tracker][DUPLICATION DEBUG] Added hash ${currentHash} to pendingStateSends to prevent duplicates`);
        
        // Send to background with appropriate flags
        console.log(`[DOM Tracker][DUPLICATION DEBUG] Sending state to background with hash=${currentHash}, isDuplicate=${isDuplicate || isPreviouslySeen}`);
        sendToBackground('recordState', {
            state: state,
            isDuplicate: isDuplicate || isPreviouslySeen,
            reusedStateId: isPreviouslySeen ? previousStates[currentHash] : null
        })
        .then(response => {
            console.log(`[DOM Tracker][DUPLICATION DEBUG] Background response for recordState:`, response);
            
            if (response && response.stateId) {
                // Update our map with the real stateId from the server
                previousStates[currentHash] = response.stateId;
                currentStateId = response.stateId;
                console.log(`[DOM Tracker][DUPLICATION DEBUG] Added/updated state in previousStates: ${currentHash} -> ${response.stateId}`);
            } else {
                console.warn('[DOM Tracker][DUPLICATION DEBUG] Did not receive valid stateId from background script');
            }
            
            // Always update lastDomHash to the current hash
            lastDomHash = currentHash;
        })
        .catch(error => {
            console.error('[DOM Tracker][DUPLICATION DEBUG] Error getting stateId from background:', error);
        })
        .finally(() => {
            // Increase the delay before clearing pending sends to prevent rapid duplicates
            console.log(`[DOM Tracker][DUPLICATION DEBUG] Setting timeout to clear pendingStateSends for hash ${currentHash}`);
            setTimeout(() => {
                delete pendingStateSends[currentHash];
                console.log(`[DOM Tracker][DUPLICATION DEBUG] Removed hash ${currentHash} from pendingStateSends`);
            }, 350); // Adjusted from 500ms to 350ms to better balance responsiveness
        });
        
        console.log(`[DOM Tracker][DUPLICATION DEBUG] Created state for DOM change with hash: ${currentHash}`);
    } catch (error) {
        console.error('[DOM Tracker][DUPLICATION DEBUG] Error processing mutations:', error);
    } finally {
        // Clear debounce flag
        processingMutations = false;
    }
}

// Set up DOM mutation observer to detect changes
function setupMutationObserver() {
    if (mutationObserver) {
        mutationObserver.disconnect();
    }
    
    // Configuration for the observer (observe everything with higher sensitivity)
    const config = {
        attributes: true,
        childList: true,
        subtree: true,
        characterData: true,
        attributeOldValue: true,  // Capture old attribute values
        characterDataOldValue: true  // Capture old text values
    };
    
    // Create an observer instance with immediate processing
    mutationObserver = new MutationObserver(mutations => {
        if (!isRecording) return;
        
        if (mutations.length > 0) {
            console.log(`[DOM Tracker] DOM changed: ${mutations.length} mutations detected`);
            
            // Start processing immediately
            processMutations(mutations);
        }
    });
    
    // Start observing the entire document with the configured parameters
    mutationObserver.observe(document.documentElement, config);
    
    console.log('[DOM Tracker] Mutation observer set up with enhanced sensitivity');
    
    return mutationObserver;
}

// Set up reload detection
function setupReloadDetection() {
    // Check if this is a reload by looking at performance navigation type
    const perfEntry = performance.getEntriesByType('navigation')[0];
    const isReload = perfEntry ? perfEntry.type === 'reload' : (
        // Fallback for browsers that don't support PerformanceNavigationTiming
        window.performance.navigation.type === window.performance.navigation.TYPE_RELOAD
    );
    
    console.log('[DOM Tracker] Navigation type detected:', perfEntry ? perfEntry.type : 'using fallback');
    
    // Store reload status in session storage
    sessionStorage.setItem('isReload', isReload.toString());
    console.log(`[DOM Tracker] Page reload status: ${isReload}`);
    
    // Track page load count for additional context
    const count = parseInt(sessionStorage.getItem('pageLoadCount') || '0') + 1;
    sessionStorage.setItem('pageLoadCount', count.toString());
    console.log(`[DOM Tracker] Page load count: ${count}`);
    
    // Store current URL before unload
    window.addEventListener('beforeunload', () => {
        const currentUrl = window.location.href;
        console.log('[DOM Tracker] Storing URL before unload:', currentUrl);
        sessionStorage.setItem('lastPageUrl', currentUrl);
        
        // If this is a reload (e.g., F5 or refresh button), set the reload flag
        if (document.visibilityState === 'visible') {
            sessionStorage.setItem('isReload', 'true');
            console.log('[DOM Tracker] Setting reload flag before refresh');
        }
    });
}

// Track URL/page changes
function setupNavigationTracking() {
    // Store initial URL
    sessionStorage.setItem('lastPageUrl', window.location.href);
    console.log('[DOM Tracker] Initial URL stored:', window.location.href);

    // Listen for URL changes via popstate
    window.addEventListener('popstate', () => {
        console.log('[DOM Tracker] Navigation detected (popstate)');
        const currentUrl = window.location.href;
        const previousUrl = sessionStorage.getItem('lastPageUrl');
        console.log(`[DOM Tracker] Navigation: from ${previousUrl} to ${currentUrl}`);
        handleNavigation(true);
    });
    
    // For single-page apps and other navigation methods
    const originalPushState = history.pushState;
    history.pushState = function() {
        originalPushState.apply(this, arguments);
        console.log('[DOM Tracker] Navigation detected (pushState)');
        const currentUrl = window.location.href;
        const previousUrl = sessionStorage.getItem('lastPageUrl');
        console.log(`[DOM Tracker] Navigation: from ${previousUrl} to ${currentUrl}`);
        handleNavigation(true);
    };
    
    const originalReplaceState = history.replaceState;
    history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        console.log('[DOM Tracker] Navigation detected (replaceState)');
        const currentUrl = window.location.href;
        const previousUrl = sessionStorage.getItem('lastPageUrl');
        console.log(`[DOM Tracker] Navigation: from ${previousUrl} to ${currentUrl}`);
        handleNavigation(true);
    };

    // Also track unload to catch regular navigation
    window.addEventListener('beforeunload', () => {
        console.log('[DOM Tracker] Page unload, storing current URL:', window.location.href);
        sessionStorage.setItem('lastPageUrl', window.location.href);
        sessionStorage.setItem('navigationPending', 'true');
    });
}

// Handle navigation events
function handleNavigation(isHistoryNavigation = false) {
    if (!isRecording) return;
    
    const url = window.location.href;
    const previousUrl = sessionStorage.getItem('lastPageUrl');
    
    console.log(`[DOM Tracker] Navigation handler - from ${previousUrl} to ${url}`);
    console.log(`[DOM Tracker] Is history navigation: ${isHistoryNavigation}`);
    
    // Update last URL
    sessionStorage.setItem('lastPageUrl', url);
    
    // Reset hash for this new page load
    lastDomHash = null;
    
    // Explicitly set loading state for navigation events
    isPageLoading = true;
    
    // Start loading detection
    startLoadingDetection();
    
    loadingStartTime = Date.now();
    
    // Set navigation pending flag
    sessionStorage.setItem('navigationPending', 'true');
    
    console.log('[DOM Tracker] Page is now in loading state, navigation pending');
}

// Capture interaction details for clicked elements
function captureInteractionDetails(element, type = 'click', additionalDetails = {}) {
    if (!element) return null;
    
    try {
        // Get element details
        const tagName = element.tagName.toLowerCase();
        const elementInfo = getElementInfo(element);
        
        // Determine element type/category
        let elementType = tagName;
        if (element.type) {
            elementType = `${tagName}[type=${element.type}]`;
        }
        
        // Get element text or label
        let text = element.innerText || element.textContent || '';
        text = text.trim().substring(0, 100); // Limit length
        
        // For inputs, get current and previous values
        let value = '';
        let previousValue = additionalDetails.previousValue || '';
        
        if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
            // For checkboxes and radio buttons, use checked state
            if (element.type === 'checkbox' || element.type === 'radio') {
                value = element.checked ? 'checked' : 'unchecked';
                
                // If no previous value was provided, try to get it from dataset
                if (!previousValue) {
                    previousValue = element.dataset.previousValue || 'unchecked';
                }
                
                // Attempt to get any label associated with this input
                if (!text) {
                    const id = element.id;
                    if (id) {
                        const label = document.querySelector(`label[for="${id}"]`);
                        if (label) {
                            text = label.innerText || label.textContent || '';
                            text = text.trim();
                        }
                    }
                }
            } else {
                // For other inputs, use their value
                value = element.value || '';
                
                // If no previous value was provided, try to get it from dataset
                if (!previousValue) {
                    previousValue = element.dataset.previousValue || '';
                }
            }
        }
        
        // Create interaction info object
        const interactionInfo = {
            type: type, // click, change, input, etc.
            element: elementType, // button, checkbox, etc.
            selector: elementInfo.selector || '', // Use the new selector property
            text: text,
            value: value,
            previousValue: previousValue,
            timestamp: new Date().toISOString(),
            details: {
                id: element.id || '',
                className: element.className || '',
                href: element.href || '',
                ...additionalDetails
            }
        };
        
        console.log(`[Content] Captured interaction: ${type} on ${elementType} - ${text || value} (previous: ${previousValue})`);
        console.log(`[Content] Generated selector: ${elementInfo.selector}`);
        return interactionInfo;
    } catch (error) {
        console.error('[Content] Error capturing interaction details:', error);
        return null;
    }
}

// Update forceCaptureState to include interaction information
function forceCaptureState(trigger, element, additionalDetails = {}) {
    try {
        if (!isRecording) return;
        
        // Properly destructure the result from createDomState
        const { state, isNewState } = createDomState();
        
        // Add interaction information if element is provided
        if (element) {
            state.interactionInfo = captureInteractionDetails(element, trigger, additionalDetails);
        }
        
        // Ensure critical fields are present
        if (!state.hash) {
            state.hash = calculateDomHash();
        }
        
        if (!state.dom) {
            state.dom = document.documentElement.outerHTML;
        }
        
        // Continue with existing code to send state
        sendToBackground('recordState', { 
            state, 
            isInteraction: true,
            source: 'interaction_' + trigger 
        })
        .then(response => {
            if (response && response.success) {
                console.log(`[Content] State captured from ${trigger} interaction`);
                
                if (response.stateId) {
                    lastStateId = response.stateId;
                    if (state.hash) lastStateHash = state.hash;
                }
            }
        })
        .catch(error => {
            console.error(`[Content] Error capturing state from ${trigger}:`, error);
        });
    } catch (error) {
        console.error(`[Content] Error in forceCaptureState (${trigger}):`, error);
    }
}

// Modify form change detection to include previous values
function setupFormChangeDetection() {
    // Listen for changes to form fields
    document.addEventListener('change', event => {
        try {
            if (!isRecording) return;
            
            const element = event.target;
            if (!element) return;
            
            // Determine type of element
            const tagName = element.tagName.toLowerCase();
            if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
                console.log(`[Content] Form element changed: ${tagName}${element.id ? '#' + element.id : ''}`);
                
                // Get the previous value from the element's data attribute
                const previousValue = element.dataset.previousValue;
                
                // For checkboxes and radio buttons, convert to boolean string
                let currentValue = element.value;
                if (element.type === 'checkbox' || element.type === 'radio') {
                    currentValue = element.checked ? 'checked' : 'unchecked';
                }
                
                // Force capture state with interaction details including previous value
                forceCaptureState('change', element, { previousValue });
                
                // Update the previous value for next time
                element.dataset.previousValue = currentValue;
            }
        } catch (error) {
            console.error('[Content] Error in change event handler:', error);
        }
    });
    
    // Track form elements on focus to capture previous value
    document.addEventListener('focus', event => {
        if (!isRecording) return;
        
        const element = event.target;
        if (element && (element.tagName.toLowerCase() === 'input' || 
                       element.tagName.toLowerCase() === 'select' || 
                       element.tagName.toLowerCase() === 'textarea')) {
            
            // Store current value as previous value
            let currentValue = element.value;
            if (element.type === 'checkbox' || element.type === 'radio') {
                currentValue = element.checked ? 'checked' : 'unchecked';
            }
            element.dataset.previousValue = currentValue;
        }
    }, true);
    
    // Handle clicks on interactive elements
    document.addEventListener('click', event => {
        try {
            if (!isRecording) return;
            
            const element = event.target;
            if (!element) return;
            
            // Determine if this is an interactive element worth tracking
            const tagName = element.tagName.toLowerCase();
            const isButton = tagName === 'button' || 
                            (tagName === 'input' && (element.type === 'button' || element.type === 'submit')) ||
                            element.role === 'button';
            
            const isCheckbox = tagName === 'input' && element.type === 'checkbox';
            const isRadio = tagName === 'input' && element.type === 'radio';
            const isCheckboxOrRadio = isCheckbox || isRadio;
            
            const isLink = tagName === 'a' && element.href;
            
            // For any clearly interactive element, capture state
            if (isButton || isCheckboxOrRadio || isLink) {
                console.log(`[Content] Interactive element clicked: ${tagName}${element.id ? '#' + element.id : ''}`);
                
                // For checkboxes and radio buttons, get previous value
                let previousValue = '';
                if (isCheckboxOrRadio) {
                    if (isCheckbox) {
                        // For checkboxes, previous value is opposite of current state
                        previousValue = element.checked ? 'unchecked' : 'checked';
                    } else if (isRadio) {
                        // For radio buttons, get the stored previous value or default to unchecked
                        previousValue = element.dataset.previousValue || 'unchecked';
                        
                        // Update previous values for all radio buttons in the same group
                        const name = element.name;
                        if (name) {
                            document.querySelectorAll(`input[type="radio"][name="${name}"]`).forEach(radio => {
                                // Store the current state as previous value for next interaction
                                radio.dataset.previousValue = radio.checked ? 'checked' : 'unchecked';
                            });
                        }
                    }
                }
                
                forceCaptureState('click', element, { previousValue });
            }
        } catch (error) {
            console.error('[Content] Error in click event handler:', error);
        }
    });
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
    setupFormChangeDetection(); // Add form change detection
    setupNonTransitionalTracking(); // Add non-transitional event tracking
    
    // Start loading detection
    startLoadingDetection();
    
    console.log(`[DOM Tracker] Started recording with session ${sessionId}`);
    
    // Set recording flag before capturing initial state
    isRecording = true;
    
    // Immediately capture the current page state when recording starts
    // This ensures we capture already-loaded pages without waiting for an interaction
    setTimeout(() => {
        try {
            console.log('[DOM Tracker][DUPLICATION DEBUG] Capturing initial state for already loaded page');
            
            // Calculate current hash
            const currentHash = calculateDomHash();
            console.log(`[DOM Tracker][DUPLICATION DEBUG] Initial page state hash: ${currentHash}`);
            
            // Create state for the already-loaded page
            const { state, isNewState } = createDomState();
            state.hash = currentHash;
            
            // Mark this as an initial state
            state.isInitial = true;
            if (state.loadingInfo) {
                state.loadingInfo.isInitial = true;
                state.loadingInfo.isPartOfLoading = false; // Page is already loaded
            }
            
            console.log(`[DOM Tracker][DUPLICATION DEBUG] Created initial state for already loaded page with hash=${currentHash}`);
            
            // Send to background with initial flag
            sendToBackground('recordState', {
                state: state,
                isInitial: true
            })
            .then(response => {
                console.log(`[DOM Tracker][DUPLICATION DEBUG] Background response for initial state:`, response);
                
                if (response && response.stateId) {
                    // Update tracking
                    previousStates[currentHash] = response.stateId;
                    currentStateId = response.stateId;
                    lastDomHash = currentHash;
                    console.log(`[DOM Tracker][DUPLICATION DEBUG] Set initial state: ${response.stateId}`);
                }
            })
            .catch(error => {
                console.error('[DOM Tracker][DUPLICATION DEBUG] Error capturing initial state:', error);
            });
        } catch (error) {
            console.error('[DOM Tracker][DUPLICATION DEBUG] Error capturing initial state:', error);
        }
    }, 100); // Short delay to ensure everything is initialized
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
        console.log('[DOM Tracker][DUPLICATION DEBUG] Page fully loaded event triggered');
        if (isRecording) {
            // For an actual page load event, this should always be considered a loading state
            isPageLoading = true;
            
            // Calculate hash once and reuse it
            const currentHash = calculateDomHash();
            console.log(`[DOM Tracker][DUPLICATION DEBUG] Page load state hash: ${currentHash}`);
            
            // Check various load scenarios with enhanced reload detection
            const isReload = sessionStorage.getItem('isReload') === 'true' || 
                            performance.getEntriesByType('navigation')[0]?.type === 'reload';
            const previousUrl = sessionStorage.getItem('lastPageUrl');
            const navigationPending = sessionStorage.getItem('navigationPending') === 'true';
            const currentUrl = window.location.href;
            const isNavigation = navigationPending && previousUrl && previousUrl !== currentUrl;
            
            console.log(`[DOM Tracker][DUPLICATION DEBUG] Load type detection:`, {
                isReload,
                previousUrl,
                currentUrl,
                navigationPending,
                isNavigation,
                navigationType: performance.getEntriesByType('navigation')[0]?.type || 'unknown'
            });
            
            // Clear navigation pending flag
            sessionStorage.setItem('navigationPending', 'false');
            
            // Check if we've already sent this hash to prevent duplicates
            if (pendingStateSends[currentHash]) {
                console.log(`[DOM Tracker][DUPLICATION DEBUG] *** WINDOW LOAD DUPLICATE PREVENTED *** Already sending state with hash: ${currentHash}`);
                return;
            }
            
            // Capture page state
            const { state, isNewState } = createDomState();
            state.hash = currentHash;
            
            // Set appropriate flags based on the type of page load
            if (isReload) {
                state.isReload = true;
                state.isInitial = false;
                state.isNavigation = false;
                console.log('[DOM Tracker][DUPLICATION DEBUG] Setting isReload flag for state');
            } else if (isNavigation) {
                state.isNavigation = true;
                state.isInitial = false;
                state.isReload = false;
                console.log('[DOM Tracker][DUPLICATION DEBUG] Setting isNavigation flag for state');
            } else {
                // Only set isInitial if this is truly the first load (no previous URL or navigation)
                state.isInitial = !previousUrl && !navigationPending;
                state.isNavigation = false;
                state.isReload = false;
                console.log(`[DOM Tracker][DUPLICATION DEBUG] Setting isInitial=${!previousUrl && !navigationPending} for state`);
            }
            
            // Update loadingInfo flags
            if (state.loadingInfo) {
                state.loadingInfo.isPartOfLoading = true;
                state.loadingInfo.isNavigation = state.isNavigation;
                state.loadingInfo.isInitial = state.isInitial;
                state.loadingInfo.isReload = state.isReload;
            }
            
            // Add to pendingStateSends to prevent duplicates
            pendingStateSends[currentHash] = true;
            
            // Send state to background
            console.log(`[DOM Tracker][DUPLICATION DEBUG] Sending state with flags:`, {
                hash: currentHash,
                isInitial: state.isInitial,
                isReload: state.isReload,
                isNavigation: state.isNavigation
            });
            
            sendToBackground('recordState', {
                state: state,
                isInitial: state.isInitial,
                isReload: state.isReload,
                isNavigation: state.isNavigation
            })
            .then(response => {
                console.log(`[DOM Tracker][DUPLICATION DEBUG] Background response for page load state:`, response);
                
                if (response && response.stateId) {
                    // Update our map with the real stateId from the server
                    previousStates[currentHash] = response.stateId;
                    currentStateId = response.stateId;
                    console.log(`[DOM Tracker][DUPLICATION DEBUG] Updated page load state tracking with server-assigned ID: ${response.stateId}`);
                    
                    // Always update lastDomHash to the current hash
                    lastDomHash = currentHash;
                    
                    // Reset the reload flag now that we've handled it
                    if (isReload) {
                        sessionStorage.setItem('isReload', 'false');
                    }
                    
                    // Reset loading state back to false after capturing
                    isPageLoading = false;
                }
            })
            .catch(error => {
                console.error('[DOM Tracker][DUPLICATION DEBUG] Error getting stateId for page load state:', error);
                // Reset loading state back to false after capturing
                isPageLoading = false;
            })
            .finally(() => {
                // Clear the pending flag with a minimum possible delay
                setTimeout(() => {
                    delete pendingStateSends[currentHash];
                    console.log(`[DOM Tracker][DUPLICATION DEBUG] Removed hash ${currentHash} from pendingStateSends for window.load event`);
                }, 1);
            });
            
            const loadType = isReload ? "RELOAD" : "INITIAL LOAD";
            console.log(`[DOM Tracker][DUPLICATION DEBUG] Page ${loadType} state created with hash: ${currentHash}`);
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

        if (message.action === 'stateSaved') {
            // Update our tracking when we get confirmation the state was saved
            updateStateTracking(message.state);
            sendResponse({ success: true });
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

// Sequential state capture function to ensure states are sent in order
async function captureAndSendState(stateData, flags = {}) {
    // Increment sequence number to track order
    const sequenceNumber = ++stateSequenceNumber;
    
    console.log(`[DOM Tracker] Capturing state #${sequenceNumber} with flags:`, flags);
    
    try {
        // Prepare state data
        const state = stateData.state || createDomState().state;
        
        // Add local tracking info
        state.previousStateId = lastStateId;
        state.previousHash = lastStateHash;
        state.captureSequence = sequenceNumber;
        
        console.log(`[DOM Tracker] State #${sequenceNumber} with previous state info:`, {
            previousStateId: lastStateId,
            previousHash: lastStateHash
        });
        
        // Create a promise to track this specific state capture
        pendingStateSaves[sequenceNumber] = new Promise(async (resolve) => {
            try {
                // Wait for any previous state captures to complete
                if (sequenceNumber > 1) {
                    const previousSequence = sequenceNumber - 1;
                    if (pendingStateSaves[previousSequence]) {
                        console.log(`[DOM Tracker] Waiting for previous state #${previousSequence} to complete before sending #${sequenceNumber}`);
                        await pendingStateSaves[previousSequence];
                    }
                }
                
                // Send state to background script
                console.log(`[DOM Tracker] Sending state #${sequenceNumber} to background`);
                const response = await sendToBackground('recordState', {
                    state,
                    ...flags
                });
                
                // Update local tracking after successful save
                if (response && response.stateId) {
                    console.log(`[DOM Tracker] State #${sequenceNumber} saved with ID: ${response.stateId}`);
                    lastStateId = response.stateId;
                    lastStateHash = state.hash;
                }
                
                resolve(response);
                return response;
            } catch (error) {
                console.error(`[DOM Tracker] Error sending state #${sequenceNumber}:`, error);
                resolve(null); // Resolve with null to unblock the queue
                return null;
            } finally {
                // Clean up after a delay to ensure any chained promises have resolved
                setTimeout(() => {
                    delete pendingStateSaves[sequenceNumber];
                }, 100);
            }
        });
        
        return await pendingStateSaves[sequenceNumber];
    } catch (error) {
        console.error(`[DOM Tracker] Error in captureAndSendState #${sequenceNumber}:`, error);
        return null;
    }
}

