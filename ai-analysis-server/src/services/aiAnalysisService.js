const Groq = require('groq-sdk');
const axios = require('axios');

// Get the main backend URL from environment or use default
const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:3001';

// Initialize the Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

/**
 * Helper function to clean LLM responses and extract valid JSON.
 * Removes thinking tags and any text before the first '{' or after the last '}'.
 */
function cleanJsonResponse(content) {
  if (!content) {
    console.warn('[Service] cleanJsonResponse received null or empty content');
    return '{}'; // Return empty JSON object for safety
  }
  // Remove thinking tags and any text between them
  let cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  
  // Find the first '{' and last '}' to isolate the JSON object
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    // Attempt to remove trailing commas from arrays and objects, which can cause parsing errors
    cleaned = cleaned.replace(/,\s*(\]|\})/g, '$1');
  } else {
    // If no valid JSON structure is found, log a warning and return an empty JSON object
    console.warn(`[Service] cleanJsonResponse could not find valid JSON structure. Raw content (first 300 chars): ${content.substring(0,300)}`);
    return '{}';
  }
  
  return cleaned;
}

// Helper function to extract relevant session features for analysis
function extractSessionFeatures(session) {
  // Core session metadata
  const features = {
    sessionId: session.sessionId || session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    duration: session.endTime ? new Date(session.endTime) - new Date(session.startTime) : null,
    totalStates: session.states?.length || 0,
    // Create detailed structure for analysis
    stateDetails: [],
    stateTransitions: [],
    interactions: [],
    nonTransitionalMetrics: {
      overall: {
        totalDeadClicks: 0,
        totalHoverEvents: 0,
        totalHoverTime: 0,
        totalKeystrokes: 0,
        backspaceCount: 0,
        escapeCount: 0,
        averageTypingSpeed: 0,
        totalTypingEvents: 0,
        totalInputFieldIdle: 0,
        averageInputFieldIdleDuration: 0,
        totalCopyTextEvents: 0,
        totalPasteEvents: 0,
        totalScrollEvents: 0,
        totalScrollDistance: 0,
        totalInactivityPeriods: 0,
        longestInactivityDuration: 0,
        totalInactivityTime: 0,
        totalOscillatingHovers: 0,
        totalTabNavigations: 0,
        totalMouseDistance: 0,
        averageMouseSpeed: 0,
        repeatedClicksCount: 0,
        repeatedInputsCount: 0,
        formCompletionRate: 0,
        formFieldInteractions: {},
      },
      byState: {},
      temporalPatterns: {
        typingSpeedTrend: [],
        mouseSpeedTrend: [],
        inactivityTrend: [],
        deadClicksTrend: [],
        hoverDurationTrend: [],
      },
    },
    behavioral: {
      confusionIndicators: [],
      hesitationPatterns: [],
      efficiencyMetrics: {}, 
      frustrationSignals: [],
      confidenceIndicators: [],
      learningCurveData: [],
      errorPatterns: [],
    },
    attachedDOM: false,
  };

  // Check if the session has states available
  if (!session.states || !Array.isArray(session.states) || session.states.length === 0) {
    return features;
  }
  
  // ======= PROCESS EACH STATE AND ITS NON-TRANSITIONAL EVENTS =======
  let totalTypingTime = 0;
  let totalKeyCount = 0;
  const allTypingCadences = [];
  let totalHoverDurations = 0;
  let hoverEventsCount = 0;
  let totalInactivityTime = 0;
  let totalFormFieldInteractions = {};
  let uniqueElementsInteractedWith = new Set();
  let uniquePagesVisited = new Set();
  
  // We'll track form field engagement across the session
  const formFieldData = {};
  
  // Track temporal patterns - create buckets for time series analysis
  const sessionDuration = features.duration;
  const timeSegments = 10; // Divide session into 10 segments for trend analysis
  const segmentDuration = sessionDuration ? Math.ceil(sessionDuration / timeSegments) : 0;
  
  const temporalBuckets = Array(timeSegments).fill(null).map(() => ({
    typingSpeed: [],
    mouseSpeed: [],
    inactivity: 0,
    deadClicks: 0,
    hoverDuration: 0,
    events: 0,
  }));
  
  let previousState = null;
  
  // First pass - get basic metrics and patterns
  session.states.forEach((state, stateIndex) => {
    if (!state) return;
    
    // Add state to visited pages
    if (state.url) {
      uniquePagesVisited.add(state.url);
    }
    
    // Record the DOM state details
    const stateDetail = {
      stateId: state.stateId,
      url: state.url || "",
      timestamp: state.timestamp,
      title: state.metrics?.title || "",
      isNavigation: state.loadingInfo?.isNavigation || false, 
      isReload: state.loadingInfo?.isReload || false,
      domSize: state.metrics?.domSize || 0,
      elementCount: state.metrics?.elementCount || 0,
      visibleElements: state.metrics?.visibleElements || 0,
      formElements: state.metrics?.formElements || 0,
      loadTime: state.loadingInfo?.loadTime || 0,
      resourceCount: state.loadingInfo?.resourceCount || 0,
      durationInState: 0, // Will calculate later
      events: {
        keystrokes: 0,
        clicks: 0,
        hovers: 0, 
        scrolls: 0,
        inactivity: 0,
        deadClicks: 0,
      },
    };
    
    // Calculate time spent in this state (if not the last state)
    if (stateIndex < session.states.length - 1) {
      const nextState = session.states[stateIndex + 1];
      const stateStartTime = new Date(state.timestamp).getTime();
      const nextStateTime = new Date(nextState.timestamp).getTime();
      stateDetail.durationInState = nextStateTime - stateStartTime;
    } else if (features.endTime && state.timestamp) {
      // For the last state, use session end time
      const stateStartTime = new Date(state.timestamp).getTime();
      const sessionEndTime = new Date(features.endTime).getTime();
      stateDetail.durationInState = sessionEndTime - stateStartTime;
    }

    // Track transitions between states
    if (previousState !== null) {
      features.stateTransitions.push({
        from: previousState.stateId,
        fromTitle: previousState.metrics?.title || "",
        fromUrl: previousState.url || "",
        to: state.stateId,
        toTitle: state.metrics?.title || "", 
        toUrl: state.url || "",
        transitionType: state.loadingInfo?.isNavigation ? "navigation" : 
                        state.loadingInfo?.isReload ? "reload" : "state-change",
        trigger: state.interactionInfo?.type || "unknown",
        triggerElement: state.interactionInfo?.element || "",
        triggerSelector: state.interactionInfo?.selector || "",
        transitionDuration: new Date(state.timestamp) - new Date(previousState.timestamp),
      });
    }
    previousState = state;
    
    // Add interaction information if present
    if (state.interactionInfo) {
      features.interactions.push({
        type: state.interactionInfo.type,
        element: state.interactionInfo.element,
        selector: state.interactionInfo.selector,
        value: state.interactionInfo.value || "",
        timestamp: state.timestamp,
        previousValue: state.interactionInfo.previousValue || "",
        stateId: state.stateId,
      });
      
      if (state.interactionInfo.element) {
        uniqueElementsInteractedWith.add(state.interactionInfo.element);
      }
    }
    
    // Add timeSegment marker to know which temporal bucket this state belongs to
    if (sessionDuration && segmentDuration > 0) {
      const stateTime = new Date(state.timestamp).getTime();
      const sessionStartTime = new Date(features.startTime).getTime();
      const timeSinceStart = stateTime - sessionStartTime;
      const timeSegmentIndex = Math.floor(timeSinceStart / segmentDuration);
      stateDetail.timeSegment = Math.min(timeSegmentIndex, timeSegments - 1); 
    }
    
    // ===== PROCESS NON-TRANSITIONAL EVENTS FOR THIS STATE =====
    if (state.nonTransitionalEvents) {
      const nte = state.nonTransitionalEvents;
      const stateId = state.stateId;
      
      // Initialize state-specific metrics if this is a new state
      features.nonTransitionalMetrics.byState[stateId] = {
        stateId,
        deadClicks: 0,
        hoverEvents: 0,
        totalHoverTime: 0,
        keystrokes: 0,
        backspaceCount: 0,
        escapeCount: 0,
        inputIdle: 0,
        copyText: 0,
        pasteEvents: 0,
        scrollEvents: 0,
        inactivityPeriods: 0,
        totalInactivityTime: 0,
        oscillatingHovers: 0,
        tabNavigations: 0,
        mouseDistance: 0,
        repeatedClicks: 0,
        repeatedInputs: 0,
        formFields: {},
        typingCadence: [],
        hoverDurations: [],
      };
      
      const stateMetrics = features.nonTransitionalMetrics.byState[stateId];
    
      // Process events object
      if (nte.events) {
        // Dead clicks - indicates confusion or misunderstanding of interface elements
        if (nte.events.deadClicks && Array.isArray(nte.events.deadClicks)) {
          const deadClicks = nte.events.deadClicks;
          stateMetrics.deadClicks = deadClicks.length;
          features.nonTransitionalMetrics.overall.totalDeadClicks += deadClicks.length;
          stateDetail.events.deadClicks = deadClicks.length;
          
          // Add to temporal buckets
          if (stateDetail.timeSegment !== undefined) {
            temporalBuckets[stateDetail.timeSegment].deadClicks += deadClicks.length;
          }
          
          // Extract dead click patterns for behavioral analysis
          deadClicks.forEach(click => {
            if (click.targetElementTag && click.targetElementPath) {
              features.behavioral.confusionIndicators.push({
                type: 'deadClick',
                stateId: stateId,
                element: click.targetElementTag,
                selector: click.targetElementPath,
                timestamp: click.timestamp,
                friendlyName: click.targetElementFriendlyName || ''
              });
            }
          });
        }
        
        // Hover events - can indicate hesitation or exploration
        if (nte.events.hover && Array.isArray(nte.events.hover)) {
          const hovers = nte.events.hover;
          stateMetrics.hoverEvents = hovers.length;
          features.nonTransitionalMetrics.overall.totalHoverEvents += hovers.length;
          stateDetail.events.hovers = hovers.length;
          hoverEventsCount += hovers.length;
          
          // Calculate total hover time
          const totalHoverTimeInState = hovers.reduce((sum, h) => sum + (h.duration || 0), 0);
          stateMetrics.totalHoverTime = totalHoverTimeInState;
          features.nonTransitionalMetrics.overall.totalHoverTime += totalHoverTimeInState;
          totalHoverDurations += totalHoverTimeInState;
          
          // Add to temporal buckets
          if (stateDetail.timeSegment !== undefined) {
            temporalBuckets[stateDetail.timeSegment].hoverDuration += totalHoverTimeInState;
          }
          
          // Store hover durations for distribution analysis
          hovers.forEach(hover => {
            if (hover.duration) {
              stateMetrics.hoverDurations.push(hover.duration);
            }
            
            // Track long hovers (over 2000ms) as possible hesitation
            if (hover.duration > 2000) {
              features.behavioral.hesitationPatterns.push({
                type: 'longHover',
                stateId: stateId,
                element: hover.element,
                selector: hover.selector,
                duration: hover.duration,
                timestamp: hover.timestamp
              });
            }
          });
        }
        
        // Keystroke analysis - analyze typing patterns and corrections
        if (nte.events.allKeyPresses && Array.isArray(nte.events.allKeyPresses)) {
          const keyPresses = nte.events.allKeyPresses;
          stateMetrics.keystrokes = keyPresses.length;
          features.nonTransitionalMetrics.overall.totalKeystrokes += keyPresses.length;
          stateDetail.events.keystrokes = keyPresses.length;
          totalKeyCount += keyPresses.length;
          
          // Count backspaces
          const backspaces = keyPresses.filter(k => k.key === 'Backspace').length;
          stateMetrics.backspaceCount = backspaces;
          features.nonTransitionalMetrics.overall.backspaceCount += backspaces;
          
          // Count escapes
          const escapes = keyPresses.filter(k => k.key === 'Escape').length;
          stateMetrics.escapeCount = escapes;
          features.nonTransitionalMetrics.overall.escapeCount += escapes;
          
          // Track which fields were interacted with
          keyPresses.forEach(key => {
            if (key.fieldIdentifier) {
              // Initialize the field if not already tracked
              if (!formFieldData[key.fieldIdentifier]) {
                formFieldData[key.fieldIdentifier] = {
                  interactions: 0,
                  keyPresses: 0,
                  backspaces: 0,
                  firstInteraction: key.timestamp,
                  lastInteraction: key.timestamp,
                  timeSpent: 0
                };
              }
              
              const field = formFieldData[key.fieldIdentifier];
              field.keyPresses++;
              field.lastInteraction = key.timestamp;
              if (key.key === 'Backspace') field.backspaces++;
              
              // Also track within state metrics
              if (!stateMetrics.formFields[key.fieldIdentifier]) {
                stateMetrics.formFields[key.fieldIdentifier] = {
                  interactions: 0,
                  keyPresses: 0,
                  backspaces: 0
                };
              }
              stateMetrics.formFields[key.fieldIdentifier].keyPresses++;
              if (key.key === 'Backspace') stateMetrics.formFields[key.fieldIdentifier].backspaces++;
            }
          });
        }
        
        // Type cadence - analyze typing speed and rhythm
        if (nte.events.keyTypingCadence && Array.isArray(nte.events.keyTypingCadence)) {
          const typingCadences = nte.events.keyTypingCadence;
          
          // Calculate typing speed stats
          const validCadences = typingCadences
            .filter(c => c.timeSinceLast && c.timeSinceLast > 0 && c.timeSinceLast < 5000); // Filter out unreasonable values
            
          if (validCadences.length > 0) {
            // Calculate average typing speed
            const totalTime = validCadences.reduce((sum, c) => sum + (c.timeSinceLast || 0), 0);
            totalTypingTime += totalTime;
            
            // Store cadences for state-level analysis
            stateMetrics.typingCadence = validCadences.map(c => c.timeSinceLast);
            
            // Add all to global collection for distribution analysis
            validCadences.forEach(c => {
              if (c.timeSinceLast) {
                allTypingCadences.push({
                  time: c.timeSinceLast,
                  field: c.field,
                  key: c.key,
                  stateId: stateId,
                  timestamp: c.timestamp
                });
              }
            });
            
            // Add to temporal buckets
            if (stateDetail.timeSegment !== undefined && validCadences.length > 0) {
              const avgTypingSpeed = totalTime / validCadences.length;
              temporalBuckets[stateDetail.timeSegment].typingSpeed.push(avgTypingSpeed);
            }
          }
        }
        
        // Input field idle - analyze hesitation in form fields
        if (nte.events.inputFieldIdle && Array.isArray(nte.events.inputFieldIdle)) {
          const inputIdles = nte.events.inputFieldIdle;
          stateMetrics.inputIdle = inputIdles.length;
          features.nonTransitionalMetrics.overall.totalInputFieldIdle += inputIdles.length;
          
          inputIdles.forEach(idle => {
            if (idle.duration && idle.field) {
              features.nonTransitionalMetrics.overall.averageInputFieldIdleDuration += idle.duration;
              
              // Also track in form field data
              if (!formFieldData[idle.field]) {
                formFieldData[idle.field] = {
                  interactions: 0,
                  keyPresses: 0,
                  backspaces: 0,
                  firstInteraction: idle.timestamp,
                  lastInteraction: idle.timestamp,
                  timeSpent: 0,
                  idleTime: 0,
                  idleCount: 0
                };
              }
              
              formFieldData[idle.field].idleTime = (formFieldData[idle.field].idleTime || 0) + idle.duration;
              formFieldData[idle.field].idleCount = (formFieldData[idle.field].idleCount || 0) + 1;
              
              // Long idle periods (>3s) might indicate confusion or hesitation
              if (idle.duration > 3000) {
                features.behavioral.hesitationPatterns.push({
                  type: 'fieldHesitation',
                  field: idle.field,
                  stateId: stateId,
                  duration: idle.duration,
                  timestamp: idle.timestamp
                });
              }
            }
          });
        }
        
        // Copy text events - can indicate user researching or reference behavior
        if (nte.events.copyText && Array.isArray(nte.events.copyText)) {
          stateMetrics.copyText = nte.events.copyText.length;
          features.nonTransitionalMetrics.overall.totalCopyTextEvents += nte.events.copyText.length;
        }
        
        // Paste events - can indicate shortcut usage or external data integration
        if (nte.events.pasteWithoutTyping && Array.isArray(nte.events.pasteWithoutTyping)) {
          stateMetrics.pasteEvents = nte.events.pasteWithoutTyping.length;
          features.nonTransitionalMetrics.overall.totalPasteEvents += nte.events.pasteWithoutTyping.length;
          
          // Track paste events as potential efficiency indicators
          nte.events.pasteWithoutTyping.forEach(paste => {
            features.behavioral.efficiencyMetrics.pasteEvents = (features.behavioral.efficiencyMetrics.pasteEvents || 0) + 1;
          });
        }
        
        // Scroll events - analyze page exploration behavior
        if (nte.events.scrollEvents && Array.isArray(nte.events.scrollEvents)) {
          const scrolls = nte.events.scrollEvents;
          stateMetrics.scrollEvents = scrolls.length;
          features.nonTransitionalMetrics.overall.totalScrollEvents += scrolls.length;
          stateDetail.events.scrolls = scrolls.length;
          
          // Calculate total scroll distance
          scrolls.forEach(scroll => {
            if (scroll.scrollDepthY) {
              features.nonTransitionalMetrics.overall.totalScrollDistance += scroll.scrollDepthY;
            }
          });
        }
        
        // Inactivity periods - can indicate confusion, reading, or thinking
        if (nte.events.inactivity && Array.isArray(nte.events.inactivity)) {
          const inactivities = nte.events.inactivity;
          stateMetrics.inactivityPeriods = inactivities.length;
          features.nonTransitionalMetrics.overall.totalInactivityPeriods += inactivities.length;
          stateDetail.events.inactivity = inactivities.length;
          
          // Calculate total inactivity time
          const totalInactivityTimeInState = inactivities.reduce((sum, i) => sum + (i.duration || 0), 0);
          stateMetrics.totalInactivityTime = totalInactivityTimeInState;
          features.nonTransitionalMetrics.overall.totalInactivityTime += totalInactivityTimeInState;
          totalInactivityTime += totalInactivityTimeInState;
          
          // Add to temporal buckets
          if (stateDetail.timeSegment !== undefined) {
            temporalBuckets[stateDetail.timeSegment].inactivity += totalInactivityTimeInState;
          }
          
          // Track longest inactivity period
          const longestInactivity = inactivities.reduce((max, i) => (i.duration > max ? i.duration : max), 0);
          features.nonTransitionalMetrics.overall.longestInactivityDuration = Math.max(
            features.nonTransitionalMetrics.overall.longestInactivityDuration, 
            longestInactivity
          );
          
          // Long inactivity periods (>5s) may indicate confusion or difficulty
          inactivities.forEach(inactivity => {
            if (inactivity.duration > 10000) { // >10 seconds
              features.behavioral.confusionIndicators.push({
                type: 'longInactivity',
                stateId: stateId,
                duration: inactivity.duration,
                timestamp: inactivity.timestamp,
                trigger: inactivity.trigger || 'unknown'
              });
            }
          });
        }
        
        // Oscillating hovers - can indicate uncertainty or indecision
        if (nte.events.oscillatingHovers && Array.isArray(nte.events.oscillatingHovers)) {
          const oscillatingHovers = nte.events.oscillatingHovers;
          stateMetrics.oscillatingHovers = oscillatingHovers.length;
          features.nonTransitionalMetrics.overall.totalOscillatingHovers += oscillatingHovers.length;
          
          // Extract patterns of indecision
          oscillatingHovers.forEach(pattern => {
            if (pattern.elements && pattern.elements.length >= 2) {
              features.behavioral.hesitationPatterns.push({
                type: 'oscillatingHover',
                stateId: stateId,
                elements: pattern.elements.map(e => e.element),
                selectors: pattern.elements.map(e => e.selector),
                switches: pattern.totalSwitches,
                duration: pattern.duration,
                timestamp: pattern.timestamp
              });
            }
          });
        }
        
        // Tab navigation - can indicate keyboard proficiency
        if (nte.events.tabNavigation && Array.isArray(nte.events.tabNavigation)) {
          stateMetrics.tabNavigations = nte.events.tabNavigation.length;
          features.nonTransitionalMetrics.overall.totalTabNavigations += nte.events.tabNavigation.length;
          
          // Track tab usage as efficiency indicator
          nte.events.tabNavigation.forEach(tab => {
            if (tab.sequence && tab.sequence.length > 1) {
              features.behavioral.efficiencyMetrics.tabNavigationSequences = 
                (features.behavioral.efficiencyMetrics.tabNavigationSequences || 0) + 1;
              features.behavioral.efficiencyMetrics.tabNavigationFields = 
                (features.behavioral.efficiencyMetrics.tabNavigationFields || 0) + tab.sequence.length;
            }
          });
        }
        
        // Mouse movement - analyze spatial navigation patterns
        if (nte.events.mousemove) {
          if (typeof nte.events.mousemove.totalDistance === 'number') {
            stateMetrics.mouseDistance = nte.events.mousemove.totalDistance;
            features.nonTransitionalMetrics.overall.totalMouseDistance += nte.events.mousemove.totalDistance;
          }
          
          if (typeof nte.events.mousemove.averageSpeed === 'number') {
            // Add to temporal buckets
            if (stateDetail.timeSegment !== undefined) {
              temporalBuckets[stateDetail.timeSegment].mouseSpeed.push(nte.events.mousemove.averageSpeed);
            }
          }
        }
        
        // Repeated clicks - can indicate frustration or confusion
        if (nte.events.repeatedClicks && Array.isArray(nte.events.repeatedClicks)) {
          const repeatedClicks = nte.events.repeatedClicks;
          stateMetrics.repeatedClicks = repeatedClicks.length;
          features.nonTransitionalMetrics.overall.repeatedClicksCount += repeatedClicks.length;
          
          // Add to frustration signals
          repeatedClicks.forEach(click => {
            features.behavioral.frustrationSignals.push({
              type: 'repeatedClick',
              stateId: stateId,
              element: click.element,
              selector: click.selector,
              count: click.count,
              timestamp: click.timestamp
            });
          });
        }
        
        // Repeated inputs - can indicate uncertainty or trial-and-error
        if (nte.events.repeatedInputs && Array.isArray(nte.events.repeatedInputs)) {
          const repeatedInputs = nte.events.repeatedInputs;
          stateMetrics.repeatedInputs = repeatedInputs.length;
          features.nonTransitionalMetrics.overall.repeatedInputsCount += repeatedInputs.length;
          
          // Add to error patterns
          repeatedInputs.forEach(input => {
            features.behavioral.errorPatterns.push({
              type: 'repeatedInput',
              stateId: stateId,
              field: input.field,
              pattern: input.pattern,
              timestamp: input.timestamp
            });
          });
        }
      }
      
      // Process overall metrics if available
      if (nte.metrics) {
        // Add dwellTimeBeforeAction
        if (nte.metrics.dwellTimeBeforeAction) {
          stateMetrics.dwellTimeBeforeAction = nte.metrics.dwellTimeBeforeAction;
          
          // Long dwell times may indicate hesitation
          if (nte.metrics.dwellTimeBeforeAction > 3000) {
            features.behavioral.hesitationPatterns.push({
              type: 'longDwellTime',
              stateId: stateId,
              duration: nte.metrics.dwellTimeBeforeAction,
              timestamp: state.timestamp
            });
          }
        }
      }
    }
    
    // Add state details to the compiled features
    features.stateDetails.push(stateDetail);
  });
  
  // Second pass - calculate derived metrics
  // ======== TEMPORAL ANALYSIS ========
  // Process temporal buckets to extract trends
  temporalBuckets.forEach((bucket, index) => {
    // Calculate average typing speed for this bucket
    if (bucket.typingSpeed.length > 0) {
      const avgTypingSpeed = bucket.typingSpeed.reduce((sum, speed) => sum + speed, 0) / bucket.typingSpeed.length;
      features.nonTransitionalMetrics.temporalPatterns.typingSpeedTrend.push({
        segment: index + 1,
        value: avgTypingSpeed
      });
    }
    
    // Calculate average mouse speed for this bucket
    if (bucket.mouseSpeed.length > 0) {
      const avgMouseSpeed = bucket.mouseSpeed.reduce((sum, speed) => sum + speed, 0) / bucket.mouseSpeed.length;
      features.nonTransitionalMetrics.temporalPatterns.mouseSpeedTrend.push({
        segment: index + 1,
        value: avgMouseSpeed
      });
    }
    
    // Record inactivity trend
    features.nonTransitionalMetrics.temporalPatterns.inactivityTrend.push({
      segment: index + 1,
      value: bucket.inactivity
    });
    
    // Record dead clicks trend
    features.nonTransitionalMetrics.temporalPatterns.deadClicksTrend.push({
      segment: index + 1, 
      value: bucket.deadClicks
    });
    
    // Record hover duration trend
    features.nonTransitionalMetrics.temporalPatterns.hoverDurationTrend.push({
      segment: index + 1,
      value: bucket.hoverDuration
    });
  });

  // Calculate average typing speed
  if (allTypingCadences.length > 0) {
    const avgTypingSpeed = totalTypingTime / allTypingCadences.length;
    features.nonTransitionalMetrics.overall.averageTypingSpeed = avgTypingSpeed;
    features.nonTransitionalMetrics.overall.totalTypingEvents = allTypingCadences.length;
  }
  
  // ======== FORM FIELD ANALYSIS ========
  // Process form field data to calculate form completion metrics
  if (Object.keys(formFieldData).length > 0) {
    features.nonTransitionalMetrics.overall.formFieldInteractions = formFieldData;
    
    // Calculate interaction time for each field
    Object.keys(formFieldData).forEach(fieldId => {
      const field = formFieldData[fieldId];
      if (field.firstInteraction && field.lastInteraction) {
        field.timeSpent = new Date(field.lastInteraction) - new Date(field.firstInteraction);
      }
    });
    
    // Add to global totals
    features.nonTransitionalMetrics.overall.formCompletionRate = 
      Object.keys(formFieldData).filter(f => 
        formFieldData[f].keyPresses > 0 || formFieldData[f].interactions > 0
      ).length;
  }
  
  // ======== BEHAVIORAL PATTERN ANALYSIS ========
  // Calculate summary stats for behavioral analysis
  
  // Analyze learning curve (e.g., typing speed improvement over time)
  if (features.nonTransitionalMetrics.temporalPatterns.typingSpeedTrend.length > 1) {
    const firstSegment = features.nonTransitionalMetrics.temporalPatterns.typingSpeedTrend[0];
    const lastSegment = features.nonTransitionalMetrics.temporalPatterns.typingSpeedTrend[
      features.nonTransitionalMetrics.temporalPatterns.typingSpeedTrend.length - 1
    ];
    
    if (firstSegment && lastSegment) {
      const typingSpeedImprovement = (firstSegment.value - lastSegment.value) / firstSegment.value;
      
      features.behavioral.learningCurveData.push({
        metric: 'typingSpeed',
        initialValue: firstSegment.value,
        finalValue: lastSegment.value,
        improvement: typingSpeedImprovement,
        trend: 'decreasing' // Lower ms between keystrokes = faster typing
      });
    }
  }
  
  // Calculate error rate (backspaces / total keystrokes)
  if (features.nonTransitionalMetrics.overall.totalKeystrokes > 0) {
    const errorRate = features.nonTransitionalMetrics.overall.backspaceCount / 
                     features.nonTransitionalMetrics.overall.totalKeystrokes;
                     
    features.behavioral.errorPatterns.push({
      type: 'overallErrorRate',
      value: errorRate,
      backspaceCount: features.nonTransitionalMetrics.overall.backspaceCount,
      keystrokeCount: features.nonTransitionalMetrics.overall.totalKeystrokes
    });
  }
  
  // Calculate average hover time
  if (hoverEventsCount > 0) {
    features.nonTransitionalMetrics.overall.averageHoverTime = 
      features.nonTransitionalMetrics.overall.totalHoverTime / hoverEventsCount;
  }
  
  // Calculate average mouse speed
  if (features.nonTransitionalMetrics.temporalPatterns.mouseSpeedTrend.length > 0) {
    const totalSpeed = features.nonTransitionalMetrics.temporalPatterns.mouseSpeedTrend.reduce(
      (sum, segment) => sum + segment.value, 0
    );
    
    features.nonTransitionalMetrics.overall.averageMouseSpeed = 
      totalSpeed / features.nonTransitionalMetrics.temporalPatterns.mouseSpeedTrend.length;
  }
  
  // Add confidence indicators based on speed improvements
  if (features.behavioral.learningCurveData.length > 0) {
    features.behavioral.confidenceIndicators.push({
      type: 'speedImprovement',
      metric: 'typing',
      value: features.behavioral.learningCurveData.find(d => d.metric === 'typingSpeed')?.improvement || 0
    });
  }
  
  // Summary stats
  features.uniquePagesVisited = uniquePagesVisited.size;
  features.uniqueElementsInteractedWith = uniqueElementsInteractedWith.size;
  
  return features;
}

/**
 * Fetch user sessions from the main backend
 * @param {string} userId - User ID to fetch sessions for
 * @returns {Promise<Array>} - Array of session objects
 */
async function fetchUserSessions(userId) {
  try {
    console.log(`[Service] Fetching sessions for userId: ${userId} from ${MAIN_BACKEND_URL}`);
    
    // Use the correct endpoint path that works in the dashboard
    const response = await axios.get(`${MAIN_BACKEND_URL}/api/admin/users/${userId}/sessions`);
    
    return response.data;
  } catch (error) {
    console.error(`[Service] Error fetching sessions for userId ${userId}:`, error);
    throw new Error(`Failed to fetch user sessions: ${error.message}`);
  }
}

/**
 * Fetches detailed session information including states
 */
async function fetchSessionDetails(sessionId) {
  try {
    console.log(`[Service] Fetching details for session: ${sessionId}`);
    
    // 1. Fetch the basic session data
    const sessionResponse = await axios.get(`${MAIN_BACKEND_URL}/api/extension/recorder/session/${sessionId}`);
    const session = sessionResponse.data.session;
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // 2. Fetch states for this session
    const statesResponse = await axios.get(`${MAIN_BACKEND_URL}/api/extension/recorder/session/${sessionId}/states`);
    const states = statesResponse.data.states || [];
    
    if (!Array.isArray(states)) {
      throw new Error(`Failed to fetch states for session ${sessionId}`);
    }
    
    console.log(`[Service] Fetched ${states.length} states for session ${sessionId}`);
    
    // 3. Fetch nonTransitionalEvents for each state - using admin endpoint
    const enrichedStates = await Promise.all(states.map(async (state) => {
      if (!state || !state.stateId) return state;
      
      try {
        const nteResponse = await axios.get(
          `${MAIN_BACKEND_URL}/api/admin/states/${state.stateId}/nontransitional?sessionId=${sessionId}`
        );
        
        if (nteResponse.data) {
          return {
            ...state,
            nonTransitionalEvents: nteResponse.data
          };
        }
        return state;
      } catch (error) {
        console.warn(`[Service] Error fetching nonTransitionalEvents for state ${state.stateId}:`, error.message);
        // Continue without nonTransitionalEvents data
        return {
          ...state,
          nonTransitionalEvents: {} // Provide empty object to avoid errors in processing
        };
      }
    }));
    
    // 4. Return the enriched session object
    return {
      ...session,
      states: enrichedStates
    };
  } catch (error) {
    console.error(`[Service] Error fetching session details for ${sessionId}:`, error.message);
    throw error;
  }
}

/**
 * Analyze a single user session
 * @param {Object} session - The session data to analyze
 * @param {String} analysisType - Type of analysis to perform
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeSession(session, analysisType) {
  // This is a placeholder for the actual implementation
  console.log(`Analyzing single session with type: ${analysisType}`);
  
  // Will implement LLM-based analysis here
  return {
    status: 'success',
    message: 'Analysis placeholder - implement actual AI analysis here',
    sessionId: session.sessionId,
    analysisType
  };
}

/**
 * Analyze multiple sessions in batch
 * @param {Array<Object>} sessions - Array of session data
 * @param {Object} options - Analysis options
 * @returns {Promise<Object>} Analysis results
 */
async function analyzeBatchSessions(sessions, options) {
  // This is a placeholder for the actual implementation
  console.log(`Analyzing ${sessions.length} sessions with type: ${options.analysisType}`);
  
  // Will implement LLM-based batch analysis here
  return {
    status: 'success',
    message: 'Batch analysis placeholder - implement actual AI analysis here',
    sessionCount: sessions.length,
    analysisType: options.analysisType
  };
}

/**
 * Compare different session groups
 * @param {Array<Object>} sessionGroups - Array of session groups to compare
 * @param {String} specializedPrompt - Optional specialized prompt for comparison
 * @returns {Promise<Object>} Comparison results
 */
async function compareSessions(sessionGroups, specializedPrompt) {
  // This is a placeholder for the actual implementation
  console.log(`Comparing ${sessionGroups.length} session groups`);
  
  // Will implement LLM-based comparison here
  return {
    status: 'success',
    message: 'Comparison placeholder - implement actual AI comparison here',
    groupCount: sessionGroups.length,
    specializedPrompt: specializedPrompt || 'none'
  };
}

/**
 * Perform user sessions comparison analysis using a multi-stage sequential approach
 * with specialized models for each analysis stage.
 */
async function performUserSessionsComparison(userId) {
  console.log(`[Service] Performing user sessions comparison for userId: ${userId}`);

  try {
    // 1. Fetch all sessions for this user from the main backend
    const sessions = await fetchUserSessions(userId);
    console.log(`[Service] Fetched ${sessions.length} sessions for userId: ${userId}`);
    
    const sessionCount = sessions.length;
    
    if (sessionCount === 0) {
      return {
        success: false,
        message: "No sessions found for this user",
        userId
      };
    }
    
    if (sessionCount === 1) {
      return {
        success: false,
        message: "At least 2 sessions are required for comparison analysis",
        userId,
        sessionCount
      };
    }

    // Sort sessions by startTime
    const sortedSessions = [...sessions].sort((a, b) => {
      return new Date(a.startTime) - new Date(b.startTime);
    });

    // 2. Fetch detailed data for each session
    const enrichedSessions = [];
    for (const session of sortedSessions) {
      const sessionId = session.id || session.sessionId;
      if (sessionId) {
        try {
          const enrichedSession = await fetchSessionDetails(sessionId);
          enrichedSessions.push(enrichedSession);
        } catch (error) {
          console.warn(`[Service] Skipping session ${sessionId} due to error:`, error.message);
          // Continue with other sessions
        }
      }
    }
    
    // Check if we still have at least 2 sessions after potential errors
    if (enrichedSessions.length < 2) {
      return {
        success: false,
        message: `Could not fetch enough valid sessions (${enrichedSessions.length} available, 2 needed)`,
        userId,
        sessionCount: enrichedSessions.length
      };
    }

    // 3. Extract relevant features from each session
    const sessionFeatures = enrichedSessions.map(extractSessionFeatures);
    
    // ******************************************
    // MULTI-MODEL ANALYSIS APPROACH 
    // ******************************************
    console.log(`[Service] Using multi-model analysis approach for enhanced insights`);
    
    // Configure specialized models for each analysis stage
    const MODELS = {
      // Fast, efficient model for metrics analysis
      STAGE1: "llama-3.1-8b-instant", 
      
      // More powerful model for psychological/behavioral analysis
      STAGE2: "mistral-saba-24b",
      
      // Strong reasoning model for form interactions
      STAGE3: "meta-llama/llama-4-scout-17b-16e-instruct",
      
      // Good middle-tier model for temporal analysis
      STAGE4: "gemma2-9b-it", 
      
      // Most powerful model for final synthesis
      FINAL: "llama-3.3-70b-versatile"
    };
    
    // Default fallback model if specified model has issues
    const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "deepseek-r1-distill-llama-70b";
    
    // Create a multi-stage analysis pipeline with focused prompts for each stage
    const analysisResults = {};
    
    // ****************************************
    // STAGE 1: SESSION METRICS & NAVIGATION ANALYSIS
    // ****************************************
    console.log(`[Service] Starting STAGE 1: Session Metrics & Navigation Analysis with ${MODELS.STAGE1}`);
    
    // Create basic metrics and navigation patterns for each session
    const sessionMetricsData = sessionFeatures.map((session, index) => ({
      sessionNumber: index + 1,
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime: session.endTime,
      duration: session.duration,
      totalStates: session.totalStates,
      interactionCount: session.interactions?.length || 0,
      uniqueElementsInteractedWith: session.uniqueElementsInteractedWith,
      uniquePagesVisited: session.uniquePagesVisited,
      stateTransitionsCount: session.stateTransitions?.length || 0,
      navigationPatterns: session.stateTransitions?.slice(0, 10).map(t => ({
        from: t.fromTitle || t.fromUrl,
        to: t.toTitle || t.toUrl,
        transitionType: t.transitionType,
        trigger: t.trigger
      })),
      metrics: session.nonTransitionalMetrics.overall
    }));
    
    const stage1Prompt = `You are an expert user behavior analyst with deep expertise in UI/UX research and digital ethnography. I need a detailed analysis of how this user's behavior evolved across multiple sessions.

For STAGE 1, focus on providing detailed insights into the user's navigation patterns, usage metrics, and overall engagement patterns.

Here's the detailed session data:
${JSON.stringify(sessionMetricsData, null, 2)}

Analyze this data and provide:

1. A detailed analysis of this user's interaction with the application across all sessions (${sessionCount} sessions)
2. Specific navigation paths and patterns the user followed in each session
3. Detailed metrics comparison showing how usage patterns evolved
4. Engagement depth analysis (time spent, interaction density, etc.)
5. Specific transition patterns that indicate user learning or confusion

Your response should include:
- Detailed metrics tables comparing ALL sessions
- Navigation flow charts or descriptions
- Specific percentages for all improvements or regressions
- Thorough analysis of duration, states, and interactions across sessions
- Identification of specific pages or features that received consistent attention

Format your response as a structured analysis with these specific sections:
1. "Session Metrics Overview" - Detailed data tables and analysis
2. "Navigation Patterns Analysis" - How the user moved through the application in each session
3. "Engagement Evolution" - How time spent and interaction patterns changed
4. "Key Findings from Metrics" - The most important insights from this data

Be extremely specific with exact numbers, percentages, and specific examples from the data.
Your entire analysis should be data-driven, comprehensive, and professional.`;

    console.log(`[Service] Sending STAGE 1 prompt to ${MODELS.STAGE1}...`);
    try {
      const stage1Response = await groq.chat.completions.create({
        model: MODELS.STAGE1,
        messages: [{ role: "user", content: stage1Prompt }],
        temperature: 0.3,
        max_tokens: 3000,
        top_p: 0.9,
        stream: false
      });
      
      analysisResults.stage1 = stage1Response.choices[0]?.message?.content;
      console.log(`[Service] Successfully completed STAGE 1 analysis using ${MODELS.STAGE1}`);
    } catch (error) {
      console.error(`[Service] Error in STAGE 1 analysis with ${MODELS.STAGE1}:`, error);
      console.log(`[Service] Retrying with fallback model ${DEFAULT_MODEL}`);
      
      try {
        const fallbackResponse = await groq.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [{ role: "user", content: stage1Prompt }],
          temperature: 0.3,
          max_tokens: 3000,
          top_p: 0.9,
          stream: false
        });
        
        analysisResults.stage1 = fallbackResponse.choices[0]?.message?.content;
        console.log(`[Service] Successfully completed STAGE 1 analysis with fallback model`);
      } catch (secondError) {
        console.error(`[Service] Fallback also failed for STAGE 1:`, secondError);
        analysisResults.stage1 = "Error generating stage 1 analysis.";
      }
    }
    
    // Sleep briefly to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // ****************************************
    // STAGE 2: BEHAVIORAL PATTERNS ANALYSIS
    // ****************************************
    console.log(`[Service] Starting STAGE 2: Behavioral Patterns Analysis with ${MODELS.STAGE2}`);
    
    // Extract detailed behavioral data for analysis
    const behavioralData = sessionFeatures.map((session, index) => ({
      sessionNumber: index + 1,
      sessionId: session.sessionId,
      confusionIndicators: session.behavioral.confusionIndicators,
      hesitationPatterns: session.behavioral.hesitationPatterns,
      frustrationSignals: session.behavioral.frustrationSignals,
      confidenceIndicators: session.behavioral.confidenceIndicators,
      learningCurveData: session.behavioral.learningCurveData,
      errorPatterns: session.behavioral.errorPatterns,
      // Include detailed metrics for each state to enable granular analysis
      stateInteractions: session.stateDetails.map(state => ({
        stateId: state.stateId,
        url: state.url,
        title: state.title,
        durationInState: state.durationInState,
        events: state.events
      })),
      // Include relevant metrics
      deadClicks: session.nonTransitionalMetrics.overall.totalDeadClicks,
      hoverEvents: session.nonTransitionalMetrics.overall.totalHoverEvents,
      hoverTime: session.nonTransitionalMetrics.overall.totalHoverTime,
      keystrokes: session.nonTransitionalMetrics.overall.totalKeystrokes,
      backspaceCount: session.nonTransitionalMetrics.overall.backspaceCount,
      escapeCount: session.nonTransitionalMetrics.overall.escapeCount,
      inactivityPeriods: session.nonTransitionalMetrics.overall.totalInactivityPeriods,
      inactivityTime: session.nonTransitionalMetrics.overall.totalInactivityTime,
      oscillatingHovers: session.nonTransitionalMetrics.overall.totalOscillatingHovers
    }));
    
    const stage2Prompt = `You are an expert user experience researcher specializing in behavioral analysis and cognitive patterns. You already have the basic metrics analysis from STAGE 1.

In STAGE 2, provide a detailed psychological and behavioral analysis of how this user interacted with the system across multiple sessions. Be extremely thorough and detailed.

Here's the comprehensive behavioral data:
${JSON.stringify(behavioralData, null, 2)}

STAGE 1 Analysis:
${analysisResults.stage1}

Analyze this data and provide:

1. A detailed psychological profile of the user based on their interaction patterns
2. Specific instances of confusion, hesitation, and frustration in each session with timestamps and contexts
3. Comparison of error patterns across sessions with specific examples
4. Detailed analysis of how the user's confidence evolved (or regressed) across sessions
5. Field-by-field analysis of where the user struggled or showed improvement
6. In-depth analysis of hover patterns, dead clicks, and other confusion indicators
7. Session-by-session breakdown of frustration signals and their contexts

Your response should include:
- Specific examples of user confusion with exact timestamps
- Psychological interpretation of behavioral patterns
- Granular analysis of hesitation durations across sessions
- Detailed frustration pattern analysis with examples
- Comprehensive error analysis showing evolution across sessions

Format your response as a structured analysis with these sections:
1. "Psychological Profile" - Overall behavioral tendencies
2. "Confusion Analysis" - Detailed examples and patterns of confusion
3. "Hesitation Patterns" - Where and why the user hesitated
4. "Frustration Signals" - Specific instances and evolution of frustration
5. "Error Pattern Evolution" - How errors changed across sessions
6. "Confidence Development" - Evidence of growing or diminishing confidence
7. "Session-by-Session Behavioral Analysis" - Comprehensive breakdown of behavior in each session

Be extremely specific and reference exact events from the data. Your analysis should be deeply insightful and detailed.`;

    console.log(`[Service] Sending STAGE 2 prompt to ${MODELS.STAGE2}...`);
    try {
      const stage2Response = await groq.chat.completions.create({
        model: MODELS.STAGE2,
        messages: [{ role: "user", content: stage2Prompt }],
        temperature: 0.3,
        max_tokens: 4000,
        top_p: 0.9,
        stream: false
      });
      
      analysisResults.stage2 = stage2Response.choices[0]?.message?.content;
      console.log(`[Service] Successfully completed STAGE 2 analysis using ${MODELS.STAGE2}`);
    } catch (error) {
      console.error(`[Service] Error in STAGE 2 analysis with ${MODELS.STAGE2}:`, error);
      console.log(`[Service] Retrying with fallback model ${DEFAULT_MODEL}`);
      
      try {
        const fallbackResponse = await groq.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [{ role: "user", content: stage2Prompt }],
          temperature: 0.3,
          max_tokens: 4000,
          top_p: 0.9,
          stream: false
        });
        
        analysisResults.stage2 = fallbackResponse.choices[0]?.message?.content;
        console.log(`[Service] Successfully completed STAGE 2 analysis with fallback model`);
      } catch (secondError) {
        console.error(`[Service] Fallback also failed for STAGE 2:`, secondError);
        analysisResults.stage2 = "Error generating stage 2 analysis.";
      }
    }
    
    // Sleep briefly to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // ****************************************
    // STAGE 3: FORM INTERACTION & INPUT ANALYSIS
    // ****************************************
    console.log(`[Service] Starting STAGE 3: Form Interaction & Input Analysis with ${MODELS.STAGE3}`);
    
    // Extract detailed form interaction data
    const formInteractionData = sessionFeatures.map((session, index) => {
      // Get form field interactions
      const formFieldInteractions = session.nonTransitionalMetrics.overall.formFieldInteractions || {};
      
      // Get typing cadence data across states
      const typingCadences = {};
      Object.keys(session.nonTransitionalMetrics.byState).forEach(stateId => {
        const state = session.nonTransitionalMetrics.byState[stateId];
        if (state.typingCadence && state.typingCadence.length > 0) {
          typingCadences[stateId] = state.typingCadence;
        }
      });
      
      return {
        sessionNumber: index + 1,
        sessionId: session.sessionId,
        formFields: formFieldInteractions,
        formCompletionRate: session.nonTransitionalMetrics.overall.formCompletionRate,
        typingSpeed: session.nonTransitionalMetrics.overall.averageTypingSpeed,
        typingCadences: typingCadences,
        backspaceRate: session.nonTransitionalMetrics.overall.backspaceCount / 
                      (session.nonTransitionalMetrics.overall.totalKeystrokes || 1),
        fieldInteractions: session.interactions.filter(i => 
          i.type === 'change' || i.type === 'input' || i.type === 'focus' || i.type === 'blur'
        ).slice(0, 30), // Limit to 30 interactions for context window
        inputFieldIdles: Object.values(session.nonTransitionalMetrics.byState)
          .flatMap(state => state.inputIdle || 0)
      };
    });
    
    const stage3Prompt = `You are an expert in human-computer interaction specializing in form design and input pattern analysis. You have already seen the basic metrics and behavioral analysis from STAGES 1 and 2.

For STAGE 3, provide an extremely detailed analysis of how this user interacted with form fields and input elements across sessions. Analyze every aspect of their input behavior.

Here's the detailed form interaction data:
${JSON.stringify(formInteractionData, null, 2)}

Previous Analyses:
STAGE 1: ${analysisResults.stage1.substring(0, 500)}... (truncated)
STAGE 2: ${analysisResults.stage2.substring(0, 500)}... (truncated)

Analyze this data and provide:

1. A field-by-field analysis of form interactions across sessions
2. Detailed typing pattern analysis including speed, cadence, and error rates
3. Comparison of form completion strategies across sessions
4. Analysis of hesitations in specific fields with timestamps and durations
5. Identification of fields that consistently caused problems
6. Analysis of how the user's form-filling efficiency evolved
7. Specific instances where the user struggled with particular inputs
8. Psychological analysis of the user's approach to form completion
9. Deep insights into cognitive load during form interaction

Your response should include:
- Exact timing comparisons for the same fields across different sessions
- Detailed analysis of typing patterns and what they reveal
- Specific examples of field struggles with timestamps
- Progression analysis showing how form interaction evolved
- Identification of learning patterns in form completion
- Detailed tables comparing field metrics across sessions
- Timestamps of significant events in form interaction

Format your response as a structured analysis with these sections:
1. "Form Interaction Overview" - Overall patterns and efficiency
2. "Field-by-Field Analysis" - Detailed breakdown of interactions with each field
3. "Typing Pattern Analysis" - Speed, cadence, and error patterns
4. "Form Completion Evolution" - How strategies changed across sessions
5. "Problem Fields Identification" - Fields that consistently caused issues
6. "Session-by-Session Form Analysis" - Detailed progression analysis
7. "Cognitive Aspects of Form Interaction" - Mental models and cognitive load
8. "Usability Insights from Form Data" - Design implications from the analysis

Be extremely specific, mentioning exact field names, timing data, and error patterns. Your analysis should provide deep insights into the user's form interaction behavior.`;

    console.log(`[Service] Sending STAGE 3 prompt to ${MODELS.STAGE3}...`);
    try {
      const stage3Response = await groq.chat.completions.create({
        model: MODELS.STAGE3,
        messages: [{ role: "user", content: stage3Prompt }],
        temperature: 0.3,
        max_tokens: 5000,
        top_p: 0.9,
        stream: false
      });
      
      analysisResults.stage3 = stage3Response.choices[0]?.message?.content;
      console.log(`[Service] Successfully completed STAGE 3 analysis using ${MODELS.STAGE3}`);
    } catch (error) {
      console.error(`[Service] Error in STAGE 3 analysis with ${MODELS.STAGE3}:`, error);
      console.log(`[Service] Retrying with fallback model ${DEFAULT_MODEL}`);
      
      try {
        const fallbackResponse = await groq.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [{ role: "user", content: stage3Prompt }],
          temperature: 0.3,
          max_tokens: 5000,
          top_p: 0.9,
          stream: false
        });
        
        analysisResults.stage3 = fallbackResponse.choices[0]?.message?.content;
        console.log(`[Service] Successfully completed STAGE 3 analysis with fallback model`);
      } catch (secondError) {
        console.error(`[Service] Fallback also failed for STAGE 3:`, secondError);
        analysisResults.stage3 = "Error generating stage 3 analysis.";
      }
    }
    
    // Sleep briefly to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // ****************************************
    // STAGE 4: TEMPORAL & PROGRESSION ANALYSIS
    // ****************************************
    console.log(`[Service] Starting STAGE 4: Temporal & Progression Analysis with ${MODELS.STAGE4}`);
    
    // Extract temporal patterns and learning progression
    const temporalData = sessionFeatures.map((session, index) => ({
      sessionNumber: index + 1,
      sessionId: session.sessionId,
      temporalPatterns: session.nonTransitionalMetrics.temporalPatterns,
      learningCurve: session.behavioral.learningCurveData,
      // Create a timeline of key events for this session
      timeline: session.stateDetails.map(state => ({
        timestamp: state.timestamp,
        title: state.title,
        url: state.url,
        durationInState: state.durationInState,
        events: state.events,
        isNavigation: state.isNavigation,
        isReload: state.isReload
      })).slice(0, 20) // Limit to 20 states for context window
    }));
    
    const stage4Prompt = `You are an expert in cognitive science and learning pattern analysis. You already have the analyses from STAGES 1-3.

For STAGE 4, provide a detailed temporal analysis of how this user's behavior progressed within each session and across sessions. Focus on creating a comprehensive timeline of their learning journey.

Here's the detailed temporal and progression data:
${JSON.stringify(temporalData, null, 2)}

Previous Analyses:
STAGE 1: ${analysisResults.stage1.substring(0, 300)}... (truncated)
STAGE 2: ${analysisResults.stage2.substring(0, 300)}... (truncated)
STAGE 3: ${analysisResults.stage3.substring(0, 300)}... (truncated)

Analyze this data and provide:

1. A detailed timeline analysis of each session showing key moments
2. Analysis of how behavior changed within each session (beginning vs. end)
3. Learning curve analysis showing skill acquisition across sessions
4. Identification of significant moments or turning points in the user's journey
5. Analysis of fatigue or improvement patterns within sessions
6. Comparison of early sessions vs. later sessions in terms of efficiency
7. Analysis of the user's adaptation to the interface over time
8. Detailed progression metrics with exact percentages and timing

Your response should include:
- Timeline visualizations or descriptions of each session
- Specific temporal pattern identification with exact timing
- Learning rate calculations with percentages and examples
- Within-session vs. across-session progression comparison
- Key turning points in the user's journey with timestamps
- Detailed tables showing progression metrics
- Session segmentation analysis (beginning, middle, end patterns)

Format your response as a structured analysis with these sections:
1. "Temporal Patterns Overview" - How behavior changes over time
2. "Within-Session Progression" - Beginning-to-end analysis of each session
3. "Cross-Session Learning Curve" - How skills evolved across sessions
4. "Key Moments & Turning Points" - Significant events in the user's journey
5. "Adaptation & Mastery Timeline" - How and when the user adapted to different features
6. "Cognitive Load Evolution" - How mental effort changed over time
7. "Session-by-Session Timeline Analysis" - Comprehensive timeline of each session
8. "User Journey Map" - Visual or descriptive mapping of the entire experience

Be extremely specific with exact timestamps, progression rates, and learning patterns. Your analysis should provide deep insights into the temporal aspects of the user's behavior.`;

    console.log(`[Service] Sending STAGE 4 prompt to ${MODELS.STAGE4}...`);
    try {
      const stage4Response = await groq.chat.completions.create({
        model: MODELS.STAGE4,
        messages: [{ role: "user", content: stage4Prompt }],
        temperature: 0.3,
        max_tokens: 4000,
        top_p: 0.9,
        stream: false
      });
      
      analysisResults.stage4 = stage4Response.choices[0]?.message?.content;
      console.log(`[Service] Successfully completed STAGE 4 analysis using ${MODELS.STAGE4}`);
    } catch (error) {
      console.error(`[Service] Error in STAGE 4 analysis with ${MODELS.STAGE4}:`, error);
      console.log(`[Service] Retrying with fallback model ${DEFAULT_MODEL}`);
      
      try {
        const fallbackResponse = await groq.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [{ role: "user", content: stage4Prompt }],
          temperature: 0.3,
          max_tokens: 4000,
          top_p: 0.9,
          stream: false
        });
        
        analysisResults.stage4 = fallbackResponse.choices[0]?.message?.content;
        console.log(`[Service] Successfully completed STAGE 4 analysis with fallback model`);
      } catch (secondError) {
        console.error(`[Service] Fallback also failed for STAGE 4:`, secondError);
        analysisResults.stage4 = "Error generating stage 4 analysis.";
      }
    }
    
    // Sleep briefly to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    // ****************************************
    // FINAL STAGE: COMPREHENSIVE SYNTHESIS
    // ****************************************
    console.log(`[Service] Starting FINAL STAGE: Comprehensive Synthesis with ${MODELS.FINAL}`);
    
    // Additional insights to include in the final synthesis
    const additionalInsights = {
      totalSessions: sessionFeatures.length,
      totalStates: sessionFeatures.reduce((sum, s) => sum + s.totalStates, 0),
      totalInteractions: sessionFeatures.reduce((sum, s) => sum + (s.interactions?.length || 0), 0),
      totalDuration: sessionFeatures.reduce((sum, s) => sum + (s.duration || 0), 0),
      firstSession: sessionFeatures[0]?.sessionId,
      lastSession: sessionFeatures[sessionFeatures.length - 1]?.sessionId,
      // Calculate improvement metrics
      improvements: {
        deadClickReduction: ((sessionFeatures[0]?.nonTransitionalMetrics?.overall?.totalDeadClicks || 1) - 
                            (sessionFeatures[sessionFeatures.length - 1]?.nonTransitionalMetrics?.overall?.totalDeadClicks || 0)) / 
                            (sessionFeatures[0]?.nonTransitionalMetrics?.overall?.totalDeadClicks || 1),
        inactivityReduction: ((sessionFeatures[0]?.nonTransitionalMetrics?.overall?.totalInactivityTime || 1) - 
                             (sessionFeatures[sessionFeatures.length - 1]?.nonTransitionalMetrics?.overall?.totalInactivityTime || 0)) / 
                             (sessionFeatures[0]?.nonTransitionalMetrics?.overall?.totalInactivityTime || 1)
      }
    };

    const finalSynthesisPrompt = `You are a highly skilled UX researcher and behavioral analyst with a PhD in Human-Computer Interaction. I need you to create a COMPREHENSIVE, EXTREMELY DETAILED synthesis report combining all previous analyses.

This must be a professional, publication-quality report that could be presented to senior executives. The report should be extremely thorough, data-rich, and at least 5-6 pages when printed.

Previous Stage Analyses:
STAGE 1 (Metrics & Navigation): ${analysisResults.stage1}

STAGE 2 (Behavioral Patterns): ${analysisResults.stage2}

STAGE 3 (Form Interactions): ${analysisResults.stage3}

STAGE 4 (Temporal Progression): ${analysisResults.stage4}

Additional Insights:
${JSON.stringify(additionalInsights, null, 2)}

Your comprehensive synthesis report must include:

1. Executive Summary - A concise but detailed overview of key findings
2. Methodology Overview - How the data was collected and analyzed
3. User Journey Map - Timeline of the user's experience across all sessions
4. Detailed Session Analysis - In-depth breakdown of each session
5. Behavioral Insights - Psychological patterns and cognitive aspects
6. Form Interaction Analysis - Field-by-field breakdown of user's form handling
7. Learning Curve Assessment - Quantitative and qualitative analysis of skill acquisition
8. Usability Issues Identified - Specific problems encountered with timestamps and frequencies
9. Comparative Analysis - Detailed comparison of early vs. late sessions
10. Recommendations - Data-backed suggestions for UI/UX improvements
11. Appendix with Detailed Metrics - Comprehensive data tables

IMPORTANT FORMAT REQUIREMENTS:
- Use proper Markdown formatting with headings, subheadings, tables, and lists
- Include HTML tables for all detailed metrics comparisons
- Use ## for main sections and ### for subsections
- Create data-rich HTML tables comparing sessions
- Include exact numbers, percentages, timestamps throughout
- Back every insight with specific data points
- Include 8-10 specific, actionable recommendations based on the data

This report must be EXTREMELY DETAILED, DATA-DRIVEN, and COMPREHENSIVE. It should read like a professional UX research document that required days of manual analysis to produce.

Focus on depth, specificity, and actionable insights. Include specific examples from the data for every claim you make.`;

    console.log(`[Service] Sending FINAL SYNTHESIS prompt to ${MODELS.FINAL}...`);
    let finalReport;
    try {
      const finalSynthesisResponse = await groq.chat.completions.create({
        model: MODELS.FINAL,
        messages: [{ role: "user", content: finalSynthesisPrompt }],
        temperature: 0.4,
        max_tokens: 8000,
        top_p: 0.9,
        stream: false
      });
      
      finalReport = finalSynthesisResponse.choices[0]?.message?.content;
      console.log(`[Service] Successfully completed FINAL SYNTHESIS using ${MODELS.FINAL}. Report length: ${finalReport.length}`);
    } catch (error) {
      console.error(`[Service] Error in FINAL SYNTHESIS with ${MODELS.FINAL}:`, error);
      console.log(`[Service] Retrying with fallback model ${DEFAULT_MODEL}`);
      
      try {
        const fallbackResponse = await groq.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [{ role: "user", content: finalSynthesisPrompt }],
          temperature: 0.4,
          max_tokens: 8000,
          top_p: 0.9,
          stream: false
        });
        
        finalReport = fallbackResponse.choices[0]?.message?.content;
        console.log(`[Service] Successfully completed FINAL SYNTHESIS with fallback model. Report length: ${finalReport.length}`);
      } catch (secondError) {
        console.error(`[Service] Fallback also failed for FINAL SYNTHESIS:`, secondError);
        // If the final synthesis fails, construct a report from the individual stages
        finalReport = `# User Session Analysis Report

## Executive Summary
${analysisResults.stage1.split('\n').slice(0, 5).join('\n')}

## Metrics & Navigation Analysis
${analysisResults.stage1}

## Behavioral Pattern Analysis
${analysisResults.stage2}

## Form Interaction Analysis
${analysisResults.stage3}

## Temporal & Progression Analysis
${analysisResults.stage4}
`;
      }
    }
    
    if (!finalReport) {
      console.error("[Service] Failed to generate final report.");
      throw new Error("Failed to generate analysis report");
    }

    // Clean the final report
    finalReport = finalReport.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    
    // List of models used in analysis
    const modelsUsed = Object.values(MODELS).join(', ');
    
    // Return the complete analysis package
    return {
      success: true,
      userId,
      sessionCount: enrichedSessions.length,
      report: finalReport,
      sessionIds: enrichedSessions.map(s => s.sessionId || s.id),
      timestamp: new Date().toISOString(),
      model: modelsUsed // List all models used
    };
  } catch (error) {
    console.error(`[Service] Error in performUserSessionsComparison:`, error);
    return {
      success: false,
      message: `Error performing comparison analysis: ${error.message}`,
      userId,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

module.exports = {
  analyzeSession,
  analyzeBatchSessions,
  compareSessions,
  performUserSessionsComparison
}; 