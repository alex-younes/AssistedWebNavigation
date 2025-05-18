/**
 * Stage 1: Metrics & Navigation Analysis Module
 * 
 * This module handles the first stage of analysis, focusing on:
 * 1. Basic session metrics
 * 2. Navigation patterns
 * 3. User engagement metrics
 * 4. Comparative metrics across sessions
 */

const Groq = require('groq-sdk');
const { getModelForStage, getOptimizedParameters } = require('../modelManagement/modelSelector');
const { executeWithFallbacks } = require('../modelManagement/fallbackHandler');
const { wrapClientWithRateLimiting } = require('../modelManagement/rateLimiter');

// Initialize the Groq client with rate limiting
const groq = wrapClientWithRateLimiting(new Groq({
  apiKey: process.env.GROQ_API_KEY,
}), 'groq');

/**
 * Generate detailed session metrics analysis
 * @param {Array} sessionFeatures - Extracted features from multiple sessions
 * @returns {Promise<string>} Detailed metrics analysis
 */
async function analyzeSessionMetrics(sessionFeatures) {
  // Extract metrics for analysis
  const sessionMetricsData = extractMetricsData(sessionFeatures);
  
  // Get appropriate model for this stage
  const modelConfig = getModelForStage('STAGE1', sessionMetricsData);
  
  // Prepare parameters including optimized settings for model
  const modelParams = getOptimizedParameters('STAGE1', modelConfig.model);
  
  // Construct detailed prompt
  const prompt = generateMetricsPrompt(sessionMetricsData, sessionFeatures.length);
  
  try {
    // Execute with fallbacks in case of failure
    const result = await executeWithFallbacks(
      // Execution function
      async (model, params) => {
        const response = await groq.chat.completions.create({
          model: model,
          messages: [{ role: "user", content: params.prompt }],
          temperature: params.temperature,
          max_tokens: params.max_tokens,
          top_p: params.top_p,
          stream: false
        });
        
        return response.choices[0]?.message?.content || '';
      },
      // Initial model
      modelConfig.model,
      // Initial parameters
      {
        prompt: prompt,
        ...modelParams
      },
      // Options for fallback handling
      {
        provider: 'groq',
        stage: 'STAGE1',
        fallbacks: modelConfig.fallbacks
      }
    );
    
    return result;
  } catch (error) {
    console.error(`[Stage1] Error analyzing session metrics: ${error.message}`);
    throw new Error(`Failed to generate metrics analysis: ${error.message}`);
  }
}

/**
 * Extract relevant metrics data from session features
 * @param {Array} sessionFeatures - Extracted features from sessions
 * @returns {Array} Metrics data for analysis
 */
function extractMetricsData(sessionFeatures) {
  return sessionFeatures.map((session, index) => ({
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
    navigationPatterns: session.stateTransitions?.slice(0, 15).map(t => ({
      from: t.fromTitle || t.fromUrl,
      to: t.toTitle || t.toUrl,
      transitionType: t.transitionType,
      trigger: t.trigger
    })),
    // Include detailed metrics
    metrics: {
      keyboard: {
        totalKeystrokes: session.nonTransitionalMetrics?.overall?.totalKeystrokes || 0,
        backspaceCount: session.nonTransitionalMetrics?.overall?.backspaceCount || 0,
        typingSpeed: session.nonTransitionalMetrics?.overall?.averageTypingSpeed || 0,
      },
      mouse: {
        totalHoverEvents: session.nonTransitionalMetrics?.overall?.totalHoverEvents || 0,
        totalHoverTime: session.nonTransitionalMetrics?.overall?.totalHoverTime || 0,
        totalDeadClicks: session.nonTransitionalMetrics?.overall?.totalDeadClicks || 0,
        totalScrollEvents: session.nonTransitionalMetrics?.overall?.totalScrollEvents || 0,
        totalMouseDistance: session.nonTransitionalMetrics?.overall?.totalMouseDistance || 0,
      },
      attention: {
        totalInactivityPeriods: session.nonTransitionalMetrics?.overall?.totalInactivityPeriods || 0,
        totalInactivityTime: session.nonTransitionalMetrics?.overall?.totalInactivityTime || 0,
        longestInactivityDuration: session.nonTransitionalMetrics?.overall?.longestInactivityDuration || 0,
      },
      form: {
        formCompletionRate: session.nonTransitionalMetrics?.overall?.formCompletionRate || 0,
        fieldCount: Object.keys(session.nonTransitionalMetrics?.overall?.formFieldInteractions || {}).length,
      }
    }
  }));
}

/**
 * Generate a detailed prompt for metrics analysis
 * @param {Array} sessionMetricsData - Extracted metrics data
 * @param {number} sessionCount - Number of sessions
 * @returns {string} Detailed prompt for analysis
 */
function generateMetricsPrompt(sessionMetricsData, sessionCount) {
  return `You are an expert user behavior analyst with deep expertise in UI/UX research and digital ethnography. I need a detailed analysis of how this user's behavior evolved across multiple sessions.

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
- Navigation flow descriptions with timestamps
- Specific percentages for all improvements or regressions
- Thorough analysis of duration, states, and interactions across sessions
- Identification of specific pages or features that received consistent attention

Format your response as a structured analysis with these specific sections:
1. "Session Metrics Overview" - Detailed data tables and analysis
2. "Navigation Patterns Analysis" - How the user moved through the application in each session
3. "Engagement Evolution" - How time spent and interaction patterns changed
4. "Key Findings from Metrics" - The most important insights from this data

IMPORTANT FORMATTING AND DEPTH REQUIREMENTS:
- Provide comprehensive HTML tables for all comparative metrics
- Create multiple paragraphs (at least 2-3) for each section
- Write detailed explanations, not just bullet points
- Include exact timestamps and percentages whenever possible
- Structure information in a narrative style suitable for a professional report
- Aim for a report that would be at least 1-2 printed pages (detailed, not summarized)
- Back every insight with specific data points
- Each section should thoroughly explore the topic, not just briefly mention it

Be extremely specific with exact numbers, percentages, and specific examples from the data.
Your entire analysis should be data-driven, comprehensive, and professional.`;
}

module.exports = {
  analyzeSessionMetrics,
  extractMetricsData
}; 