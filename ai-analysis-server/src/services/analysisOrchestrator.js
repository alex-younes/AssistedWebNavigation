/**
 * Simplified Analysis Orchestrator
 * 
 * This module provides a basic analysis pipeline for user session data.
 * It focuses on fetching data and generating a simple report to avoid complexity
 * and API token limit issues.
 */

const axios = require('axios');
const Groq = require('groq-sdk');
const { processSessionForDetailedEvents } = require('./analysisStages/stage1_detailedEventProcessor');

// Get the main backend URL from environment or use default
const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:3001';

// Initialize Groq client only if not using Gemini and API key is provided
const groq = (process.env.USE_GEMINI === 'true' || !process.env.GROQ_API_KEY) ? null : new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Google Gemini API settings
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// Determine which AI service to use
const USE_GEMINI = process.env.USE_GEMINI === 'true' || !!GEMINI_API_KEY || !process.env.GROQ_API_KEY;

// Basic model selection
function selectModel() {
  if (USE_GEMINI) {
    return process.env.DEFAULT_MODEL || 'gemini-1.5-flash';
  }
  return process.env.DEFAULT_MODEL || 'llama-3.1-8b-instant';
}

// Execute model request with basic error handling
async function executeModelRequest(prompt, model) {
  if (USE_GEMINI) {
    return executeGeminiRequest(prompt, model);
  }
  return executeGroqRequest(prompt, model);
}

async function executeGroqRequest(prompt, model) {
  try {
    if (!groq) {
      throw new Error('Groq client not initialized. GROQ_API_KEY is missing.');
    }
    const response = await groq.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 1000,
      stream: false
    });
    return response.choices[0]?.message?.content || 'No content returned';
  } catch (error) {
    console.error(`Error with Groq model ${model}:`, error.message);
    return `Error generating analysis: ${error.message}`;
  }
}

async function executeGeminiRequest(prompt, model) {
  console.log(`[Gemini] Attempting to generate content with model: ${model}`);
  console.log(`[Gemini] Prompt length: ${prompt.length} characters`);
  
  // Log prompt summary - only log first and last parts to avoid console spam
  console.log(`[Gemini] Prompt summary: ${prompt.substring(0, 200)}...${prompt.substring(prompt.length - 200)}`);

  if (!GEMINI_API_KEY) {
    console.error("[Gemini] Error: GEMINI_API_KEY is not set. Please check your .env file.");
    return "Error: GEMINI_API_KEY is not configured.";
  }

  try {
    // Truncate prompt if too long (Gemini has a token limit)
    // A very rough character estimate - actual token count would be more precise
    const MAX_CHARS = 80000; // Conservative limit
    let truncatedPrompt = prompt;
    if (prompt.length > MAX_CHARS) {
      console.warn(`[Gemini] Prompt too long (${prompt.length} chars). Truncating to ~${MAX_CHARS} chars.`);
      // Keep the important parts of the prompt - start with intro and instructions
      const introLength = 2000; // Keep first 2000 chars
      const endLength = 10000;  // Keep last 10000 chars (usually contains tables and key data)
      truncatedPrompt = prompt.substring(0, introLength) + 
        `\n\n[NOTE: Some detailed state information has been omitted due to length constraints. Focus on the transition tables and summary data below.]\n\n` +
        prompt.substring(prompt.length - endLength);
      
      console.log(`[Gemini] Truncated prompt length: ${truncatedPrompt.length} characters`);
    }

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          role: 'user',
          parts: [{ text: truncatedPrompt }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("[Gemini] Successfully received response from Gemini.");
    return content || 'No content returned from Gemini';
  } catch (error) {
    console.error(`[Gemini] Error with Gemini model ${model}. Status: ${error.response?.status}. Message: ${error.message}`);
    
    // Enhanced error logging
    if (error.response?.data) {
      console.error("[Gemini] Error details:", JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.response?.status === 400) {
      console.error("[Gemini] 400 Bad Request - This typically indicates an issue with the prompt structure or size.");
      // Check for common Gemini error messages
      if (error.response?.data?.error?.message) {
        console.error(`[Gemini] API Error message: ${error.response.data.error.message}`);
      }
    }
    
    return `Error generating analysis with Gemini: ${error.message}`;
  }
}

/**
 * Generate a comprehensive summary prompt for analysis that includes the new session-level analysis
 * @param {Object} sessionData - Prepared session data with enhanced Stage 1 analysis
 * @returns {string} Summary prompt for the model
 */
function generateSummaryPrompt(sessionData) {
  let prompt = `You are an Expert User Session Analyst. Your task is to analyze user behavior data and create a detailed report with tables and insights FOCUSED EXCLUSIVELY ON USER BEHAVIOR.

IMPORTANT GUIDELINES:
1. Focus ONLY on describing observed user behavior and patterns - NOT on website design suggestions
2. Use the provided transition tables and metrics to analyze how users navigate between states
3. Identify specific patterns like navigation loops, form interactions, and state transition behaviors
4. Generate your report with Markdown formatting including tables and bullet points
5. Structure your analysis as a data scientist would - with observations backed by the data

User ID: ${sessionData.enrichedSessions[0]?.userId}
Sessions Analyzed: ${sessionData.sessionCount}

`;

  // For brevity and to stay within token limits, process just one session in detail if multiple exist
  // But include summary data for all sessions
  const sessionsToProcess = sessionData.enrichedSessions.length > 1 ? 
    [sessionData.enrichedSessions[0]] : 
    sessionData.enrichedSessions;
  
  // Include summary data for ALL sessions
  prompt += `\n## All Sessions Overview\n`;
  sessionData.enrichedSessions.forEach((session, sessionIndex) => {
    prompt += `- Session ${sessionIndex + 1} ID: ${session.id || session.sessionId}\n`;
    prompt += `  Duration: ${Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000)} seconds\n`;
    prompt += `  States: ${session.states.length}\n`;
    if (session.sessionAnalysis?.summary) {
      const summary = session.sessionAnalysis.summary;
      prompt += `  Unique URLs: ${summary.uniqueUrls}\n`;
      if (summary.mostCommonTransitionTrigger) {
        prompt += `  Most Common Transition: ${summary.mostCommonTransitionTrigger.type} (${summary.mostCommonTransitionTrigger.count} occurrences)\n`;
      }
    }
    prompt += `\n`;
  });

  // Process selected sessions in detail
  sessionsToProcess.forEach((session, sessionIndex) => {
    prompt += `\n## Detailed Analysis: Session ${sessionIndex + 1} (ID: ${session.id || session.sessionId})\n`;
    
    // Add session-level analysis if available - THIS IS THE MOST IMPORTANT DATA
    if (session.sessionAnalysis) {
      const analysis = session.sessionAnalysis;
      
      // Add transition pattern summary
      if (analysis.transitionPatterns && analysis.transitionPatterns.summary) {
        const summary = analysis.transitionPatterns.summary;
        prompt += `\n### Session Navigation Summary\n`;
        prompt += `- Total States: ${summary.totalStates}\n`;
        prompt += `- Unique URLs: ${summary.uniqueUrlCount}\n`;
        prompt += `- Navigation Loops: ${summary.navigationLoopCount}\n`;
        prompt += `- Form Interactions: ${summary.formInteractionCount}\n`;
        if (summary.mostVisitedUrl && summary.mostVisitedUrl.url) {
          prompt += `- Most Visited URL: ${summary.mostVisitedUrl.url} (${summary.mostVisitedUrl.count} visits)\n`;
        }
        prompt += `- Avg States Per URL: ${summary.averageStatesPerUrl.toFixed(2)}\n`;
        
        // Add transition trigger types
        if (summary.transitionTypeSummary) {
          prompt += `- Transition Types:\n`;
          Object.entries(summary.transitionTypeSummary).forEach(([type, count]) => {
            prompt += `  - ${type}: ${count}\n`;
          });
        }
      }
      
      // Add HTML table structures as Markdown tables - VERY IMPORTANT FOR VISUALIZATION
      if (analysis.htmlTables) {
        prompt += `\n### Important Data Tables\n`;
        
        // URL Visit Summary Table
        if (analysis.htmlTables.urlVisitSummary) {
          const table = analysis.htmlTables.urlVisitSummary;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
        
        // State Transitions Table
        if (analysis.htmlTables.stateTransitions) {
          const table = analysis.htmlTables.stateTransitions;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
        
        // Navigation Loops Table (if has data)
        if (analysis.htmlTables.navigationLoops && analysis.htmlTables.navigationLoops.rows && analysis.htmlTables.navigationLoops.rows.length > 0) {
          const table = analysis.htmlTables.navigationLoops;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
        
        // Form Interactions Table (if has data)
        if (analysis.htmlTables.formInteractions && analysis.htmlTables.formInteractions.rows && analysis.htmlTables.formInteractions.rows.length > 0) {
          const table = analysis.htmlTables.formInteractions;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
      }
    }
    
    // Add summary of state-by-state transitions (limit to first 5 states to manage token count)
    prompt += `\n### Key State Transitions\n`;
    const statesToShow = Math.min(5, session.states.length);
    
    for (let i = 0; i < statesToShow; i++) {
      const state = session.states[i];
      const features = state.processedEventFeatures || {};
      
      if (!features.stateIdentity) continue;
      
      prompt += `- State ${i + 1} (${features.stateIdentity.stateId || state.stateId}):\n`;
      prompt += `  URL: ${features.stateIdentity.url || state.url}\n`;
      
      if (features.transitionTrigger) {
        prompt += `  Trigger: ${features.transitionTrigger.type}\n`;
      }
      
      if (i > 0) {
        const prevState = session.states[i-1];
        const prevFeatures = prevState.processedEventFeatures || {};
        prompt += `  From Previous: ${prevFeatures.stateIdentity?.url || prevState.url}\n`;
        if (features.transitionDetails?.timeSincePreviousStateMs) {
          prompt += `  Time Since Previous: ${features.transitionDetails.timeSincePreviousStateMs}ms\n`;
        }
      }
    }
    
    if (statesToShow < session.states.length) {
      prompt += `\n_Note: Showing only first ${statesToShow} of ${session.states.length} states for brevity._\n`;
    }
  });

  prompt += `\n## Analysis Requirements

Based on the data provided above, create a comprehensive analysis report that:

1. STRICTLY focuses on the USER BEHAVIOR across the session(s) - NOT on website design recommendations. 
   Describe what the user did, not what the website should do better.

2. Analyzes the state transition tables to identify how users navigated between pages:
   - What URLs did they visit most?
   - What types of transitions were most common (user interactions vs. navigations)?
   - How much time did they spend on different pages?

3. Identifies navigation patterns:
   - Did they exhibit navigation loops (revisiting the same URLs)?
   - How many states did it take them to accomplish tasks?
   - What was their primary navigation flow?

4. Provides concrete, data-backed observations about user behavior:
   - Example: "The user spent an average of 45 seconds on the homepage before navigating to other pages via user interactions."
   - Example: "The user showed a navigation loop pattern, returning to the homepage 5 times during the session."

Your report should read like a professional data analyst's findings about user behavior - factual, detailed, and based entirely on the data provided.
`;

  return prompt;
}

/**
 * Perform a basic analysis of user sessions
 * @param {string} userId - User ID to analyze sessions for
 * @returns {Promise<object>} Basic analysis results
 */
async function performBasicAnalysis(userId) {
  console.log(`[Orchestrator] Starting basic analysis for userId: ${userId}`);
  try {
    // Step 1: Fetch and prepare raw session data
    let sessionData = await fetchAndPrepareSessionData(userId);
    if (sessionData.sessionCount < 1) {
      console.log(`[Orchestrator] No valid sessions found for user ${userId}`);
      return {
        success: false,
        message: `No valid sessions found for user ${userId}`,
        userId,
        sessionCount: 0
      };
    }
    console.log(`[Orchestrator] Found ${sessionData.sessionCount} valid raw sessions to analyze`);

    // Step 2: Perform Stage 1 Detailed Event Processing
    const processedSessions = [];
    for (const session of sessionData.enrichedSessions) {
      const processedSession = await processSessionForDetailedEvents(session);
      processedSessions.push(processedSession);
    }
    // Update sessionData to use the sessions processed by Stage 1
    sessionData.enrichedSessions = processedSessions;
    console.log(`[Orchestrator] Completed Stage 1 Detailed Event Processing for ${processedSessions.length} sessions.`);

    // Step 3: Generate a summary prompt with the enhanced session analysis data
    const summaryPrompt = generateSummaryPrompt(sessionData);
    const model = selectModel();
    const analysisResult = await executeModelRequest(summaryPrompt, model);
      
    // Extract HTML table structures from the processed sessions for direct client-side rendering
    const htmlTables = processedSessions.map(session => session.sessionAnalysis?.htmlTables || {});
      
    return {
      success: true,
      report: analysisResult,
      reportLength: analysisResult.length,
      userId,
      sessionCount: sessionData.sessionCount,
      analysisStagesCompleted: processedSessions[0]?.analysisStagesCompleted,
      htmlTables: htmlTables, // Include HTML table structures for client-side rendering
      sessionAnalysisSummary: processedSessions.map(session => ({
        sessionId: session.id || session.sessionId,
        summary: session.sessionAnalysis?.summary || {}
      }))
    };
  } catch (error) {
    console.error(`[Orchestrator] Error in analysis pipeline: ${error.message}`);
    return {
      success: false,
      message: `Error performing analysis: ${error.message}`,
      userId,
      error: error.message
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
    const sessionsResponse = await fetchUserSessions(userId);
    const sessions = sessionsResponse.data;
    console.log(`[Orchestrator] Fetched ${sessions.length} sessions for userId: ${userId}`);
    if (sessions.length === 0) {
      return { sessionCount: 0 };
    }

    const sortedSessions = [...sessions].sort((a, b) => {
      return new Date(a.startTime) - new Date(b.startTime);
    });

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
    const response = await axios.get(`${MAIN_BACKEND_URL}/api/admin/users/${userId}/sessions`);
    return response;
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
    const sessionResponse = await axios.get(`${MAIN_BACKEND_URL}/api/extension/recorder/session/${sessionId}`);
    const session = sessionResponse.data.session;
    if (!session) {
      throw new Error(`Session ${sessionId} not found or data structure incorrect.`);
    }

    const statesResponse = await axios.get(`${MAIN_BACKEND_URL}/api/extension/recorder/session/${sessionId}/states`);
    const states = statesResponse.data.states || [];
    if (!Array.isArray(states)) {
      throw new Error(`Failed to fetch states for session ${sessionId}`);
    }
    console.log(`[Orchestrator] Fetched ${states.length} states for session ${sessionId}`);

    const enrichedStates = await Promise.all(states.map(async (state) => {
      if (!state || !state.stateId) {
        // console.log(`[Orchestrator] Invalid state data found, skipping:`, state); // Optional: log if needed
        return state;
      }
      
      // console.log(`[Orchestrator] Processing state: ${state.stateId}`); // Optional: for very detailed tracing

      if (state.events && Object.keys(state.events).length > 0) {
        console.log(`[Orchestrator] Found embedded nonTransitionalEvents for state ${state.stateId}`);
        return {
          ...state,
          nonTransitionalEvents: state.events
        };
      }

      // Only fetch non-transitional events if the state has interactionInfo
      if (state.interactionInfo) {
        try {
          console.log(`[Orchestrator] Attempting to fetch nonTransitionalEvents for state ${state.stateId} (has interactionInfo)`);
          const nteResponse = await axios.get(
            `${MAIN_BACKEND_URL}/api/admin/states/${state.stateId}/nontransitional?sessionId=${sessionId}`
          );
          if (nteResponse.data && (typeof nteResponse.data !== 'object' || Object.keys(nteResponse.data).length > 0)) {
            console.log(`[Orchestrator] Successfully fetched nonTransitionalEvents for state ${state.stateId}`);
            return {
              ...state,
              nonTransitionalEvents: nteResponse.data.events || nteResponse.data 
            };
          }
          console.log(`[Orchestrator] No data returned by API for nonTransitionalEvents for state ${state.stateId} (had interactionInfo)`);
          return { 
            ...state,
            nonTransitionalEvents: {} 
          };
        } catch (error) {
          if (error.response?.status === 404) {
            console.log(`[Orchestrator] No nonTransitionalEvents found for state ${state.stateId} (had interactionInfo, API returned 404).`);
            return {
              ...state,
              nonTransitionalEvents: {} // Data not found, not an error for summary
            };
          } else {
            // For other errors (network issues, 500s, etc.), log as a warning and count as a fetch error
            console.warn(`[Orchestrator] System error fetching nonTransitionalEvents for state ${state.stateId} (had interactionInfo):`, error.message, `Status: ${error.response?.status || 'N/A'}`);
            return {
              ...state,
              nonTransitionalEvents: {},
              fetchError: { 
                message: error.message, 
                status: error.response?.status || 'N/A' 
              }
            };
          }
        }
      } else {
        console.log(`[Orchestrator] Skipping fetch for nonTransitionalEvents for state ${state.stateId} (lacks interactionInfo)`);
        return {
          ...state,
          nonTransitionalEvents: {}, // Ensure nonTransitionalEvents is an empty object
          fetchSkipped: true 
        };
      }
    }));

    // Check for transitional events in session or states
    if (session.interactionInfo || states.some(state => state.interactionInfo)) {
      console.log(`[Orchestrator] Transitional events detected for session ${sessionId}`);
    } else {
      console.log(`[Orchestrator] No transitional events detected for session ${sessionId}`);
    }

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
    console.warn(`[Orchestrator] Session missing or has no states: ${session?.id || session?.sessionId || 'unknown'}`);
    return { isValid: false, sessionId: session?.id || session?.sessionId || 'unknown' };
  }

  try {
    const sessionId = session.id || session.sessionId;
    const { states = [] } = session;
    const sessionDuration = session.endTime && session.startTime ? 
      Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 1000) : 0;

    // Check for non-transitional events in states
    const hasNonTransitionalEvents = states.some(state => state.nonTransitionalEvents && Object.keys(state.nonTransitionalEvents).length > 0);
    console.log(`[Orchestrator] Non-transitional events ${hasNonTransitionalEvents ? 'present' : 'absent'} for session ${sessionId}`);

    // Check for transitional events
    const hasTransitionalEvents = session.interactionInfo || states.some(state => state.interactionInfo);
    console.log(`[Orchestrator] Transitional events ${hasTransitionalEvents ? 'present' : 'absent'} for session ${sessionId}`);

    return {
      isValid: true,
      sessionId,
      sessionDuration,
      stateCount: states.length,
      startTime: session.startTime,
      endTime: session.endTime,
      url: session.url,
      hasNonTransitionalEvents,
      hasTransitionalEvents
    };
  } catch (error) {
    console.error(`[Orchestrator] Error extracting features for session ${session?.id || session?.sessionId}:`, error);
    return {
      isValid: false,
      sessionId: session?.id || session?.sessionId || 'unknown',
      error: error.message
    };
  }
}

module.exports = {
  performBasicAnalysis
}; 