/**
 * Analysis Orchestrator - Coordinates Multi-Model Analysis Pipeline
 * 
 * This module orchestrates the full analysis pipeline, coordinating:
 * 1. Session data retrieval
 * 2. Sequential processing through specialized analysis stages
 * 3. Multi-model execution and fallback handling
 * 4. Final report synthesis
 */

const axios = require('axios');
const Groq = require('groq-sdk');

// Get the main backend URL from environment or use default
const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:3001';

// Initialize the Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Default fallback model if specified model has issues
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || "deepseek-r1-distill-llama-70b";

/**
 * Perform a comprehensive analysis on a user's sessions
 * @param {string} userId - User ID to analyze
 * @returns {Promise<Object>} Analysis results
 */
async function performComprehensiveAnalysis(userId) {
  console.log(`[Orchestrator] Starting comprehensive analysis for user ${userId}`);
  
  try {
    // This is a temporary placeholder implementation
    // We'll replace this with the full implementation later
    
    // Simulate a delay to mimic processing time
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Return a placeholder analysis result
    return {
      success: true,
      report: `# User Analysis Report\n\n## Executive Summary\n\nThis is a placeholder report for user ${userId}. The full multi-model analysis orchestrator is still being implemented.\n\n## Planned Capabilities\n\n- **Multi-stage analysis**: Using specialized models for different aspects of analysis\n- **Feature extraction**: Transforming raw session data into structured features\n- **Deep behavioral insights**: Psychological patterns and user intent analysis\n- **Form interaction analysis**: How users interact with forms and inputs\n- **Comprehensive synthesis**: Bringing all analysis stages together\n\n## Next Steps\n\nThe complete analysis will be available soon. Stay tuned for a more comprehensive report with deep insights into user behavior.`,
      reportLength: 500,
      modelsUsed: ['placeholder-model'],
      _meta: {
        placeholder: true
      }
    };
    
  } catch (error) {
    console.error(`[Orchestrator] Error in comprehensive analysis:`, error);
    return {
      success: false,
      message: `Analysis failed: ${error.message}`,
      error: error.message
    };
  }
}

/**
 * Perform comprehensive multi-stage, multi-model user sessions analysis
 * @param {string} userId - User ID to analyze sessions for
 * @returns {Promise<object>} Comprehensive analysis results
 */
async function performComprehensiveAnalysis(userId) {
  console.log(`[Orchestrator] Starting comprehensive analysis for userId: ${userId}`);
  
  try {
    // Stage 0: Data Retrieval
    console.log(`[Orchestrator] STAGE 0: Fetching and extracting session data`);
    const sessionData = await fetchAndPrepareSessionData(userId);
    
    if (sessionData.sessionCount < 1) {
      return {
        success: false,
        message: `No valid sessions found for user ${userId}`,
        userId,
        sessionCount: 0
      };
    }
    
    console.log(`[Orchestrator] Found ${sessionData.sessionCount} valid sessions to analyze`);
    
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
    
    // Collect all stage results
    const stageResults = {};
    const modelsUsed = [];
    
    // Stage 1: Metrics & Navigation Analysis
    console.log(`[Orchestrator] STAGE 1: Performing metrics & navigation analysis with ${MODELS.STAGE1}`);
    try {
      const stage1Result = await performMetricsAnalysis(sessionData.sessionFeatures, MODELS.STAGE1);
      stageResults.stage1 = stage1Result.analysis;
      modelsUsed.push(stage1Result.modelUsed);
      console.log(`[Orchestrator] STAGE 1 complete: ${stageResults.stage1.length} characters of analysis`);
    } catch (error) {
      console.error(`[Orchestrator] Error in STAGE 1: ${error.message}`);
      stageResults.stage1 = `Error generating Stage 1 analysis: ${error.message}`;
    }
    
    // Stage 2: Behavioral & Psychological Analysis
    console.log(`[Orchestrator] STAGE 2: Performing behavioral & psychological analysis with ${MODELS.STAGE2}`);
    try {
      const stage2Result = await performBehavioralAnalysis(
        sessionData.sessionFeatures, 
        stageResults.stage1,
        MODELS.STAGE2
      );
      stageResults.stage2 = stage2Result.analysis;
      modelsUsed.push(stage2Result.modelUsed);
      console.log(`[Orchestrator] STAGE 2 complete: ${stageResults.stage2.length} characters of analysis`);
    } catch (error) {
      console.error(`[Orchestrator] Error in STAGE 2: ${error.message}`);
      stageResults.stage2 = `Error generating Stage 2 analysis: ${error.message}`;
    }
    
    // Stage 3: Form Interaction Analysis
    // Only run if sessions contain form interactions
    const hasFormInteractions = sessionData.sessionFeatures.some(session => 
      session.formInteractions?.fields?.length > 0 || 
      session.formInteractions?.formSubmissions?.length > 0
    );
    
    if (hasFormInteractions) {
      console.log(`[Orchestrator] STAGE 3: Performing form interaction analysis with ${MODELS.STAGE3}`);
      try {
        const stage3Result = await performFormAnalysis(
          sessionData.sessionFeatures,
          MODELS.STAGE3
        );
        stageResults.stage3 = stage3Result.analysis;
        modelsUsed.push(stage3Result.modelUsed);
        console.log(`[Orchestrator] STAGE 3 complete: ${stageResults.stage3.length} characters of analysis`);
      } catch (error) {
        console.error(`[Orchestrator] Error in STAGE 3: ${error.message}`);
        stageResults.stage3 = `Error generating Stage 3 analysis: ${error.message}`;
      }
    } else {
      console.log(`[Orchestrator] STAGE 3: Skipping form interaction analysis (no form interactions found)`);
      stageResults.stage3 = "No form interactions detected in these sessions.";
    }
    
    // Stage 4: Temporal & Progression Analysis
    // Only run if we have multiple sessions or long individual sessions
    const hasMultipleSessions = sessionData.sessionCount > 1;
    const hasLongSession = sessionData.sessionFeatures.some(session => 
      (session.sessionDuration || 0) > 300 // sessions longer than 5 minutes
    );
    
    if (hasMultipleSessions || hasLongSession) {
      console.log(`[Orchestrator] STAGE 4: Performing temporal analysis with ${MODELS.STAGE4}`);
      try {
        const stage4Result = await performTemporalAnalysis(
          sessionData.sessionFeatures,
          MODELS.STAGE4
        );
        stageResults.stage4 = stage4Result.analysis;
        modelsUsed.push(stage4Result.modelUsed);
        console.log(`[Orchestrator] STAGE 4 complete: ${stageResults.stage4.length} characters of analysis`);
      } catch (error) {
        console.error(`[Orchestrator] Error in STAGE 4: ${error.message}`);
        stageResults.stage4 = `Error generating Stage 4 analysis: ${error.message}`;
      }
    } else {
      console.log(`[Orchestrator] STAGE 4: Skipping temporal analysis (insufficient data)`);
      stageResults.stage4 = "Insufficient data for temporal analysis.";
    }
    
    // Final Stage: Comprehensive Synthesis
    console.log(`[Orchestrator] FINAL STAGE: Generating comprehensive synthesis report with ${MODELS.FINAL}`);
    try {
      const finalReport = await generateComprehensiveReport(
        sessionData.sessionFeatures, 
        stageResults,
        MODELS.FINAL
      );
      modelsUsed.push(finalReport.modelUsed);
      console.log(`[Orchestrator] Analysis complete! Generated ${finalReport.report.length} character report`);
      
      return {
        success: true,
        report: finalReport.report,
        reportLength: finalReport.report.length,
        userId,
        modelsUsed: [...new Set(modelsUsed)], // Remove duplicates
        stageResults, // Include all stage results in the response
        _meta: {
          stageResultSizes: {
            stage1: stageResults.stage1?.length || 0,
            stage2: stageResults.stage2?.length || 0,
            stage3: stageResults.stage3?.length || 0,
            stage4: stageResults.stage4?.length || 0,
            final: finalReport.report.length
          }
        }
      };
    } catch (error) {
      console.error(`[Orchestrator] Error in FINAL STAGE: ${error.message}`);
      
      // If final synthesis fails, return the individual stage results as a fallback
      const fallbackReport = `# User Analysis Report\n\n## Analysis Error\nThe final synthesis failed, but here are the individual analysis stages:\n\n## Metrics & Navigation Analysis\n${stageResults.stage1}\n\n## Behavioral Analysis\n${stageResults.stage2}\n\n## Form Interaction Analysis\n${stageResults.stage3 || "Not available"}\n\n## Temporal Analysis\n${stageResults.stage4 || "Not available"}`;
      
      return {
        success: true,
        report: fallbackReport,
        reportLength: fallbackReport.length,
        userId,
        modelsUsed: [...new Set(modelsUsed)], // Remove duplicates
        _meta: {
          synthesisError: error.message,
          fallbackUsed: true,
          stageResultSizes: {
            stage1: stageResults.stage1?.length || 0,
            stage2: stageResults.stage2?.length || 0,
            stage3: stageResults.stage3?.length || 0,
            stage4: stageResults.stage4?.length || 0,
            final: fallbackReport.length
          }
        }
      };
    }
    
  } catch (error) {
    console.error(`[Orchestrator] Error in analysis pipeline: ${error.message}`);
    return {
      success: false,
      message: `Error performing analysis: ${error.message}`,
      userId,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

/**
 * Fetch and prepare session data for analysis
 * @param {string} userId - User ID to fetch sessions for
 * @returns {Promise<object>} Prepared session data for analysis
 */
async function fetchAndPrepareSessionData(userId) {
  try {
    // 1. Fetch all sessions for this user
    const sessions = await fetchUserSessions(userId);
    console.log(`[Orchestrator] Fetched ${sessions.length} sessions for userId: ${userId}`);
    
    if (sessions.length === 0) {
      return { sessionCount: 0 };
    }
    
    // 2. Sort sessions by start time
    const sortedSessions = [...sessions].sort((a, b) => {
      return new Date(a.startTime) - new Date(b.startTime);
    });
    
    // 3. Fetch detailed data for each session
    const enrichedSessions = [];
    for (const session of sortedSessions) {
      const sessionId = session.id || session.sessionId;
      if (sessionId) {
        try {
          const enrichedSession = await fetchSessionDetails(sessionId);
          enrichedSessions.push(enrichedSession);
        } catch (error) {
          console.warn(`[Orchestrator] Skipping session ${sessionId} due to error: ${error.message}`);
        }
      }
    }
    
    if (enrichedSessions.length === 0) {
      return { sessionCount: 0 };
    }
    
    // 4. Extract features from each session
    const sessionFeatures = enrichedSessions.map(extractSessionFeatures);
    
    return {
      sessionCount: sessionFeatures.length,
      sessionFeatures,
      enrichedSessions,
      originalSessions: sessions
    };
  } catch (error) {
    console.error(`[Orchestrator] Error fetching and preparing session data: ${error.message}`);
    throw error;
  }
}

/**
 * Fetch user sessions from the main backend
 * @param {string} userId - User ID to fetch sessions for
 * @returns {Promise<Array>} - Array of session objects
 */
async function fetchUserSessions(userId) {
  try {
    console.log(`[Orchestrator] Fetching sessions for userId: ${userId} from ${MAIN_BACKEND_URL}`);
    
    // Use the correct endpoint path
    const response = await axios.get(`${MAIN_BACKEND_URL}/api/admin/users/${userId}/sessions`);
    
    return response.data;
  } catch (error) {
    console.error(`[Orchestrator] Error fetching sessions for userId ${userId}:`, error);
    throw new Error(`Failed to fetch user sessions: ${error.message}`);
  }
}

/**
 * Fetches detailed session information including states
 * @param {string} sessionId - Session ID to fetch details for
 * @returns {Promise<object>} - Enhanced session object with states
 */
async function fetchSessionDetails(sessionId) {
  try {
    console.log(`[Orchestrator] Fetching details for session: ${sessionId}`);
    
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
    
    console.log(`[Orchestrator] Fetched ${states.length} states for session ${sessionId}`);
    
    // 3. Fetch nonTransitionalEvents for each state
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
        console.warn(`[Orchestrator] Error fetching nonTransitionalEvents for state ${state.stateId}:`, error.message);
        return {
          ...state,
          nonTransitionalEvents: {} // Provide empty object to avoid errors
        };
      }
    }));
    
    // 4. Return the enriched session object
    return {
      ...session,
      states: enrichedStates
    };
  } catch (error) {
    console.error(`[Orchestrator] Error fetching session details for ${sessionId}:`, error.message);
    throw error;
  }
}

/**
 * Extract features from a session for analysis
 * @param {Object} session - Session with states
 * @returns {Object} Features extracted for analysis
 */
function extractSessionFeatures(session) {
  if (!session || !session.states) {
    console.warn(`[Orchestrator] Session missing or has no states: ${session?.id || 'unknown'}`);
    return { isValid: false };
  }

  try {
    const sessionId = session.id || session.sessionId;
    const { states = [] } = session;
    
    // Basic session metrics
    const sessionDuration = session.endTime && session.startTime ? 
      Math.round((new Date(session.endTime) - new Date(session.startTime)) / 1000) : 0;
    
    // Sort states chronologically
    const sortedStates = [...states].sort((a, b) => 
      new Date(a.createdAt || a.timestamp) - new Date(b.createdAt || b.timestamp)
    );
    
    // Extract navigation sequence with enhanced details
    const navigationSequence = sortedStates.map((state, index) => {
      // Get timestamp of state
      const timestamp = new Date(state.createdAt || state.timestamp).getTime();
      
      // Calculate time spent if not the last state
      let timeSpentMs = 0;
      if (index < states.length - 1) {
        const nextTimestamp = new Date(states[index + 1].createdAt || states[index + 1].timestamp).getTime();
        timeSpentMs = nextTimestamp - timestamp;
      }
      
      // Extract more detailed page metrics
      const pageMetrics = {
        domSize: state.metrics?.domSize || 0,
        elementCount: state.metrics?.elementCount || 0,
        formElements: state.metrics?.formElements || 0,
        visibleElements: state.metrics?.visibleElements || 0,
        loadTime: state.loadingInfo?.loadTime || 0,
        networkQuality: state.networkInfo?.effectiveType || 'unknown',
        rtt: state.networkInfo?.rtt || 0
      };
      
      return {
        index,
        url: state.url,
        title: state.title || state.metrics?.title || '',
        pathname: state.pathname || '',
        timeSpentMs,
        timeSpentSeconds: Math.round(timeSpentMs / 1000),
        timestamp,
        stateId: state.stateId || state.id,
        hash: state.hash || '',
        stateNumber: state.stateNumber,
        metrics: pageMetrics,
        interactionEvent: state.interactionInfo || null
      };
    });
    
    // Extract user interactions with enhanced details
    const userInteractions = [];
    const fieldInteractions = {};
    
    states.forEach((state, stateIndex) => {
      if (!state.nonTransitionalEvents) return;
      
      // Extract clicks with enhanced details
      const clicks = (state.nonTransitionalEvents.clicks || []).map(click => {
        const interactionData = {
          type: 'click',
          stateIndex,
          url: state.url,
          pathname: state.pathname || '',
          stateNumber: state.stateNumber,
          timestamp: click.timestamp,
          targetElement: click.target,
          elementType: click.target?.tagName?.toLowerCase() || 'unknown',
          elementId: click.target?.id || '',
          elementClass: click.target?.className || '',
          innerText: click.target?.innerText || '',
          timeSincePageLoad: click.timestamp - new Date(state.timestamp).getTime()
        };
        
        // Track interactions with specific elements by their ID
        if (click.target?.id) {
          if (!fieldInteractions[click.target.id]) {
            fieldInteractions[click.target.id] = [];
          }
          fieldInteractions[click.target.id].push({
            type: 'click',
            timestamp: click.timestamp,
            url: state.url,
            stateNumber: state.stateNumber
          });
        }
        
        return interactionData;
      });
      
      // Extract keypresses with enhanced details
      const keypresses = (state.nonTransitionalEvents.keypresses || []).map(keypress => {
        const interactionData = {
          type: 'keypress',
          stateIndex,
          url: state.url,
          pathname: state.pathname || '',
          stateNumber: state.stateNumber,
          timestamp: keypress.timestamp,
          key: keypress.key,
          targetElement: keypress.target,
          elementType: keypress.target?.tagName?.toLowerCase() || 'unknown',
          elementId: keypress.target?.id || '',
          elementClass: keypress.target?.className || '',
          timeSincePageLoad: keypress.timestamp - new Date(state.timestamp).getTime()
        };
        
        // Track keypresses for specific fields by their ID
        if (keypress.target?.id) {
          if (!fieldInteractions[keypress.target.id]) {
            fieldInteractions[keypress.target.id] = [];
          }
          fieldInteractions[keypress.target.id].push({
            type: 'keypress',
            timestamp: keypress.timestamp,
            key: keypress.key,
            url: state.url,
            stateNumber: state.stateNumber
          });
        }
        
        return interactionData;
      });
      
      // Track state transitions
      if (state.interactionInfo) {
        userInteractions.push({
          type: 'state_transition',
          stateIndex,
          fromState: state.previousStateId,
          toState: state.stateId,
          timestamp: new Date(state.timestamp).getTime(),
          transitionType: state.interactionInfo.type || 'unknown',
          timeSincePreviousState: state.timeSincePreviousState || 0
        });
        
        // Track form field changes
        if (state.interactionInfo.type === 'change' && 
            state.interactionInfo.element && 
            state.interactionInfo.element.includes('input')) {
          
          const fieldId = state.interactionInfo.details?.id || '';
          
          if (fieldId) {
            if (!fieldInteractions[fieldId]) {
              fieldInteractions[fieldId] = [];
            }
            
            fieldInteractions[fieldId].push({
              type: 'change',
              timestamp: new Date(state.interactionInfo.timestamp).getTime(),
              previousValue: state.interactionInfo.previousValue || '',
              value: state.interactionInfo.value || '',
              url: state.url,
              stateNumber: state.stateNumber
            });
          }
        }
      }
      
      userInteractions.push(...clicks, ...keypresses);
    });
    
    // Sort by timestamp
    userInteractions.sort((a, b) => a.timestamp - b.timestamp);
    
    // Extract form interactions
    const formInteractions = {
      fields: [],
      formSubmissions: [],
      fieldDetails: fieldInteractions // Add the detailed field interactions
    };
    
    states.forEach((state, stateIndex) => {
      if (!state.nonTransitionalEvents) return;
      
      // Track form inputs
      const inputs = (state.nonTransitionalEvents.inputs || []).map(input => {
        const fieldData = {
          stateIndex,
          url: state.url,
          pathname: state.pathname || '',
          stateNumber: state.stateNumber,
          timestamp: input.timestamp,
          field: {
            id: input.target?.id,
            name: input.target?.name,
            type: input.target?.type || 'text',
            value: input.target?.value ? '(value present)' : '(empty)', // Don't store actual values
          },
          timeSincePageLoad: input.timestamp - new Date(state.timestamp).getTime()
        };
        
        // Track interactions for specific fields
        if (input.target?.id) {
          if (!fieldInteractions[input.target.id]) {
            fieldInteractions[input.target.id] = [];
          }
          
          fieldInteractions[input.target.id].push({
            type: 'input',
            timestamp: input.timestamp,
            fieldType: input.target?.type || 'text',
            hasValue: !!input.target?.value,
            url: state.url,
            stateNumber: state.stateNumber
          });
        }
        
        return fieldData;
      });
      
      formInteractions.fields.push(...inputs);
      
      // Track form submissions
      const formSubmits = (state.nonTransitionalEvents.formSubmits || []).map(submit => {
        return {
          stateIndex,
          url: state.url,
          pathname: state.pathname || '',
          stateNumber: state.stateNumber,
          timestamp: submit.timestamp,
          formId: submit.target?.id,
          success: submit.success || false,
          timeSincePageLoad: submit.timestamp - new Date(state.timestamp).getTime()
        };
      });
      
      formInteractions.formSubmissions.push(...formSubmits);
    });
    
    // Add detailed time analysis for each field
    const fieldTimeAnalysis = {};
    
    Object.entries(fieldInteractions).forEach(([fieldId, interactions]) => {
      // Sort chronologically
      interactions.sort((a, b) => a.timestamp - b.timestamp);
      
      if (interactions.length > 0) {
        const firstTimestamp = interactions[0].timestamp;
        const lastTimestamp = interactions[interactions.length - 1].timestamp;
        const totalInteractionTime = lastTimestamp - firstTimestamp;
        
        fieldTimeAnalysis[fieldId] = {
          fieldId,
          interactionCount: interactions.length,
          firstInteraction: new Date(firstTimestamp).toISOString(),
          lastInteraction: new Date(lastTimestamp).toISOString(),
          totalInteractionTimeMs: totalInteractionTime,
          totalInteractionTimeSec: Math.round(totalInteractionTime / 1000),
          interactionTypes: [...new Set(interactions.map(i => i.type))],
          values: interactions
            .filter(i => i.type === 'change')
            .map(i => ({ value: i.value, timestamp: i.timestamp }))
        };
      }
    });
    
    return {
      isValid: true,
      sessionId,
      sessionDuration,
      stateCount: states.length,
      startTime: session.startTime || sortedStates[0]?.createdAt || sortedStates[0]?.timestamp,
      endTime: session.endTime || sortedStates[states.length-1]?.createdAt || sortedStates[states.length-1]?.timestamp,
      url: session.url,
      userAgent: session.userAgent,
      navigationSequence,
      userInteractions,
      formInteractions,
      fieldTimeAnalysis,   // Add detailed time analysis
      pageSequence: sortedStates.map(state => ({
        url: state.url,
        pathname: state.pathname || '',
        title: state.title || state.metrics?.title || '',
        stateNumber: state.stateNumber,
        timestamp: state.timestamp,
        domSize: state.metrics?.domSize,
        elementCount: state.metrics?.elementCount,
        loadTime: state.loadingInfo?.loadTime
      }))
    };
  } catch (error) {
    console.error(`[Orchestrator] Error extracting features:`, error);
    return {
      isValid: false,
      error: error.message
    };
  }
}

/**
 * Perform metrics analysis on session features (Stage 1)
 * @param {Array} sessionFeatures - Array of session features
 * @param {string} model - Model to use for analysis
 * @returns {Promise<Object>} Analysis text and model used
 */
async function performMetricsAnalysis(sessionFeatures, model) {
  try {
    // Extract rich metrics data from each session
    const sessionMetricsData = sessionFeatures.map((session, index) => {
      // Calculate average time per page
      const avgTimePerPage = session.navigationSequence.length > 0 
        ? Math.round(session.sessionDuration / session.navigationSequence.length)
        : 0;
        
      // Get form field details with timing
      const formFieldStats = Object.values(session.fieldTimeAnalysis || {}).map(field => ({
        fieldId: field.fieldId,
        interactionCount: field.interactionCount,
        totalTimeSec: field.totalInteractionTimeSec,
        interactionTypes: field.interactionTypes,
        values: field.values
      }));
      
      // Calculate interaction density (interactions per minute)
      const interactionDensity = session.sessionDuration > 0 
        ? Math.round((session.userInteractions.length / session.sessionDuration) * 60)
        : 0;
        
      // Extract page load metrics
      const pageLoadMetrics = session.navigationSequence.map(page => ({
        url: page.url,
        pathname: page.pathname,
        title: page.title,
        loadTime: page.metrics?.loadTime || 0,
        networkQuality: page.metrics?.networkQuality || 'unknown',
        domSize: page.metrics?.domSize || 0,
        elementCount: page.metrics?.elementCount || 0
      }));
      
      // Create detailed navigation path
      const navigationPath = session.navigationSequence.map(nav => ({
        pageTitle: nav.title,
        url: nav.pathname || nav.url,
        timeSpentSec: nav.timeSpentSeconds,
        interactions: session.userInteractions.filter(i => 
          i.stateNumber === nav.stateNumber).length
      }));
      
      return {
        sessionNumber: index + 1,
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        duration: session.sessionDuration,
        totalStates: session.stateCount,
        pageCount: session.navigationSequence.length,
        avgTimePerPage,
        interactionCount: session.userInteractions?.length || 0,
        interactionDensity,
        clickCount: session.userInteractions?.filter(i => i.type === 'click').length || 0,
        keypressCount: session.userInteractions?.filter(i => i.type === 'keypress').length || 0,
        navigationPath: navigationPath.slice(0, 10), // Limit for prompt size
        formFields: formFieldStats,
        pageLoadMetrics: pageLoadMetrics.slice(0, 5) // Limit for prompt size
      };
    });
    
    const prompt = `You are an expert user behavior analyst with deep expertise in UI/UX research and digital ethnography. I need a detailed analysis of this user's interaction patterns across multiple sessions.

For STAGE 1, focus on creating a comprehensive, HIGHLY DETAILED metrics analysis with SPECIFIC insights about EXACTLY what the user did in each session.

Here's the detailed session data:
${JSON.stringify(sessionMetricsData, null, 2)}

## INSIGHTS TO EXTRACT
1. Form field interaction patterns showing EXACTLY how the user engaged with each field:
   - Field ID: "${sessionMetricsData[0]?.formFields?.[0]?.fieldId || 'example'}" - exactly what the user did, how long they spent
   - Show precise timing data for each field (e.g., "user spent 45 seconds on the fullName field")
   - Identify hesitation patterns (long pauses before interaction)
   - Show input behavior (e.g., "typed 'gt' in fullName field")

2. Navigation patterns with CONCRETE examples:
   - Exact path followed (e.g., "Started at Registration page, spent 23 seconds, then moved to Step 2")
   - Page transitions with timing data
   - Pages where user spent most/least time with EXACT seconds

3. Detailed performance metrics:
   - Page load times for each state change
   - Network quality impact on interaction
   - DOM size and complexity impact

4. Micro-interaction analysis:
   - Click patterns and timing
   - Keypress frequency and timing
   - State transitions with PRECISE timings

## DATA VISUALIZATION REQUIREMENTS

1. CREATE DETAILED FORM FIELD INTERACTION TABLE
   | Field ID | Total Time (s) | Interaction Count | Interaction Types | Analysis |
   |----------|----------------|-------------------|-------------------|----------|
   | fullName | 45             | 7                 | keypress, change  | Started typing slowly (2.3s between keypresses), accelerated after 5th character |

2. CREATE DETAILED PAGE ENGAGEMENT TABLE
   | Page Title | Time Spent (s) | Interactions | Metrics |
   |------------|----------------|--------------|---------|
   | Registration - Page 1 | 125 | 14 | 7.1 int/min, 4 clicks, 10 keypresses |

3. CREATE DETAILED NAVIGATION FLOW VISUALIZATION
   Registration (23s, 7 int) -> Details (87s, 12 int) -> Confirmation (14s, 2 int)
     ↓ [4.2s load]              ↓ [3.1s load]           ↓ [2.8s load]
   2 clicks, 5 keys           8 clicks, 4 keys        2 clicks, 0 keys

4. CREATE INTERACTION DENSITY HEATMAP
   Field: fullName  [XXXXXXXXXXXXXXXXXXXXXXXX] 24 interactions
   Field: email     [XXXXXXXXXXXXXXXXXXXX    ] 22 interactions
   Field: password  [XXXXXXXXXXXXXXXXX       ] 17 interactions

5. CREATE SESSION COMPARISON MATRIX
   | Metric          | Session 1 | Session 2 | Change | Analysis |
   |-----------------|-----------|-----------|--------|----------|
   | Duration        | 245s      | 187s      | -24%↓  | User becoming more efficient |
   | Clicks          | 24        | 18        | -25%↓  | More direct navigation |
   | Time per page   | 61s       | 47s       | -23%↓  | Faster task completion |

FORMAT INSTRUCTIONS:
1. Create proper markdown tables with |---|---| headers and alignment
2. Use EXACT measurements from the data (seconds, counts, etc.)
3. Include specific field IDs, page names, and interaction details
4. Use ASCII visualizations for flows and heatmaps
5. Label all visualizations clearly and thoroughly
6. BE SPECIFIC - avoid generalities. Say "User spent 45 seconds on the fullName field" not "User spent time on form fields"

Format your response as a structured analysis with these specific sections:
1. "Field Interaction Analysis" - Detailed breakdown of how user engaged with EACH specific form field
2. "Navigation Behavior Analysis" - Specific flow through the application with EXACT timing data
3. "Interaction Pattern Analysis" - Detailed breakdown of clicks, keypresses with EXACT locations and timing
4. "Performance Impact Analysis" - How page load times and network conditions affected user experience
5. "Key Metrics Insights" - Specific, actionable findings from the data

Your entire analysis should be extremely specific, concrete, and data-driven.`;

    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
        top_p: 0.9,
        stream: false
      });
      
      return {
        analysis: response.choices[0]?.message?.content,
        modelUsed: model
      };
    } catch (error) {
      console.error(`[Orchestrator] Error in performMetricsAnalysis with ${model}:`, error);
      console.log(`[Orchestrator] Retrying with fallback model ${DEFAULT_MODEL}`);
      
      const fallbackResponse = await groq.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
        top_p: 0.9,
        stream: false
      });
      
      return {
        analysis: fallbackResponse.choices[0]?.message?.content,
        modelUsed: DEFAULT_MODEL
      };
    }
  } catch (error) {
    console.error(`[Orchestrator] Error in performMetricsAnalysis:`, error);
    throw error;
  }
}

/**
 * Perform behavioral analysis on session features (Stage 2)
 * @param {Array} sessionFeatures - Array of session features
 * @param {string} stage1Analysis - Results from Stage 1
 * @param {string} model - Model to use for analysis
 * @returns {Promise<Object>} Analysis text and model used
 */
async function performBehavioralAnalysis(sessionFeatures, stage1Analysis, model) {
  try {
    // Extract detailed behavioral data from sessions
    const behavioralData = sessionFeatures.map((session, index) => {
      // Extract interaction timing patterns
      const interactionTimings = session.userInteractions.map((interaction, i, arr) => {
        const nextInteraction = i < arr.length - 1 ? arr[i + 1] : null;
        const timeDiff = nextInteraction ? nextInteraction.timestamp - interaction.timestamp : 0;
        
        return {
          type: interaction.type,
          targetElement: interaction.elementType || interaction.targetElement,
          targetId: interaction.elementId || '',
          timeSinceLastInteraction: i > 0 ? interaction.timestamp - arr[i-1].timestamp : 0,
          timeToNextInteraction: timeDiff,
          url: interaction.url || '',
          timestamp: interaction.timestamp
        };
      });
      
      // Calculate hesitation patterns (pauses > 3 seconds between interactions)
      const hesitations = interactionTimings.filter(t => t.timeSinceLastInteraction > 3000)
        .map(t => ({
          timestamp: t.timestamp,
          duration: Math.round(t.timeSinceLastInteraction / 1000),
          beforeElement: t.targetElement,
          beforeElementId: t.targetId,
          url: t.url
        }));
      
      // Extract form field editing patterns
      const fieldEdits = Object.values(session.fieldTimeAnalysis || {}).map(field => {
        const edits = field.values || [];
        return {
          fieldId: field.fieldId,
          editCount: edits.length,
          timeSpent: field.totalInteractionTimeSec,
          edits: edits.map((edit, i, arr) => ({
            value: edit.value,
            previousValue: i > 0 ? arr[i-1].value : '',
            timestamp: edit.timestamp
          })).slice(0, 5) // Limit to first 5 edits for prompt size
        };
      });
      
      // Extract navigation behavior (backtracking, revisits)
      const visitedPages = new Map();
      const navigationBehaviors = session.navigationSequence.map(nav => {
        const pageKey = nav.url || nav.pathname;
        const visitCount = visitedPages.get(pageKey) || 0;
        visitedPages.set(pageKey, visitCount + 1);
        
        return {
          url: pageKey,
          title: nav.title,
          visitCount: visitCount + 1,
          timeSpent: nav.timeSpentSeconds,
          isRevisit: visitCount > 0
        };
      });
      
      // Extract click pattern types
      const clickPatterns = session.userInteractions
        .filter(i => i.type === 'click')
        .map(click => ({
          element: click.elementType || 'unknown',
          elementId: click.elementId || '',
          timestamp: click.timestamp,
          timeSincePageLoad: click.timeSincePageLoad || 0
        }));
      
      return {
        sessionNumber: index + 1,
        sessionId: session.sessionId,
        duration: session.sessionDuration,
        interactionPatterns: {
          totalInteractions: session.userInteractions?.length || 0,
          clicksCount: session.userInteractions?.filter(i => i.type === 'click').length || 0,
          keypressesCount: session.userInteractions?.filter(i => i.type === 'keypress').length || 0
        },
        hesitations: hesitations.slice(0, 10), // Limit for prompt size
        fieldEdits: fieldEdits.slice(0, 5), // Limit for prompt size
        interactionTimings: interactionTimings.slice(0, 20), // Limit for prompt size
        navigationBehaviors: navigationBehaviors.slice(0, 10), // Limit for prompt size
        clickPatterns: clickPatterns.slice(0, 15) // Limit for prompt size
      };
    });
    
    const prompt = `You are a behavioral psychologist and UX researcher specializing in digital behavior analysis. Your task is to analyze this user's behavior in EXTREME DETAIL, focusing on EXACTLY what they did, when they hesitated, how they interacted with each page element, and their specific psychological patterns.

STAGE 2 ANALYSIS: Create a highly detailed psychological profile of this user based on their digital behavior.

Here's the user's detailed behavioral data:
${JSON.stringify(behavioralData, null, 2)}

Previous analysis from STAGE 1:
${stage1Analysis}

## BEHAVIORAL INSIGHTS TO EXTRACT

1. EXACT USER EXPERTISE LEVEL with specific examples:
   - Field interaction expertise (e.g., "User hesitated 4.2 seconds before entering email, suggesting uncertainty")
   - Navigation confidence with specific evidence (e.g., "Used back button 3 times on checkout page")
   - Learning curve with concrete examples comparing early vs late interactions

2. DETAILED HESITATION PATTERNS with timestamps:
   - Exactly when and where the user paused (e.g., "4.2 second pause before clicking submit button")
   - Specific hesitation sequences (e.g., "Consistently hesitated before form submission steps")
   - Correlation between hesitation and specific UI elements

3. INTERACTION RHYTHM ANALYSIS with specific patterns:
   - Field interaction pace (e.g., "Typed email address at 2.3 chars/second, password at 1.2 chars/second")
   - Click patterns with exact counts and timing (e.g., "3 rapid clicks (0.4s apart) on navigation menu")
   - Engagement flow visualization showing precisely how the user moved through interface

4. PSYCHOLOGICAL BEHAVIOR INDICATORS with concrete examples:
   - Decision-making style based on specific interactions (e.g., "Methodical approach shown by reviewing all options before selecting")
   - Frustration signals with precise timing (e.g., "Rapid repeated clicks on submit button at 2:14")
   - Confidence indicators with exact behavior (e.g., "Direct path to checkout without reviewing order summary")

## VISUALIZATION REQUIREMENTS

1. CREATE DETAILED PSYCHOLOGICAL PROFILE TABLE:
   | Behavioral Trait | Evidence | Confidence | Impact |
   |------------------|----------|------------|--------|
   | Methodical Decision-Making | Spent 45s reviewing options before selecting | 85% | Needs comprehensive information before deciding |
   | Form Anxiety | 4.2s hesitation before email field, 2 correction attempts | 90% | May abandon complex forms without assistance |

2. CREATE COGNITIVE LOAD ASSESSMENT TABLE:
   | Interface Element | Cognitive Load | Evidence | Recommendation |
   |-------------------|----------------|----------|----------------|
   | Registration Form | High | 3 hesitations (4.2s, 3.1s, 5.4s), 2 field corrections | Simplify form, add better field guidance |
   | Product Selection | Low | Direct selection, no hesitation, 0 corrections | Current design works well for this user |

3. CREATE EMOTIONAL JOURNEY MAP:
   Registration [UNCERTAIN] -> Form Completion [FRUSTRATED] -> Submission [RELIEVED]
      ↓                          ↓                               ↓
   4.2s hesitation           2 correction attempts          Rapid confirmation click
      ↓                          ↓                               ↓
   Slow, careful input       Repeated field changes         Quick page exit

4. CREATE BEHAVIORAL FRICTION HEATMAP:
   Email field      [XXXXXXXXXX] High friction (4.2s hesitation, 2 corrections)
   Password field   [XXXXXX] Moderate friction (2.1s hesitation, 1 correction)
   Submit button    [XXX] Low friction (0.8s hesitation, direct click)

5. CREATE DECISION-MAKING PATTERN VISUALIZATION:
   Linear Path:      Home → Category → Product → Checkout [65% of interactions]
   Exploratory Path: Home ↔ Category ↔ Category ↔ Product [35% of interactions]
                                      ↓
                            [3.1s average decision time]

FORMAT INSTRUCTIONS:
1. Be EXTREMELY SPECIFIC about exact behaviors - use precise times, counts, and sequences
2. Include field IDs, page names, and exact interaction details
3. Create properly formatted tables with clear headers
4. Use ASCII visualization for journey maps and heatmaps
5. Make direct quotes from the behavior (e.g., "User typed 'gt' in fullName field, paused 2.1s, then continued")
6. Link every behavioral conclusion to specific evidence from the data

Format your analysis as this highly detailed behavioral report with these specific sections:
1. "Detailed Psychological Profile" - Comprehensive breakdown of user's cognitive and emotional traits
2. "Hesitation & Confidence Analysis" - EXACT moments of uncertainty and confidence
3. "Interaction Rhythm & Pacing" - Detailed analysis of interaction speed, timing and efficiency
4. "Decision-Making Style Assessment" - Specific decision patterns with examples
5. "UI Friction Points" - EXACT elements causing cognitive load or confusion
6. "Behavioral Optimization Recommendations" - Specific UI changes to match user's psychological pattern

Your entire analysis must be incredibly specific, detailed, and evidence-based. Focus on the EXACT actions this specific user took, not general patterns.`;

    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 4000, 
        top_p: 0.9,
        stream: false
      });
      
      return {
        analysis: response.choices[0]?.message?.content,
        modelUsed: model
      };
    } catch (error) {
      console.error(`[Orchestrator] Error in performBehavioralAnalysis with ${model}:`, error);
      console.log(`[Orchestrator] Retrying with fallback model ${DEFAULT_MODEL}`);
      
      const fallbackResponse = await groq.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 4000,
        top_p: 0.9,
        stream: false
      });
      
      return {
        analysis: fallbackResponse.choices[0]?.message?.content,
        modelUsed: DEFAULT_MODEL
      };
    }
  } catch (error) {
    console.error(`[Orchestrator] Error in performBehavioralAnalysis:`, error);
    throw error;
  }
}

/**
 * Perform form interaction analysis on session features (Stage 3)
 * @param {Array} sessionFeatures - Array of session features
 * @param {string} model - Model to use for analysis
 * @returns {Promise<Object>} Analysis text and model used
 */
async function performFormAnalysis(sessionFeatures, model) {
  try {
    const formData = sessionFeatures.map((session, index) => ({
      sessionNumber: index + 1,
      sessionId: session.sessionId,
      formFields: session.formInteractions?.fields || [],
      formSubmissions: session.formInteractions?.formSubmissions || []
    }));
    
    const prompt = `You are a form UX specialist and interaction designer with expertise in analyzing how users engage with forms and input fields. Your task is to analyze this user's form interaction patterns.

STAGE 3 ANALYSIS: Focus on form interactions, input patterns, and error handling.

Here's the user's form interaction data:
${JSON.stringify(formData, null, 2)}

Analyze this data for:

1. Form completion patterns and success rates
2. Field interaction sequences and time spent on different field types
3. Error patterns and correction behaviors
4. Hesitation points in form completion
5. Form abandonment patterns and potential friction points

Your response should include:

- Detailed analysis of form completion workflows
- Field-by-field interaction assessment
- Error frequency and recovery patterns
- Recommendations for form design improvements
- User's apparent comfort level with different input types

Format your analysis as a structured report with these specific sections:
1. "Form Interaction Overview" - Overall patterns in form usage
2. "Field-by-Field Analysis" - Detailed analysis of interactions with each field type
3. "Error Patterns & Recovery" - How the user encounters and recovers from errors
4. "Form UX Friction Points" - Identified issues in the form experience
5. "Form Design Recommendations" - Specific suggestions for improvement

Be specific about exact fields, timing patterns, and provide actionable insights rather than general observations.`;

    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2500,
        top_p: 0.9,
        stream: false
      });
      
      return {
        analysis: response.choices[0]?.message?.content,
        modelUsed: model
      };
    } catch (error) {
      console.error(`[Orchestrator] Error in performFormAnalysis with ${model}:`, error);
      console.log(`[Orchestrator] Retrying with fallback model ${DEFAULT_MODEL}`);
      
      const fallbackResponse = await groq.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 2500,
        top_p: 0.9,
        stream: false
      });
      
      return {
        analysis: fallbackResponse.choices[0]?.message?.content,
        modelUsed: DEFAULT_MODEL
      };
    }
  } catch (error) {
    console.error(`[Orchestrator] Error in performFormAnalysis:`, error);
    throw error;
  }
}

/**
 * Perform temporal analysis on session features (Stage 4)
 * @param {Array} sessionFeatures - Array of session features
 * @param {string} model - Model to use for analysis
 * @returns {Promise<Object>} Analysis text and model used
 */
async function performTemporalAnalysis(sessionFeatures, model) {
  try {
    const temporalData = {
      sessionCount: sessionFeatures.length,
      sessions: sessionFeatures.map((session, index) => ({
        sessionNumber: index + 1,
        sessionId: session.sessionId,
        date: session.startTime,
        duration: session.sessionDuration,
        stateCount: session.stateCount,
        interactionCount: session.userInteractions?.length || 0
      })),
      sessionDates: sessionFeatures.map(s => s.startTime),
      timeSpans: sessionFeatures.map(s => s.sessionDuration)
    };
    
    const prompt = `You are a longitudinal UX researcher specializing in user progression and temporal analysis. Your task is to analyze how this user's behavior has changed over time and identify progression patterns.

STAGE 4 ANALYSIS: Focus on temporal patterns, learning progression, and behavioral evolution.

Here's the temporal data about the user's sessions:
${JSON.stringify(temporalData, null, 2)}

Analyze this data for:

1. User progression and learning curve over time
2. Task efficiency improvements or regressions
3. Evolution of navigation patterns and workflows
4. Time-based patterns in session engagement
5. Seasonal or periodic usage patterns

Your response should include:

- TIMELINE VISUALIZATION: Create a session-by-session timeline using markdown/ASCII showing key metrics
- PROGRESSION METRICS TABLE: Create a detailed table showing improvement/regression rates with percentages
- LEARNING CURVE VISUALIZATION: Show skill development progression using ASCII charts
- ENGAGEMENT TREND ANALYSIS: Present a structured table of changing interaction patterns
- EFFICIENCY METRICS CHART: Display task completion efficiency changes over sessions

FORMAT INSTRUCTIONS:
1. Create proper markdown tables with |---|---| headers and alignment
2. Use markdown formatting for headers, lists and structure
3. Include exact measurements and percentages for all metrics
4. Label all tables and charts clearly
5. Show progression/regression with indicators (↑/↓) in tables 
6. Make every section highly detailed with concrete data, not generalizations

Format your analysis as a structured report with these specific sections:
1. "Temporal Overview" - Analysis of session timing, frequency and duration patterns
2. "Learning Progression Analysis" - How the user's skills and efficiency evolved
3. "Behavioral Evolution" - Changes in approaches and strategies over time
4. "Engagement Trends" - Long-term patterns in engagement and interest
5. "Progression Insights & Predictions" - Key insights and predicted future behavior

Focus on changes over time rather than repeating analysis of individual sessions. Identify clear patterns of improvement, plateaus, or regression in the user's journey with concrete data visualizations.`;

    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 4000, // Increased token limit for more detailed output
        top_p: 0.9,
        stream: false
      });
      
      return {
        analysis: response.choices[0]?.message?.content,
        modelUsed: model
      };
    } catch (error) {
      console.error(`[Orchestrator] Error in performTemporalAnalysis with ${model}:`, error);
      console.log(`[Orchestrator] Retrying with fallback model ${DEFAULT_MODEL}`);
      
      const fallbackResponse = await groq.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 4000,
        top_p: 0.9,
        stream: false
      });
      
      return {
        analysis: fallbackResponse.choices[0]?.message?.content,
        modelUsed: DEFAULT_MODEL
      };
    }
  } catch (error) {
    console.error(`[Orchestrator] Error in performTemporalAnalysis:`, error);
    throw error;
  }
}

/**
 * Generate a comprehensive synthesis report from all analysis stages
 * @param {Array} sessionFeatures - Extracted session features
 * @param {Object} stageResults - Results from all analysis stages
 * @param {string} model - Model to use for synthesis
 * @returns {Promise<Object>} Final report and model used
 */
async function generateComprehensiveReport(sessionFeatures, stageResults, model) {
  try {
    const sessionCount = sessionFeatures.length;
    
    // Create a summary of the most important user data for the synthesis model
    const userDataSummary = sessionFeatures.map(session => ({
      sessionId: session.sessionId,
      duration: session.sessionDuration,
      pageCount: session.navigationSequence.length,
      interactionCount: session.userInteractions.length,
      formFieldIds: Object.keys(session.fieldTimeAnalysis || {}),
      startTime: session.startTime,
      endTime: session.endTime
    }));
    
    const prompt = `You are an expert UX analyst creating a professional, EXTREMELY DETAILED report on user behavior from in-depth analytics data.

# SYNTHESIS TASK
Create a comprehensive, data-rich analysis report by synthesizing these specialized analysis stages:

## Stage 1: Metrics & Navigation Analysis
${stageResults.stage1}

## Stage 2: Behavioral & Psychological Analysis
${stageResults.stage2}

## Stage 3: Form Interaction Analysis
${stageResults.stage3 || "No form interaction analysis available."}

## Stage 4: Temporal & Progression Analysis
${stageResults.stage4 || "No temporal analysis available."}

## User Sessions Summary
${JSON.stringify(userDataSummary, null, 2)}

# REPORT REQUIREMENTS
Create a professional analysis report that integrates ALL insights from previous stages, preserving their detailed data and visualizations. This is a high-value deliverable for UX teams that must maintain the specificity and detail from each stage.

## SYNTHESIS APPROACH
1. Maintain ALL detailed tables, visualizations and specific data points from each stage
2. Create unified visualizations that combine insights across stages
3. Highlight specific field interactions with exact timing data
4. Include all psychological insights with supporting evidence
5. Preserve all micro-interaction details (clicks, hesitations, form interactions)

## REQUIRED ELEMENTS

1. COMPREHENSIVE METRICS MATRIX
   | Metric | Value | Source | Significance |
   |--------|-------|--------|-------------|
   | Form field hesitation | 4.2s on email field | Stage 2 | High cognitive load, potential abandonment risk |
   | Navigation path | Registration → Details → Confirmation | Stage 1 | Linear completion journey, no exploration |

2. USER PSYCHOLOGICAL PROFILE SYNTHESIS
   | Trait | Confidence | Evidence | UX Implications |
   |-------|------------|----------|----------------|
   | Form Anxiety | 90% | 4.2s hesitation on email field, 2 correction attempts | Need clear validation, progressive disclosure |
   | Goal-Oriented | 85% | Direct path through tasks, minimal exploration | Streamline primary user flows, minimize distractions |

3. INTERACTION TIMELINE SYNTHESIS
   Registration Page [4.2s hesitation] → Email Field [2 corrections] → Submit [Direct click]
     Cognitive Load: HIGH                Friction: MEDIUM              Relief: HIGH
     Methodical Input                    Careful Verification          Confident Completion

4. UX FRICTION HEATMAP
   Email field validation   [XXXXXXXXXX] (4.2s hesitation, 2 corrections)
   Password requirements    [XXXXXX] (Slow typing at 1.2 chars/sec)
   Navigation menu          [XXX] (0.8s hesitation per click)

5. OPTIMIZATION PRIORITY MATRIX
   | UI Element | Friction Score | Improvement Potential | Implementation Difficulty |
   |------------|----------------|----------------------|----------------------------|
   | Email field validation | 8/10 | High (+25% completion) | Low (2/10) |
   | Form layout structure | 7/10 | Medium (+15% completion) | Medium (5/10) |
   | Navigation clarity | 5/10 | Medium (+10% efficiency) | Low (3/10) |

## DETAIL REQUIREMENTS
1. Include EXACT field IDs, element names, and interaction details
2. Preserve ALL timing data (seconds of interaction, hesitation times)
3. Maintain all visualization details and specific metrics
4. Include ALL page names, navigation paths, and state transitions
5. Keep all behavioral insights with their specific evidence

Format your report as a professional UX analysis document with these sections:
1. **Executive Summary** - Concise overview of most critical findings (2-3 paragraphs)
2. **User Behavioral Profile** - Comprehensive psychological profile with specific evidence
3. **Interaction Analysis** - Detailed breakdown of how the user interacted with specific elements
4. **Navigation & Information Architecture Analysis** - User's movement through the site/app
5. **Form Field Analysis** - Field-by-field breakdown of interaction patterns
6. **Performance & Technical Impact** - How technical factors affected the UX
7. **Experience Pain Points** - Ranked list of UX friction areas with specific evidence
8. **Optimization Opportunities** - Prioritized recommendations with expected impact

Your report must maintain the exceptional level of detail and specificity from the individual stages while creating a cohesive, unified analysis.`;

    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 6000,
        top_p: 0.9,
        stream: false
      });
      
      // Add header with metadata
      const report = `# User Session Analysis Report
*Generated on: ${new Date().toLocaleString()}*

${response.choices[0]?.message?.content}

---
*This analysis was performed using a multi-stage AI analysis pipeline with ${sessionCount} user session(s).*`;
      
      return {
        report,
        modelUsed: model
      };
    } catch (error) {
      console.error(`[Orchestrator] Error in generateComprehensiveReport with ${model}:`, error);
      console.log(`[Orchestrator] Retrying with fallback model ${DEFAULT_MODEL}`);
      
      const fallbackResponse = await groq.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
        max_tokens: 6000,
        top_p: 0.9,
        stream: false
      });
      
      // Add header with metadata and note about fallback
      const report = `# User Session Analysis Report
*Generated on: ${new Date().toLocaleString()}*

${fallbackResponse.choices[0]?.message?.content}

---
*This analysis was performed using a multi-stage AI analysis pipeline with ${sessionCount} user session(s). Fallback model was used for final synthesis.*`;
      
      return {
        report,
        modelUsed: DEFAULT_MODEL
      };
    }
  } catch (error) {
    console.error(`[Orchestrator] Error in generateComprehensiveReport:`, error);
    throw error;
  }
}

module.exports = {
  performComprehensiveAnalysis
}; 