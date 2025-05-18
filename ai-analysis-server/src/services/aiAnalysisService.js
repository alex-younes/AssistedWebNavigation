const Groq = require('groq-sdk');
const axios = require('axios');

// Get the main backend URL from environment or use default
const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:3001';

// Initialize the Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Helper function to extract relevant session features for analysis
function extractSessionFeatures(session) {
  const features = {
    sessionId: session.sessionId || session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    duration: session.endTime ? new Date(session.endTime) - new Date(session.startTime) : null,
    totalStates: session.states?.length || 0,
    interactions: [],
    metrics: {}
  };
  
  // Extract metrics across all states if available
  if (session.states && Array.isArray(session.states)) {
    session.states.forEach(state => {
      // Add interaction information if present
      if (state.interactionInfo) {
        features.interactions.push({
          type: state.interactionInfo.type,
          element: state.interactionInfo.element,
          selector: state.interactionInfo.selector,
          value: state.interactionInfo.value,
          timestamp: state.timestamp
        });
      }
      
      // Aggregate metrics
      if (state.metrics) {
        Object.keys(state.metrics).forEach(key => {
          if (typeof state.metrics[key] === 'number') {
            features.metrics[key] = (features.metrics[key] || 0) + state.metrics[key];
          }
        });
      }
    });
  }
  
  // Add non-transitional events if available
  if (session.nonTransitionalEvents) {
    features.nonTransitionalEvents = {};
    
    // Count different event types
    Object.entries(session.nonTransitionalEvents).forEach(([eventType, events]) => {
      if (Array.isArray(events)) {
        features.nonTransitionalEvents[eventType] = events.length;
      }
    });
    
    // Extract specific key behavioral indicators
    const ntEvents = session.nonTransitionalEvents;
    
    // Dead clicks - indicate user confusion
    features.deadClicks = ntEvents.deadClicks?.length || 0;
    
    // Hesitation markers (input field idle)
    features.inputFieldIdles = ntEvents.inputFieldIdle?.length || 0;
    
    // Escape/Backspace - correction behaviors
    features.escapeBackspaces = ntEvents.escapeBackspace?.length || 0;
    
    // Repeated clicks - frustration indicators
    features.repeatedClicks = ntEvents.repeatedClicks?.length || 0;
    
    // Oscillating hovers - indecision indicators
    features.oscillatingHovers = ntEvents.oscillatingHovers?.length || 0;
    
    // Typing cadence analysis
    if (ntEvents.keyTypingCadence && Array.isArray(ntEvents.keyTypingCadence)) {
      const cadences = ntEvents.keyTypingCadence.map(k => k.timeSinceLast).filter(Boolean);
      features.avgTypingCadence = cadences.length > 0 ? 
        cadences.reduce((sum, val) => sum + val, 0) / cadences.length : null;
    }
  }
  
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
 * Fetch session details including states from the main backend
 * @param {string} sessionId - Session ID to fetch details for
 * @returns {Promise<Object>} - Enriched session object with states
 */
async function fetchSessionDetails(sessionId) {
  try {
    console.log(`[Service] Fetching details for sessionId: ${sessionId}`);
    
    // Fetch basic session data - using the same endpoint the Graph component uses
    const sessionResponse = await axios.get(`${MAIN_BACKEND_URL}/api/extension/recorder/session/${sessionId}`);
    const session = sessionResponse.data.session;
    
    // Fetch states for this session - using the same endpoint the Graph component uses
    const statesResponse = await axios.get(`${MAIN_BACKEND_URL}/api/extension/recorder/session/${sessionId}/states`);
    session.states = statesResponse.data.states;
    
    return session;
  } catch (error) {
    console.error(`[Service] Error fetching details for sessionId ${sessionId}:`, error);
    throw new Error(`Failed to fetch session details: ${error.message}`);
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
 * Perform user sessions comparison analysis.
 * This function will take a specific userId, fetch all their sessions from the main backend,
 * then perform a comparative analysis on these sessions.
 * 
 * @param {string} userId - The ID of the user whose sessions are being compared.
 * @returns {Promise<Object>} - An object containing the comparison analysis report.
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
    
    // 4. Create a structured prompt for the LLM
    const systemPrompt = `You are an expert user behavior analyst specializing in detailed web interaction analysis. 
You have been given data from ${enrichedSessions.length} sessions of the same user (userId: ${userId}).
Your task is to perform a comprehensive comparative analysis of these sessions, focusing on changes in user behavior over time.

Pay close attention to:
1. Learning curves and behavioral evolution
2. Changes in efficiency and confidence
3. Reduction in errors or confusion indicators
4. Evolving navigation patterns
5. Micro-interactions (hesitations, hover patterns, typing cadence)
6. Evidence of mastery or continuing struggles

FORMAT YOUR RESPONSE WITH PROPER MARKDOWN:
- Use ## for main section headers and ### for subsections
- Use **bold** for emphasis of key metrics and findings 
- Use HTML tables instead of markdown tables for better formatting
- Separate sections with blank lines for better readability
- For session data, use HTML tables with this structure:

<table>
  <thead>
    <tr>
      <th>Session ID</th>
      <th>Start Time</th>
      <th>End Time</th>
      <th>Duration</th>
      <th>Total States</th>
      <th>Interactions</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>session_123</td>
      <td>2023-05-17 14:30:22</td>
      <td>2023-05-17 14:35:46</td>
      <td>324,000 ms</td>
      <td>5</td>
      <td>3</td>
    </tr>
  </tbody>
</table>

Your analysis should be evidence-based, citing specific metrics from the provided session data.`;

    const userPrompt = `Here is the session data for user ${userId}:
${JSON.stringify(sessionFeatures, null, 2)}

Based on this data, provide a detailed comparative analysis with the following structured sections:

## Executive Summary
A concise overview of the key findings from your analysis (3-4 sentences).

## Sessions Overview
Create a clean HTML table showing all sessions with these columns:
- Session ID
- Start Time (formatted)
- End Time (formatted)
- Duration (ms)
- Total States
- Interactions
- DOM Size (if available)
- Visible Elements (if available)

Use this HTML structure for your table:
<table>
  <thead>
    <tr>
      <th>Session ID</th>
      <th>Start Time</th>
      <th>End Time</th>
      <th>Duration</th>
      <th>States</th>
      <th>Interactions</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>session_12345</td>
      <td>2023-05-17 14:30:22</td>
      <td>2023-05-17 14:35:46</td>
      <td>324,000 ms</td>
      <td>5</td>
      <td>3</td>
    </tr>
  </tbody>
</table>

## Detailed Behavioral Patterns
Analyze how behavior evolved across sessions, organized into these subsections:

### Learning Curves and Behavioral Evolution
### Changes in Efficiency and Confidence
### Reduction in Errors or Confusion Indicators
### Evolving Navigation Patterns
### Micro-Interactions

## Recommendations
Provide 3-5 specific, actionable recommendations based on the patterns observed.

Format your analysis with clear markdown headings, proper spacing between sections, and well-structured lists with nested bullet points.`;

    // 5. Call the Groq LLM API
    console.log(`[Service] Sending prompt to Groq LLM for user ${userId}...`);
    const MODEL = process.env.DEFAULT_MODEL || "llama3-8b-8192";
    
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      temperature: 0.5,
      max_tokens: 4000,
      top_p: 0.9,
      stream: false
    });
    
    // 6. Process the LLM response
    const analysisReport = completion.choices[0]?.message?.content;
    
    if (!analysisReport) {
      throw new Error("Failed to generate analysis from LLM");
    }
    
    // 7. Construct and return the final response
    return {
      success: true,
      userId,
      sessionCount: enrichedSessions.length,
      report: analysisReport,
      sessionIds: enrichedSessions.map(s => s.sessionId || s.id),
      timestamp: new Date().toISOString(),
      model: MODEL
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