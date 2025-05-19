/**
 * Stage 1: Detailed Event Processor - Enhanced Transitional Analysis
 * 
 * This enhanced version focuses on:
 * 1. Extracting rich transitional data
 * 2. Comparing sessions and states
 * 3. Analyzing user behavior patterns
 * 4. Structuring data for HTML table rendering
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
 * Analyzes a sequence of states to extract transition patterns
 * @param {Array} states - Array of states from a session
 * @returns {Object} Transition pattern analysis
 */
function analyzeTransitionPatterns(states) {
  if (!states || states.length === 0) return {};
  
  const patterns = {
    urlTransitions: [], // Tracks page-to-page navigation
    formInteractions: [], // Tracks form field interactions across states
    navigationLoops: [], // Identifies when users return to previous URLs
    statesByUrl: {}, // Groups states by URL for comparison
    uniqueUrls: new Set(), // Set of unique URLs visited
    urlVisitCounts: {}, // Count of visits per URL
    averageTimePerUrl: {}, // Average time spent on each URL
    transitionTriggerTypes: {}, // Count of different transition trigger types
  };
  
  // Process each state to build transition data
  states.forEach((state, index) => {
    const url = state.url || '';
    const stateId = state.stateId;
    const timestamp = state.timestamp ? new Date(state.timestamp).getTime() : 0;
    
    // Track URL visits
    patterns.uniqueUrls.add(url);
    patterns.urlVisitCounts[url] = (patterns.urlVisitCounts[url] || 0) + 1;
    
    // Group states by URL
    if (!patterns.statesByUrl[url]) patterns.statesByUrl[url] = [];
    patterns.statesByUrl[url].push({
      stateId,
      stateNumber: state.stateNumber,
      timestamp,
      index
    });
    
    // Track transition triggers
    let triggerType = 'unknown';
    if (state.interactionInfo) triggerType = 'userInteraction';
    else if (state.isNavigation || state.loadingInfo?.isNavigation) triggerType = 'navigation';
    else if (state.isReload || state.loadingInfo?.isReload) triggerType = 'reload';
    else if (state.mutationInfo?.count > 0) triggerType = 'domMutation';
    
    patterns.transitionTriggerTypes[triggerType] = (patterns.transitionTriggerTypes[triggerType] || 0) + 1;
    
    // Track URL transitions (if not first state)
    if (index > 0) {
      const prevState = states[index - 1];
      const prevUrl = prevState.url || '';
      if (prevUrl !== url) {
        patterns.urlTransitions.push({
          from: prevUrl,
          to: url,
          fromStateId: prevState.stateId,
          toStateId: stateId,
          triggerType,
          timeBetweenMs: timestamp - (prevState.timestamp ? new Date(prevState.timestamp).getTime() : 0)
        });
      }
      
      // Check for navigation loops (returning to previously visited URL)
      if (patterns.urlVisitCounts[url] > 1) {
        // Find previous visit to this URL
        const prevVisits = patterns.statesByUrl[url].filter(s => s.index < index);
        if (prevVisits.length > 0) {
          const lastVisit = prevVisits[prevVisits.length - 1];
          patterns.navigationLoops.push({
            url,
            firstVisitStateId: lastVisit.stateId,
            returnVisitStateId: stateId,
            statesBetween: index - lastVisit.index - 1,
            timeBetweenMs: timestamp - lastVisit.timestamp
          });
        }
      }
    }
    
    // Track form interactions if present in interactionInfo
    if (state.interactionInfo && 
        (state.interactionInfo.tagName === 'INPUT' || 
         state.interactionInfo.tagName === 'SELECT' || 
         state.interactionInfo.tagName === 'TEXTAREA')) {
      patterns.formInteractions.push({
        stateId,
        fieldType: state.interactionInfo.type || state.interactionInfo.tagName.toLowerCase(),
        fieldId: state.interactionInfo.id || state.interactionInfo.name || state.interactionInfo.selector,
        fieldLabel: state.interactionInfo.label || 'Unlabeled Field',
        action: state.interactionInfo.trigger || 'interaction',
        value: state.interactionInfo.value,
        previousValue: state.interactionInfo.previousValue,
        timestamp
      });
    }
  });
  
  // Calculate average time per URL
  Object.keys(patterns.statesByUrl).forEach(url => {
    const states = patterns.statesByUrl[url];
    if (states.length <= 1) {
      patterns.averageTimePerUrl[url] = 0; // Can't calculate time with only one state
      return;
    }
    
    let totalTimeMs = 0;
    let validTimePoints = 0;
    
    for (let i = 0; i < states.length - 1; i++) {
      const currentState = states[i];
      const nextState = states[i + 1];
      
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
  
  // Add summary statistics
  patterns.summary = {
    totalStates: states.length,
    uniqueUrlCount: patterns.uniqueUrls.size,
    navigationLoopCount: patterns.navigationLoops.length,
    formInteractionCount: patterns.formInteractions.length,
    mostVisitedUrl: Object.entries(patterns.urlVisitCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([url, count]) => ({ url, count }))[0] || { url: 'none', count: 0 },
    transitionTypeSummary: patterns.transitionTriggerTypes,
    averageStatesPerUrl: states.length / Math.max(1, patterns.uniqueUrls.size)
  };
  
  return patterns;
}

/**
 * Analyzes form completion patterns across states
 * @param {Array} states - Array of states from a session
 * @returns {Object} Form completion analysis
 */
function analyzeFormCompletionPatterns(states) {
  if (!states || states.length === 0) return {};
  
  const forms = {};
  const formCompletionPaths = [];
  let currentForm = null;
  let currentFormFields = new Set();
  
  // Identify form interactions and group them
  states.forEach((state, index) => {
    if (!state.interactionInfo) return;
    
    const interaction = state.interactionInfo;
    if (interaction.tagName === 'FORM' && interaction.trigger === 'submit') {
      // Form submission detected
      if (currentForm) {
        formCompletionPaths.push({
          formId: currentForm,
          fields: Array.from(currentFormFields),
          submittedAtStateId: state.stateId,
          stateNumber: state.stateNumber
        });
      }
      currentForm = interaction.id || interaction.selector || `form_${index}`;
      currentFormFields = new Set();
    } 
    else if (interaction.tagName === 'INPUT' || interaction.tagName === 'SELECT' || interaction.tagName === 'TEXTAREA') {
      // Form field interaction detected
      const fieldId = interaction.id || interaction.name || interaction.selector || `field_${index}`;
      const formId = interaction.form || currentForm || 'unknown_form';
      
      if (!forms[formId]) forms[formId] = { fields: {}, interactions: [] };
      
      if (!forms[formId].fields[fieldId]) {
        forms[formId].fields[fieldId] = {
          type: interaction.type || interaction.tagName.toLowerCase(),
          label: interaction.label || 'Unlabeled Field',
          interactionCount: 0,
          values: []
        };
      }
      
      forms[formId].fields[fieldId].interactionCount++;
      if (interaction.value !== undefined) {
        forms[formId].fields[fieldId].values.push(interaction.value);
      }
      
      forms[formId].interactions.push({
        stateId,
        stateNumber: state.stateNumber,
        fieldId,
        action: interaction.trigger || 'interaction',
        timestamp: state.timestamp
      });
      
      if (currentForm === formId) {
        currentFormFields.add(fieldId);
      }
    }
  });
  
  // Calculate form completion metrics
  Object.keys(forms).forEach(formId => {
    const form = forms[formId];
    const fieldCount = Object.keys(form.fields).length;
    
    form.summary = {
      fieldCount,
      totalInteractions: form.interactions.length,
      averageInteractionsPerField: fieldCount > 0 ? form.interactions.length / fieldCount : 0,
      completed: formCompletionPaths.some(path => path.formId === formId)
    };
  });
  
  return {
    forms,
    formCompletionPaths,
    summary: {
      formCount: Object.keys(forms).length,
      completedFormCount: formCompletionPaths.length
    }
  };
}

/**
 * Generates HTML table structures for various analyses
 * @param {Object} analysisData - The analysis data to format
 * @returns {Object} HTML table structures for different analyses
 */
function generateHtmlTableStructures(analysisData) {
  const tables = {};
  
  // State Transition Table
  if (analysisData.transitionPatterns && analysisData.transitionPatterns.urlTransitions) {
    tables.stateTransitions = {
      title: "State Transitions",
      headers: ["From URL", "To URL", "Trigger Type", "Time Between (ms)"],
      rows: analysisData.transitionPatterns.urlTransitions.map(transition => [
        transition.from,
        transition.to,
        transition.triggerType,
        transition.timeBetweenMs
      ])
    };
  }
  
  // URL Visit Summary Table
  if (analysisData.transitionPatterns && analysisData.transitionPatterns.urlVisitCounts) {
    const urlData = Object.entries(analysisData.transitionPatterns.urlVisitCounts)
      .map(([url, count]) => ({
        url,
        count,
        avgTime: analysisData.transitionPatterns.averageTimePerUrl[url] || 0
      }))
      .sort((a, b) => b.count - a.count);
    
    tables.urlVisitSummary = {
      title: "URL Visit Summary",
      headers: ["URL", "Visit Count", "Avg Time Spent (ms)"],
      rows: urlData.map(data => [
        data.url,
        data.count,
        Math.round(data.avgTime)
      ])
    };
  }
  
  // Form Interaction Table
  if (analysisData.formPatterns && analysisData.formPatterns.forms) {
    const formData = [];
    Object.entries(analysisData.formPatterns.forms).forEach(([formId, form]) => {
      Object.entries(form.fields).forEach(([fieldId, field]) => {
        formData.push({
          formId,
          fieldId,
          fieldType: field.type,
          fieldLabel: field.label,
          interactionCount: field.interactionCount,
          lastValue: field.values.length > 0 ? field.values[field.values.length - 1] : 'N/A'
        });
      });
    });
    
    tables.formInteractions = {
      title: "Form Field Interactions",
      headers: ["Form ID", "Field", "Type", "Label", "Interactions", "Final Value"],
      rows: formData.map(data => [
        data.formId,
        data.fieldId,
        data.fieldType,
        data.fieldLabel,
        data.interactionCount,
        data.lastValue
      ])
    };
  }
  
  // Navigation Loop Table
  if (analysisData.transitionPatterns && analysisData.transitionPatterns.navigationLoops) {
    tables.navigationLoops = {
      title: "Navigation Loops (Revisited URLs)",
      headers: ["URL", "First Visit State", "Return Visit State", "States Between", "Time Between (ms)"],
      rows: analysisData.transitionPatterns.navigationLoops.map(loop => [
        loop.url,
        loop.firstVisitStateId,
        loop.returnVisitStateId,
        loop.statesBetween,
        loop.timeBetweenMs
      ])
    };
  }
  
  return tables;
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
        // Initialize field input data aggregator for keyboard interactions
        const fieldInputData = {};
        
        // Process transitional events first (state navigation patterns)
        console.log(`Analyzing transitional patterns for ${session.states.length} states...`);
        const transitionPatterns = analyzeTransitionPatterns(session.states);
        
        // Process form completion data
        console.log(`Analyzing form completion patterns...`);
        const formPatterns = analyzeFormCompletionPatterns(session.states);
        
        // Create HTML table structures for the report
        console.log(`Generating HTML table structures for reporting...`);
        const htmlTables = generateHtmlTableStructures({
            transitionPatterns,
            formPatterns
        });
        
        // Store all the session analysis in one place
        session.sessionAnalysis = {
            transitionPatterns,
            formPatterns,
            htmlTables,
            summary: transitionPatterns.summary // For easier access to top-level metrics
        };
        
        console.log(`Session analysis complete. Found ${transitionPatterns.summary.uniqueUrlCount} unique URLs, ${transitionPatterns.summary.navigationLoopCount} navigation loops, and ${transitionPatterns.summary.formInteractionCount} form interactions.`);
        
        // Now process each state for detailed non-transitional events
        for (let i = 0; i < session.states.length; i++) {
            const state = session.states[i];
            
            // Skip states without stateId
            if (!state.stateId) {
                console.warn(`State at index ${i} has no stateId, skipping`);
                continue;
            }
            
            // Initialize processedEventFeatures if it doesn't exist
            if (!state.processedEventFeatures) {
                state.processedEventFeatures = {};
            }
            
            // Add basic state identity
            state.processedEventFeatures.stateIdentity = {
                stateId: state.stateId,
                stateNumber: state.stateNumber || i + 1,
                url: state.url || 'unknown',
                title: state.title || '',
                timestamp: state.timestamp || state.createdAt
            };
            
            // Add transition trigger if available from interactionInfo
            if (state.interactionInfo) {
                const interactionInfo = state.interactionInfo;
                state.processedEventFeatures.transitionTrigger = {
                    type: 'userInteraction',
                    details: {
                        trigger: interactionInfo.trigger || 'unknown',
                        tagName: interactionInfo.tagName || '',
                        label: interactionInfo.targetText || interactionInfo.accessibleName || '',
                        value: interactionInfo.value || '',
                    }
                };
            } else if (state.isNavigation || state.isReload || state.isInitial || state.isPartOfLoading) {
                // For states without interaction but with navigation flags
                state.processedEventFeatures.transitionTrigger = {
                    type: state.isNavigation ? 'navigation' : 
                          state.isReload ? 'reload' : 
                          state.isInitial ? 'initialLoad' : 
                          'loading'
                };
            }
            
            // Add transition details (time since previous state, etc.)
            if (i > 0) {
                const previousState = session.states[i-1];
                const currentTimestamp = new Date(state.timestamp || state.createdAt).getTime();
                const prevTimestamp = new Date(previousState.timestamp || previousState.createdAt).getTime();
                const timeDiff = currentTimestamp - prevTimestamp;
                
                state.processedEventFeatures.transitionDetails = {
                    previousStateId: previousState.stateId,
                    previousUrl: previousState.url || 'unknown',
                    timeSincePreviousStateMs: timeDiff,
                    isUrlChange: state.url !== previousState.url
                };
            }
            
            // Skip states without non-transitional events data
            if (!state.nontransitionalevents) {
                console.log(`No non-transitional events for state ${state.stateId}, skipping detailed event processing`);
                continue;
            }
            
            try {
                const nte = state.nontransitionalevents;
                
                // Process keyboard events
                if (nte.keyboard && Array.isArray(nte.keyboard)) {
                    // ... existing keyboard processing logic ...
                }
                
                // Process pointer events
                if (nte.pointer && Array.isArray(nte.pointer)) {
                    // ... existing pointer processing logic ...
                }
                
                // Process navigation events
                if (nte.navigation && Array.isArray(nte.navigation)) {
                    // ... existing navigation processing logic ...
                }
                
                // Process clipboard events
                if (nte.clipboard && Array.isArray(nte.clipboard)) {
                    // ... existing clipboard processing logic ...
                }
                
            } catch (error) {
                console.error(`Error processing non-transitional events for state ${state.stateId}:`, error);
            }
        }
        
        // Final check to ensure all analysis components are present
        if (!session.sessionAnalysis) {
            console.warn(`Session ${session.id || session.sessionId} analysis object is missing, creating empty structure`);
            session.sessionAnalysis = {
                transitionPatterns: { summary: {} },
                formPatterns: {},
                htmlTables: {},
                summary: {}
            };
        } else if (!session.sessionAnalysis.htmlTables) {
            console.warn(`Session ${session.id || session.sessionId} htmlTables is missing, regenerating`);
            session.sessionAnalysis.htmlTables = generateHtmlTableStructures({
                transitionPatterns: session.sessionAnalysis.transitionPatterns || { summary: {} },
                formPatterns: session.sessionAnalysis.formPatterns || {}
            });
        }
        
        // Mark that stage 1 processing is complete
        session.stageResults = {
            stage1: {
                completed: true,
                processingTime: new Date().toISOString()
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
    processSessionForDetailedEvents
}; 