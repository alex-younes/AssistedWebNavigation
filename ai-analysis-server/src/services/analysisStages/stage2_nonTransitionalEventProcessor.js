/**
 * Stage 2: Non-Transitional Event Analyzer
 * 
 * This module provides analysis of user behavior between state transitions including:
 * 1. Mouse movement and hover patterns (heat maps, oscillating hovers)
 * 2. Keyboard behavior (typing cadence, escape/backspace)
 * 3. Idle time analysis (inactivity periods, field-specific hesitation)
 * 4. Click behavior (dead clicks, repeated clicks)
 * 5. Scroll behavior
 */

// Helper function to calculate statistics (min, max, stddev)
function calculateStats(arr) {
    if (!arr || arr.length === 0) return { min: 0, max: 0, stdDev: 0, count: 0, sum: 0 };
    const n = arr.length;
    const sum = arr.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const stdDev = Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / n);
    return {
        min: Math.min(...arr),
        max: Math.max(...arr),
        stdDev: n > 0 ? parseFloat(stdDev.toFixed(2)) : 0,
        count: n,
        sum,
        mean: parseFloat(mean.toFixed(2))
    };
}

/**
 * Processes non-transitional events data from a session
 * @param {Object} session - Session data containing non-transitional events
 * @returns {Object} Enhanced session with non-transitional event analysis
 */
async function processSessionForNonTransitionalEvents(session) {
    try {
        if (!session) return null;
        
        console.log(`[Stage 2] Processing non-transitional events for session: ${session.id || session.sessionId}`);
        
        // Clone the session to avoid modifying the original
        const enhancedSession = { ...session };
        
        // Initialize nonTransitionalAnalysis if it doesn't exist
        if (!enhancedSession.nonTransitionalAnalysis) {
            enhancedSession.nonTransitionalAnalysis = {
                summary: {},
                pointerAnalysis: {},
                keyboardAnalysis: {},
                idleAnalysis: {},
                clickAnalysis: {},
                scrollAnalysis: {}
            };
        }
        
        // Get all non-transitional event batches for this session
        const nonTransitionalEvents = session.nonTransitionalEvents || [];
        
        if (nonTransitionalEvents.length === 0) {
            console.log(`[Stage 2] No non-transitional events found for session: ${session.id || session.sessionId}`);
            enhancedSession.nonTransitionalAnalysis.summary = {
                eventCount: 0,
                hasData: false,
                message: "No non-transitional events recorded for this session"
            };
            return enhancedSession;
        }
        
        console.log(`[Stage 2] Found ${nonTransitionalEvents.length} non-transitional event batches`);
        
        // Process different types of non-transitional events
        const pointerAnalysis = analyzePointerBehavior(nonTransitionalEvents);
        const keyboardAnalysis = analyzeKeyboardBehavior(nonTransitionalEvents);
        const idleAnalysis = analyzeIdleBehavior(nonTransitionalEvents);
        const clickAnalysis = analyzeClickBehavior(nonTransitionalEvents);
        const scrollAnalysis = analyzeScrollBehavior(nonTransitionalEvents);
        
        // Store the analyses in the session object
        enhancedSession.nonTransitionalAnalysis = {
            summary: generateSummary(nonTransitionalEvents, pointerAnalysis, keyboardAnalysis, idleAnalysis, clickAnalysis, scrollAnalysis),
            pointerAnalysis,
            keyboardAnalysis,
            idleAnalysis,
            clickAnalysis,
            scrollAnalysis,
            raw: {
                eventCount: nonTransitionalEvents.length,
                sampleBatch: nonTransitionalEvents.length > 0 ? nonTransitionalEvents[0] : null
            }
        };
        
        console.log(`[Stage 2] Completed non-transitional events analysis for session: ${session.id || session.sessionId}`);
        return enhancedSession;
        
    } catch (error) {
        console.error(`[Stage 2] Error processing non-transitional events: ${error.message}`);
        console.error(error);
        return session; // Return original session on error
    }
}

/**
 * Analyzes pointer-related behavior (mouse movements, hovers)
 * @param {Array} events - Array of non-transitional event batches
 * @returns {Object} Analysis of pointer behavior
 */
function analyzePointerBehavior(events) {
    try {
        // Initialize analysis structure
        const analysis = {
            mousemoveSummary: {
                totalDistance: 0,
                averageSpeed: 0,
                heatmapAggregate: Array(10).fill().map(() => Array(10).fill(0))
            },
            hoverSummary: {
                totalHovers: 0,
                totalHoverTime: 0,
                averageHoverDuration: 0,
                hoversByElement: {},
                longestHover: null
            },
            oscillatingSummary: {
                totalOscillations: 0,
                averageSwitches: 0,
                patternDetails: []
            }
        };
        
        // Extract all hover events
        const allHovers = [];
        const allOscillations = [];
        
        // Process each event batch
        events.forEach(batch => {
            const batchEvents = batch.events || {};
            
            // Process mousemove data
            if (batchEvents.mousemove) {
                const mousemove = batchEvents.mousemove;
                analysis.mousemoveSummary.totalDistance += mousemove.totalDistance || 0;
                
                // Aggregate heatmap data
                if (mousemove.heatmap && Array.isArray(mousemove.heatmap)) {
                    mousemove.heatmap.forEach((row, rowIndex) => {
                        if (rowIndex < 10 && Array.isArray(row)) {
                            row.forEach((cellValue, colIndex) => {
                                if (colIndex < 10) {
                                    analysis.mousemoveSummary.heatmapAggregate[rowIndex][colIndex] += cellValue || 0;
                                }
                            });
                        }
                    });
                }
            }
            
            // Process hover events
            if (batchEvents.hover && Array.isArray(batchEvents.hover)) {
                batchEvents.hover.forEach(hover => {
                    allHovers.push(hover);
                    
                    // Track element frequencies
                    const selector = hover.selector || "unknown";
                    if (!analysis.hoverSummary.hoversByElement[selector]) {
                        analysis.hoverSummary.hoversByElement[selector] = {
                            count: 0,
                            totalDuration: 0,
                            element: hover.element || "",
                            name: hover.name || selector
                        };
                    }
                    
                    analysis.hoverSummary.hoversByElement[selector].count++;
                    analysis.hoverSummary.hoversByElement[selector].totalDuration += hover.duration || 0;
                    
                    // Track longest hover
                    if (!analysis.hoverSummary.longestHover || 
                        (hover.duration > analysis.hoverSummary.longestHover.duration)) {
                        analysis.hoverSummary.longestHover = hover;
                    }
                });
            }
            
            // Process oscillating hover patterns
            if (batchEvents.oscillatingHovers && Array.isArray(batchEvents.oscillatingHovers)) {
                batchEvents.oscillatingHovers.forEach(osc => {
                    allOscillations.push(osc);
                    
                    // Only keep detailed info for significant oscillations (4+ switches)
                    if (osc.totalSwitches >= 4) {
                        analysis.oscillatingSummary.patternDetails.push({
                            elements: osc.elements || [],
                            totalSwitches: osc.totalSwitches,
                            duration: osc.duration,
                            timestamp: osc.timestamp
                        });
                    }
                });
            }
        });
        
        // Calculate summary metrics
        analysis.hoverSummary.totalHovers = allHovers.length;
        analysis.hoverSummary.totalHoverTime = allHovers.reduce((sum, h) => sum + (h.duration || 0), 0);
        analysis.hoverSummary.averageHoverDuration = allHovers.length > 0 ? 
            analysis.hoverSummary.totalHoverTime / allHovers.length : 0;
            
        analysis.oscillatingSummary.totalOscillations = allOscillations.length;
        analysis.oscillatingSummary.averageSwitches = allOscillations.length > 0 ?
            allOscillations.reduce((sum, o) => sum + (o.totalSwitches || 0), 0) / allOscillations.length : 0;
            
        // Sort hover elements by frequency
        analysis.hoverSummary.topHoverTargets = Object.entries(analysis.hoverSummary.hoversByElement)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10)
            .map(([selector, data]) => ({
                selector,
                element: data.element,
                name: data.name,
                count: data.count,
                totalDuration: data.totalDuration,
                averageDuration: data.count > 0 ? data.totalDuration / data.count : 0
            }));
            
        return analysis;
        
    } catch (error) {
        console.error(`[Pointer Analysis] Error: ${error.message}`);
        return {
            error: error.message,
            mousemoveSummary: { totalDistance: 0 },
            hoverSummary: { totalHovers: 0 },
            oscillatingSummary: { totalOscillations: 0 }
        };
    }
}

/**
 * Analyzes keyboard-related behavior (keystrokes, typing cadence, escape/backspace)
 * @param {Array} events - Array of non-transitional event batches
 * @returns {Object} Analysis of keyboard behavior
 */
function analyzeKeyboardBehavior(events) {
    try {
        // Initialize analysis structure
        const analysis = {
            keyPressSummary: {
                totalKeyPresses: 0,
                keysByField: {},
                keysByType: {
                    'Escape': 0,
                    'Backspace': 0,
                    'Enter': 0,
                    'Tab': 0,
                    'ArrowKeys': 0,
                    'Space': 0,
                    'Alphanumeric': 0,
                    'Other': 0
                }
            },
            typingCadenceSummary: {
                averageCadenceMs: 0,
                fastestCadenceMs: Infinity,
                slowestCadenceMs: 0,
                cadenceDistribution: {
                    veryFast: 0,   // <= 50ms (rage typing)
                    fast: 0,        // 51-100ms
                    normal: 0,      // 101-250ms
                    thoughtful: 0,  // 251-500ms
                    slow: 0,        // 501-1000ms
                    verySlow: 0     // > 1000ms
                }
            },
            escapeBackspaceSummary: {
                totalEscapes: 0,
                totalBackspaces: 0,
                escapesInferred: 0,
                backspacesConsecutive: 0,
                fieldEscapeCount: {},
                fieldBackspaceCount: {}
            },
            repeatedInputsSummary: {
                totalRepeatedPatterns: 0,
                patternDetails: []
            }
        };
        
        // Extract all keyboard-related events
        const allKeyPresses = [];
        const allTypingCadence = [];
        const allEscapeBackspace = [];
        const allRepeatedInputs = [];
        
        // Process each event batch
        events.forEach(batch => {
            const batchEvents = batch.events || {};
            
            // Process key press events
            if (batchEvents.allKeyPresses && Array.isArray(batchEvents.allKeyPresses)) {
                batchEvents.allKeyPresses.forEach(keyPress => {
                    allKeyPresses.push(keyPress);
                    
                    // Categorize key press
                    const key = keyPress.key || 'unknown';
                    const field = keyPress.field || 'unknown';
                    
                    // Track by field
                    if (!analysis.keyPressSummary.keysByField[field]) {
                        analysis.keyPressSummary.keysByField[field] = {
                            count: 0,
                            fieldName: keyPress.fieldName || field,
                            keyTypes: {}
                        };
                    }
                    analysis.keyPressSummary.keysByField[field].count++;
                    
                    // Categorize key type
                    let keyType = 'Other';
                    if (key === 'Escape') keyType = 'Escape';
                    else if (key === 'Backspace') keyType = 'Backspace';
                    else if (key === 'Enter') keyType = 'Enter';
                    else if (key === 'Tab') keyType = 'Tab';
                    else if (key === ' ') keyType = 'Space';
                    else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) keyType = 'ArrowKeys';
                    else if (/^[a-zA-Z0-9]$/.test(key)) keyType = 'Alphanumeric';
                    
                    // Increment counters
                    analysis.keyPressSummary.keysByType[keyType]++;
                    
                    if (!analysis.keyPressSummary.keysByField[field].keyTypes[keyType]) {
                        analysis.keyPressSummary.keysByField[field].keyTypes[keyType] = 0;
                    }
                    analysis.keyPressSummary.keysByField[field].keyTypes[keyType]++;
                });
            }
            
            // Process typing cadence
            if (batchEvents.keyTypingCadence && Array.isArray(batchEvents.keyTypingCadence)) {
                batchEvents.keyTypingCadence.forEach(cadence => {
                    allTypingCadence.push(cadence);
                    
                    // Categorize cadence speed
                    const timeSinceLast = cadence.timeSinceLast || 0;
                    if (timeSinceLast <= 50) analysis.typingCadenceSummary.cadenceDistribution.veryFast++;
                    else if (timeSinceLast <= 100) analysis.typingCadenceSummary.cadenceDistribution.fast++;
                    else if (timeSinceLast <= 250) analysis.typingCadenceSummary.cadenceDistribution.normal++;
                    else if (timeSinceLast <= 500) analysis.typingCadenceSummary.cadenceDistribution.thoughtful++;
                    else if (timeSinceLast <= 1000) analysis.typingCadenceSummary.cadenceDistribution.slow++;
                    else analysis.typingCadenceSummary.cadenceDistribution.verySlow++;
                    
                    // Track fastest/slowest cadence
                    if (timeSinceLast < analysis.typingCadenceSummary.fastestCadenceMs) {
                        analysis.typingCadenceSummary.fastestCadenceMs = timeSinceLast;
                    }
                    if (timeSinceLast > analysis.typingCadenceSummary.slowestCadenceMs) {
                        analysis.typingCadenceSummary.slowestCadenceMs = timeSinceLast;
                    }
                });
            }
            
            // Process escape/backspace events
            if (batchEvents.escapeBackspace && Array.isArray(batchEvents.escapeBackspace)) {
                batchEvents.escapeBackspace.forEach(escBackspace => {
                    allEscapeBackspace.push(escBackspace);
                    
                    const key = escBackspace.key || 'unknown';
                    const field = escBackspace.field || 'unknown';
                    const inferred = escBackspace.inferred || false;
                    
                    if (key === 'Escape') {
                        analysis.escapeBackspaceSummary.totalEscapes++;
                        if (inferred) analysis.escapeBackspaceSummary.escapesInferred++;
                        
                        // Count by field
                        if (!analysis.escapeBackspaceSummary.fieldEscapeCount[field]) {
                            analysis.escapeBackspaceSummary.fieldEscapeCount[field] = {
                                count: 0,
                                inferred: 0,
                                fieldName: escBackspace.fieldName || field
                            };
                        }
                        analysis.escapeBackspaceSummary.fieldEscapeCount[field].count++;
                        if (inferred) analysis.escapeBackspaceSummary.fieldEscapeCount[field].inferred++;
                    }
                    else if (key === 'Backspace') {
                        analysis.escapeBackspaceSummary.totalBackspaces++;
                        
                        // Count by field
                        if (!analysis.escapeBackspaceSummary.fieldBackspaceCount[field]) {
                            analysis.escapeBackspaceSummary.fieldBackspaceCount[field] = {
                                count: 0,
                                fieldName: escBackspace.fieldName || field
                            };
                        }
                        analysis.escapeBackspaceSummary.fieldBackspaceCount[field].count++;
                    }
                });
            }
            
            // Process repeated input patterns
            if (batchEvents.repeatedInputs && Array.isArray(batchEvents.repeatedInputs)) {
                batchEvents.repeatedInputs.forEach(repeated => {
                    allRepeatedInputs.push(repeated);
                    
                    if (repeated.pattern) {
                        analysis.repeatedInputsSummary.patternDetails.push({
                            field: repeated.field || 'unknown',
                            fieldName: repeated.fieldName || repeated.field || 'unknown',
                            pattern: repeated.pattern,
                            timestamp: repeated.timestamp
                        });
                    }
                });
            }
        });
        
        // Calculate summary metrics
        analysis.keyPressSummary.totalKeyPresses = allKeyPresses.length;
        
        // Calculate average typing cadence
        const cadenceTimes = allTypingCadence.map(c => c.timeSinceLast).filter(t => t >= 10 && t <= 5000);
        analysis.typingCadenceSummary.averageCadenceMs = cadenceTimes.length > 0 ? 
            cadenceTimes.reduce((sum, time) => sum + time, 0) / cadenceTimes.length : 0;
            
        // If we never found any cadence values, reset min/max
        if (analysis.typingCadenceSummary.fastestCadenceMs === Infinity) {
            analysis.typingCadenceSummary.fastestCadenceMs = 0;
        }
        
        // Count consecutive backspaces (3+ in a row)
        // This is a simplified approach - a more detailed one would look at timestamps
        let consecutiveCount = 0;
        let lastField = null;
        allEscapeBackspace.forEach(event => {
            if (event.key === 'Backspace') {
                if (lastField === event.field) {
                    consecutiveCount++;
                    if (consecutiveCount >= 3) {
                        analysis.escapeBackspaceSummary.backspacesConsecutive++;
                        consecutiveCount = 0; // Reset to avoid double counting
                    }
                } else {
                    consecutiveCount = 1;
                    lastField = event.field;
                }
            } else {
                consecutiveCount = 0;
                lastField = null;
            }
        });
        
        analysis.repeatedInputsSummary.totalRepeatedPatterns = allRepeatedInputs.length;
        
        return analysis;
        
    } catch (error) {
        console.error(`[Keyboard Analysis] Error: ${error.message}`);
        return {
            error: error.message,
            keyPressSummary: { totalKeyPresses: 0 },
            typingCadenceSummary: { averageCadenceMs: 0 },
            escapeBackspaceSummary: { totalEscapes: 0, totalBackspaces: 0 },
            repeatedInputsSummary: { totalRepeatedPatterns: 0 }
        };
    }
}

/**
 * Analyzes idle-related behavior (inactivity, field-specific hesitation)
 * @param {Array} events - Array of non-transitional event batches
 * @returns {Object} Analysis of idle behavior
 */
function analyzeIdleBehavior(events) {
    try {
        // Initialize analysis structure
        const analysis = {
            inactivitySummary: {
                totalInactivityTime: 0,
                averageInactivityDuration: 0,
                inactivityCount: 0,
                inactivityDistribution: {
                    microPauses: 0,     // 2-5s (thinking)
                    shortPauses: 0,      // 5-15s (reading)
                    mediumPauses: 0,     // 15-30s (consideration)
                    longPauses: 0        // >30s (distraction/away)
                }
            },
            fieldIdleSummary: {
                totalFieldIdleEvents: 0,
                fieldIdleByField: {},
                thresholdReachedCount: 0,
                blurAfterIdleCount: 0
            }
        };
        
        // Extract all idle-related events
        const allInactivity = [];
        const allFieldIdle = [];
        
        // Process each event batch
        events.forEach(batch => {
            const batchEvents = batch.events || {};
            
            // Process general inactivity
            if (batchEvents.inactivity && Array.isArray(batchEvents.inactivity)) {
                batchEvents.inactivity.forEach(inactivity => {
                    allInactivity.push(inactivity);
                    
                    const duration = inactivity.duration || 0;
                    analysis.inactivitySummary.totalInactivityTime += duration;
                    
                    // Categorize by duration
                    if (duration >= 2000 && duration < 5000) analysis.inactivitySummary.inactivityDistribution.microPauses++;
                    else if (duration >= 5000 && duration < 15000) analysis.inactivitySummary.inactivityDistribution.shortPauses++;
                    else if (duration >= 15000 && duration < 30000) analysis.inactivitySummary.inactivityDistribution.mediumPauses++;
                    else if (duration >= 30000) analysis.inactivitySummary.inactivityDistribution.longPauses++;
                });
            }
            
            // Process field-specific idle
            if (batchEvents.inputFieldIdle && Array.isArray(batchEvents.inputFieldIdle)) {
                batchEvents.inputFieldIdle.forEach(fieldIdle => {
                    allFieldIdle.push(fieldIdle);
                    
                    const field = fieldIdle.field || 'unknown';
                    const eventType = fieldIdle.eventType || 'unknown';
                    const duration = fieldIdle.duration || 0;
                    const valueChanged = fieldIdle.valueChanged || false;
                    
                    // Count by event type
                    if (eventType === 'idle_threshold_reached') {
                        analysis.fieldIdleSummary.thresholdReachedCount++;
                    } else if (eventType === 'blur_after_idle') {
                        analysis.fieldIdleSummary.blurAfterIdleCount++;
                    }
                    
                    // Track by field
                    if (!analysis.fieldIdleSummary.fieldIdleByField[field]) {
                        analysis.fieldIdleSummary.fieldIdleByField[field] = {
                            count: 0,
                            totalDuration: 0,
                            thresholdReached: 0,
                            blurAfterIdle: 0,
                            valueChanged: 0,
                            valueUnchanged: 0,
                            fieldName: fieldIdle.fieldName || fieldIdle.label || field
                        };
                    }
                    
                    const fieldStats = analysis.fieldIdleSummary.fieldIdleByField[field];
                    fieldStats.count++;
                    fieldStats.totalDuration += duration;
                    
                    if (eventType === 'idle_threshold_reached') fieldStats.thresholdReached++;
                    else if (eventType === 'blur_after_idle') fieldStats.blurAfterIdle++;
                    
                    if (valueChanged) fieldStats.valueChanged++;
                    else fieldStats.valueUnchanged++;
                });
            }
        });
        
        // Calculate summary metrics
        analysis.inactivitySummary.inactivityCount = allInactivity.length;
        analysis.inactivitySummary.averageInactivityDuration = allInactivity.length > 0 ? 
            analysis.inactivitySummary.totalInactivityTime / allInactivity.length : 0;
            
        analysis.fieldIdleSummary.totalFieldIdleEvents = allFieldIdle.length;
        
        // Calculate the problematic fields (high idle, unchanged values)
        const problematicFields = Object.entries(analysis.fieldIdleSummary.fieldIdleByField)
            .filter(([_, data]) => {
                // Fields with high idle threshold reaches and unchanged values are potentially problematic
                return data.thresholdReached > 0 && 
                       data.valueUnchanged > 0 && 
                       data.valueUnchanged / data.count >= 0.5; // At least 50% of idle events resulted in no change
            })
            .sort((a, b) => {
                // Sort by highest unchanged ratio first, then by total idle events
                const ratioA = a[1].valueUnchanged / a[1].count;
                const ratioB = b[1].valueUnchanged / b[1].count; 
                return ratioB - ratioA || b[1].count - a[1].count;
            })
            .slice(0, 5)
            .map(([field, data]) => ({
                field,
                fieldName: data.fieldName,
                idleCount: data.count,
                thresholdReached: data.thresholdReached,
                unchangedRatio: data.valueUnchanged / data.count,
                averageDuration: data.totalDuration / data.count
            }));
            
        analysis.fieldIdleSummary.problematicFields = problematicFields;
        
        return analysis;
        
    } catch (error) {
        console.error(`[Idle Analysis] Error: ${error.message}`);
        return {
            error: error.message,
            inactivitySummary: { totalInactivityTime: 0, inactivityCount: 0 },
            fieldIdleSummary: { totalFieldIdleEvents: 0 }
        };
    }
}

/**
 * Analyzes click-related behavior (dead clicks, repeated clicks)
 * @param {Array} events - Array of non-transitional event batches
 * @returns {Object} Analysis of click behavior
 */
function analyzeClickBehavior(events) {
    try {
        // Initialize analysis structure
        const analysis = {
            deadClickSummary: {
                totalDeadClicks: 0,
                deadClicksByElement: {},
                deadClickHeatmap: Array(10).fill().map(() => Array(10).fill(0))
            },
            repeatedClickSummary: {
                totalRepeatedClickBursts: 0,
                totalIndividualRepeatedClicks: 0,
                repeatedClicksBySelector: {}
            }
        };
        
        // Extract all click-related events
        const allDeadClicks = [];
        const allRepeatedClicks = [];
        
        // Process each event batch
        events.forEach(batch => {
            const batchEvents = batch.events || {};
            
            // Process dead clicks
            if (batchEvents.deadClicks && Array.isArray(batchEvents.deadClicks)) {
                batchEvents.deadClicks.forEach(deadClick => {
                    allDeadClicks.push(deadClick);
                    
                    const path = deadClick.path || 'unknown';
                    const tagName = deadClick.tag || 'unknown';
                    const name = deadClick.friendlyName || path;
                    
                    // Track by element
                    if (!analysis.deadClickSummary.deadClicksByElement[path]) {
                        analysis.deadClickSummary.deadClicksByElement[path] = {
                            count: 0,
                            tag: tagName,
                            friendlyName: name,
                            clicks: []
                        };
                    }
                    
                    analysis.deadClickSummary.deadClicksByElement[path].count++;
                    
                    // Add to detailed list (limit to 20 per element to avoid excessive data)
                    if (analysis.deadClickSummary.deadClicksByElement[path].clicks.length < 20) {
                        analysis.deadClickSummary.deadClicksByElement[path].clicks.push({
                            x: deadClick.x,
                            y: deadClick.y,
                            timestamp: deadClick.timestamp
                        });
                    }
                    
                    // Add to heatmap if coordinates are available
                    if (typeof deadClick.x === 'number' && typeof deadClick.y === 'number') {
                        // Convert pixel coordinates to 10x10 grid
                        // Assuming viewport is ~1000x600 (typical desktop) to normalize
                        const gridX = Math.min(Math.floor(deadClick.x / 100), 9);
                        const gridY = Math.min(Math.floor(deadClick.y / 60), 9);
                        
                        if (gridX >= 0 && gridX < 10 && gridY >= 0 && gridY < 10) {
                            analysis.deadClickSummary.deadClickHeatmap[gridY][gridX]++;
                        }
                    }
                });
            }
            
            // Process repeated clicks
            if (batchEvents.repeatedClicks && Array.isArray(batchEvents.repeatedClicks)) {
                batchEvents.repeatedClicks.forEach(repeatedClick => {
                    allRepeatedClicks.push(repeatedClick);
                    
                    const selector = repeatedClick.selector || 'unknown';
                    const count = repeatedClick.count || 0;
                    
                    analysis.repeatedClickSummary.totalIndividualRepeatedClicks += count;
                    
                    // Track by selector
                    if (!analysis.repeatedClickSummary.repeatedClicksBySelector[selector]) {
                        analysis.repeatedClickSummary.repeatedClicksBySelector[selector] = {
                            burstCount: 0,
                            totalClicks: 0,
                            maxClicksInBurst: 0
                        };
                    }
                    
                    const selectorStats = analysis.repeatedClickSummary.repeatedClicksBySelector[selector];
                    selectorStats.burstCount++;
                    selectorStats.totalClicks += count;
                    
                    if (count > selectorStats.maxClicksInBurst) {
                        selectorStats.maxClicksInBurst = count;
                    }
                });
            }
        });
        
        // Calculate summary metrics
        analysis.deadClickSummary.totalDeadClicks = allDeadClicks.length;
        analysis.repeatedClickSummary.totalRepeatedClickBursts = allRepeatedClicks.length;
        
        // Sort dead clicks by frequency
        analysis.deadClickSummary.topDeadClickTargets = Object.entries(analysis.deadClickSummary.deadClicksByElement)
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10)
            .map(([path, data]) => ({
                path,
                tag: data.tag,
                friendlyName: data.friendlyName,
                count: data.count
            }));
            
        // Sort repeated clicks by frequency
        analysis.repeatedClickSummary.topRepeatedClickTargets = Object.entries(analysis.repeatedClickSummary.repeatedClicksBySelector)
            .sort((a, b) => b[1].totalClicks - a[1].totalClicks)
            .slice(0, 10)
            .map(([selector, data]) => ({
                selector,
                burstCount: data.burstCount,
                totalClicks: data.totalClicks,
                maxClicksInBurst: data.maxClicksInBurst,
                averageClicksPerBurst: data.burstCount > 0 ? data.totalClicks / data.burstCount : 0
            }));
            
        return analysis;
        
    } catch (error) {
        console.error(`[Click Analysis] Error: ${error.message}`);
        return {
            error: error.message,
            deadClickSummary: { totalDeadClicks: 0 },
            repeatedClickSummary: { totalRepeatedClickBursts: 0, totalIndividualRepeatedClicks: 0 }
        };
    }
}

/**
 * Analyzes scroll-related behavior
 * @param {Array} events - Array of non-transitional event batches
 * @returns {Object} Analysis of scroll behavior
 */
function analyzeScrollBehavior(events) {
    try {
        // Initialize analysis structure
        const analysis = {
            scrollSummary: {
                totalScrollEvents: 0,
                totalScrollDistance: 0,
                maxScrollDepth: 0,
                averageScrollDistance: 0,
                scrollsByDirection: {
                    down: 0,
                    up: 0,
                    left: 0,
                    right: 0
                },
                rapidScrollCount: 0, // Fast, large scrolls
                smallAdjustmentCount: 0 // Small position adjustments
            }
        };
        
        // Extract all scroll events
        const allScrollEvents = [];
        
        // Process each event batch
        events.forEach(batch => {
            const batchEvents = batch.events || {};
            
            // Process scroll events
            if (batchEvents.scrollEvents && Array.isArray(batchEvents.scrollEvents)) {
                batchEvents.scrollEvents.forEach(scroll => {
                    allScrollEvents.push(scroll);
                    
                    const deltaY = scroll.deltaY || 0;
                    const deltaX = scroll.deltaX || 0;
                    const depth = scroll.depth || 0;
                    
                    // Accumulate scroll distance (use absolute values)
                    const distance = Math.abs(deltaY) + Math.abs(deltaX);
                    analysis.scrollSummary.totalScrollDistance += distance;
                    
                    // Track maximum scroll depth
                    if (depth > analysis.scrollSummary.maxScrollDepth) {
                        analysis.scrollSummary.maxScrollDepth = depth;
                    }
                    
                    // Determine scroll direction
                    if (deltaY > 0) analysis.scrollSummary.scrollsByDirection.down++;
                    else if (deltaY < 0) analysis.scrollSummary.scrollsByDirection.up++;
                    if (deltaX > 0) analysis.scrollSummary.scrollsByDirection.right++;
                    else if (deltaX < 0) analysis.scrollSummary.scrollsByDirection.left++;
                    
                    // Classify scroll behavior
                    if (distance >= 300) { // Rapid, large scroll
                        analysis.scrollSummary.rapidScrollCount++;
                    } else if (distance <= 30) { // Small adjustment
                        analysis.scrollSummary.smallAdjustmentCount++;
                    }
                });
            }
        });
        
        // Calculate summary metrics
        analysis.scrollSummary.totalScrollEvents = allScrollEvents.length;
        analysis.scrollSummary.averageScrollDistance = allScrollEvents.length > 0 ? 
            analysis.scrollSummary.totalScrollDistance / allScrollEvents.length : 0;
            
        // Calculate scroll engagement ratio (if we have depth data)
        // This is the ratio of max scroll depth to estimated page height
        if (analysis.scrollSummary.maxScrollDepth > 0) {
            // Estimate page engagement based on scroll depth
            // NOTE: This is a rough estimate without knowing actual page height
            const estimatedEngagement = Math.min(analysis.scrollSummary.maxScrollDepth / 3000, 1);
            analysis.scrollSummary.estimatedContentEngagement = parseFloat(estimatedEngagement.toFixed(2));
        } else {
            analysis.scrollSummary.estimatedContentEngagement = 0;
        }
        
        // Determine scroll pattern
        let patternType = 'unknown';
        if (allScrollEvents.length === 0) {
            patternType = 'no_scrolling';
        } else if (analysis.scrollSummary.rapidScrollCount > allScrollEvents.length * 0.5) {
            patternType = 'rapid_skimming'; // Majority of scrolls are rapid, suggesting skimming
        } else if (analysis.scrollSummary.smallAdjustmentCount > allScrollEvents.length * 0.5) {
            patternType = 'careful_reading'; // Lots of small adjustments indicate careful reading
        } else if (analysis.scrollSummary.scrollsByDirection.down > allScrollEvents.length * 0.8) {
            patternType = 'consistent_forward'; // Mostly scrolling down, consistent forward reading
        } else if (analysis.scrollSummary.scrollsByDirection.up > analysis.scrollSummary.scrollsByDirection.down) {
            patternType = 'review_heavy'; // More scrolling up than down, indicates reviewing content
        } else {
            patternType = 'mixed_reading'; // Mixed pattern
        }
        
        analysis.scrollSummary.dominantScrollPattern = patternType;
        
        return analysis;
        
    } catch (error) {
        console.error(`[Scroll Analysis] Error: ${error.message}`);
        return {
            error: error.message,
            scrollSummary: { totalScrollEvents: 0, totalScrollDistance: 0 }
        };
    }
}

/**
 * Generates a summary object from all analyses
 * @param {Object} events - Array of non-transitional event batches
 * @param {Object} pointerAnalysis - Analysis of pointer behavior
 * @param {Object} keyboardAnalysis - Analysis of keyboard behavior
 * @param {Object} idleAnalysis - Analysis of idle behavior
 * @param {Object} clickAnalysis - Analysis of click behavior
 * @param {Object} scrollAnalysis - Analysis of scroll behavior
 * @returns {Object} Summary object
 */
function generateSummary(events, pointerAnalysis, keyboardAnalysis, idleAnalysis, clickAnalysis, scrollAnalysis) {
    // Implementation of generateSummary function
}

// Export the main processing function and any utilities that might be useful elsewhere
module.exports = {
    processSessionForNonTransitionalEvents,
    analyzePointerBehavior,
    analyzeKeyboardBehavior, 
    analyzeIdleBehavior,
    analyzeClickBehavior,
    analyzeScrollBehavior
}; 