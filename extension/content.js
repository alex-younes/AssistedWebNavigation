// Simplified DOM State Tracker - Content Script
// Tracks DOM changes and state only

// Core state variables
let isRecording = false;
let sessionId = null;
let userId = null;
let lastStateId = null; // USE THIS consistently for the last recorded state ID
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
    inputFieldIdle: [],
    allKeyPresses: [], // ADDED for all key presses
    deadClicks: [], // ADDED for dead clicks
    scrollEvents: [], // ADDED for scroll events
    dropdownToggle: [], // ADDED for dropdown toggle
    inputContent: [] // ADDED for input field content tracking
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
let currentBatchMouseActiveTime = 0; // ADDED: Track active mouse movement time for current batch (in ms)

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

// NEW: Variables for keydownWithoutSubmit tracking
let activeFormFields = {}; // Stores data about fields currently in focus or recently blurred

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

// NEW FUNCTION: Get a friendly, human-readable name for an element
function getElementFriendlyName(element) {
    if (!element) return '';

    let name = '';

    // 1. ARIA Label (high priority)
    name = element.getAttribute('aria-label');
    if (name && name.trim()) return name.trim();

    // 2. Specific element types
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        name = getFieldLabel(element); // getFieldLabel is quite comprehensive
        if (name && name.trim()) return name.trim();
        name = element.placeholder;
        if (name && name.trim()) return name.trim();
        name = element.name;
        if (name && name.trim()) return name.trim();
        name = element.id;
        if (name && name.trim()) return name.trim();
    } else if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'button', 'a', 'p', 'span', 'div', 'li', 'td', 'th'].includes(tagName)) {
        // For common text-bearing elements, get textContent
        name = element.textContent;
        if (name) {
            name = name.replace(/\s+/g, ' ').trim();
            if (name.length > 75) { // Max length for readability
                name = name.substring(0, 72) + '...';
            }
            if (name) return name;
        }
    }

    // 3. Element ID (generic)
    name = element.id;
    if (name && name.trim()) return name.trim();

    // 4. Element Name attribute (generic)
    name = element.name;
    if (name && name.trim()) return name.trim();
    
    // 5. Element Title attribute
    name = element.title;
    if (name && name.trim()) return name.trim();

    // Fallback to tag name if no other name found
    return tagName;
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
    
    // Clone the events to send
    const eventsToSend = {
        hover: [...nonTransitionalEvents.hover],
        mousemove: {
            heatmap: nonTransitionalEvents.mousemove.heatmap.map(row => [...row]),
            totalDistance: nonTransitionalEvents.mousemove.totalDistance, // This is event-specific distance for the batch
            averageSpeed: 0 // Will be calculated below
        },
        keyTyping: { 
            fields: (nonTransitionalEvents.keyTyping && nonTransitionalEvents.keyTyping.fields) ? 
                    {...nonTransitionalEvents.keyTyping.fields} : 
                    {}
        },
        inactivity: [...nonTransitionalEvents.inactivity],
        escapeBackspace: [...nonTransitionalEvents.escapeBackspace],
        keyTypingCadence: [...nonTransitionalEvents.keyTypingCadence],
        tabNavigation: [...nonTransitionalEvents.tabNavigation],
        repeatedClicks: [...nonTransitionalEvents.repeatedClicks],
        copyText: [...nonTransitionalEvents.copyText],
        pasteWithoutTyping: [...nonTransitionalEvents.pasteWithoutTyping],
        repeatedInputs: [...nonTransitionalEvents.repeatedInputs],
        oscillatingHovers: [...nonTransitionalEvents.oscillatingHovers],
        keydownWithoutSubmit: [...nonTransitionalEvents.keydownWithoutSubmit],
        inputFieldIdle: [...nonTransitionalEvents.inputFieldIdle],
        allKeyPresses: [...nonTransitionalEvents.allKeyPresses],
        deadClicks: [...nonTransitionalEvents.deadClicks],
        scrollEvents: [...nonTransitionalEvents.scrollEvents],
        dropdownToggle: [...nonTransitionalEvents.dropdownToggle],
        inputContent: nonTransitionalEvents.inputContent ? [...nonTransitionalEvents.inputContent] : [] // Add inputContent
    };
    
    // Clone the current state of nonTransitionalMetrics to send
    const metricsToSend = {...nonTransitionalMetrics};
    // Ensure the scope is explicitly set for this send operation, if not already
    if (!metricsToSend.metricsScope) {
        metricsToSend.metricsScope = "per_state_reset"; // Default if somehow missed
    }
    
    // Calculate averageSpeed for the events batch
    if (eventsToSend.mousemove.totalDistance > 0 && currentBatchMouseActiveTime > 0) {
        eventsToSend.mousemove.averageSpeed = eventsToSend.mousemove.totalDistance / (currentBatchMouseActiveTime / 1000); // pixels per second
    } else {
        eventsToSend.mousemove.averageSpeed = 0; // Default to 0 if no distance or no active time
    }

    console.log('[DOM Tracker] Preparing to send non-transitional data:', 
                { stateId: lastStateId, eventsToLog: JSON.parse(JSON.stringify(eventsToSend)), metricsToLog: JSON.parse(JSON.stringify(metricsToSend)) }
              );
    
    // Reset ONLY the event arrays and batch-specific data in nonTransitionalEvents.
    // The counters in nonTransitionalMetrics are NOT reset here.
    nonTransitionalEvents.hover = [];
    nonTransitionalEvents.mousemove = {
        heatmap: initializeHeatmap(), // Reset heatmap for next batch
        totalDistance: 0, // Reset batch-specific distance
        averageSpeed: 0
    };
    nonTransitionalEvents.keyTyping = { fields: {} };
    nonTransitionalEvents.inactivity = [];
    nonTransitionalEvents.escapeBackspace = [];
    nonTransitionalEvents.keyTypingCadence = [];
    nonTransitionalEvents.tabNavigation = [];
    nonTransitionalEvents.repeatedClicks = [];
    nonTransitionalEvents.copyText = [];
    nonTransitionalEvents.pasteWithoutTyping = [];
    nonTransitionalEvents.repeatedInputs = [];
    nonTransitionalEvents.oscillatingHovers = [];
    nonTransitionalEvents.keydownWithoutSubmit = [];
    nonTransitionalEvents.inputFieldIdle = [];
    nonTransitionalEvents.allKeyPresses = [];
    nonTransitionalEvents.deadClicks = [];
    nonTransitionalEvents.scrollEvents = [];
    nonTransitionalEvents.dropdownToggle = [];
    nonTransitionalEvents.inputContent = []; // Reset inputContent array
    
    // Reset batch-specific mouse active time
    currentBatchMouseActiveTime = 0;
    
    // Check if there are any actual events to send (metrics will always be sent if a state exists)
    const noEvents = eventsToSend.hover.length === 0 &&
        eventsToSend.mousemove.totalDistance === 0 && // Check actual distance, not just heatmap
        Object.keys(eventsToSend.keyTyping.fields).length === 0 &&
        eventsToSend.inactivity.length === 0 &&
        eventsToSend.escapeBackspace.length === 0 &&
        eventsToSend.keyTypingCadence.length === 0 &&
        eventsToSend.tabNavigation.length === 0 &&
        eventsToSend.repeatedClicks.length === 0 &&
        eventsToSend.copyText.length === 0 &&
        eventsToSend.pasteWithoutTyping.length === 0 &&
        eventsToSend.repeatedInputs.length === 0 &&
        eventsToSend.oscillatingHovers.length === 0 &&
        eventsToSend.keydownWithoutSubmit.length === 0 &&
        eventsToSend.inputFieldIdle.length === 0 &&
        eventsToSend.allKeyPresses.length === 0 &&
        eventsToSend.deadClicks.length === 0 &&
        eventsToSend.scrollEvents.length === 0 &&
        eventsToSend.dropdownToggle.length === 0 &&
        eventsToSend.inputContent.length === 0;

    // Only send if there are events OR if dwellTimeBeforeAction has been captured for the current state
    // (This ensures metrics are sent for a state even if no other non-transitional events occurred after dwell time capture)
    if (noEvents && metricsToSend.dwellTimeBeforeAction === 0) {
         // If also no dwell time captured yet for this state's metrics, and no other events, then maybe skip.
         // However, metrics like idle time might still be relevant. For now, send if metrics object has stateStartTime.
        if (!metricsToSend.stateStartTime) {
            console.log("[DOM Tracker] No events to send and no state start time in metrics, skipping non-transitional send.");
            return;
        }
    }
    
    try {
        console.log(`[DOM Tracker] Sending non-transitional events for state: ${lastStateId}`);
        
        const result = await sendToBackground('saveNonTransitionalEvents', {
            stateId: lastStateId,
            sessionId: sessionId,
            userId: userId,
            events: eventsToSend, 
            metrics: metricsToSend
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
    // Variables for tracking oscillating hovers
    let hoverHistory = [];
    const MAX_HOVER_HISTORY = 10;
    const MIN_OSCILLATION_LENGTH = 2; // Reduced from 3 to 2 to require fewer hover events
    
    // Track mouseover for hover
    document.addEventListener('mouseover', event => {
        if (!isRecording) return;
        
        // End previous hover if there is one
        if (currentHoverElement && hoverStartTime) {
            const hoverEndTime = Date.now();
            const duration = hoverEndTime - hoverStartTime;
            
            // Only record if hover was longer than 50ms to avoid tracking quick mouse movements
            // Reduced from 100ms to 50ms to capture more hovers
            if (duration > 50) {
                const elementInfo = getElementInfo(currentHoverElement);
                const elementName = getElementFriendlyName(currentHoverElement); // Get friendly name
                
                const hoverEvent = {
                    element: currentHoverElement.tagName.toLowerCase(),
                    selector: elementInfo.selector,
                    name: elementName, // Add name to hover event
                    duration: duration,
                    timestamp: new Date(hoverStartTime)
                };
                
                nonTransitionalEvents.hover.push(hoverEvent);
                
                // Update total hover time
                nonTransitionalMetrics.totalHoverTime += duration;
                
                // Add to hover history for oscillation detection
                hoverHistory.push(hoverEvent);
                if (hoverHistory.length > MAX_HOVER_HISTORY) {
                    hoverHistory.shift(); // Remove oldest hover
                }
                
                // Check for oscillating hover patterns
                detectOscillatingHovers(hoverHistory);
                
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
            
            // Only record if hover was longer than 50ms
            // Reduced from 100ms to 50ms to capture more hovers
            if (duration > 50) {
                const elementInfo = getElementInfo(currentHoverElement);
                const elementName = getElementFriendlyName(currentHoverElement); // Get friendly name
                
                const hoverEvent = {
                    element: currentHoverElement.tagName.toLowerCase(),
                    selector: elementInfo.selector,
                    name: elementName, // Add name to hover event
                    duration: duration,
                    timestamp: new Date(hoverStartTime)
                };
                
                nonTransitionalEvents.hover.push(hoverEvent);
                
                // Update total hover time
                nonTransitionalMetrics.totalHoverTime += duration;
                
                // Add to hover history for oscillation detection
                hoverHistory.push(hoverEvent);
                if (hoverHistory.length > MAX_HOVER_HISTORY) {
                    hoverHistory.shift(); // Remove oldest hover
                }
                
                // Check for oscillating hover patterns
                detectOscillatingHovers(hoverHistory);
                
                scheduleNonTransitionalSend();
            }
            
            // Reset hover tracking
            currentHoverElement = null;
            hoverStartTime = null;
        }
    });
    
    // Function to detect oscillating hover patterns
    function detectOscillatingHovers(history) {
        console.log(`[DOM Tracker][DEBUG] Checking for oscillating hovers with history length: ${history.length}`);
        
        if (history.length < MIN_OSCILLATION_LENGTH) {
            console.log(`[DOM Tracker][DEBUG] Not enough hover history (${history.length}) to detect pattern`);
            return;
        }
        
        // Check the most recent hovers to detect oscillation pattern A->B->A->B...
        const recentHovers = history.slice(-6); // Look at the last 6 hovers
        console.log(`[DOM Tracker][DEBUG] Recent hover selectors: ${recentHovers.map(h => h.selector).join(' -> ')}`);
        
        // Map of selectors to their indices in the hover sequence
        const selectorIndices = {};
        recentHovers.forEach((hover, index) => {
            if (!selectorIndices[hover.selector]) {
                selectorIndices[hover.selector] = [];
            }
            selectorIndices[hover.selector].push(index);
        });
        
        console.log(`[DOM Tracker][DEBUG] Selector occurrences: ${JSON.stringify(selectorIndices)}`);
        
        // Get selectors that appeared multiple times
        const oscillatingSelectors = Object.keys(selectorIndices).filter(
            selector => selectorIndices[selector].length >= 2
        );
        
        console.log(`[DOM Tracker][DEBUG] Potential oscillating selectors: ${oscillatingSelectors.join(', ')}`);
        
        // Check if we have at least 2 elements involved in oscillation
        if (oscillatingSelectors.length >= 2) {
            // Look for alternating pattern between any 2 or 3 elements
            const startTime = recentHovers[0].timestamp;
            const endTime = recentHovers[recentHovers.length - 1].timestamp;
            const totalDuration = endTime - startTime;
            const totalSwitches = recentHovers.length - 1;
            
            // Make time threshold more permissive - allow up to 5 seconds between switches
            const avgTimeBetweenSwitches = totalDuration / totalSwitches;
            console.log(`[DOM Tracker][DEBUG] Avg time between switches: ${avgTimeBetweenSwitches}ms`);
            
            if (avgTimeBetweenSwitches < 5000) { // Increased from 2000ms to 5000ms
                // Extract the segments that form the oscillation pattern
                const segments = oscillatingSelectors.map(selector => {
                    const hoverForSelector = recentHovers.find(h => h.selector === selector);
                    return {
                        element: hoverForSelector.element,
                        selector: selector,
                        occurrences: selectorIndices[selector].length
                    };
                });
                
                // Create oscillation event
                nonTransitionalEvents.oscillatingHovers.push({
                    elements: segments,
                    totalSwitches: totalSwitches,
                    duration: totalDuration,
                    timestamp: startTime,
                    hoverPattern: recentHovers.map(h => h.selector)
                });
                
                console.log(`[DOM Tracker] Oscillating hover pattern detected between ${oscillatingSelectors.join(' and ')}`);
                console.log(`[DOM Tracker] Total switches: ${totalSwitches}, duration: ${totalDuration}ms`);
                
                scheduleNonTransitionalSend();
            } else {
                console.log(`[DOM Tracker][DEBUG] Switches too slow (${avgTimeBetweenSwitches}ms) to be considered oscillating`);
            }
        } else {
            console.log(`[DOM Tracker][DEBUG] Not enough repeating elements to detect oscillation`);
        }
    }
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
            
            // Add to active time: Calculate duration of this specific mouse movement segment
            if (lastMouseMoveTime) { // Only add duration if it's not the first movement point of this activity burst
                 currentBatchMouseActiveTime += (currentTime - lastMouseMoveTime); // currentTime is from the start of the event listener
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
    
    // REMOVED scroll listener from here as it's now in setupScrollTracking
    // document.addEventListener('scroll', () => {
    //     if (!isRecording) return;
    //     
    //     // Update scroll position
    //     scrollPosition = { x: window.scrollX, y: window.scrollY };
    // });
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
        
        // Prevent double counting by checking if we've counted this keystroke recently
        const keyTime = Date.now();
        if (keyTime - lastRecordedKeyTime > DUPLICATE_THRESHOLD) {
            // Increment the total keystrokes counter for ALL keys, not just in input fields
            nonTransitionalMetrics.totalKeystrokes++;
            lastRecordedKeyTime = keyTime;
            console.log(`[DOM Tracker] Keystroke recorded: ${key}, total: ${nonTransitionalMetrics.totalKeystrokes}`);
        } else {
            console.log(`[DOM Tracker] Prevented duplicate keystroke: ${key}, time diff: ${keyTime - lastRecordedKeyTime}ms`);
        }

        // Reset input idle timer when typing occurs
        if (isInputField && fieldId) {
            // Make sure current focused element is set
            if (!currentFocusedInput) {
                currentFocusedInput = element;
                inputFocusTime = Date.now();
            }
            
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
                        
                        console.log(`[DOM Tracker] Input field idle threshold reached for ${fieldId}: ${idleDuration}ms`);
                        
                        nonTransitionalEvents.inputFieldIdle.push({
                            field: fieldId,
                            label: fieldLabel,
                            placeholder: element.placeholder || '',
                            fieldType: fieldType,
                            formId: formId,
                            formName: formName,
                            url: window.location.href,
                            page: document.title,
                            eventType: 'idle_after_typing',
                            duration: idleDuration,
                            valueChanged: valueChanged,
                            initialValue: initialValue,
                            currentValue: element.type === 'password' ? '[password]' : currentValue,
                            timestamp: new Date(lastInputActivityTime)
                        });
                        
                        scheduleNonTransitionalSend();
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
        
        // Key typing cadence tracking
        const cadenceTime = Date.now();
        
        // FIXED: Only track cadence for input fields, not document-level
        if (isInputField && fieldId) {
            if (lastKeyTime[fieldId]) {
                const timeBetweenKeystrokes = cadenceTime - lastKeyTime[fieldId];
                if (timeBetweenKeystrokes >= 10 && timeBetweenKeystrokes <= 5000) {
                    // Save the actual key value for the prototype
                    // For single character keys or special keys, use the actual value
                    nonTransitionalEvents.keyTypingCadence.push({
                        field: fieldId,
                        key: key, // Use the actual key value
                        timeSinceLast: timeBetweenKeystrokes,
                        timestamp: new Date()
                    });
                    scheduleNonTransitionalSend();
                }
            }
            lastKeyTime[fieldId] = cadenceTime;
            
            if (keyCadenceTimers[fieldId]) {
                clearTimeout(keyCadenceTimers[fieldId]);
            }
            
            keyCadenceTimers[fieldId] = setTimeout(() => {
                if (lastKeyTime[fieldId]) {
                    const endTime = Date.now();
                    const typingDuration = endTime - lastKeyTime[fieldId];
                    if (typingDuration > 500) {
                        nonTransitionalEvents.keyTypingCadence.push({
                            field: fieldId,
                            key: 'sequence_end',
                            timeSinceLast: typingDuration,
                            timestamp: new Date()
                        });
                        scheduleNonTransitionalSend();
                    }
                    delete lastKeyTime[fieldId];
                }
            }, 1500);
            
            // ADDED: Track input field content changes
            if (!nonTransitionalEvents.inputContent) {
                nonTransitionalEvents.inputContent = [];
            }
            
            // Only track content for non-password fields
            if (element.type !== 'password') {
                const maxContentLength = 50; // Limit content length for privacy/storage
                const currentContent = element.value || '';
                const truncatedContent = currentContent.length <= maxContentLength ? 
                    currentContent : 
                    currentContent.substring(0, maxContentLength) + '...';
                
                // Track every 5th keystroke to avoid excessive data
                if (nonTransitionalMetrics.totalKeystrokes % 5 === 0) {
                    nonTransitionalEvents.inputContent.push({
                        field: fieldId,
                        content: truncatedContent,
                        length: currentContent.length,
                        timestamp: new Date()
                    });
                    scheduleNonTransitionalSend();
                }
            }
        }
        
        // Remove document-level cadence tracking entirely
        // REMOVED: lastKeyTime['document'] and related code
        
        // Track Escape and Backspace keys for all elements
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
            
            // Remove double counting here since we already increment above
            // nonTransitionalMetrics.totalKeystrokes++;
            
            scheduleNonTransitionalSend();
            // Do not return here if it's backspace and an input field, 
            // as repeatedInput logic needs to handle backspace too.
        }
        
        // Only track keystrokes in input elements for regular typing (keyTyping.fields - existing logic)
        if (!isInputField) {
            return;
        }
        const inputFieldId = fieldId; // Already derived

        // NEW: Mark that typing has occurred for keydownWithoutSubmit
        if (activeFormFields[inputFieldId]) {
            activeFormFields[inputFieldId].typedIn = true;
            // Update currentValue on each keydown to reflect the latest state if they abandon
            if (element.type !== 'password') { // Don't store password values directly
                 activeFormFields[inputFieldId].currentValue = element.value;
            } else {
                 activeFormFields[inputFieldId].currentValue = '[password]';
            }
        }

        if (!nonTransitionalEvents.keyTyping.fields[inputFieldId]) {
            nonTransitionalEvents.keyTyping.fields[inputFieldId] = {
                keystrokes: 0,
                lastUpdated: new Date()
            };
        }
        nonTransitionalEvents.keyTyping.fields[inputFieldId].keystrokes++;
        nonTransitionalEvents.keyTyping.fields[inputFieldId].lastUpdated = new Date();
        
        // Remove double counting
        // if (key !== 'Escape' && key !== 'Backspace') {
        //    nonTransitionalMetrics.totalKeystrokes++;
        // }
        
        scheduleNonTransitionalSend();
    });

    // Track focus events on input fields
    document.addEventListener('focus', event => {
        if (!isRecording) return;
        
        const element = event.target;
        if (element && (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea')) {
            const fieldId = element.id || element.name || getElementPath(element);
            
            // NEW: Setup for keydownWithoutSubmit
            // Store initial value, don't store password values directly
            let initialVal = element.value;
            if (element.type === 'password') {
                initialVal = element.value ? '[password]' : '';
            }
            activeFormFields[fieldId] = {
                element: element,
                initialValue: initialVal,
                typedIn: false,
                currentValue: initialVal, // Initialize currentValue with initialValue
                form: element.form // Store a reference to the parent form
            };
            
            // Input field idle tracking - set up tracking variables
            currentFocusedInput = element;
            inputFocusTime = Date.now();
            lastInputActivityTime = Date.now();
            
            // Store initial value for comparison when idle period ends
            element.dataset.initialValue = element.type === 'password' ? '[password]' : element.value;
            
            // Clear any existing idle timer for this or other fields
            if (inputIdleTimer) {
                clearTimeout(inputIdleTimer);
            }
            
            // Set a new idle timer
            inputIdleTimer = setTimeout(() => {
                if (currentFocusedInput === element) {
                    const idleDuration = Date.now() - lastInputActivityTime;
                    
                    // Get enhanced field information
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
                    
                    console.log(`[DOM Tracker] Input field idle detected for ${fieldId}: ${idleDuration}ms`);
                    
                    nonTransitionalEvents.inputFieldIdle.push({
                        field: fieldId,
                        label: fieldLabel,
                        placeholder: element.placeholder || '',
                        fieldType: fieldType,
                        formId: formId,
                        formName: formName,
                        url: window.location.href,
                        page: document.title,
                        eventType: 'idle_threshold_reached',
                        duration: idleDuration,
                        valueChanged: valueChanged,
                        initialValue: initialValue,
                        currentValue: element.type === 'password' ? '[password]' : currentValue,
                        timestamp: new Date(lastInputActivityTime)
                    });
                    
                    scheduleNonTransitionalSend();
                }
            }, inputIdleThreshold);
            
            // Store current value as previous value (existing code for other features)
            // ... (rest of existing focus listener code) ...
        }
    }, true); // Use capture for focus

    // Track blur events on input fields
    document.addEventListener('blur', event => {
        if (!isRecording) return;
        
        const element = event.target;
        if (element && (element.tagName.toLowerCase() === 'input' || element.tagName.toLowerCase() === 'textarea')) {
            const fieldId = element.id || element.name || getElementPath(element);

            // NEW: Check for keydownWithoutSubmit
            if (activeFormFields[fieldId]) {
                const fieldData = activeFormFields[fieldId];
                // Update currentValue one last time on blur
                let finalValue = element.value;
                if (element.type === 'password') {
                    finalValue = element.value ? '[password]' : '';
                }
                fieldData.currentValue = finalValue;

                if (fieldData.typedIn && fieldData.currentValue !== fieldData.initialValue) {
                    let formLikelySubmitted = false;
                    if (fieldData.form && fieldData.form.dataset.submitted === 'true') {
                        formLikelySubmitted = true;
                        // Important: Reset the flag for this form for future interactions
                        // Do this in the submit handler to ensure it's clean for any field from that form
                    }

                    if (!formLikelySubmitted) {
                        console.log(`[DOM Tracker] Logging keydownWithoutSubmit for field: ${fieldId}`);
                        nonTransitionalEvents.keydownWithoutSubmit.push({
                            field: fieldId,
                            value: fieldData.currentValue, // Use the potentially masked value
                            timestamp: new Date()
                        });
                        scheduleNonTransitionalSend();
                    }
                }
                // Remove from active tracking whether event was sent or not
                delete activeFormFields[fieldId]; 
            }
            
            // Handle input field idle tracking on blur
            if (currentFocusedInput === element && lastInputActivityTime) {
                // Clear the idle timer
                if (inputIdleTimer) {
                    clearTimeout(inputIdleTimer);
                    inputIdleTimer = null;
                }
                
                // Calculate how long the field has been idle before blur
                const idleDuration = Date.now() - lastInputActivityTime;
                
                // If the field was idle for longer than our threshold, record it
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
                        eventType: 'field_blur_after_idle',
                        duration: idleDuration,
                        valueChanged: valueChanged,
                        initialValue: initialValue,
                        currentValue: element.type === 'password' ? '[password]' : currentValue,
                        timestamp: new Date(lastInputActivityTime)
                    });
                    
                    console.log(`[DOM Tracker] Input field idle detected on blur for ${fieldId}: ${idleDuration}ms`);
                    scheduleNonTransitionalSend();
                }
                
                // Reset tracking variables
                currentFocusedInput = null;
                inputFocusTime = null;
                lastInputActivityTime = null;
            }
            
            // Existing code for clearing input history for repeated inputs
            if (fieldInputHistory[fieldId]) {
                delete fieldInputHistory[fieldId];
            }
        }
    }, true); // Use capture for blur

    // Add keyup listener specifically for ESC key detection
    // This is the most reliable way to catch ESC even when browser UI intercepts keydown
    document.addEventListener('keyup', event => {
        if (!isRecording) return;
        
        if (event.key === 'Escape') {
            console.log('[DOM Tracker] ESC key detected via keyup!', {
                isTrusted: event.isTrusted,
                target: event.target?.tagName,
                activeElement: document.activeElement?.tagName
            });
            
            // Only record if it's a trusted event (from user, not simulated)
            if (event.isTrusted) {
                const element = event.target || document.activeElement;
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
                    key: 'Escape',
                    source: 'keyup_event',
                    timestamp: new Date()
                });
                
                console.log('[DOM Tracker] Recorded ESC key via keyup event');
                scheduleNonTransitionalSend();
            }
        }
    }, true); // Use capture phase to intercept early
    
    // Enhanced blur detection for ESC key inference
    // Add this to your existing blur event listener
    document.addEventListener('blur', event => {
        if (!isRecording) return;
        
        const element = event.target;
        if (element && element.tagName.toLowerCase() === 'input') {
            // Check if the input has autocomplete and might have had a suggestion window
            const fieldId = element.id || element.name || getElementPath(element);
            const now = Date.now();
            
            // If blur happened very quickly after focus (< 500ms), it might be from ESC
            // Or if the element has browser autocomplete enabled
            if ((now - inputFocusTime < 500) || 
                (element.autocomplete !== 'off' && element.autocomplete !== 'new-password')) {
                
                console.log('[DOM Tracker] Possible ESC key detected via input blur');
                
                // Don't record if we already recorded an ESC key press in the last 100ms
                const recentEscPress = nonTransitionalEvents.escapeBackspace && 
                    nonTransitionalEvents.escapeBackspace.some(e => 
                        e.key === 'Escape' && 
                        (now - new Date(e.timestamp).getTime()) < 100
                    );
                
                if (!recentEscPress) {
                    if (!nonTransitionalEvents.escapeBackspace) {
                        nonTransitionalEvents.escapeBackspace = [];
                    }
                    
                    nonTransitionalEvents.escapeBackspace.push({
                        field: fieldId,
                        key: 'Escape',
                        source: 'blur_inference',
                        inferred: true,
                        timestamp: new Date()
                    });
                    
                    console.log('[DOM Tracker] Recorded inferred ESC key from input blur');
                    scheduleNonTransitionalSend();
                }
            }
        }
    }, true); // Use capture phase
    
    // Handle search inputs specifically for ESC detection
    document.addEventListener('search', event => {
        if (!isRecording) return;
        
        const element = event.target;
        if (element && element.tagName.toLowerCase() === 'input' && element.type === 'search') {
            const fieldId = element.id || element.name || getElementPath(element);
            
            console.log('[DOM Tracker] Search event detected (possibly ESC key)');
            
            if (!nonTransitionalEvents.escapeBackspace) {
                nonTransitionalEvents.escapeBackspace = [];
            }
            
            nonTransitionalEvents.escapeBackspace.push({
                field: fieldId,
                key: 'Escape',
                source: 'search_event',
                inferred: true,
                timestamp: new Date()
            });
            
            console.log('[DOM Tracker] Recorded ESC key via search event');
            scheduleNonTransitionalSend();
        }
    }, true);
}

// Setup click tracking
function setupClickTracking() {
    document.addEventListener('click', event => {
        if (!isRecording) return;
        
        // Prevent double counting by checking if we've counted this click recently
        const clickNow = Date.now();
        if (clickNow - lastRecordedClickTime > DUPLICATE_THRESHOLD) {
            // Make sure we increment the total click counter for ALL clicks
            nonTransitionalMetrics.totalClicks++;
            lastRecordedClickTime = clickNow;
            console.log(`[DOM Tracker] Click recorded. Total clicks: ${nonTransitionalMetrics.totalClicks}`);
        } else {
            console.log(`[DOM Tracker] Prevented duplicate click, time diff: ${clickNow - lastRecordedClickTime}ms`);
        }

        const element = event.target;

        // Determine if the click is "dead"
        let isDeadClick = true;
        if (element) {
            const tagName = element.tagName.toLowerCase();
            const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'details', 'summary'];
            const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'menuitem', 'tab', 'slider', 'textbox', 'option', 'treeitem'];
            
            if (interactiveTags.includes(tagName)) {
                isDeadClick = false;
            }
            // For inputs, some types are not inherently interactive for a "click" action in this context
            if (tagName === 'input' && ['hidden', 'image', 'reset', 'button', 'submit', 'checkbox', 'radio'].includes(element.type?.toLowerCase())){
                 isDeadClick = false;
            }
            if (element.hasAttribute('onclick') || 
                element.hasAttribute('href') || 
                (element.getAttribute('role') && interactiveRoles.includes(element.getAttribute('role'))) ||
                element.isContentEditable) {
                isDeadClick = false;
            }
            // Check style for pointer cursor as a hint, but not definitive
            const styles = window.getComputedStyle(element);
            if (styles.cursor === 'pointer') {
                 // Could still be a dead click if it's just styled to look interactive but does nothing.
                 // For simplicity, we won't make it not-dead based on cursor alone unless it's already determined interactive.
            }
        }

        if (isDeadClick) {
            const path = getElementPath(element);
            const friendlyName = getElementFriendlyName(element);
            const deadClickData = {
                timestamp: new Date(),
                targetElementTag: element ? element.tagName.toLowerCase() : 'unknown',
                targetElementId: element ? (element.id || 'N/A') : 'N/A',
                targetElementPath: path || 'N/A',
                targetElementFriendlyName: friendlyName || 'N/A',
                clientX: event.clientX,
                clientY: event.clientY
            };
            if (!nonTransitionalEvents.deadClicks) { // Defensive init
                nonTransitionalEvents.deadClicks = [];
            }
            nonTransitionalEvents.deadClicks.push(deadClickData);
        }
        
        scheduleNonTransitionalSend(); // Schedule sending of non-transitional events
    }, true); // Use capture phase to get all clicks
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

// Track additional dwell periods (idle times after activity)
function setupExtendedDwellTimeTracking() {
    console.log('[DOM Tracker] Setting up extended dwell time tracking');
    
    // Variables to track user activity state
    let isUserActive = true;
    let lastActivityTime = Date.now();
    const activityResetThreshold = 10000; // 10 seconds of no activity to count as a dwell period
    let dwellTimeMonitorInterval = null;
    
    // Function to handle user activity
    const handleUserActivity = () => {
        if (!isRecording) return;
        
        const now = Date.now();
        
        // If user was idle and is now active, calculate dwell time
        if (!isUserActive) {
            const dwellTime = now - lastActivityTime;
            console.log(`[DOM Tracker] User returned after ${dwellTime}ms of dwell time`);
            
            // Only record significant dwell periods (longer than threshold)
            if (dwellTime >= activityResetThreshold) {
                nonTransitionalEvents.inactivity.push({
                    duration: dwellTime,
                    timestamp: new Date(lastActivityTime),
                    trigger: "dwell_period_ended"
                });
                
                // Update total idle time metrics
                nonTransitionalMetrics.totalIdleTime += dwellTime;
                if (dwellTime > nonTransitionalMetrics.longestIdlePeriod) {
                    nonTransitionalMetrics.longestIdlePeriod = dwellTime;
                }
                
                scheduleNonTransitionalSend();
            }
            
            isUserActive = true;
        }
        
        // Reset the activity timer
        lastActivityTime = now;
        
        // Clear any existing timer
        if (dwellTimeMonitorInterval) {
            clearInterval(dwellTimeMonitorInterval);
        }
        
        // Set a new timer to check for inactivity
        dwellTimeMonitorInterval = setInterval(() => {
            const currentTime = Date.now();
            const timeSinceActivity = currentTime - lastActivityTime;
            
            // If inactive for the threshold period, mark as idle
            if (timeSinceActivity >= activityResetThreshold && isUserActive) {
                isUserActive = false;
                console.log(`[DOM Tracker] User became idle after ${activityResetThreshold}ms of inactivity`);
            }
        }, 1000); // Check every second
    };
    
    // Track activity events for dwell time monitoring
    const activityEvents = ['mousedown', 'keydown', 'scroll', 'click', 'mousemove', 'touchstart'];
    
    // Add listeners for all activity events
    activityEvents.forEach(eventType => {
        document.addEventListener(eventType, handleUserActivity, { passive: true });
    });
    
    // Initialize the monitoring
    handleUserActivity();
}

// Setup all non-transitional event tracking
function setupNonTransitionalTracking() {
    setupHoverTracking();
    setupMouseMoveTracking();
    setupKeyboardTracking(); // This now includes focus/blur listeners relevant to keydownWithoutSubmit
    setupClickTracking();
    setupInactivityTracking();
    setupTabNavigationTracking();
    setupRepeatedClicksTracking();
    setupCopyTextTracking();
    setupPasteTracking();
    setupFormSubmitTracking(); // NEW: Call the new setup function
    setupAllKeyPressesTracking(); // ADDED for all key presses
    setupScrollTracking(); // ADDED for scroll events
    setupDropdownTracking(); // ADDED for dropdown toggle events
    setupExtendedDwellTimeTracking(); // ADDED for better dwell time tracking
    
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

// NEW FUNCTION for all key presses
function setupAllKeyPressesTracking() {
    document.addEventListener('keydown', function(event) {
        if (!isRecording) return;

        // Ignore "Dead" keys if they cause issues or aren't needed
        if (event.key === "Dead") { 
            // console.log("Dead key detected, not logging for allKeyPresses.");
            return;
        }

        const target = event.target;
        const isInputField = target instanceof HTMLInputElement || 
                             target instanceof HTMLTextAreaElement || 
                             target.isContentEditable;
        
        let fieldIdentifier = 'N/A';
        if (isInputField) {
            fieldIdentifier = target.name || target.id || getElementPath(target) || 'Unnamed Field';
        }

        const pressData = {
            key: event.key,
            timestamp: Date.now(),
            targetElementTag: target.tagName ? target.tagName.toLowerCase() : 'unknown',
            targetElementId: target.id || 'N/A',
            targetElementPath: getElementPath(target) || 'N/A',
            isInputField: isInputField,
            fieldIdentifier: fieldIdentifier,
            // eventMeaning is defaulted in the backend schema
        };
        
        if (!nonTransitionalEvents.allKeyPresses) { // Defensive init
            nonTransitionalEvents.allKeyPresses = [];
        }
        nonTransitionalEvents.allKeyPresses.push(pressData);
        // console.log('AllKeyPresses Event:', pressData); // For debugging
        
        // scheduleNonTransitionalSend(); // This is usually called by other event handlers or the main interval
                                       // Call it here if immediate sending per key press is desired (can be noisy)

    }, true); // Use capture phase to get all key events, including those handled by other listeners
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

// New function to reset dwell time tracking for new states
function resetDwellTimeTracking() {
    // Only reset if we're recording
    if (!isRecording) return;
    
    // Reset the tracking variables
    window.stateLoadTime = Date.now();
    window.stateInteractionRecorded = false;
    
    // Remove previous event listeners if they exist
    if (window.stateInteractionHandlers) {
        for (const handler of window.stateInteractionHandlers) {
            document.removeEventListener(handler.event, handler.function, true);
        }
    }
    
    // Create new event handlers array
    window.stateInteractionHandlers = [];
    
    const stateInteractionHandler = () => {
        if (!window.stateInteractionRecorded && window.stateLoadTime) {
            const stateDwellTime = Date.now() - window.stateLoadTime;
            window.stateInteractionRecorded = true;
            
            // Log the dwell time for debugging
            console.log(`[DOM Tracker] First interaction with new state detected after ${stateDwellTime}ms of dwell time`);
            
            // Store dwell time in non-transitional metrics
            nonTransitionalMetrics.dwellTimeBeforeAction = stateDwellTime;
            
            // Schedule sending of metrics with the dwell time
            scheduleNonTransitionalSend();
            
            // Remove these event listeners since we only need the first interaction per state
            for (const handler of window.stateInteractionHandlers) {
                document.removeEventListener(handler.event, handler.function, true);
            }
        }
    };
    
    // Add event listeners for the first interaction with the new state
    const events = ['click', 'keydown', 'input', 'scroll'];
    for (const event of events) {
        document.addEventListener(event, stateInteractionHandler, true);
        window.stateInteractionHandlers.push({
            event: event,
            function: stateInteractionHandler
        });
    }
    
    console.log(`[DOM Tracker] Dwell time tracking reset for new state`);
}

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
        
        const { state, isNewState: isNewHash } = createDomState(); // isNewHash indicates if the hash is new, not necessarily if the state is new to the session
        state.hash = currentHash;
        
        let isTrulyNewStateForSession = false; // Flag to determine if we reset metrics

        if (isDuplicate || isPreviouslySeen) {
            state.isNewState = false; // This flag tells the backend not to create a new unique state entry if it can find the original by hash
            state.originalStateId = isPreviouslySeen ? previousStates[currentHash] : lastStateId;
        } else {
            state.isNewState = true; // This is a new hash, so it's a new state for the session
            isTrulyNewStateForSession = true;
        }
        
        state.mutationInfo = {
            count: significantMutations.length,
            types: [...new Set(significantMutations.map(m => m.type))],
            timestamp: now
        };
        
        pendingStateSends[currentHash] = true;
        
        sendToBackground('recordState', {
            state,
            isDuplicate: isDuplicate || isPreviouslySeen, // For background logic
            reusedStateId: isPreviouslySeen ? previousStates[currentHash] : null
        })
        .then(response => {
            if (response && response.stateId) {
                previousStates[currentHash] = response.stateId;
                lastStateId = response.stateId; // CRITICAL: Update lastStateId to the ID of the *just recorded* state
                
                console.log(`[DOM Tracker][DUPLICATION DEBUG] State processed: ${response.stateId}, currentHash: ${currentHash}`);

                // If background confirms it's a new, final (non-loading, non-duplicate) state, reset metrics.
                if (!response.isDuplicate && response.stateId && !response.stateId.startsWith('loading_')) {
                    console.log(`[DOM Tracker] Calling resetAllMetricsForNewState based on background response for new final state in processMutations: ${response.stateId}`);
                    resetAllMetricsForNewState();
                }
            } else {
                console.warn('[DOM Tracker][DUPLICATION DEBUG] Did not receive valid stateId from background script');
            }
            lastDomHash = currentHash;
        })
        .catch(error => {
            console.error('[DOM Tracker][DUPLICATION DEBUG] Error getting stateId from background:', error);
        })
        .finally(() => {
            setTimeout(() => { delete pendingStateSends[currentHash]; }, 350);
        });
        
    } catch (error) {
        console.error('[DOM Tracker][DUPLICATION DEBUG] Error processing mutations:', error);
    } finally {
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

        // NEW: Handle keydownWithoutSubmit for any remaining active fields on page unload
        console.log('[DOM Tracker] Beforeunload: Checking activeFormFields for keydownWithoutSubmit.');
        if (isRecording) { // Only process if recording
            for (const fieldId in activeFormFields) {
                const fieldData = activeFormFields[fieldId];
                // Update currentValue one last time from the element before checking
                if (fieldData.element) {
                     let finalUnloadValue = fieldData.element.value;
                     if (fieldData.element.type === 'password') {
                         finalUnloadValue = fieldData.element.value ? '[password]' : '';
                     }
                     fieldData.currentValue = finalUnloadValue;
                }

                if (fieldData.typedIn && fieldData.currentValue !== fieldData.initialValue) {
                    let formLikelySubmitted = false;
                    if (fieldData.form && fieldData.form.dataset.submitted === 'true') {
                        formLikelySubmitted = true;
                    }

                    if (!formLikelySubmitted) {
                        console.log(`[DOM Tracker] Logging keydownWithoutSubmit for field on unload: ${fieldId}`);
                        nonTransitionalEvents.keydownWithoutSubmit.push({
                            field: fieldId,
                            value: fieldData.currentValue,
                            timestamp: new Date() 
                        });
                    }
                }
            }
            // Attempt to send any batched non-transitional events.
            if (nonTransitionalEvents.keydownWithoutSubmit.length > 0) {
                 sendNonTransitionalEvents(); 
            }
        }
        activeFormFields = {}; 
    });
} // This closes setupReloadDetection

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

                    // Reset metrics if background confirms it's a new, final (non-loading, non-duplicate) state.
                    if (!response.isDuplicate && response.stateId && !response.stateId.startsWith('loading_')) {
                         console.log(`[DOM Tracker] Calling resetAllMetricsForNewState for forced capture state: ${response.stateId}`);
                         resetAllMetricsForNewState();
                    }
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

// Variables for debugging double counting
let lastRecordedKeyTime = 0;
let lastRecordedClickTime = 0;
const DUPLICATE_THRESHOLD = 10; // ms

// Start recording
function startRecording(newSessionId, newUserId) {
    if (isRecording) return;
    
    sessionId = newSessionId;
    userId = newUserId;
    
    // Reset state tracking
    previousStates = {};
    lastDomHash = null;
    
    // Reset dwell time tracking
    window.pageLoadTime = Date.now();
    window.firstInteractionRecorded = false;
    nonTransitionalMetrics.dwellTimeBeforeAction = 0;
    
    // Reset debugging variables
    lastRecordedKeyTime = 0;
    lastRecordedClickTime = 0;
    
    // Reset all metrics to ensure a clean start
    nonTransitionalMetrics = {
        totalIdleTime: 0,
        longestIdlePeriod: 0,
        dwellTimeBeforeAction: 0,
        totalMouseDistance: 0,
        totalKeystrokes: 0,
        totalClicks: 0,
        totalHoverTime: 0
    };
    
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
    
    // Set up reload detection (which now correctly includes its own beforeunload listener)
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
        
        // Initialize dwell time tracking - measure time from page load until first interaction
        if (isRecording) {
            window.pageLoadTime = Date.now();
            window.firstInteractionRecorded = false;
            
            // Add listener for first interaction
            const firstInteractionHandler = () => {
                if (!window.firstInteractionRecorded && window.pageLoadTime) {
                    const dwellTime = Date.now() - window.pageLoadTime;
                    window.firstInteractionRecorded = true;
                    nonTransitionalMetrics.dwellTimeBeforeAction = dwellTime;
                    console.log(`[DOM Tracker] First interaction detected after ${dwellTime}ms of dwell time`);
                    
                    // Schedule sending of metrics with the dwell time
                    scheduleNonTransitionalSend();
                    
                    // Remove these event listeners since we only need the first interaction
                    document.removeEventListener('click', firstInteractionHandler, true);
                    document.removeEventListener('keydown', firstInteractionHandler, true);
                    document.removeEventListener('input', firstInteractionHandler, true);
                    document.removeEventListener('scroll', firstInteractionHandler, true);
                }
            };
            
            // Listen for first interactions
            document.addEventListener('click', firstInteractionHandler, true);
            document.addEventListener('keydown', firstInteractionHandler, true);
            document.addEventListener('input', firstInteractionHandler, true);
            document.addEventListener('scroll', firstInteractionHandler, true);
        }
        
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
            const { state, isNewState } = createDomState(); // isNewState from createDomState refers to hash comparison locally
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
                    lastStateId = response.stateId; // Use lastStateId consistently
                    console.log(`[DOM Tracker][DUPLICATION DEBUG] Updated page load state tracking with server-assigned ID: ${response.stateId}`);
                    
                    // Always update lastDomHash to the current hash
                    lastDomHash = currentHash;
                    
                    // Reset metrics if background confirms it's a new, final (non-loading, non-duplicate) state.
                    if (!response.isDuplicate && response.stateId && !response.stateId.startsWith('loading_')) {
                        console.log(`[DOM Tracker] Calling resetAllMetricsForNewState for page load state: ${response.stateId}`);
                        resetAllMetricsForNewState();
                    }

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

// NEW: Add form submission listener
function setupFormSubmitTracking() {
    document.addEventListener('submit', event => {
        if (!isRecording) return;
        const form = event.target;
        if (form && form.tagName.toLowerCase() === 'form') {
            console.log('[DOM Tracker] Form submitted:', form.id || form.name || 'unnamed form');
            form.dataset.submitted = 'true'; // Mark the form as submitted

            // For all fields that were part of this form and are in activeFormFields,
            // they should not trigger keydownWithoutSubmit.
            // We can clear them from activeFormFields or rely on the blur check.
            // The blur check is more robust. Setting the flag is key.

            // Optional: Clean up the flag after a short delay to ensure blur events have fired
            // and to prepare for potential re-use of the form (e.g. in SPAs)
            setTimeout(() => {
                if (form.dataset.submitted) { // Check if still relevant
                    delete form.dataset.submitted;
                }
            }, 100); // Delay to allow blur events to process the flag
        }
    }, true); // Use capture phase
}

// NEW FUNCTION for scroll tracking
function setupScrollTracking() {
    let lastScrollTime = 0;
    const scrollDebounceTime = 200; // ms to wait after last scroll to record event
    // Store the previous scroll position to determine direction
    let previousScrollX = window.scrollX;
    let previousScrollY = window.scrollY;

    document.addEventListener('scroll', (event) => {
        if (!isRecording) return;

        const currentTime = Date.now();
        // Debounce scroll events to avoid flooding
        if (currentTime - lastScrollTime < scrollDebounceTime) {
            return;
        }
        lastScrollTime = currentTime;

        const scrollElement = event.target === document ? document.documentElement : event.target;
        
        // Get scroll position relative to the scrolled element or viewport
        const scrollX = scrollElement.scrollLeft !== undefined ? scrollElement.scrollLeft : window.scrollX;
        const scrollY = scrollElement.scrollTop !== undefined ? scrollElement.scrollTop : window.scrollY;
        
        // Determine scroll direction by comparing with previous values
        let directionX = 'none';
        let directionY = 'none';
        
        if (scrollX > previousScrollX) {
            directionX = 'right';
        } else if (scrollX < previousScrollX) {
            directionX = 'left';
        }
        
        if (scrollY > previousScrollY) {
            directionY = 'down';
        } else if (scrollY < previousScrollY) {
            directionY = 'up';
        }
        
        // Pick the primary direction based on which axis had more movement
        const deltaX = Math.abs(scrollX - previousScrollX);
        const deltaY = Math.abs(scrollY - previousScrollY);
        const primaryDirection = deltaX > deltaY ? directionX : directionY;
        
        // Calculate magnitude of the scroll
        const magnitudeX = Math.abs(scrollX - previousScrollX);
        const magnitudeY = Math.abs(scrollY - previousScrollY);
        const magnitude = Math.max(magnitudeX, magnitudeY);
        
        // Get the dimensions of the scrolled content and viewport/element
        const scrollHeight = scrollElement.scrollHeight;
        const scrollWidth = scrollElement.scrollWidth;
        const clientHeight = scrollElement.clientHeight;
        const clientWidth = scrollElement.clientWidth;

        // Calculate scroll depth percentages
        const scrollDepthY = scrollHeight > clientHeight ? (scrollY / (scrollHeight - clientHeight)) * 100 : 0;
        const scrollDepthX = scrollWidth > clientWidth ? (scrollX / (scrollWidth - clientWidth)) * 100 : 0;

        const scrollData = {
            timestamp: new Date(),
            targetElementTag: scrollElement.tagName ? scrollElement.tagName.toLowerCase() : 'document',
            targetElementId: scrollElement.id || 'N/A',
            targetElementPath: getElementPath(scrollElement),
            scrollX: Math.round(scrollX),
            scrollY: Math.round(scrollY),
            scrollDepthX: Math.round(scrollDepthX),
            scrollDepthY: Math.round(scrollDepthY),
            maxScrollX: scrollWidth,
            maxScrollY: scrollHeight,
            viewportWidth: clientWidth,
            viewportHeight: clientHeight,
            direction: primaryDirection,
            magnitude: magnitude,
            directionX: directionX,
            directionY: directionY,
            eventMeaning: `User scrolled ${primaryDirection} by ${magnitude}px.` 
        };

        // Update previous scroll positions for next event
        previousScrollX = scrollX;
        previousScrollY = scrollY;

        if (!nonTransitionalEvents.scrollEvents) { // Defensive init
            nonTransitionalEvents.scrollEvents = [];
        }
        nonTransitionalEvents.scrollEvents.push(scrollData);
        // console.log('Scroll Event recorded:', scrollData); 
        scheduleNonTransitionalSend();

        // Update global scrollPosition (used by heatmap in mousemove)
        // This should ideally be distinct or mousemove should get its own live scroll data
        // For now, maintaining this update:
        window.scrollPosition = { x: window.scrollX, y: window.scrollY };


    }, true); // Use capture phase to detect scrolls on any element
}

// NEW FUNCTION for dropdown toggle tracking
function setupDropdownTracking() {
    document.addEventListener('click', function(event) {
        if (!isRecording) return;

        let originalClickedElement = event.target; // CORRECTED: Added semicolon back / ensured let is correct
        let currentTarget = event.target;          // CORRECTED: Added semicolon back / ensured let is correct
        let isDropdownTrigger = false;
        let identifiedTriggerElement = null;

        // Check up to 3 parent levels OR if we hit a <select> directly
        for (let i = 0; i < 3 && currentTarget && currentTarget !== document.body; i++) {
            // CHECK 1: Is the currentTarget a <select> tag?
            if (currentTarget.tagName.toLowerCase() === 'select') {
                isDropdownTrigger = true;
                identifiedTriggerElement = currentTarget;
                break; 
            }

            // CHECK 2: ARIA patterns for custom dropdowns
            const hasPopup = currentTarget.getAttribute('aria-haspopup');
            if (hasPopup && (hasPopup === 'true' || hasPopup === 'menu' || hasPopup === 'listbox')) {
                isDropdownTrigger = true;
                identifiedTriggerElement = currentTarget;
                break;
            }
            if (currentTarget.hasAttribute('aria-expanded')) {
                isDropdownTrigger = true;
                identifiedTriggerElement = currentTarget;
                break;
            }
            
            // CHECK 3: Heuristic for common menu classes (mostly for custom dropdowns)
            // Check if currentTarget has a child that is a common menu, or if a sibling is.
            const commonMenuClasses = ['dropdown-menu', 'select-menu', 'options-list', 'dropdown']; // Added 'dropdown' as a common wrapper
            let foundMenuClass = false;
            if (currentTarget.children.length > 0) {
                for (const child of currentTarget.children) {
                    if (commonMenuClasses.some(cls => child.classList.contains(cls))) {
                        foundMenuClass = true; break;
                    }
                }
            }
            if (foundMenuClass) {
                isDropdownTrigger = true;
                identifiedTriggerElement = currentTarget;
                break;
            }

            // Check siblings only if currentTarget itself is not a likely candidate from above checks
            // This check is less reliable and more of a fallback for specific structures.
            // Consider if the originalClickedElement is the one that should be logged if a sibling menu is found.
            if (currentTarget.parentElement && currentTarget !== originalClickedElement) { // Avoid re-checking original if it has no specific attributes
                for (const sibling of currentTarget.parentElement.children) {
                    if (sibling !== currentTarget && commonMenuClasses.some(cls => sibling.classList.contains(cls))) {
                        // This implies originalClickedElement might be the trigger for a sibling menu.
                        // We should log originalClickedElement in this case.
                        isDropdownTrigger = true;
                        identifiedTriggerElement = originalClickedElement; // Log the element actually clicked
                        break;
                    }
                }
                if (foundMenuClass) break; // Break outer loop if found by sibling check
            }
            
            if (isDropdownTrigger) break;

            currentTarget = currentTarget.parentElement;
        }

        if (isDropdownTrigger && identifiedTriggerElement) {
            const path = getElementPath(identifiedTriggerElement);
            const friendlyName = getElementFriendlyName(identifiedTriggerElement); // Still needed for custom dropdowns
            let currentState = identifiedTriggerElement.getAttribute('aria-expanded'); // For custom dropdowns

            // Use setTimeout to allow the DOM to update after the click
            setTimeout(() => {
                let finalState = identifiedTriggerElement.getAttribute('aria-expanded'); // For custom dropdowns
                const isSelectElement = identifiedTriggerElement.tagName.toLowerCase() === 'select';

                const dropdownEvent = {
                    timestamp: new Date(),
                    elementTag: identifiedTriggerElement.tagName.toLowerCase(),
                    elementId: identifiedTriggerElement.id || 'N/A',
                    elementPath: path || 'N/A',
                    // elementFriendlyName and newState are added conditionally below
                };

                if (isSelectElement) {
                    dropdownEvent.eventMeaning = "Native select dropdown clicked.";
                    // For select elements, newState and elementFriendlyName are intentionally omitted.
                } else {
                    // This is a custom dropdown, use existing logic for newState and elementFriendlyName
                    let determinedNewState = "toggled"; 
                    let specificEventMeaning = "Dropdown toggled.";

                    if (currentState !== null && finalState !== null) { // Only if aria-expanded was present
                        if (currentState !== finalState) {
                            determinedNewState = finalState;
                            specificEventMeaning = finalState === "true" ? "Dropdown opened." : "Dropdown closed.";
                        } else {
                            determinedNewState = finalState; 
                            specificEventMeaning = finalState === "true" ? "Dropdown likely remained open." : "Dropdown likely remained closed.";
                        }
                    } else if (finalState !== null) {
                        determinedNewState = finalState;
                        specificEventMeaning = finalState === "true" ? "Dropdown became expanded." : "Dropdown became collapsed.";
                    }
                    dropdownEvent.newState = determinedNewState;
                    dropdownEvent.elementFriendlyName = friendlyName || 'N/A'; 
                    dropdownEvent.eventMeaning = specificEventMeaning;
                }

                if (!nonTransitionalEvents.dropdownToggle) { // Defensive init
                    nonTransitionalEvents.dropdownToggle = [];
                }
                
                nonTransitionalEvents.dropdownToggle.push(dropdownEvent);
                console.log('Dropdown Toggle Event:', dropdownEvent); // For debugging
                scheduleNonTransitionalSend();
            }, 0); // Small delay to catch attribute change
        } // This closes the if (isDropdownTrigger && identifiedTriggerElement)
    }, true); // Use capture phase
}

// NEW FUNCTION: To reset all metrics and set up dwell time for a new state
function resetAllMetricsForNewState() {
    if (!isRecording || !lastStateId) {
        console.log("[DOM Tracker] Cannot reset metrics - not recording or no lastStateId");
        return;
    }

    console.log(`[DOM Tracker] Resetting all metrics for new state: ${lastStateId}`);

    // Reset all counters in nonTransitionalMetrics
    nonTransitionalMetrics.totalIdleTime = 0;
    nonTransitionalMetrics.longestIdlePeriod = 0;
    nonTransitionalMetrics.dwellTimeBeforeAction = 0;
    nonTransitionalMetrics.totalMouseDistance = 0;
    nonTransitionalMetrics.totalKeystrokes = 0;
    nonTransitionalMetrics.totalClicks = 0;
    nonTransitionalMetrics.totalHoverTime = 0;
    // Add a note for the backend/DB that these metrics are for the current state
    nonTransitionalMetrics.metricsScope = "per_state_reset"; 
    nonTransitionalMetrics.stateStartTime = Date.now();

    // Clear previous dwell time listeners if any (use a more robust clearing mechanism)
    if (window.currentDwellTimeAbortController) {
        window.currentDwellTimeAbortController.abort();
    }
    window.currentDwellTimeAbortController = new AbortController();
    const { signal } = window.currentDwellTimeAbortController;

    // Set up dwell time for the current state (lastStateId)
    const stateStartTime = Date.now(); // Time this specific state became active
    let stateInteractionRecorded = false;

    const dwellTimeHandler = (event) => {
        if (!stateInteractionRecorded) {
            stateInteractionRecorded = true;
            const dwellTime = Date.now() - stateStartTime;
            nonTransitionalMetrics.dwellTimeBeforeAction = dwellTime;
            console.log(`[DOM Tracker] Dwell time for state ${lastStateId}: ${dwellTime}ms (Interaction: ${event.type})`);
            
            // Listeners are auto-removed due to AbortController signal
            // Schedule send after dwell time is captured
            scheduleNonTransitionalSend();
        }
    };

    const dwellEvents = ['click', 'keydown', 'input', 'scroll'];
    dwellEvents.forEach(eventType => {
        document.addEventListener(eventType, dwellTimeHandler, { capture: true, once: true, signal });
    });

    console.log(`[DOM Tracker] Dwell time listeners set up for state ${lastStateId}`);
}

