/**
 * Session Feature Extractor
 * 
 * Transforms raw session data into a structured format with extracted features
 * for easier analysis across multiple models. This module processes:
 * - Page navigation patterns
 * - User interaction sequences
 * - Form input behaviors
 * - Error occurrences and corrections
 * - Temporal patterns in navigation
 */

/**
 * Extract structured features from a session object
 * @param {Object} session - Complete session object with states
 * @returns {Object} Extracted features for analysis
 */
function extractSessionFeatures(session) {
  if (!session || !session.states) {
    console.warn(`[FeatureExtractor] Session missing or has no states: ${session?.id || 'unknown'}`);
    return { isValid: false };
  }

  try {
    const sessionId = session.id || session.sessionId;
    const { states = [] } = session;
    
    // Basic session metrics
    const sessionDuration = calculateSessionDuration(session);
    const stateCount = states.length;
    
    // Sort states chronologically
    const sortedStates = [...states].sort((a, b) => 
      new Date(a.createdAt || a.timestamp) - new Date(b.createdAt || b.timestamp)
    );
    
    // Extract navigation sequence
    const navigationSequence = extractNavigationSequence(sortedStates);
    
    // Extract user interactions
    const userInteractions = extractUserInteractions(sortedStates);
    
    // Extract form interactions
    const formInteractions = extractFormInteractions(sortedStates);
    
    // Extract errors and corrections
    const errorsAndCorrections = extractErrorsAndCorrections(sortedStates);
    
    // Extract timing patterns
    const timingPatterns = extractTimingPatterns(sortedStates);
    
    return {
      isValid: true,
      sessionId,
      sessionDuration,
      stateCount,
      startTime: session.startTime || sortedStates[0]?.createdAt || sortedStates[0]?.timestamp,
      endTime: session.endTime || sortedStates[stateCount-1]?.createdAt || sortedStates[stateCount-1]?.timestamp,
      url: session.url,
      userAgent: session.userAgent,
      device: detectDevice(session.userAgent),
      navigationSequence,
      userInteractions,
      formInteractions,
      errorsAndCorrections,
      timingPatterns,
      rawStates: sortedStates.map(simplifyState)
    };
  } catch (error) {
    console.error(`[FeatureExtractor] Error extracting features:`, error);
    return {
      isValid: false,
      error: error.message
    };
  }
}

/**
 * Calculate total session duration in seconds
 * @param {Object} session - Session object
 * @returns {number} Duration in seconds
 */
function calculateSessionDuration(session) {
  // If session has explicit start and end times, use those
  if (session.startTime && session.endTime) {
    return Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000);
  }
  
  // Otherwise calculate from first and last state
  if (session.states && session.states.length > 1) {
    const timestamps = session.states
      .map(state => new Date(state.createdAt || state.timestamp).getTime())
      .filter(ts => !isNaN(ts));
    
    if (timestamps.length > 1) {
      const firstTimestamp = Math.min(...timestamps);
      const lastTimestamp = Math.max(...timestamps);
      return Math.round((lastTimestamp - firstTimestamp) / 1000);
    }
  }
  
  return 0; // Unable to determine duration
}

/**
 * Extract the navigation sequence from states
 * @param {Array} states - Sorted states array
 * @returns {Array} Navigation sequence with page details
 */
function extractNavigationSequence(states) {
  return states.map((state, index) => {
    // Get timestamp of state
    const timestamp = new Date(state.createdAt || state.timestamp).getTime();
    
    // Calculate time spent if not the last state
    let timeSpentMs = 0;
    if (index < states.length - 1) {
      const nextTimestamp = new Date(states[index + 1].createdAt || states[index + 1].timestamp).getTime();
      timeSpentMs = nextTimestamp - timestamp;
    }
    
    // Extract URL parts
    const url = new URL(state.url || 'https://example.com');
    const path = url.pathname;
    const hash = url.hash;
    const params = Object.fromEntries(url.searchParams);
    
    return {
      index,
      url: state.url,
      path,
      hash,
      params,
      title: state.title || extractTitleFromDOM(state),
      timeSpentMs,
      timeSpentSeconds: Math.round(timeSpentMs / 1000),
      timestamp,
      stateId: state.stateId || state.id
    };
  });
}

/**
 * Extract the title from DOM if available
 * @param {Object} state - State object
 * @returns {string} Page title
 */
function extractTitleFromDOM(state) {
  if (state.parsedDom && state.parsedDom.querySelector) {
    const titleElement = state.parsedDom.querySelector('title');
    if (titleElement) {
      return titleElement.textContent;
    }
  }
  
  if (state.dom && typeof state.dom === 'string') {
    const titleMatch = state.dom.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1];
    }
  }
  
  return 'Unknown Page';
}

/**
 * Extract user interactions from non-transitional events
 * @param {Array} states - Sorted states array
 * @returns {Array} Structured user interactions
 */
function extractUserInteractions(states) {
  const interactions = [];
  
  states.forEach((state, stateIndex) => {
    if (!state.nonTransitionalEvents) return;
    
    // Extract clicks
    const clicks = (state.nonTransitionalEvents.clicks || []).map(click => {
      return {
        type: 'click',
        stateIndex,
        url: state.url,
        path: state.url ? new URL(state.url).pathname : null,
        timestamp: click.timestamp,
        targetElement: {
          tag: click.target?.tagName?.toLowerCase() || 'unknown',
          id: click.target?.id || null,
          className: click.target?.className || null,
          text: click.target?.textContent || null,
          type: click.target?.type || null
        },
        x: click.x,
        y: click.y
      };
    });
    
    // Extract keypresses
    const keypresses = (state.nonTransitionalEvents.keypresses || []).map(keypress => {
      return {
        type: 'keypress',
        stateIndex,
        url: state.url,
        timestamp: keypress.timestamp,
        key: keypress.key,
        targetElement: {
          tag: keypress.target?.tagName?.toLowerCase() || 'unknown',
          id: keypress.target?.id || null,
          className: keypress.target?.className || null,
          type: keypress.target?.type || null
        }
      };
    });
    
    // Add all interactions
    interactions.push(...clicks, ...keypresses);
  });
  
  // Sort by timestamp
  return interactions.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Extract form interactions from states
 * @param {Array} states - Sorted states array
 * @returns {Object} Form interaction patterns
 */
function extractFormInteractions(states) {
  const formInteractions = {
    forms: [],
    fields: [],
    formSubmissions: [],
    formErrors: []
  };
  
  states.forEach((state, stateIndex) => {
    if (!state.nonTransitionalEvents) return;
    
    // Track form fields
    const inputs = (state.nonTransitionalEvents.inputs || []).map(input => {
      return {
        stateIndex,
        url: state.url,
        timestamp: input.timestamp,
        field: {
          id: input.target?.id || null,
          name: input.target?.name || null,
          type: input.target?.type || 'text',
          value: input.target?.value ? '(value present)' : '(empty)', // Don't store actual values
          required: input.target?.required || false
        }
      };
    });
    
    formInteractions.fields.push(...inputs);
    
    // Track form submissions
    const formSubmits = (state.nonTransitionalEvents.formSubmits || []).map(submit => {
      return {
        stateIndex,
        url: state.url,
        timestamp: submit.timestamp,
        formId: submit.target?.id || null,
        success: submit.success || false,
        error: submit.error || null
      };
    });
    
    formInteractions.formSubmissions.push(...formSubmits);
  });
  
  return formInteractions;
}

/**
 * Extract errors and corrections from states
 * @param {Array} states - Sorted states array
 * @returns {Object} Error and correction patterns
 */
function extractErrorsAndCorrections(states) {
  const errors = {
    formValidationErrors: [],
    jsErrors: [],
    networkErrors: [],
    correctionPatterns: []
  };
  
  // Extract validation errors
  states.forEach((state, stateIndex) => {
    if (!state.nonTransitionalEvents) return;
    
    // Track form validation errors
    const validationErrors = (state.nonTransitionalEvents.validationErrors || []).map(error => {
      return {
        stateIndex,
        url: state.url,
        timestamp: error.timestamp,
        field: error.field || null,
        message: error.message || 'Unknown error'
      };
    });
    
    errors.formValidationErrors.push(...validationErrors);
    
    // Track JavaScript errors
    const jsErrors = (state.nonTransitionalEvents.jsErrors || []).map(error => {
      return {
        stateIndex,
        url: state.url,
        timestamp: error.timestamp,
        message: error.message || 'Unknown error',
        stack: error.stack ? '(stack trace present)' : null
      };
    });
    
    errors.jsErrors.push(...jsErrors);
    
    // Track network errors
    const networkErrors = (state.nonTransitionalEvents.networkErrors || []).map(error => {
      return {
        stateIndex,
        url: state.url,
        timestamp: error.timestamp,
        requestUrl: error.url || null,
        status: error.status || null,
        method: error.method || 'GET'
      };
    });
    
    errors.networkErrors.push(...networkErrors);
  });
  
  return errors;
}

/**
 * Extract timing patterns from states
 * @param {Array} states - Sorted states array
 * @returns {Object} Timing statistics and patterns
 */
function extractTimingPatterns(states) {
  if (states.length <= 1) {
    return {
      avgTimePerState: 0,
      stateTimings: []
    };
  }
  
  // Calculate time spent on each state
  const stateTimings = states.map((state, index) => {
    const stateTime = new Date(state.createdAt || state.timestamp).getTime();
    
    // If not the last state, calculate time until next state
    let timeSpentMs = 0;
    if (index < states.length - 1) {
      const nextStateTime = new Date(states[index+1].createdAt || states[index+1].timestamp).getTime();
      timeSpentMs = nextStateTime - stateTime;
    }
    
    return {
      stateIndex: index,
      url: state.url,
      timeSpentMs,
      timeSpentSeconds: Math.round(timeSpentMs / 1000)
    };
  });
  
  // Calculate average time per state (excluding the last state)
  const totalTime = stateTimings.slice(0, -1).reduce((sum, timing) => sum + timing.timeSpentMs, 0);
  const avgTimePerState = Math.round(totalTime / (states.length - 1));
  
  return {
    avgTimePerState,
    avgTimePerStateSeconds: Math.round(avgTimePerState / 1000),
    stateTimings,
    totalSessionTimeMs: totalTime,
    totalSessionTimeSeconds: Math.round(totalTime / 1000)
  };
}

/**
 * Create a simplified version of a state object
 * @param {Object} state - State object
 * @returns {Object} Simplified state
 */
function simplifyState(state) {
  // Return a simplified version of the state to avoid including the full DOM
  return {
    stateId: state.stateId || state.id,
    url: state.url,
    title: state.title || extractTitleFromDOM(state),
    timestamp: state.createdAt || state.timestamp,
    eventCount: countEvents(state.nonTransitionalEvents)
  };
}

/**
 * Count the number of events in nonTransitionalEvents
 * @param {Object} events - nonTransitionalEvents object
 * @returns {number} Total event count
 */
function countEvents(events) {
  if (!events) return 0;
  
  return Object.values(events).reduce((sum, eventArray) => {
    return sum + (Array.isArray(eventArray) ? eventArray.length : 0);
  }, 0);
}

/**
 * Detect device type from user agent
 * @param {string} userAgent - User agent string
 * @returns {string} Device type (mobile, tablet, desktop)
 */
function detectDevice(userAgent) {
  if (!userAgent) return 'unknown';
  
  const ua = userAgent.toLowerCase();
  
  // Check for mobile devices
  if (ua.match(/android|webos|iphone|ipod|blackberry|iemobile|opera mini/i)) {
    return 'mobile';
  }
  
  // Check for tablets
  if (ua.match(/ipad|android(?!.*mobile)/i)) {
    return 'tablet';
  }
  
  // Default to desktop
  return 'desktop';
}

module.exports = {
  extractSessionFeatures
}; 