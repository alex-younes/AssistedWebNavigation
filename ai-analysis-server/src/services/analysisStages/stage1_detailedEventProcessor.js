/**
 * Stage 1: Enhanced Transitional Event Analyzer
 * 
 * This module provides deeper analysis of transitional events including:
 * 1. State type classification (page load, DOM mutation, user interaction)
 * 2. State flag analysis (isReload, isNavigation, isInitial, isPartOfLoading)
 * 3. Fingerprint/hash pattern detection
 * 4. Detailed transition trigger analysis
 * 5. Loading state analysis (skeleton vs final states)
 * 6. Rich navigation pattern detection
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
 * Analyzes a sequence of states to extract rich transition patterns
 * @param {Array} states - Array of states from a session
 * @returns {Object} Comprehensive transition pattern analysis
 */
function analyzeTransitionPatterns(states) {
    if (!states || states.length === 0) return {};
  
    const patterns = {
        urlTransitions: [], // Tracks page-to-page navigation
        domTransitions: [], // Tracks DOM changes within same URL
        stateTypeTransitions: [], // Tracks transitions between different state types
        hashPatterns: {}, // Tracks recurring hash patterns
        statesByUrl: {}, // Groups states by URL for comparison
        statesByType: {}, // Groups states by type (navigation, reload, user interaction, mutation)
        statesByFlags: {
            isNavigation: [],
            isReload: [],
            isInitial: [],
            isPartOfLoading: [],
            isFinalState: []
        },
        uniqueUrls: new Set(), // Set of unique URLs visited
        uniqueHashes: new Set(), // Set of unique fingerprint hashes
        urlVisitCounts: {}, // Count of visits per URL
        hashOccurrences: {}, // Count of occurrences per hash
        averageTimePerUrl: {}, // Average time spent on each URL
        transitionTriggerTypes: {}, // Count of different transition trigger types
        skeletonStatesByUrl: {}, // Loading state counts by URL
        formInteractions: [] // Tracks form field interactions across states
    };

    // Initialize sequence trackers
    let currentSequence = {
        url: null,
        states: [],
        startIndex: 0
    };
  
    // Process each state to build comprehensive transition data
    states.forEach((state, index) => {
        const url = state.url || '';
        const stateId = state.stateId;
        const hash = state.hash || '';
        const timestamp = state.timestamp ? new Date(state.timestamp).getTime() : 0;
        const isLoading = state.isPartOfLoading || false;
        const isFinal = state.isFinalState || false;
        
        // Store hash information
        if (hash) {
            patterns.uniqueHashes.add(hash);
            patterns.hashOccurrences[hash] = (patterns.hashOccurrences[hash] || 0) + 1;
        }
    
        // Track URL visits
        patterns.uniqueUrls.add(url);
        patterns.urlVisitCounts[url] = (patterns.urlVisitCounts[url] || 0) + 1;
    
        // Group states by URL
        if (!patterns.statesByUrl[url]) patterns.statesByUrl[url] = [];
        patterns.statesByUrl[url].push({
            stateId,
            stateNumber: state.stateNumber,
            timestamp,
            hash,
            isLoading,
            isFinal,
            index
        });

        // Track loading states by URL
        if (isLoading) {
            if (!patterns.skeletonStatesByUrl[url]) patterns.skeletonStatesByUrl[url] = [];
            patterns.skeletonStatesByUrl[url].push({
                stateId,
                stateNumber: state.stateNumber,
                timestamp,
                index
            });
        }
    
        // Track state flags
        if (state.isNavigation) patterns.statesByFlags.isNavigation.push(index);
        if (state.isReload) patterns.statesByFlags.isReload.push(index);
        if (state.isInitial) patterns.statesByFlags.isInitial.push(index);
        if (state.isPartOfLoading) patterns.statesByFlags.isPartOfLoading.push(index);
        if (state.isFinalState) patterns.statesByFlags.isFinalState.push(index);

        // Determine state type for better classification
        let stateType = 'mutation'; // default
        if (state.isNavigation) stateType = 'navigation';
        else if (state.isReload) stateType = 'reload';
        else if (state.isInitial) stateType = 'initial';
        else if (state.interactionInfo) stateType = 'userInteraction';
        
        // Track states by type
        if (!patterns.statesByType[stateType]) patterns.statesByType[stateType] = [];
        patterns.statesByType[stateType].push(index);
    
        // Track transition triggers with more detail
        let triggerType = 'unknown';
        let triggerDetails = {};
        
        if (state.interactionInfo) {
            triggerType = 'userInteraction';
            triggerDetails = {
                element: state.interactionInfo.tagName || '',
                trigger: state.interactionInfo.trigger || '',
                label: state.interactionInfo.targetText || state.interactionInfo.accessibleName || '',
                formId: state.interactionInfo.formId || '',
                isFormElement: ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'FORM'].includes(state.interactionInfo.tagName)
            };
        } 
        else if (state.isNavigation) {
            triggerType = 'navigation';
            triggerDetails = { type: 'spa' }; // SPA route change
        }
        else if (state.isReload) {
            triggerType = 'reload';
            triggerDetails = { type: 'browser' }; // Browser refresh
        }
        else if (state.mutationInfo?.count > 0) {
            triggerType = 'domMutation';
            triggerDetails = { 
                count: state.mutationInfo.count,
                types: state.mutationInfo.types || []
            };
        }
        
        // Count transition types
        patterns.transitionTriggerTypes[triggerType] = (patterns.transitionTriggerTypes[triggerType] || 0) + 1;
        
        // Track URL vs DOM transitions (if not first state)
        if (index > 0) {
            const prevState = states[index - 1];
            const prevUrl = prevState.url || '';
            const prevTimestamp = prevState.timestamp ? new Date(prevState.timestamp).getTime() : 0;
            const timeBetweenMs = timestamp - prevTimestamp;
            
            // Create common transition data
            const transition = {
                fromStateId: prevState.stateId,
                toStateId: stateId,
                fromStateNumber: prevState.stateNumber,
                toStateNumber: state.stateNumber,
                fromHash: prevState.hash || '',
                toHash: hash,
                triggerType,
                triggerDetails,
                timeBetweenMs,
                fromStateType: prevState.isPartOfLoading ? 'loading' : 'stable',
                toStateType: isLoading ? 'loading' : 'stable'
            };

            // Is this a URL change or DOM change within same URL?
            if (prevUrl !== url) {
                // URL transition
                patterns.urlTransitions.push({
                    ...transition,
                    fromUrl: prevUrl,
                    toUrl: url
                });
                
                // Start new sequence for URL
                if (currentSequence.url !== null) {
                    // End previous sequence
                    currentSequence.endIndex = index - 1;
                    currentSequence.duration = timestamp - (states[currentSequence.startIndex].timestamp ? 
                        new Date(states[currentSequence.startIndex].timestamp).getTime() : 0);
                }
                
                // Start new sequence
                currentSequence = {
                    url,
                    states: [stateId],
                    startIndex: index,
                    transitionType: triggerType
                };
            } else {
                // DOM transition within same URL
                patterns.domTransitions.push({
                    ...transition,
                    url,
                    isDomMutation: triggerType === 'domMutation'
                });
                
                // Add to current sequence
                if (currentSequence.url === url) {
                    currentSequence.states.push(stateId);
                }
            }
            
            // Track state type transitions
            const prevStateType = prevState.isPartOfLoading ? 'loading' : (
                prevState.isNavigation ? 'navigation' : 
                prevState.isReload ? 'reload' : 
                prevState.interactionInfo ? 'userInteraction' : 'mutation'
            );
            
            patterns.stateTypeTransitions.push({
                fromType: prevStateType,
                toType: stateType,
                fromStateId: prevState.stateId,
                toStateId: stateId,
                timeBetweenMs
            });
            
            // Track form interactions if present in interactionInfo
            if (state.interactionInfo && 
                ['INPUT', 'SELECT', 'TEXTAREA', 'FORM', 'BUTTON'].includes(state.interactionInfo.tagName)) {
                patterns.formInteractions.push({
                    stateId,
                    stateNumber: state.stateNumber,
                    element: state.interactionInfo.tagName,
                    fieldType: state.interactionInfo.type || state.interactionInfo.tagName.toLowerCase(),
                    fieldId: state.interactionInfo.id || state.interactionInfo.name || state.interactionInfo.selector || '',
                    fieldLabel: state.interactionInfo.label || state.interactionInfo.targetText || '',
                    action: state.interactionInfo.trigger || 'interaction',
                    value: state.interactionInfo.value,
                    formId: state.interactionInfo.formId || '',
                    timestamp
                });
            }
        } else {
            // First state - initialize sequence
            currentSequence = {
                url,
                states: [stateId],
                startIndex: 0,
                transitionType: state.isInitial ? 'initial' : (
                    state.isNavigation ? 'navigation' : 
                    state.isReload ? 'reload' : 'unknown'
                )
            };
        }
    });
  
    // Close the last sequence if any
    if (currentSequence.url !== null && states.length > 0) {
        const lastIndex = states.length - 1;
        const lastTimestamp = states[lastIndex].timestamp ? 
            new Date(states[lastIndex].timestamp).getTime() : 0;
        const firstTimestamp = states[currentSequence.startIndex].timestamp ? 
            new Date(states[currentSequence.startIndex].timestamp).getTime() : 0;
            
        currentSequence.endIndex = lastIndex;
        currentSequence.duration = lastTimestamp - firstTimestamp;
    }
  
    // Calculate average time per URL
    Object.keys(patterns.statesByUrl).forEach(url => {
        const urlStates = patterns.statesByUrl[url];
        if (urlStates.length <= 1) {
            patterns.averageTimePerUrl[url] = 0; // Can't calculate time with only one state
            return;
        }
    
        let totalTimeMs = 0;
        let validTimePoints = 0;
    
        // Calculate time spent on stable states (non-loading)
        const stableStates = urlStates.filter(state => !state.isLoading);
        for (let i = 0; i < stableStates.length - 1; i++) {
            const currentState = stableStates[i];
            const nextState = stableStates[i + 1];
            
            // Only count consecutive states on the same URL
            if (nextState.index === currentState.index + 1) {
                const timeSpentMs = nextState.timestamp - currentState.timestamp;
                if (timeSpentMs > 0) {
                    totalTimeMs += timeSpentMs;
                    validTimePoints++;
                }
            }
        }
    
        patterns.averageTimePerUrl[url] = validTimePoints > 0 ? totalTimeMs / validTimePoints : 0;
    });
  
    // Analyze hash patterns (recurring fingerprints)
    const significantHashes = Object.entries(patterns.hashOccurrences)
        .filter(([hash, count]) => count > 1)
        .sort((a, b) => b[1] - a[1]);
    
    patterns.hashPatterns = {
        recurring: significantHashes.map(([hash, count]) => ({
            hash,
            count,
            states: states.filter(s => s.hash === hash).map(s => s.stateId),
            isSignificant: count > 3 // Consider hashes that appear more than 3 times significant
        }))
    };
  
    // Add comprehensive summary statistics
    patterns.summary = {
        totalStates: states.length,
        uniqueUrlCount: patterns.uniqueUrls.size,
        uniqueHashCount: patterns.uniqueHashes.size,
        urlTransitionCount: patterns.urlTransitions.length,
        domTransitionCount: patterns.domTransitions.length,
        navigationCount: patterns.statesByFlags.isNavigation.length,
        reloadCount: patterns.statesByFlags.isReload.length,
        formInteractionCount: patterns.formInteractions.length,
        skeletonStateCount: patterns.statesByFlags.isPartOfLoading.length,
        finalStateCount: patterns.statesByFlags.isFinalState.length,
        mostVisitedUrl: Object.entries(patterns.urlVisitCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([url, count]) => ({ url, count }))[0] || { url: 'none', count: 0 },
        mostFrequentHash: significantHashes[0] ? 
            { hash: significantHashes[0][0], count: significantHashes[0][1] } : 
            { hash: 'none', count: 0 },
        transitionTypeSummary: patterns.transitionTriggerTypes,
        averageStatesPerUrl: states.length / Math.max(1, patterns.uniqueUrls.size),
        loadingToStableRatio: patterns.statesByFlags.isPartOfLoading.length / 
            Math.max(1, states.length - patterns.statesByFlags.isPartOfLoading.length),
        avgDomTransitionsPerUrl: patterns.domTransitions.length / Math.max(1, patterns.uniqueUrls.size)
    };

    // Calculate transition timing statistics
    patterns.summary.transitionTimings = {
        urlTransitions: calculateStats(patterns.urlTransitions.map(t => t.timeBetweenMs)),
        domTransitions: calculateStats(patterns.domTransitions.map(t => t.timeBetweenMs)),
        overall: calculateStats([...patterns.urlTransitions, ...patterns.domTransitions].map(t => t.timeBetweenMs))
    };

    // Calculate most common transition trigger
    patterns.summary.mostCommonTransitionTrigger = Object.entries(patterns.transitionTriggerTypes)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => ({ type, count }))[0] || { type: 'unknown', count: 0 };
  
    return patterns;
}

/**
 * Generates enhanced HTML table structures for the report
 * @param {Object} analysisData - The analysis data to format
 * @returns {Object} Rich HTML table structures for the report
 */
function generateHtmlTableStructures(analysisData) {
    const tables = {};
  
    // URL Visit Summary Table with enhanced metrics
    if (analysisData.transitionPatterns?.urlVisitCounts && analysisData.transitionPatterns?.statesByUrl) {
        const urlData = Object.entries(analysisData.transitionPatterns.urlVisitCounts)
            .map(([url, count]) => {
                const statesForUrl = analysisData.transitionPatterns.statesByUrl[url] || [];
                const loadingStates = statesForUrl.filter(s => s.isLoading).length;
                const stableStates = statesForUrl.length - loadingStates;
                const avgTime = analysisData.transitionPatterns.averageTimePerUrl[url] || 0;
                
                return {
                    url,
                    count,
                    totalStates: statesForUrl.length,
                    loadingStates,
                    stableStates,
                    avgTime
                };
            })
            .sort((a, b) => b.count - a.count);
        
        tables.urlVisitSummary = {
            title: "URL Visit & State Summary",
            headers: ["URL", "Visit Count", "Total States", "Loading States", "Stable States", "Avg Time (sec)"],
            rows: urlData.map(data => [
                data.url,
                data.count,
                data.totalStates,
                data.loadingStates,
                data.stableStates,
                (data.avgTime / 1000).toFixed(2)
            ])
        };
    }
  
    // State Transition Table with enhanced details
    if (analysisData.transitionPatterns?.urlTransitions) {
        tables.urlTransitions = {
            title: "URL Transitions (Page Navigation)",
            headers: ["From URL", "To URL", "Trigger Type", "From State", "To State", "Time (sec)"],
            rows: analysisData.transitionPatterns.urlTransitions.map(transition => [
                transition.fromUrl,
                transition.toUrl,
                transition.triggerType,
                transition.fromStateNumber || transition.fromStateId,
                transition.toStateNumber || transition.toStateId,
                (transition.timeBetweenMs / 1000).toFixed(2)
            ])
        };
    }

    // DOM Mutation Transitions Table (within same URL)
    if (analysisData.transitionPatterns?.domTransitions && analysisData.transitionPatterns.domTransitions.length > 0) {
        tables.domTransitions = {
            title: "DOM Transitions (Within Same URL)",
            headers: ["URL", "Trigger Type", "From State", "To State", "Time (sec)"],
            rows: analysisData.transitionPatterns.domTransitions.map(transition => [
                transition.url,
                transition.triggerType,
                transition.fromStateNumber || transition.fromStateId,
                transition.toStateNumber || transition.toStateId,
                (transition.timeBetweenMs / 1000).toFixed(2)
            ])
        };
    }

    // State Flag Summary Table
    if (analysisData.transitionPatterns?.statesByFlags) {
        const flags = analysisData.transitionPatterns.statesByFlags;
        tables.stateFlagSummary = {
            title: "State Flag Summary",
            headers: ["Flag Type", "Count", "State Numbers"],
            rows: [
                ["Navigation", flags.isNavigation.length, flags.isNavigation.length > 0 ? 
                    flags.isNavigation.slice(0, 5).join(', ') + (flags.isNavigation.length > 5 ? '...' : '') : 'None'],
                ["Reload", flags.isReload.length, flags.isReload.length > 0 ? 
                    flags.isReload.slice(0, 5).join(', ') + (flags.isReload.length > 5 ? '...' : '') : 'None'],
                ["Initial", flags.isInitial.length, flags.isInitial.length > 0 ? 
                    flags.isInitial.slice(0, 5).join(', ') + (flags.isInitial.length > 5 ? '...' : '') : 'None'],
                ["Loading", flags.isPartOfLoading.length, flags.isPartOfLoading.length > 0 ? 
                    flags.isPartOfLoading.slice(0, 5).join(', ') + (flags.isPartOfLoading.length > 5 ? '...' : '') : 'None'],
                ["Final", flags.isFinalState.length, flags.isFinalState.length > 0 ? 
                    flags.isFinalState.slice(0, 5).join(', ') + (flags.isFinalState.length > 5 ? '...' : '') : 'None']
            ]
        };
    }

    // Form Interaction Table
    if (analysisData.transitionPatterns?.formInteractions && analysisData.transitionPatterns.formInteractions.length > 0) {
        tables.formInteractions = {
            title: "Form Field Interactions",
            headers: ["State", "Element", "Field Type", "Label/ID", "Action", "Value"],
            rows: analysisData.transitionPatterns.formInteractions.map(interaction => [
                interaction.stateNumber || interaction.stateId,
                interaction.element,
                interaction.fieldType,
                interaction.fieldLabel || interaction.fieldId,
                interaction.action,
                typeof interaction.value === 'string' ? 
                    (interaction.value.length > 20 ? interaction.value.substring(0, 20) + '...' : interaction.value) : 
                    String(interaction.value || '')
            ])
        };
    }

    // Hash Pattern Table (recurring fingerprints)
    if (analysisData.transitionPatterns?.hashPatterns?.recurring && 
        analysisData.transitionPatterns.hashPatterns.recurring.length > 0) {
        tables.hashPatterns = {
            title: "Recurring State Fingerprints",
            headers: ["Hash", "Count", "State Numbers", "Significant"],
            rows: analysisData.transitionPatterns.hashPatterns.recurring.map(pattern => [
                pattern.hash,
                pattern.count,
                pattern.states.slice(0, 3).join(', ') + (pattern.states.length > 3 ? '...' : ''),
                pattern.isSignificant ? 'Yes' : 'No'
            ])
        };
    }
  
    // Form Behavior Analysis Table
    if (analysisData.formBehaviors?.fieldCorrectionRates) {
        const fieldData = Object.entries(analysisData.formBehaviors.fieldCorrectionRates)
            .map(([fieldId, data]) => ({
                fieldId,
                ...data,
                avgTime: analysisData.formBehaviors.fieldTimings[fieldId]?.averageTimeMs || 0,
                interactions: analysisData.formBehaviors.fieldTimings[fieldId]?.interactions || 0
            }))
            .sort((a, b) => b.interactions - a.interactions);
        
        tables.formBehaviors = {
            title: "Form Field Interaction Behavior",
            headers: ["Field ID", "Changes", "Corrections", "Correction Rate", "Avg Time (sec)"],
            rows: fieldData.map(data => [
                data.fieldId,
                data.totalChanges,
                data.corrections,
                (data.correctionRate * 100).toFixed(1) + '%',
                (data.avgTime / 1000).toFixed(2)
            ])
        };
        
        // Field interaction sequence table
        if (analysisData.formBehaviors.sequencePatterns.length > 0) {
            const firstAppearance = analysisData.formBehaviors.sequencePatterns
                .find(p => p.type === 'first_appearance');
                
            if (firstAppearance && firstAppearance.sequence.length > 0) {
                tables.formSequence = {
                    title: "Form Field Interaction Sequence",
                    headers: ["Sequence Position", "Field ID"],
                    rows: firstAppearance.sequence.map((fieldId, idx) => [
                        idx + 1,
                        fieldId
                    ])
                };
            }
        }
    }
    
    // Network Performance Impact Table
    if (analysisData.networkPerformance?.summary?.connectionTypes) {
        tables.networkPerformance = {
            title: "Network Performance Impact",
            headers: ["Connection Type", "Occurrences", "Avg Load Time (ms)", "Impact"],
            rows: analysisData.networkPerformance.summary.connectionTypes.map(conn => [
                conn.type,
                conn.count,
                Math.round(conn.avgLoadTime),
                // Calculate impact rating
                conn.avgLoadTime > 1000 ? "High" : 
                conn.avgLoadTime > 500 ? "Medium" : "Low"
            ])
        };
    }
    
    // DOM Fingerprint Transition Table
    if (analysisData.domFingerprints?.fingerprintTransitions) {
        // Only include most significant transitions to avoid overload
        const significantTransitions = analysisData.domFingerprints.fingerprintTransitions
            .filter((_, idx) => idx < 20);  // Limit to first 20
            
        tables.domFingerprints = {
            title: "DOM State Transitions",
            headers: ["From URL", "To URL", "URL Change", "DOM Change", "Time (sec)"],
            rows: significantTransitions.map(t => [
                t.fromUrl.split('?')[0],  // Remove query params for readability
                t.toUrl.split('?')[0],
                t.isUrlChange ? "Yes" : "No",
                t.isDomChange ? "Yes" : "No",
                (t.timeBetweenMs / 1000).toFixed(2)
            ])
        };
    }
    
    // NEW: State Flag Analysis Table
    if (analysisData.stateFlags?.summary) {
        tables.stateFlags = {
            title: "State Flag Analysis",
            headers: ["Flag Type", "Count", "Percent of States"],
            rows: [
                ["Navigation", analysisData.stateFlags.summary.navigationCount, 
                 ((analysisData.stateFlags.summary.navigationCount / Math.max(1, analysisData.stateFlags.summary.navigationCount + 
                   analysisData.stateFlags.summary.reloadCount + 
                   analysisData.stateFlags.summary.initialCount + 
                   analysisData.stateFlags.summary.loadingStateCount + 
                   analysisData.stateFlags.summary.finalStateCount)) * 100).toFixed(1) + '%'],
                ["Reload", analysisData.stateFlags.summary.reloadCount, 
                 ((analysisData.stateFlags.summary.reloadCount / Math.max(1, analysisData.stateFlags.summary.navigationCount + 
                   analysisData.stateFlags.summary.reloadCount + 
                   analysisData.stateFlags.summary.initialCount + 
                   analysisData.stateFlags.summary.loadingStateCount + 
                   analysisData.stateFlags.summary.finalStateCount)) * 100).toFixed(1) + '%'],
                ["Initial", analysisData.stateFlags.summary.initialCount, 
                 ((analysisData.stateFlags.summary.initialCount / Math.max(1, analysisData.stateFlags.summary.navigationCount + 
                   analysisData.stateFlags.summary.reloadCount + 
                   analysisData.stateFlags.summary.initialCount + 
                   analysisData.stateFlags.summary.loadingStateCount + 
                   analysisData.stateFlags.summary.finalStateCount)) * 100).toFixed(1) + '%'],
                ["Loading", analysisData.stateFlags.summary.loadingStateCount, 
                 ((analysisData.stateFlags.summary.loadingStateCount / Math.max(1, analysisData.stateFlags.summary.navigationCount + 
                   analysisData.stateFlags.summary.reloadCount + 
                   analysisData.stateFlags.summary.initialCount + 
                   analysisData.stateFlags.summary.loadingStateCount + 
                   analysisData.stateFlags.summary.finalStateCount)) * 100).toFixed(1) + '%'],
                ["Final", analysisData.stateFlags.summary.finalStateCount, 
                 ((analysisData.stateFlags.summary.finalStateCount / Math.max(1, analysisData.stateFlags.summary.navigationCount + 
                   analysisData.stateFlags.summary.reloadCount + 
                   analysisData.stateFlags.summary.initialCount + 
                   analysisData.stateFlags.summary.loadingStateCount + 
                   analysisData.stateFlags.summary.finalStateCount)) * 100).toFixed(1) + '%']
            ]
        };
    }
    
    // NEW: Loading Sequence Table
    if (analysisData.stateFlags?.loadingSequences && analysisData.stateFlags.loadingSequences.length > 0) {
        tables.loadingSequences = {
            title: "Page Loading Sequences",
            headers: ["Start State", "End State", "States Count", "Duration (sec)"],
            rows: analysisData.stateFlags.loadingSequences.map(sequence => [
                sequence.startStateId,
                sequence.endStateId,
                sequence.states.length,
                (sequence.duration / 1000).toFixed(2)
            ])
        };
    }
    
    // NEW: Form Interaction Transitions Table
    if (analysisData.formTransitions?.fieldTransitions) {
        const fieldData = Object.entries(analysisData.formTransitions.fieldTransitions)
            .map(([fieldId, data]) => ({
                fieldId,
                transitions: data.transitions.length,
                valueChanges: data.valueChangeCount,
                corrections: data.correctionCount,
                correctionRate: data.transitions.length > 0 ? data.correctionCount / data.transitions.length : 0
            }))
            .sort((a, b) => b.transitions - a.transitions);
        
        tables.formTransitions = {
            title: "Form Field Transition Analysis",
            headers: ["Field ID", "Transitions", "Value Changes", "Corrections", "Correction Rate"],
            rows: fieldData.map(data => [
                data.fieldId,
                data.transitions,
                data.valueChanges,
                data.corrections,
                (data.correctionRate * 100).toFixed(1) + '%'
            ])
        };
    }
    
    // NEW: Form Interaction Timing Table
    if (analysisData.formTransitions?.transitionTiming) {
        const timingData = Object.entries(analysisData.formTransitions.transitionTiming)
            .map(([fieldId, timing]) => ({
                fieldId,
                avgMs: timing.avgMs,
                maxMs: timing.maxMs,
                totalTimeMs: timing.totalTimeMs,
                transitions: timing.totalTransitions
            }))
            .sort((a, b) => b.totalTimeMs - a.totalTimeMs);
        
        tables.formTimings = {
            title: "Form Field Interaction Timing",
            headers: ["Field ID", "Avg Time (sec)", "Max Time (sec)", "Total Time (sec)", "Transitions"],
            rows: timingData.map(data => [
                data.fieldId,
                (data.avgMs / 1000).toFixed(2),
                (data.maxMs / 1000).toFixed(2),
                (data.totalTimeMs / 1000).toFixed(2),
                data.transitions
            ])
        };
    }
  
    return tables;
}

/**
 * Analyzes form interaction behaviors across states
 * @param {Array} states - Array of states from a session
 * @returns {Object} Form interaction analysis
 */
function analyzeFormInteractions(states) {
  if (!states || states.length === 0) return {};
  
  const formAnalysis = {
    interactions: [],
    fieldCorrectionRates: {},
    fieldTimings: {},
    sequencePatterns: [],
    completionRate: 0,
    overallStats: {
      totalInteractions: 0,
      corrections: 0,
      emptyToFilledCount: 0,
      invalidToValidCount: 0,
      averageTimePerField: 0
    }
  };
  
  // Extract all form interactions in sequence
  let previousInteractionsByField = {};
  
  states.forEach((state, index) => {
    if (!state.interactionInfo || !['input', 'select', 'textarea', 'button'].includes(
      state.interactionInfo.element?.toLowerCase().split('[')[0]
    )) return;
    
    const interaction = state.interactionInfo;
    const fieldId = interaction.id || interaction.selector || interaction.element;
    const timestamp = state.timestamp ? new Date(state.timestamp).getTime() : 0;
    const value = interaction.value || '';
    const previousValue = interaction.previousValue || '';
    
    // Build rich interaction object
    const interactionData = {
      stateId: state.stateId,
      fieldId,
      fieldType: interaction.element,
      action: interaction.type,
      value,
      previousValue,
      timestamp,
      networkInfo: state.networkInfo || {},
      isCorrection: previousValue !== '' && previousValue !== value,
      isInitialEntry: previousValue === '' && value !== '',
      isEmptying: previousValue !== '' && value === '',
      timeSinceLastInteraction: 0
    };
    
    // Track previous interaction with this field
    if (previousInteractionsByField[fieldId]) {
      const prevInteraction = previousInteractionsByField[fieldId];
      interactionData.timeSinceLastInteraction = timestamp - prevInteraction.timestamp;
      
      // Track field-specific timings
      if (!formAnalysis.fieldTimings[fieldId]) {
        formAnalysis.fieldTimings[fieldId] = {
          interactions: 0,
          totalTimeMs: 0,
          averageTimeMs: 0,
          values: []
        };
      }
      
      formAnalysis.fieldTimings[fieldId].interactions++;
      formAnalysis.fieldTimings[fieldId].totalTimeMs += interactionData.timeSinceLastInteraction;
      formAnalysis.fieldTimings[fieldId].averageTimeMs = 
        formAnalysis.fieldTimings[fieldId].totalTimeMs / formAnalysis.fieldTimings[fieldId].interactions;
      formAnalysis.fieldTimings[fieldId].values.push(value);
    }
    
    // Track correction rates by field
    if (!formAnalysis.fieldCorrectionRates[fieldId]) {
      formAnalysis.fieldCorrectionRates[fieldId] = {
        totalChanges: 0,
        corrections: 0,
        correctionRate: 0
      };
    }
    
    formAnalysis.fieldCorrectionRates[fieldId].totalChanges++;
    if (interactionData.isCorrection) {
      formAnalysis.fieldCorrectionRates[fieldId].corrections++;
      formAnalysis.overallStats.corrections++;
    }
    
    if (interactionData.isInitialEntry) {
      formAnalysis.overallStats.emptyToFilledCount++;
    }
    
    formAnalysis.fieldCorrectionRates[fieldId].correctionRate = 
      formAnalysis.fieldCorrectionRates[fieldId].corrections / 
      formAnalysis.fieldCorrectionRates[fieldId].totalChanges;
    
    // Add to the interactions array
    formAnalysis.interactions.push(interactionData);
    formAnalysis.overallStats.totalInteractions++;
    
    // Update previous interaction tracker
    previousInteractionsByField[fieldId] = interactionData;
  });
  
  // Calculate overall stats
  if (formAnalysis.overallStats.totalInteractions > 0) {
    let totalTime = 0;
    let validInteractions = 0;
    
    formAnalysis.interactions.forEach(interaction => {
      if (interaction.timeSinceLastInteraction > 0) {
        totalTime += interaction.timeSinceLastInteraction;
        validInteractions++;
      }
    });
    
    formAnalysis.overallStats.averageTimePerField = 
      validInteractions > 0 ? totalTime / validInteractions : 0;
  }
  
  // Find sequence patterns (e.g., common field ordering)
  const fieldSequence = formAnalysis.interactions.map(i => i.fieldId);
  if (fieldSequence.length > 0) {
    // Get unique fields in order of first appearance
    const uniqueFields = [...new Set(fieldSequence)];
    formAnalysis.sequencePatterns.push({
      sequence: uniqueFields,
      type: 'first_appearance'
    });
    
    // Check if fills happened in form order
    formAnalysis.sequencePatterns.push({
      sequence: fieldSequence,
      type: 'actual_sequence'
    });
  }
  
  return formAnalysis;
}

/**
 * Analyzes network performance correlation with user behavior
 * @param {Array} states - Array of states from a session
 * @returns {Object} Network performance analysis
 */
function analyzeNetworkPerformance(states) {
  if (!states || states.length === 0) return {};
  
  const networkAnalysis = {
    byState: {},
    byTransition: [],
    performanceImpact: {
      loadTimes: [],
      interactionDelays: [],
      connectionQuality: {}
    },
    summary: {}
  };
  
  // Track network info state by state
  states.forEach((state, index) => {
    const stateId = state.stateId;
    const network = state.networkInfo || {};
    const loading = state.loadingInfo || {};
    
    networkAnalysis.byState[stateId] = {
      effectiveType: network.effectiveType || 'unknown',
      rtt: network.rtt || 0,
      downlink: network.downlink || 0,
      loadTime: loading.loadTime || 0,
      resourceCount: loading.resourceCount || 0,
      timestamp: state.timestamp
    };
    
    // Track by connection quality
    const connectionType = network.effectiveType || 'unknown';
    if (!networkAnalysis.performanceImpact.connectionQuality[connectionType]) {
      networkAnalysis.performanceImpact.connectionQuality[connectionType] = {
        count: 0,
        loadTimes: [],
        avgLoadTime: 0
      };
    }
    
    networkAnalysis.performanceImpact.connectionQuality[connectionType].count++;
    
    if (loading.loadTime) {
      networkAnalysis.performanceImpact.loadTimes.push(loading.loadTime);
      networkAnalysis.performanceImpact.connectionQuality[connectionType].loadTimes.push(loading.loadTime);
      
      // Calculate average load time for this connection type
      const loadTimes = networkAnalysis.performanceImpact.connectionQuality[connectionType].loadTimes;
      networkAnalysis.performanceImpact.connectionQuality[connectionType].avgLoadTime = 
        loadTimes.reduce((sum, time) => sum + time, 0) / loadTimes.length;
    }
    
    // Add transition timing if we have a previous state
    if (index > 0) {
      const prevState = states[index - 1];
      const prevNetwork = prevState.networkInfo || {};
      const transitionTime = state.timeSincePreviousState || 0;
      
      networkAnalysis.byTransition.push({
        fromStateId: prevState.stateId,
        toStateId: stateId,
        networkBeforeType: prevNetwork.effectiveType || 'unknown',
        networkAfterType: network.effectiveType || 'unknown',
        rttBefore: prevNetwork.rtt || 0,
        rttAfter: network.rtt || 0,
        transitionTimeMs: transitionTime,
        hasNetworkChange: 
          prevNetwork.effectiveType !== network.effectiveType || 
          Math.abs((prevNetwork.rtt || 0) - (network.rtt || 0)) > 20
      });
      
      // Track interaction delays by network quality
      if (state.interactionInfo && transitionTime > 0) {
        networkAnalysis.performanceImpact.interactionDelays.push({
          connectionType: network.effectiveType || 'unknown',
          delayMs: transitionTime,
          interactionType: state.interactionInfo.type || 'unknown'
        });
      }
    }
  });
  
  // Generate summary statistics
  networkAnalysis.summary = {
    connectionTypes: Object.keys(networkAnalysis.performanceImpact.connectionQuality).map(type => ({
      type,
      count: networkAnalysis.performanceImpact.connectionQuality[type].count,
      avgLoadTime: networkAnalysis.performanceImpact.connectionQuality[type].avgLoadTime
    })),
    avgLoadTime: networkAnalysis.performanceImpact.loadTimes.length > 0 ?
      networkAnalysis.performanceImpact.loadTimes.reduce((sum, time) => sum + time, 0) / 
      networkAnalysis.performanceImpact.loadTimes.length : 0,
    networkChanges: networkAnalysis.byTransition.filter(t => t.hasNetworkChange).length,
    slowestConnection: Object.entries(networkAnalysis.performanceImpact.connectionQuality)
      .sort((a, b) => b[1].avgLoadTime - a[1].avgLoadTime)
      .map(([type, data]) => ({ type, avgLoadTime: data.avgLoadTime }))[0] || { type: 'none', avgLoadTime: 0 }
  };
  
  return networkAnalysis;
}

/**
 * Analyzes DOM fingerprint/hash transitions for identifying page state changes
 * @param {Array} states - Array of states from a session
 * @returns {Object} DOM fingerprint analysis
 */
function analyzeDomFingerprints(states) {
  if (!states || states.length === 0) return {};
  
  const fingerprintAnalysis = {
    uniqueFingerprints: new Set(),
    fingerprintTransitions: [],
    urlToFingerprints: {},
    fingerprintToStates: {},
    recurringPatterns: [],
    summary: {}
  };
  
  // Track all fingerprints and their relationships
  states.forEach((state, index) => {
    const hash = state.hash || '';
    const url = state.url || '';
    
    if (!hash) return;
    
    fingerprintAnalysis.uniqueFingerprints.add(hash);
    
    // Map URL to fingerprints
    if (!fingerprintAnalysis.urlToFingerprints[url]) {
      fingerprintAnalysis.urlToFingerprints[url] = new Set();
    }
    fingerprintAnalysis.urlToFingerprints[url].add(hash);
    
    // Map fingerprints to states
    if (!fingerprintAnalysis.fingerprintToStates[hash]) {
      fingerprintAnalysis.fingerprintToStates[hash] = [];
    }
    fingerprintAnalysis.fingerprintToStates[hash].push(state.stateId);
    
    // Track transitions between fingerprints
    if (index > 0) {
      const prevState = states[index - 1];
      const prevHash = prevState.hash || '';
      const prevUrl = prevState.url || '';
      
      if (prevHash && hash) {
        fingerprintAnalysis.fingerprintTransitions.push({
          fromHash: prevHash,
          toHash: hash,
          fromUrl: prevUrl,
          toUrl: url,
          isUrlChange: prevUrl !== url,
          isDomChange: prevHash !== hash,
          stateChange: { from: prevState.stateId, to: state.stateId },
          timeBetweenMs: state.timeSincePreviousState || 0
        });
      }
    }
  });
  
  // Analyze recurring patterns (like A→B→C→A cycles)
  const transitionSequence = fingerprintAnalysis.fingerprintTransitions.map(t => t.toHash);
  if (transitionSequence.length > 2) {
    // Find repeating subsequences of length 2 or more
    for (let length = 2; length <= Math.min(5, transitionSequence.length / 2); length++) {
      for (let i = 0; i <= transitionSequence.length - 2 * length; i++) {
        const pattern = transitionSequence.slice(i, i + length);
        const patternStr = pattern.join('→');
        
        // Look for this pattern later in the sequence
        for (let j = i + length; j <= transitionSequence.length - length; j++) {
          const comparePattern = transitionSequence.slice(j, j + length);
          const compareStr = comparePattern.join('→');
          
          if (patternStr === compareStr) {
            // Found a recurring pattern
            fingerprintAnalysis.recurringPatterns.push({
              pattern,
              firstOccurrence: i,
              nextOccurrence: j,
              length
            });
            break; // Only record the first recurrence
          }
        }
      }
    }
  }
  
  // Prepare summary data
  fingerprintAnalysis.summary = {
    uniqueCount: fingerprintAnalysis.uniqueFingerprints.size,
    transitionCount: fingerprintAnalysis.fingerprintTransitions.length,
    urlChangeCount: fingerprintAnalysis.fingerprintTransitions.filter(t => t.isUrlChange).length,
    domChangeOnlyCount: fingerprintAnalysis.fingerprintTransitions.filter(t => !t.isUrlChange && t.isDomChange).length,
    recurringPatternCount: fingerprintAnalysis.recurringPatterns.length,
    avgFingerprintsPerUrl: Object.keys(fingerprintAnalysis.urlToFingerprints).length > 0 ?
      Array.from(fingerprintAnalysis.uniqueFingerprints).length / Object.keys(fingerprintAnalysis.urlToFingerprints).length : 0,
    mostFrequentFingerprint: Object.entries(fingerprintAnalysis.fingerprintToStates)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([hash, states]) => ({ hash, count: states.length }))[0] || { hash: 'none', count: 0 }
  };
  
  return fingerprintAnalysis;
}

/**
 * Analyzes transition state flags for better understanding of page state changes
 * @param {Array} states - Array of states from a session
 * @returns {Object} State flag analysis
 */
function analyzeStateFlags(states) {
  if (!states || states.length === 0) return {};
  
  const flagAnalysis = {
    statesByFlags: {
      isNavigation: [],
      isReload: [],
      isInitial: [],
      isPartOfLoading: [],
      isFinalState: []
    },
    flagTransitions: [],
    flagSequences: [],
    loadingSequences: [],
    summary: {}
  };
  
  // Group states by their flags
  states.forEach((state, index) => {
    if (state.isNavigation) flagAnalysis.statesByFlags.isNavigation.push(index);
    if (state.isReload) flagAnalysis.statesByFlags.isReload.push(index);
    if (state.isInitial) flagAnalysis.statesByFlags.isInitial.push(index);
    if (state.isPartOfLoading) flagAnalysis.statesByFlags.isPartOfLoading.push(index);
    if (state.isFinalState) flagAnalysis.statesByFlags.isFinalState.push(index);
    
    // Track transitions between state flags
    if (index > 0) {
      const prevState = states[index - 1];
      
      flagAnalysis.flagTransitions.push({
        fromState: prevState.stateId,
        toState: state.stateId,
        fromStateNumber: prevState.stateNumber,
        toStateNumber: state.stateNumber,
        flags: {
          navigationChange: prevState.isNavigation !== state.isNavigation,
          reloadChange: prevState.isReload !== state.isReload,
          loadingChange: prevState.isPartOfLoading !== state.isPartOfLoading,
          finalStateChange: prevState.isFinalState !== state.isFinalState
        },
        timeBetweenMs: state.timeSincePreviousState || 0
      });
    }
  });
  
  // Find loading state sequences (isPartOfLoading=true → isPartOfLoading=false transitions)
  let currentLoadingSequence = null;
  
  states.forEach((state, index) => {
    if (state.isPartOfLoading && !currentLoadingSequence) {
      // Start a new loading sequence
      currentLoadingSequence = {
        startIndex: index,
        startStateId: state.stateId,
        states: [state.stateId],
        endIndex: null,
        endStateId: null,
        duration: 0
      };
    } else if (state.isPartOfLoading && currentLoadingSequence) {
      // Continue existing loading sequence
      currentLoadingSequence.states.push(state.stateId);
    } else if (!state.isPartOfLoading && currentLoadingSequence) {
      // End loading sequence
      currentLoadingSequence.endIndex = index;
      currentLoadingSequence.endStateId = state.stateId;
      
      // Calculate duration
      const startTime = states[currentLoadingSequence.startIndex].timestamp ? 
        new Date(states[currentLoadingSequence.startIndex].timestamp).getTime() : 0;
      const endTime = state.timestamp ? new Date(state.timestamp).getTime() : 0;
      currentLoadingSequence.duration = endTime - startTime;
      
      // Store the sequence
      flagAnalysis.loadingSequences.push(currentLoadingSequence);
      currentLoadingSequence = null;
    }
  });
  
  // Generate summary
  flagAnalysis.summary = {
    navigationCount: flagAnalysis.statesByFlags.isNavigation.length,
    reloadCount: flagAnalysis.statesByFlags.isReload.length,
    initialCount: flagAnalysis.statesByFlags.isInitial.length,
    loadingStateCount: flagAnalysis.statesByFlags.isPartOfLoading.length,
    finalStateCount: flagAnalysis.statesByFlags.isFinalState.length,
    loadingSequenceCount: flagAnalysis.loadingSequences.length,
    avgLoadingSequenceDuration: flagAnalysis.loadingSequences.length > 0 ?
      flagAnalysis.loadingSequences.reduce((sum, seq) => sum + seq.duration, 0) / 
      flagAnalysis.loadingSequences.length : 0,
    avgLoadingStatesPerSequence: flagAnalysis.loadingSequences.length > 0 ?
      flagAnalysis.loadingSequences.reduce((sum, seq) => sum + seq.states.length, 0) / 
      flagAnalysis.loadingSequences.length : 0
  };
  
  return flagAnalysis;
}

/**
 * Analyzes form interaction transitions in more detail
 * @param {Array} states - Array of states from a session
 * @returns {Object} Form interaction transition analysis
 */
function analyzeFormInteractionTransitions(states) {
  if (!states || states.length === 0) return {};
  
  const formTransitionAnalysis = {
    formTransitions: [],
    fieldTransitions: {},
    transitionTiming: {},
    valueChangeSequences: [],
    summary: {}
  };
  
  // Track form field transitions
  states.forEach((state, index) => {
    if (!state.interactionInfo) return;
    
    const interaction = state.interactionInfo;
    // Focus on form elements
    if (!['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'FORM'].includes(
      interaction.element?.toUpperCase().split('[')[0]
    )) return;
    
    const fieldId = interaction.id || interaction.selector || interaction.element;
    const value = interaction.value || '';
    const previousValue = interaction.previousValue || '';
    
    // Skip if no value change
    if (value === previousValue && interaction.type !== 'focus' && interaction.type !== 'blur') return;
    
    // Get previous state if it exists
    const prevState = index > 0 ? states[index - 1] : null;
    
    // Build transition object
    const transition = {
      stateId: state.stateId,
      stateNumber: state.stateNumber,
      timestamp: state.timestamp ? new Date(state.timestamp).getTime() : 0,
      fieldId,
      actionType: interaction.type || 'unknown',
      value,
      previousValue,
      isCorrection: previousValue !== '' && previousValue !== value,
      isInitialEntry: previousValue === '' && value !== '',
      hash: state.hash,
      url: state.url,
      timeSincePreviousStateMs: state.timeSincePreviousState || 0,
      domChangedSinceLastInteraction: prevState ? prevState.hash !== state.hash : false,
      flags: {
        isNavigation: state.isNavigation || false,
        isReload: state.isReload || false,
        isPartOfLoading: state.isPartOfLoading || false
      }
    };
    
    // Add to transitions array
    formTransitionAnalysis.formTransitions.push(transition);
    
    // Track transitions by field
    if (!formTransitionAnalysis.fieldTransitions[fieldId]) {
      formTransitionAnalysis.fieldTransitions[fieldId] = {
        transitions: [],
        correctionCount: 0,
        valueChangeCount: 0,
        values: [],
        transitionTypes: {}
      };
    }
    
    formTransitionAnalysis.fieldTransitions[fieldId].transitions.push(transition);
    formTransitionAnalysis.fieldTransitions[fieldId].values.push(value);
    
    if (transition.isCorrection) {
      formTransitionAnalysis.fieldTransitions[fieldId].correctionCount++;
    }
    
    if (value !== previousValue) {
      formTransitionAnalysis.fieldTransitions[fieldId].valueChangeCount++;
    }
    
    // Track transition types
    const actionType = interaction.type || 'unknown';
    formTransitionAnalysis.fieldTransitions[fieldId].transitionTypes[actionType] = 
      (formTransitionAnalysis.fieldTransitions[fieldId].transitionTypes[actionType] || 0) + 1;
  });
  
  // Calculate transition timing statistics
  Object.keys(formTransitionAnalysis.fieldTransitions).forEach(fieldId => {
    const transitions = formTransitionAnalysis.fieldTransitions[fieldId].transitions;
    
    if (transitions.length < 2) return;
    
    const timeBetweenTransitions = [];
    
    for (let i = 1; i < transitions.length; i++) {
      const current = transitions[i];
      const previous = transitions[i-1];
      
      const timeDiff = current.timestamp - previous.timestamp;
      if (timeDiff > 0) {
        timeBetweenTransitions.push(timeDiff);
      }
    }
    
    formTransitionAnalysis.transitionTiming[fieldId] = {
      minMs: Math.min(...timeBetweenTransitions) || 0,
      maxMs: Math.max(...timeBetweenTransitions) || 0,
      avgMs: timeBetweenTransitions.length > 0 ?
        timeBetweenTransitions.reduce((sum, time) => sum + time, 0) / timeBetweenTransitions.length : 0,
      medianMs: timeBetweenTransitions.length > 0 ?
        [...timeBetweenTransitions].sort((a, b) => a - b)[Math.floor(timeBetweenTransitions.length / 2)] : 0,
      totalTransitions: transitions.length,
      totalTimeMs: timeBetweenTransitions.reduce((sum, time) => sum + time, 0)
    };
  });
  
  // Generate summary
  const totalTransitions = formTransitionAnalysis.formTransitions.length;
  const totalCorrections = Object.values(formTransitionAnalysis.fieldTransitions)
    .reduce((sum, field) => sum + field.correctionCount, 0);
  
  formTransitionAnalysis.summary = {
    totalTransitions,
    totalFields: Object.keys(formTransitionAnalysis.fieldTransitions).length,
    totalCorrections,
    correctionRate: totalTransitions > 0 ? totalCorrections / totalTransitions : 0,
    fieldWithMostTransitions: Object.entries(formTransitionAnalysis.fieldTransitions)
      .sort((a, b) => b[1].transitions.length - a[1].transitions.length)
      .map(([fieldId, data]) => ({
        fieldId,
        transitionCount: data.transitions.length,
        correctionCount: data.correctionCount
      }))[0] || { fieldId: 'none', transitionCount: 0, correctionCount: 0 },
    avgTransitionsPerField: Object.keys(formTransitionAnalysis.fieldTransitions).length > 0 ?
      totalTransitions / Object.keys(formTransitionAnalysis.fieldTransitions).length : 0,
    fieldsWithCorrections: Object.values(formTransitionAnalysis.fieldTransitions)
      .filter(field => field.correctionCount > 0).length
  };
  
  return formTransitionAnalysis;
}

/**
 * Processes a single session to extract detailed event-based features from its states.
 * @param {Object} session - The session object containing states and events
 * @returns {Object} - The enriched session with processed event features
 */
async function processSessionForDetailedEvents(session) {
    console.log(`Stage 1: Processing session ${session.id || session.sessionId} with ${session.states?.length || 0} states`);
    
    if (!session.states || session.states.length === 0) {
        console.warn(`Session ${session.id || session.sessionId} has no states, skipping processing`);
        return session;
    }
    
    try {
        // Process transitional events first (state navigation patterns)
        console.log(`Analyzing transitional patterns for ${session.states.length} states...`);
        const transitionPatterns = analyzeTransitionPatterns(session.states);
        
        // Process form interactions
        console.log(`Analyzing form interaction behaviors...`);
        const formBehaviors = analyzeFormInteractions(session.states);
        
        // Process network performance
        console.log(`Analyzing network performance correlation...`);
        const networkPerformance = analyzeNetworkPerformance(session.states);
        
        // Process DOM fingerprints/hash transitions
        console.log(`Analyzing DOM fingerprint patterns...`);
        const domFingerprints = analyzeDomFingerprints(session.states);
        
        // NEW: Process state flags
        console.log(`Analyzing state flag transitions...`);
        const stateFlags = analyzeStateFlags(session.states);
        
        // NEW: Process form interaction transitions
        console.log(`Analyzing form interaction transitions...`);
        const formTransitions = analyzeFormInteractionTransitions(session.states);
        
        // Create HTML table structures for the report
        console.log(`Generating HTML table structures for reporting...`);
        const htmlTables = generateHtmlTableStructures({
            transitionPatterns,
            formBehaviors,
            networkPerformance,
            domFingerprints,
            stateFlags,         // NEW
            formTransitions     // NEW
        });
        
        // Store all the session analysis in one place
        session.sessionAnalysis = {
            transitionPatterns,
            formBehaviors,
            networkPerformance,
            domFingerprints,
            stateFlags,         // NEW
            formTransitions,    // NEW
            htmlTables,
            summary: {
                ...transitionPatterns.summary,
                forms: formBehaviors.overallStats || {},
                network: networkPerformance.summary || {},
                fingerprints: domFingerprints.summary || {},
                stateFlags: stateFlags.summary || {},           // NEW
                formTransitions: formTransitions.summary || {}  // NEW
            }
        };
        
        console.log(`Session analysis complete. Found ${transitionPatterns.summary.uniqueUrlCount} unique URLs, ` +
            `${transitionPatterns.summary.domTransitionCount} DOM transitions, ` +
            `${transitionPatterns.summary.urlTransitionCount} URL transitions, ` +
            `${transitionPatterns.summary.skeletonStateCount} loading states, ` +
            `${formBehaviors.overallStats.totalInteractions || 0} form interactions, ` +
            `${domFingerprints.summary.uniqueCount || 0} unique DOM fingerprints, ` +
            `${stateFlags.summary.loadingSequenceCount || 0} loading sequences, and ` +
            `${formTransitions.summary.totalTransitions || 0} form transitions.`);
        
        // Mark that stage 1 processing is complete
        session.stageResults = {
            stage1: {
                completed: true,
                processingTime: new Date().toISOString(),
                statesCounted: session.states.length,
                uniqueUrlsCounted: transitionPatterns.summary.uniqueUrlCount,
                uniqueHashesCounted: transitionPatterns.summary.uniqueHashCount,
                formInteractionsCounted: formBehaviors.overallStats.totalInteractions || 0,
                stateTransitionsCounted: formTransitions.summary.totalTransitions || 0 // NEW
            }
        };
        
        return session;
    } catch (error) {
        console.error(`Error in processSessionForDetailedEvents for session ${session.id || session.sessionId}:`, error);
        // Return session with error flag but don't completely fail
        session.stageResults = {
            stage1: {
                completed: false,
                error: error.message
            }
        };
        return session;
    }
}

module.exports = {
    processSessionForDetailedEvents,
    // Export for testing if needed
    analyzeFormInteractions,
    analyzeNetworkPerformance, 
    analyzeDomFingerprints,
    analyzeStateFlags,              // NEW
    analyzeFormInteractionTransitions // NEW
}; 