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
const { processSessionForNonTransitionalEvents } = require('./analysisStages/stage2_nonTransitionalEventProcessor');

// Get the main backend URL from environment or use default
const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:3001';

// Initialize Groq client only if not using Gemini and API key is provided
const groq = (process.env.USE_GEMINI === 'true' || !process.env.GROQ_API_KEY) ? null : new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Google Gemini API settings
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Determine which AI service to use
const USE_GEMINI = process.env.USE_GEMINI === 'true' || !!GEMINI_API_KEY || !process.env.GROQ_API_KEY;

// Basic model selection
function selectModel() {
  if (USE_GEMINI) {
    return process.env.DEFAULT_MODEL || 'gemini-2.0-flash';
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
    
    // Modify prompt to explicitly request verbose output
    truncatedPrompt = truncatedPrompt.replace('You are an Expert User Session Analyst', 
      'You are an Expert User Session Analyst with a focus on EXTREMELY DETAILED and COMPREHENSIVE reporting');
    
    // Add more explicit instructions to the end of the prompt
    truncatedPrompt += `\n\nIMPORTANT FINAL INSTRUCTIONS:
1. Your analysis MUST be extremely detailed and comprehensive - aim for at least 3000 words
2. ALWAYS include multiple paragraphs about each major section
3. Every table provided in the data MUST be thoroughly analyzed with multiple observations
4. ALWAYS include at least 8-10 detailed data tables in your response using proper Markdown formatting
5. Format your analysis with clear headings, subheadings, and bullet points
6. Create summary tables for important metrics even if they weren't in the original data
7. If there are any inconsistencies in the data, trust the URL information in the tables rather than any summary counts
8. For each session, create an ASCII diagram showing the flow between URLs (e.g. index.html → page2.html → page3.html → index.html)
9. Present data visually whenever possible using ASCII charts or structured tables
10. Your final report should be one of the most detailed analyses you can produce
11. Quantity AND quality are both highly valued - a short report will be considered incomplete
12. ENSURE you include detailed analysis of state flags (loading, complete, navigation) in the report
13. THOROUGHLY analyze every URL visited in each session, including the frequency and patterns
14. ALWAYS create flow diagrams showing user navigation patterns between URLs`;

    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          role: 'user',
          parts: [{ text: truncatedPrompt }]
        }],
        generationConfig: {
          temperature: 0.7, // Increased from default to encourage more verbose output
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 8192 // Request more tokens in the response
        }
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 120000 // Increase timeout to 120 seconds (2 minutes) for large requests
      }
    );
    const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("[Gemini] Successfully received response from Gemini.");
    console.log(`[Gemini] Response length: ${content?.length || 0} characters`);
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
      prompt += `  Unique URLs: ${summary.uniqueUrlCount || 'Not recorded'}\n`;
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
        
        // NEW: Add Form Behavior Analysis Table
        if (analysis.htmlTables.formBehaviors) {
          const table = analysis.htmlTables.formBehaviors;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
        
        // NEW: Add Form Sequence Table if available
        if (analysis.htmlTables.formSequence) {
          const table = analysis.htmlTables.formSequence;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
        
        // NEW: Add Network Performance Table
        if (analysis.htmlTables.networkPerformance) {
          const table = analysis.htmlTables.networkPerformance;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
        
        // NEW: Add DOM Fingerprint Table
        if (analysis.htmlTables.domFingerprints) {
          const table = analysis.htmlTables.domFingerprints;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
        
        // NEW: Add State Flag Analysis Table
        if (analysis.htmlTables.stateFlags) {
          const table = analysis.htmlTables.stateFlags;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
        
        // NEW: Add Loading Sequences Table
        if (analysis.htmlTables.loadingSequences && analysis.htmlTables.loadingSequences.rows && analysis.htmlTables.loadingSequences.rows.length > 0) {
          const table = analysis.htmlTables.loadingSequences;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
        
        // NEW: Add Form Transition Analysis Table
        if (analysis.htmlTables.formTransitions && analysis.htmlTables.formTransitions.rows && analysis.htmlTables.formTransitions.rows.length > 0) {
          const table = analysis.htmlTables.formTransitions;
          prompt += `\n#### ${table.title}\n`;
          prompt += `| ${table.headers.join(' | ')} |\n`;
          prompt += `| ${table.headers.map(() => '---').join(' | ')} |\n`;
          table.rows.forEach(row => {
            prompt += `| ${row.join(' | ')} |\n`;
          });
        }
        
        // NEW: Add Form Interaction Timing Table
        if (analysis.htmlTables.formTimings && analysis.htmlTables.formTimings.rows && analysis.htmlTables.formTimings.rows.length > 0) {
          const table = analysis.htmlTables.formTimings;
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

4. Analyzes form interaction behavior:
   - How did users interact with form fields?
   - Were there fields that required multiple corrections?
   - What was the sequence of form field completion?
   - Were there delays between field interactions?
   - IMPORTANT: Use the form transitions and form timings tables to identify correction patterns and struggles

5. Considers network performance impact:
   - Did network conditions correlate with user behavior?
   - Were there performance issues that affected interaction timing?
   - How did page loading times compare across different states?

6. Examines DOM state changes:
   - How did the page state change during user interactions?
   - Were there recurring patterns in DOM fingerprints?
   - What transitions happened within the same URL?

7. NEW: Analyzes state flag transitions for better state change understanding:
   - What percentage of states were loading vs. stable states?
   - How many loading sequences occurred and what was their duration?
   - Did navigation state changes correlate with user activity?
   - What is the relationship between DOM changes and loading states?

8. NEW: Detects form field transition patterns:
   - How did users correct their inputs?
   - What was the timing between field interactions? 
   - Which fields took the longest to complete?
   - Were there fields where users struggled or made repeated changes?
   - Can you identify "thinking time" between key interactions?

9. Provides concrete, data-backed observations about user behavior:
   - Example: "The user spent an average of 45 seconds on the homepage before navigating to other pages via user interactions."
   - Example: "The user showed a navigation loop pattern, returning to the homepage 5 times during the session."
   - Example: "The user made 3 corrections to the email field, suggesting possible confusion or validation issues."
   - Example: "The loading sequences averaged 2.5 seconds, with network conditions impacting page transitions."
   - Example: "Form completion showed a pattern of quick initial entries followed by multiple corrections on validation fields."

Your report should read like a professional data analyst's findings about user behavior - factual, detailed, and based entirely on the data provided. Focus especially on the transitions between states and what they reveal about user patterns.
`;

  return prompt;
}

/**
 * Perform a basic analysis of user sessions (Stage 1 only)
 * @param {string} userId - User ID to analyze sessions for
 * @returns {Promise<object>} Basic analysis results
 */
async function performBasicAnalysis(userId) {
  console.log(`[Orchestrator] Starting basic analysis (Stage 1) for userId: ${userId}`);
  try {
    // Step 1: Fetch and prepare raw session data
    console.log(`[Orchestrator] STEP 1: Fetching and preparing raw session data for ${userId}`);
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
    console.log(`[Orchestrator] Session data size: ${JSON.stringify(sessionData).length} characters`);

    // Step 2: Perform Stage 1 Detailed Event Processing
    console.log(`[Orchestrator] STEP 2: Beginning Stage 1 Detailed Event Processing`);
    const processedSessions = [];
    let sessionCounter = 0;
    for (const session of sessionData.enrichedSessions) {
      sessionCounter++;
      console.log(`[Orchestrator] Processing session ${sessionCounter}/${sessionData.enrichedSessions.length}`);
      const processedSession = await processSessionForDetailedEvents(session);
      // Mark that stage 1 processing is complete
      processedSession.analysisStagesCompleted = ['Stage1_DetailedEventProcessor'];
      processedSessions.push(processedSession);
      console.log(`[Orchestrator] Completed processing session ${sessionCounter}`);
    }
    
    // Update sessionData to use the sessions processed by Stage 1
    sessionData.enrichedSessions = processedSessions;
    console.log(`[Orchestrator] Completed Stage 1 Detailed Event Processing for ${processedSessions.length} sessions.`);
    console.log(`[Orchestrator] Processed session data size: ${JSON.stringify(sessionData).length} characters`);

    // Step 3: Generate a summary prompt with the enhanced session analysis data
    console.log(`[Orchestrator] STEP 3: Generating summary prompt and requesting AI analysis`);
    const summaryPrompt = generateSummaryPrompt(sessionData);
    console.log(`[Orchestrator] Summary prompt generated with ${summaryPrompt.length} characters`);
    
    const model = selectModel();
    console.log(`[Orchestrator] Selected model: ${model}`);
    
    console.log(`[Orchestrator] Sending request to AI model...`);
    const analysisResult = await executeModelRequest(summaryPrompt, model);
    console.log(`[Orchestrator] AI analysis complete. Response length: ${analysisResult.length} characters`);
      
    // Extract HTML table structures from the processed sessions for direct client-side rendering
    const htmlTables = processedSessions.map(session => session.sessionAnalysis?.htmlTables || {});
    console.log(`[Orchestrator] Extracted ${Object.keys(htmlTables).length} HTML tables from processed sessions`);
      
    return {
      success: true,
      report: analysisResult,
      reportLength: analysisResult.length,
      userId,
      sessionCount: sessionData.sessionCount,
      analysisStagesCompleted: ['Stage1_DetailedEventProcessor'],
      htmlTables: htmlTables, // Include HTML table structures for client-side rendering
      sessionAnalysisSummary: processedSessions.map(session => ({
        sessionId: session.id || session.sessionId,
        summary: session.sessionAnalysis?.summary || {}
      }))
    };
  } catch (error) {
    console.error(`[Orchestrator] Error in analysis pipeline: ${error.message}`);
    console.error(`[Orchestrator] Error stack: ${error.stack}`);
    return {
      success: false,
      message: `Error performing analysis: ${error.message}`,
      userId,
      error: error.message
    };
  }
}

/**
 * Perform Stage 2 non-transitional event analysis for a user
 * @param {string} userId - User ID to analyze sessions for
 * @returns {Promise<object>} Stage 2 analysis results
 */
async function performStage2Analysis(userId) {
  console.log(`[Orchestrator] Starting Stage 2 analysis for userId: ${userId}`);
  try {
    // Step 1: Fetch and prepare raw session data again (as Stage 2 is called separately)
    console.log(`[Orchestrator] STEP 1: Fetching and preparing raw session data for ${userId}`);
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

    // Step 2: Perform Stage 2 Non-Transitional Event Processing
    console.log(`[Orchestrator] STEP 2: Beginning Stage 2 Non-Transitional Event Processing`);
    const stage2ProcessedSessions = [];
    let stage2SessionCounter = 0;
    
    for (const session of sessionData.enrichedSessions) {
      stage2SessionCounter++;
      console.log(`[Orchestrator] Stage 2 processing session ${stage2SessionCounter}/${sessionData.enrichedSessions.length}`);
      try {
        const stage2Session = await processSessionForNonTransitionalEvents(session);
        // Mark Stage 2 as completed in the session
        stage2Session.analysisStagesCompleted = ['Stage2_NonTransitionalEventProcessor'];
        stage2ProcessedSessions.push(stage2Session);
        console.log(`[Orchestrator] Completed Stage 2 processing for session ${stage2SessionCounter}`);
      } catch (error) {
        console.error(`[Orchestrator] Error during Stage 2 processing of session ${stage2SessionCounter}:`, error);
        // Add the original session with error flag
        session.analysisStagesCompleted = [];
        session.stageResults = {
          stage2: {
            completed: false,
            error: error.message
          }
        };
        stage2ProcessedSessions.push(session);
        console.log(`[Orchestrator] Skipping Stage 2 for session ${stage2SessionCounter} due to error`);
      }
    }
    
    // Update sessionData with Stage 2 processed sessions
    sessionData.enrichedSessions = stage2ProcessedSessions;
    console.log(`[Orchestrator] Completed Stage 2 processing for ${stage2ProcessedSessions.length} sessions.`);
    
    // Step 3: Generate a Stage 2 summary prompt
    console.log(`[Orchestrator] STEP 3: Generating Stage 2 summary prompt and requesting AI analysis`);
    const stage2SummaryPrompt = generateStage2SummaryPrompt(sessionData);
    console.log(`[Orchestrator] Stage 2 summary prompt generated with ${stage2SummaryPrompt.length} characters`);
    
    const model = selectModel();
    console.log(`[Orchestrator] Selected model for Stage 2: ${model}`);
    
    console.log(`[Orchestrator] Sending Stage 2 request to AI model...`);
    const stage2AnalysisResult = await executeModelRequest(stage2SummaryPrompt, model);
    console.log(`[Orchestrator] Stage 2 AI analysis complete. Response length: ${stage2AnalysisResult.length} characters`);
    
    return {
      success: true,
      report: stage2AnalysisResult,
      reportLength: stage2AnalysisResult.length,
      userId,
      sessionCount: sessionData.sessionCount,
      analysisStagesCompleted: ['Stage2_NonTransitionalEventProcessor'],
      nonTransitionalData: stage2ProcessedSessions.map(session => ({
        sessionId: session.id || session.sessionId,
        nonTransitionalAnalysis: session.nonTransitionalAnalysis || {}
      }))
    };
  } catch (error) {
    console.error(`[Orchestrator] Error in Stage 2 analysis pipeline: ${error.message}`);
    console.error(`[Orchestrator] Error stack: ${error.stack}`);
    return {
      success: false,
      message: `Error performing Stage 2 analysis: ${error.message}`,
      userId,
      error: error.message
    };
  }
}

/**
 * Generate a Stage 2 summary prompt focused on non-transitional events
 * @param {Object} sessionData - Prepared session data with Stage 2 analysis
 * @returns {string} Summary prompt for the model
 */
function generateStage2SummaryPrompt(sessionData) {
  let prompt = `You are an Expert User Behavior Analyst specializing in non-transitional events. Your task is to analyze the user's behavior BETWEEN page navigations and state changes, focusing on mouse movements, keyboard input, idle time, clicking behavior, and scrolling patterns.

IMPORTANT GUIDELINES:
1. Focus ONLY on micro-behaviors that occur between page transitions
2. Analyze patterns in mouse movements, hovering, clicking, keyboard usage, and scrolling
3. Identify signs of hesitation, frustration, confusion or engagement
4. Generate your report with Markdown formatting including tables and bullet points
5. Structure your analysis as a behavioral scientist would - focusing on what these behaviors reveal about the user's experience

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
    prompt += `  States: ${session.states?.length || 0}\n`;
    
    // Add Stage 2 specific summary if available
    if (session.nonTransitionalAnalysis?.summary) {
      const summary = session.nonTransitionalAnalysis.summary;
      prompt += `  Non-Transitional Events: ${summary.totalEvents || 'Not recorded'}\n`;
      if (summary.pointerEvents) {
        prompt += `  Mouse Events: ${summary.pointerEvents}\n`;
      }
      if (summary.keyboardEvents) {
        prompt += `  Keyboard Events: ${summary.keyboardEvents}\n`;
      }
    }
    prompt += `\n`;
  });

  // Process selected sessions in detail
  sessionsToProcess.forEach((session, sessionIndex) => {
    prompt += `\n## Detailed Analysis: Session ${sessionIndex + 1} (ID: ${session.id || session.sessionId})\n`;
    
    // Add non-transitional analysis if available
    if (session.nonTransitionalAnalysis) {
      const analysis = session.nonTransitionalAnalysis;
      
      // Add summary data
      if (analysis.summary) {
        const summary = analysis.summary;
        prompt += `\n### Non-Transitional Event Summary\n`;
        
        if (summary.totalEvents) {
          prompt += `- Total Events: ${summary.totalEvents}\n`;
        }
        
        if (summary.pointerEvents) {
          prompt += `- Mouse Events: ${summary.pointerEvents}\n`;
          prompt += `  - Total Distance: ${summary.totalMouseDistance || 0} pixels\n`;
          prompt += `  - Hovers: ${summary.hoverCount || 0}\n`;
        }
        
        if (summary.keyboardEvents) {
          prompt += `- Keyboard Events: ${summary.keyboardEvents}\n`;
          prompt += `  - Escape/Backspace: ${summary.escapeBackspaceCount || 0}\n`;
        }
        
        if (summary.idleEvents) {
          prompt += `- Idle/Hesitation Events: ${summary.idleEvents}\n`;
          prompt += `  - Total Inactive Time: ${summary.totalInactiveTime || 0}ms\n`;
        }
        
        if (summary.clickEvents) {
          prompt += `- Click Events: ${summary.clickEvents}\n`;
          prompt += `  - Dead Clicks: ${summary.deadClickCount || 0}\n`;
          prompt += `  - Repeated Clicks: ${summary.repeatedClickCount || 0}\n`;
        }
        
        if (summary.scrollEvents) {
          prompt += `- Scroll Events: ${summary.scrollEvents}\n`;
          prompt += `  - Total Scroll Distance: ${summary.totalScrollDistance || 0}\n`;
        }
      }
      
      // Add pointer behavior analysis
      if (analysis.pointerAnalysis) {
        prompt += `\n### Mouse Movement Analysis\n`;
        
        // Mouse movement summary
        if (analysis.pointerAnalysis.mousemoveSummary) {
          const mousemove = analysis.pointerAnalysis.mousemoveSummary;
          prompt += `- Total Mouse Distance: ${mousemove.totalDistance || 0} pixels\n`;
          prompt += `- Average Speed: ${mousemove.averageSpeed || 0} pixels/sec\n`;
        }
        
        // Hover summary
        if (analysis.pointerAnalysis.hoverSummary) {
          const hover = analysis.pointerAnalysis.hoverSummary;
          prompt += `\n#### Hover Analysis\n`;
          prompt += `- Total Hovers: ${hover.totalHovers || 0}\n`;
          prompt += `- Average Hover Duration: ${hover.averageHoverDuration?.toFixed(2) || 0}ms\n`;
          
          // Add top hover targets if available
          if (hover.topHoverTargets && hover.topHoverTargets.length > 0) {
            prompt += `\n##### Top Hover Targets\n`;
            prompt += `| Element | Count | Avg Duration (ms) |\n`;
            prompt += `| --- | --- | --- |\n`;
            
            hover.topHoverTargets.slice(0, 5).forEach(target => {
              prompt += `| ${target.name || target.selector || 'Unknown'} | ${target.count} | ${target.averageDuration?.toFixed(2) || 0} |\n`;
            });
          }
        }
        
        // Oscillating hover analysis
        if (analysis.pointerAnalysis.oscillatingSummary && analysis.pointerAnalysis.oscillatingSummary.totalOscillations > 0) {
          const oscillating = analysis.pointerAnalysis.oscillatingSummary;
          prompt += `\n#### Oscillating Hover Patterns\n`;
          prompt += `- Total Oscillations: ${oscillating.totalOscillations}\n`;
          prompt += `- Average Switches: ${oscillating.averageSwitches?.toFixed(2) || 0}\n`;
          
          // Add oscillating pattern details
          if (oscillating.patternDetails && oscillating.patternDetails.length > 0) {
            prompt += `\n##### Significant Oscillation Patterns\n`;
            
            oscillating.patternDetails.slice(0, 3).forEach((pattern, idx) => {
              prompt += `${idx + 1}. Between elements: ${pattern.elements?.join(' and ') || 'Unknown'}\n`;
              prompt += `   - Total Switches: ${pattern.totalSwitches}\n`;
              prompt += `   - Duration: ${pattern.duration}ms\n`;
            });
          }
        }
      }
      
      // Add click analysis
      if (analysis.clickAnalysis) {
        prompt += `\n### Click Behavior Analysis\n`;
        
        // Dead click analysis
        if (analysis.clickAnalysis.deadClickSummary) {
          const deadClicks = analysis.clickAnalysis.deadClickSummary;
          prompt += `\n#### Dead Click Analysis\n`;
          prompt += `- Total Dead Clicks: ${deadClicks.totalDeadClicks || 0}\n`;
          
          // Add top dead click targets
          if (deadClicks.topDeadClickTargets && deadClicks.topDeadClickTargets.length > 0) {
            prompt += `\n##### Top Dead Click Targets\n`;
            prompt += `| Element | Tag | Count |\n`;
            prompt += `| --- | --- | --- |\n`;
            
            deadClicks.topDeadClickTargets.forEach(target => {
              prompt += `| ${target.friendlyName || target.path || 'Unknown'} | ${target.tag || 'Unknown'} | ${target.count} |\n`;
            });
          }
        }
        
        // Repeated click analysis
        if (analysis.clickAnalysis.repeatedClickSummary) {
          const repeatedClicks = analysis.clickAnalysis.repeatedClickSummary;
          prompt += `\n#### Repeated Click Analysis\n`;
          prompt += `- Total Repeated Click Bursts: ${repeatedClicks.totalRepeatedClickBursts || 0}\n`;
          prompt += `- Total Individual Repeated Clicks: ${repeatedClicks.totalIndividualRepeatedClicks || 0}\n`;
          
          // Add top repeated click targets
          if (repeatedClicks.topRepeatedClickTargets && repeatedClicks.topRepeatedClickTargets.length > 0) {
            prompt += `\n##### Top Repeated Click Targets\n`;
            prompt += `| Element | Burst Count | Total Clicks | Max in Burst |\n`;
            prompt += `| --- | --- | --- | --- |\n`;
            
            repeatedClicks.topRepeatedClickTargets.forEach(target => {
              prompt += `| ${target.selector || 'Unknown'} | ${target.burstCount} | ${target.totalClicks} | ${target.maxClicksInBurst} |\n`;
            });
          }
        }
      }
      
      // Add keyboard analysis
      if (analysis.keyboardAnalysis) {
        prompt += `\n### Keyboard Behavior Analysis\n`;
        
        // Key press summary
        if (analysis.keyboardAnalysis.keyPressSummary) {
          const keyPress = analysis.keyboardAnalysis.keyPressSummary;
          prompt += `- Total Key Presses: ${keyPress.totalKeyPresses || 0}\n`;
          
          // Add key type distribution
          if (keyPress.keysByType) {
            prompt += `\n#### Key Type Distribution\n`;
            prompt += `| Key Type | Count |\n`;
            prompt += `| --- | --- |\n`;
            
            Object.entries(keyPress.keysByType).forEach(([type, count]) => {
              prompt += `| ${type} | ${count} |\n`;
            });
          }
        }
        
        // Typing cadence
        if (analysis.keyboardAnalysis.typingCadenceSummary) {
          const cadence = analysis.keyboardAnalysis.typingCadenceSummary;
          prompt += `\n#### Typing Cadence Analysis\n`;
          prompt += `- Average Cadence: ${cadence.averageCadenceMs?.toFixed(2) || 0}ms\n`;
          prompt += `- Fastest Cadence: ${cadence.fastestCadenceMs || 0}ms\n`;
          prompt += `- Slowest Cadence: ${cadence.slowestCadenceMs || 0}ms\n`;
          
          // Add cadence distribution
          if (cadence.cadenceDistribution) {
            prompt += `\n##### Cadence Distribution\n`;
            prompt += `| Speed | Count |\n`;
            prompt += `| --- | --- |\n`;
            
            const dist = cadence.cadenceDistribution;
            prompt += `| Very Fast (≤50ms) | ${dist.veryFast || 0} |\n`;
            prompt += `| Fast (51-100ms) | ${dist.fast || 0} |\n`;
            prompt += `| Normal (101-250ms) | ${dist.normal || 0} |\n`;
            prompt += `| Thoughtful (251-500ms) | ${dist.thoughtful || 0} |\n`;
            prompt += `| Slow (501-1000ms) | ${dist.slow || 0} |\n`;
            prompt += `| Very Slow (>1000ms) | ${dist.verySlow || 0} |\n`;
          }
        }
        
        // Escape/backspace usage
        if (analysis.keyboardAnalysis.escapeBackspaceSummary) {
          const escBack = analysis.keyboardAnalysis.escapeBackspaceSummary;
          prompt += `\n#### Escape/Backspace Usage\n`;
          prompt += `- Total Escapes: ${escBack.totalEscapes || 0}\n`;
          prompt += `- Total Backspaces: ${escBack.totalBackspaces || 0}\n`;
          prompt += `- Consecutive Backspaces (3+ in a row): ${escBack.backspacesConsecutive || 0}\n`;
        }
      }
      
      // Add idle time analysis
      if (analysis.idleAnalysis) {
        prompt += `\n### User Idle/Hesitation Analysis\n`;
        
        // Inactivity summary
        if (analysis.idleAnalysis.inactivitySummary) {
          const idle = analysis.idleAnalysis.inactivitySummary;
          prompt += `- Total Inactivity Time: ${(idle.totalInactivityTime / 1000).toFixed(2) || 0}s\n`;
          prompt += `- Inactivity Events: ${idle.inactivityCount || 0}\n`;
          prompt += `- Average Inactivity Duration: ${(idle.averageInactivityDuration / 1000).toFixed(2) || 0}s\n`;
          
          // Add inactivity distribution
          if (idle.inactivityDistribution) {
            prompt += `\n#### Inactivity Distribution\n`;
            prompt += `| Type | Count |\n`;
            prompt += `| --- | --- |\n`;
            
            const dist = idle.inactivityDistribution;
            prompt += `| Micro Pauses (2-5s) | ${dist.microPauses || 0} |\n`;
            prompt += `| Short Pauses (5-15s) | ${dist.shortPauses || 0} |\n`;
            prompt += `| Medium Pauses (15-30s) | ${dist.mediumPauses || 0} |\n`;
            prompt += `| Long Pauses (>30s) | ${dist.longPauses || 0} |\n`;
          }
        }
        
        // Field specific idle analysis
        if (analysis.idleAnalysis.fieldIdleSummary) {
          const fieldIdle = analysis.idleAnalysis.fieldIdleSummary;
          prompt += `\n#### Field Hesitation Analysis\n`;
          prompt += `- Total Field Idle Events: ${fieldIdle.totalFieldIdleEvents || 0}\n`;
          prompt += `- Idle Threshold Reached: ${fieldIdle.thresholdReachedCount || 0}\n`;
          prompt += `- Blur After Idle: ${fieldIdle.blurAfterIdleCount || 0}\n`;
          
          // Add problematic fields
          if (fieldIdle.problematicFields && fieldIdle.problematicFields.length > 0) {
            prompt += `\n##### Fields with High Hesitation\n`;
            prompt += `| Field | Idle Count | Unchanged Rate | Avg Duration (s) |\n`;
            prompt += `| --- | --- | --- | --- |\n`;
            
            fieldIdle.problematicFields.forEach(field => {
              prompt += `| ${field.fieldName || field.field || 'Unknown'} | ${field.idleCount} | ${(field.unchangedRatio * 100).toFixed(1)}% | ${(field.averageDuration / 1000).toFixed(2)} |\n`;
            });
          }
        }
      }
      
      // Add scroll analysis
      if (analysis.scrollAnalysis) {
        prompt += `\n### Scroll Behavior Analysis\n`;
        
        // Scroll summary
        if (analysis.scrollAnalysis.scrollSummary) {
          const scroll = analysis.scrollAnalysis.scrollSummary;
          prompt += `- Total Scroll Events: ${scroll.totalScrollEvents || 0}\n`;
          prompt += `- Total Scroll Distance: ${scroll.totalScrollDistance || 0}\n`;
          prompt += `- Maximum Scroll Depth: ${scroll.maxScrollDepth || 0} pixels\n`;
          prompt += `- Average Scroll Distance: ${scroll.averageScrollDistance?.toFixed(2) || 0}\n`;
          prompt += `- Dominant Scroll Pattern: ${scroll.dominantScrollPattern?.replace(/_/g, ' ') || 'Unknown'}\n`;
          
          // Add directional breakdown
          if (scroll.scrollsByDirection) {
            prompt += `\n#### Scroll Direction Distribution\n`;
            prompt += `| Direction | Count |\n`;
            prompt += `| --- | --- |\n`;
            
            Object.entries(scroll.scrollsByDirection).forEach(([direction, count]) => {
              prompt += `| ${direction.charAt(0).toUpperCase() + direction.slice(1)} | ${count} |\n`;
            });
          }
          
          // Add engagement metrics
          if (typeof scroll.estimatedContentEngagement === 'number') {
            prompt += `\n- Estimated Content Engagement: ${(scroll.estimatedContentEngagement * 100).toFixed(1)}%\n`;
            prompt += `- Rapid Scrolls: ${scroll.rapidScrollCount || 0}\n`;
            prompt += `- Small Adjustments: ${scroll.smallAdjustmentCount || 0}\n`;
          }
        }
      }
    }
  });

  // Analysis requirements
  prompt += `\n## Analysis Requirements

Based on the non-transitional event data provided above, create a comprehensive analysis report that:

1. Focuses EXCLUSIVELY on micro-behaviors that occur BETWEEN page transitions
   - Mouse movements, hovering, clicking
   - Keyboard patterns and timing
   - Idle/hesitation periods
   - Scrolling behavior

2. Identifies behavioral patterns that may indicate:
   - Hesitation or confusion (e.g. oscillating hovers, repeated clicks, excessive backspaces)
   - Frustration (e.g. dead clicks, rapid click bursts, escape key usage)
   - Engagement (e.g. careful scrolling, consistent mouse movements)
   - Disengagement (e.g. long idle periods, rapid skimming behavior)

3. Correlates these micro-behaviors with specific UI elements or form fields:
   - Which elements received the most hover attention?
   - Where did the user experience the most dead clicks?
   - Which form fields caused the most hesitation?
   - How did the user's scrolling behavior change across the session?

4. Provides evidence-based behavioral insights:
   - Example: "The user demonstrated hesitation in the email field with 5 seconds of idle time followed by multiple backspaces, suggesting potential uncertainty."
   - Example: "Oscillating hover behavior between the submit button and form fields indicates decision uncertainty."
   - Example: "Rapid scrolling followed by careful small adjustments suggests the user was searching for specific information."
   - Example: "Multiple dead clicks on the header image suggests the user expected it to be interactive."

Your report should read like a behavioral scientist's analysis - focusing on what these micro-behaviors reveal about the user's experience, attention, and potential confusion points.
`;

  return prompt;
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

// Export the analysis functions
module.exports = {
  performBasicAnalysis,
  performStage2Analysis,
  fetchAndPrepareSessionData,
  executeModelRequest,
  extractSessionFeatures
};