/**
 * Stage 2: Behavioral & Psychological Analysis Module
 * 
 * This module uses DeepSeek with thinking capabilities to perform in-depth
 * behavioral analysis, focusing on:
 * 
 * 1. Psychological patterns in user behavior
 * 2. Confusion and hesitation detection
 * 3. Frustration signals analysis
 * 4. Confidence and comfort level assessment
 * 5. Learning curve and adaptation patterns
 */

const { deepseek, createDeepseekClient } = require('../modelManagement/deepseekService');
const { getModelForStage, getOptimizedParameters } = require('../modelManagement/modelSelector');
const { executeWithFallbacks } = require('../modelManagement/fallbackHandler');

// Initialize specialized DeepSeek client for behavioral analysis
const behavioralClient = createDeepseekClient({
  // Using environment variable for API key
});

/**
 * Perform detailed behavioral and psychological analysis
 * @param {Array} sessionFeatures - Extracted features from multiple sessions
 * @param {string} stage1Analysis - Analysis from stage 1
 * @returns {Promise<string>} Detailed behavioral analysis
 */
async function analyzeBehavioralPatterns(sessionFeatures, stage1Analysis) {
  // Extract behavioral data for analysis
  const behavioralData = extractBehavioralData(sessionFeatures);
  
  // Get appropriate model for this stage
  const modelConfig = getModelForStage('STAGE2', behavioralData, true); // true to enable thinking
  
  // Prepare parameters including optimized settings for model
  const modelParams = getOptimizedParameters('STAGE2', modelConfig.model, modelConfig.enableThinking);
  
  // Construct detailed prompt
  const prompt = generateBehavioralPrompt(behavioralData, stage1Analysis, sessionFeatures.length);
  
  try {
    // Execute with fallbacks in case of failure
    const result = await executeWithFallbacks(
      // Execution function
      async (model, params) => {
        // Check if we should use DeepSeek specialized client
        if (model.includes('deepseek') && params.thinking) {
          console.log(`[Stage2] Using DeepSeek client with thinking capability for ${model}`);
          
          const response = await behavioralClient.completion({
            model: model,
            prompt: params.prompt,
            temperature: params.temperature,
            max_tokens: params.max_tokens,
            top_p: params.top_p,
            thinking: true,
            thinkingDepth: 'extensive' // Use deep thinking for behavioral analysis
          });
          
          // Store thinking process for debugging if available
          if (response.choices[0]?.thinking) {
            console.log(`[Stage2] DeepSeek thinking process (excerpt): ${response.choices[0].thinking.substring(0, 200)}...`);
          }
          
          return response.choices[0].text;
        } else {
          // Fallback to standard completion for non-DeepSeek models
          console.log(`[Stage2] Using standard completion for ${model} (thinking capability unavailable)`);
          
          // Add explicit instruction to do behavioral analysis if model doesn't support thinking
          const enhancedPrompt = !params.thinking ? 
            `DETAILED BEHAVIORAL ANALYSIS INSTRUCTIONS: Think deeply about psychological implications in the data before answering.\n\n${params.prompt}` : 
            params.prompt;
          
          return Promise.resolve(dedicatedBehavioralCompletion(model, enhancedPrompt, params));
        }
      },
      // Initial model
      modelConfig.model,
      // Initial parameters
      {
        prompt,
        thinking: modelConfig.enableThinking,
        ...modelParams
      },
      // Options for fallback handling
      {
        provider: 'deepseek',
        stage: 'STAGE2',
        fallbacks: modelConfig.fallbacks
      }
    );
    
    return result;
  } catch (error) {
    console.error(`[Stage2] Error analyzing behavioral patterns: ${error.message}`);
    throw new Error(`Failed to generate behavioral analysis: ${error.message}`);
  }
}

/**
 * Fallback completion function for non-DeepSeek models
 * @param {string} model - Model name
 * @param {string} prompt - Prompt for completion
 * @param {object} params - Model parameters
 * @returns {Promise<string>} Completion result
 */
async function dedicatedBehavioralCompletion(model, prompt, params) {
  // This function would contain model-specific implementations
  // For now, we'll use the DeepSeek client for simplicity
  try {
    const response = await deepseek.completion({
      model: model,
      prompt: prompt,
      temperature: params.temperature,
      max_tokens: params.max_tokens,
      top_p: params.top_p,
    });
    
    return response.choices[0].text;
  } catch (error) {
    console.error(`[Stage2] Error in dedicatedBehavioralCompletion: ${error.message}`);
    throw error;
  }
}

/**
 * Extract behavioral data for analysis
 * @param {Array} sessionFeatures - Extracted features from sessions
 * @returns {Array} Behavioral data for analysis
 */
function extractBehavioralData(sessionFeatures) {
  return sessionFeatures.map((session, index) => ({
    sessionNumber: index + 1,
    sessionId: session.sessionId,
    // Core behavioral indicators
    confusionIndicators: session.behavioral.confusionIndicators || [],
    hesitationPatterns: session.behavioral.hesitationPatterns || [],
    frustrationSignals: session.behavioral.frustrationSignals || [],
    confidenceIndicators: session.behavioral.confidenceIndicators || [],
    learningCurveData: session.behavioral.learningCurveData || [],
    errorPatterns: session.behavioral.errorPatterns || [],
    
    // State interactions for context
    stateInteractions: session.stateDetails.map(state => ({
      stateId: state.stateId,
      url: state.url,
      title: state.title,
      durationInState: state.durationInState,
      events: state.events
    })).slice(0, 20), // Limit to 20 states for context window
    
    // Key metrics relevant to behavioral analysis
    metrics: {
      deadClicks: session.nonTransitionalMetrics?.overall?.totalDeadClicks || 0,
      hoverEvents: session.nonTransitionalMetrics?.overall?.totalHoverEvents || 0,
      hoverTime: session.nonTransitionalMetrics?.overall?.totalHoverTime || 0,
      keystrokes: session.nonTransitionalMetrics?.overall?.totalKeystrokes || 0,
      backspaceCount: session.nonTransitionalMetrics?.overall?.backspaceCount || 0,
      backspaceRate: session.nonTransitionalMetrics?.overall?.totalKeystrokes ?
        session.nonTransitionalMetrics?.overall?.backspaceCount / session.nonTransitionalMetrics?.overall?.totalKeystrokes : 0,
      escapeCount: session.nonTransitionalMetrics?.overall?.escapeCount || 0,
      inactivityPeriods: session.nonTransitionalMetrics?.overall?.totalInactivityPeriods || 0,
      inactivityTime: session.nonTransitionalMetrics?.overall?.totalInactivityTime || 0,
      oscillatingHovers: session.nonTransitionalMetrics?.overall?.totalOscillatingHovers || 0,
      repeatedClicks: session.nonTransitionalMetrics?.overall?.repeatedClicksCount || 0,
      repeatedInputs: session.nonTransitionalMetrics?.overall?.repeatedInputsCount || 0,
    },
    
    // Temporal patterns
    typingSpeedTrend: session.nonTransitionalMetrics?.temporalPatterns?.typingSpeedTrend || [],
    mouseSpeedTrend: session.nonTransitionalMetrics?.temporalPatterns?.mouseSpeedTrend || [],
    inactivityTrend: session.nonTransitionalMetrics?.temporalPatterns?.inactivityTrend || [],
    
    // Examples of raw events for deeper analysis
    exampleDeadClicks: (session.stateDetails
      .flatMap(state => state.nonTransitionalEvents?.events?.deadClicks || [])
      .slice(0, 5)) || [],
    exampleHesitations: (session.behavioral.hesitationPatterns || []).slice(0, 5),
    exampleFrustrations: (session.behavioral.frustrationSignals || []).slice(0, 5),
  }));
}

/**
 * Generate a detailed prompt for behavioral analysis
 * @param {Array} behavioralData - Extracted behavioral data
 * @param {string} stage1Analysis - Analysis from stage 1 (first 500 chars)
 * @param {number} sessionCount - Number of sessions
 * @returns {string} Detailed prompt for analysis
 */
function generateBehavioralPrompt(behavioralData, stage1Analysis, sessionCount) {
  // Create a truncated version of stage 1 analysis
  const truncatedStage1 = stage1Analysis ? 
    `${stage1Analysis.substring(0, 500)}... (truncated)` : 
    "No previous analysis available.";
  
  return `You are an expert user experience researcher specializing in behavioral analysis and cognitive patterns. I need you to perform a comprehensive psychological analysis of user behavior across multiple sessions.

<thinking>
Think extensively about the psychological aspects of this user's behavior:

1. DETAILED CONFUSION ANALYSIS:
   - Examine all dead clicks, oscillating hovers, and long dwell times
   - Consider what specific UI elements caused confusion
   - Analyze the timing patterns of confusion (when in the session they occurred)
   - Look for how confusion patterns changed across sessions
   - Consider what the confusion reveals about the user's mental model

2. HESITATION PATTERNS:
   - Analyze all hover patterns and field idle times
   - Look for correlations between field types and hesitation duration
   - Examine how hesitation changed from early to later sessions
   - Consider what hesitation reveals about user confidence
   - Identify UI elements causing the most significant hesitation

3. FRUSTRATION SIGNALS:
   - Examine repeated clicks, backspace usage, and inactivity periods
   - Look for patterns of escalating frustration
   - Analyze how the user recovered from frustration
   - Consider the relationship between frustration and specific UI elements
   - Identify potential triggers for user frustration

4. LEARNING CURVE ANALYSIS:
   - Examine how interaction patterns evolved across sessions
   - Look for evidence of growing confidence or persistent struggles
   - Analyze how keyboard and mouse usage patterns changed
   - Consider how the user's mental model developed
   - Identify areas where learning occurred most/least effectively

5. ERROR PATTERNS:
   - Analyze backspace usage, form corrections, and validation errors
   - Look for patterns in error occurrence and recovery
   - Consider what errors reveal about the user's understanding
   - Examine how error patterns changed across sessions
   - Identify persistent error types vs. those that were overcome

The goal is to create a deeply insightful psychological profile that reveals not just WHAT the user did, but WHY they behaved that way, and what it reveals about their cognitive processes, mental models, and emotional responses to the interface.
</thinking>

In STAGE 2, provide a detailed psychological and behavioral analysis of how this user interacted with the system across multiple sessions. Be extremely thorough and detailed.

Here's the comprehensive behavioral data:
${JSON.stringify(behavioralData, null, 2)}

STAGE 1 Analysis:
${truncatedStage1}

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

IMPORTANT FORMATTING AND DEPTH REQUIREMENTS:
- Provide multiple detailed paragraphs (3-5) for each section
- Reference established psychological principles and cognitive models when relevant
- Include exact timestamps and detailed event descriptions
- Create narrative explanations that connect behaviors to psychological states
- Include HTML tables to compare behavioral metrics across sessions
- Provide detailed "user journey" sections that trace psychological states chronologically
- Aim for a report that would be at least 2-3 printed pages (deeply detailed)
- Each section should thoroughly explore the topic with multiple detailed examples

Be extremely specific and reference exact events from the data. Your analysis should be deeply insightful and detailed.`;
}

module.exports = {
  analyzeBehavioralPatterns,
  extractBehavioralData
}; 