/**
 * Fallback Handler Module - Sophisticated fallback handling for LLM requests
 * 
 * This module provides advanced functionality for handling API failures:
 * 1. Cascading fallbacks through model tiers
 * 2. Smart retry logic with exponential backoff
 * 3. Graceful degradation of analysis quality
 * 4. Parameter tuning based on failure type
 */

const { getModelForStage, FALLBACK_CASCADES } = require('./modelSelector');
const { recordFailedRequest } = require('./rateLimiter');

// Maximum retry attempts before giving up
const MAX_RETRIES = 5;

// Delay between retries (ms) with exponential backoff
const BASE_RETRY_DELAY = 1000;

/**
 * Execute an LLM request with smart fallback and retry logic
 * @param {Function} executeRequest - Function to execute the request
 * @param {string} modelName - Name of the model to use
 * @param {object} requestParams - Parameters for the request
 * @param {object} options - Options for fallback handling
 * @returns {Promise<object>} Response from successful request
 */
async function executeWithFallbacks(executeRequest, modelName, requestParams, options = {}) {
  const {
    provider = 'groq',
    stage = 'UNKNOWN',
    maxRetries = MAX_RETRIES,
    fallbacks = FALLBACK_CASCADES[modelName] || [],
    adjustParamsForFallback = true
  } = options;
  
  let currentModel = modelName;
  let currentParams = { ...requestParams };
  let attemptsRemaining = maxRetries;
  let lastError = null;
  let usedFallbacks = [];
  
  // Try the primary model and fallbacks as needed
  while (attemptsRemaining > 0) {
    try {
      console.log(`[FallbackHandler] Attempting request with model: ${currentModel} (${attemptsRemaining} attempts remaining)`);
      
      // Execute the request with current model and parameters
      const result = await executeRequest(currentModel, currentParams);
      
      // If we used fallbacks, log the information
      if (usedFallbacks.length > 0) {
        console.log(`[FallbackHandler] Successfully completed request with fallback model: ${currentModel} after trying: ${usedFallbacks.join(', ')}`);
        
        // Add information about fallback to result metadata
        return {
          ...result,
          _meta: {
            ...(result._meta || {}),
            usedFallbacks,
            originalModel: modelName,
            finalModel: currentModel
          }
        };
      }
      
      return result;
    } catch (error) {
      lastError = error;
      attemptsRemaining--;
      
      // Record the failure for rate limiting
      recordFailedRequest(provider, error);
      
      // Log the error
      console.error(`[FallbackHandler] Error with model ${currentModel}: ${error.message}`);
      
      // Determine if we should retry with the same model or move to a fallback
      const isRateLimit = error.message?.includes('rate limit') || 
                         error.message?.includes('too many requests') ||
                         error.status === 429;
      
      const isModelUnavailable = error.message?.includes('model not found') ||
                                error.message?.includes('unavailable') ||
                                error.message?.includes('unauthorized');
      
      // If it's a rate limit error or we've tried this model twice, move to fallback
      if (isRateLimit || isModelUnavailable || usedFallbacks.length < fallbacks.length && attemptsRemaining < maxRetries - 1) {
        usedFallbacks.push(currentModel);
        
        // Select next fallback model
        if (fallbacks.length > 0) {
          currentModel = fallbacks.shift();
          
          // Adjust parameters for the fallback model if needed
          if (adjustParamsForFallback) {
            currentParams = adjustParametersForFallback(currentParams, currentModel, stage);
          }
          
          console.log(`[FallbackHandler] Switching to fallback model: ${currentModel}`);
          
          // Don't wait for the first fallback attempt
          continue;
        }
      }
      
      // Calculate delay with exponential backoff
      const retryDelay = calculateBackoffDelay(maxRetries - attemptsRemaining);
      
      if (attemptsRemaining > 0) {
        console.log(`[FallbackHandler] Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }
  
  // If we've exhausted all retries and fallbacks, throw the last error
  throw new Error(`Failed after ${MAX_RETRIES} attempts with all fallbacks: ${lastError.message}`);
}

/**
 * Calculate delay for exponential backoff
 * @param {number} attempt - Current attempt number (0-based)
 * @returns {number} Delay in milliseconds
 */
function calculateBackoffDelay(attempt) {
  // Exponential backoff with jitter
  const exponentialDelay = BASE_RETRY_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
  return Math.min(30000, exponentialDelay + jitter); // Cap at 30 seconds
}

/**
 * Adjust request parameters for a fallback model
 * @param {object} params - Original request parameters
 * @param {string} fallbackModel - Fallback model name
 * @param {string} stage - Analysis stage
 * @returns {object} Adjusted parameters
 */
function adjustParametersForFallback(params, fallbackModel, stage) {
  const adjustedParams = { ...params };
  
  // Adjust parameters based on model capabilities
  if (fallbackModel.includes('8b') || fallbackModel.includes('7b')) {
    // Smaller models - adjust for capabilities
    adjustedParams.temperature = Math.min(0.7, (params.temperature || 0.7) + 0.1);
    adjustedParams.max_tokens = Math.min(params.max_tokens || 4000, 2000);
    
    // Add guidance for smaller models to compensate
    if (stage === 'STAGE2' && !adjustedParams.prompt.includes('psychological analysis instructions')) {
      adjustedParams.prompt = addCompensationGuidance(adjustedParams.prompt, 'behavioral', fallbackModel);
    } else if (stage === 'FINAL' && !adjustedParams.prompt.includes('synthesis instructions')) {
      adjustedParams.prompt = addCompensationGuidance(adjustedParams.prompt, 'synthesis', fallbackModel);
    }
  } else if (fallbackModel.includes('32b') || fallbackModel.includes('70b')) {
    // Larger models - can handle more complex tasks
    adjustedParams.temperature = Math.max(0.3, (params.temperature || 0.7) - 0.1);
  }
  
  return adjustedParams;
}

/**
 * Add compensatory guidance to prompts for weaker models
 * @param {string} prompt - Original prompt
 * @param {string} analysisType - Type of analysis
 * @param {string} model - Model name
 * @returns {string} Enhanced prompt
 */
function addCompensationGuidance(prompt, analysisType, model) {
  let guidance = '';
  
  if (analysisType === 'behavioral') {
    guidance = `\n\nIMPORTANT GUIDANCE FOR ${model.toUpperCase()}:
1. Break down psychological analysis into clearly defined steps
2. Explicitly tie metrics to user intent and psychological states
3. Provide detailed paragraphs for each psychological insight
4. Include 3-5 sentences for each behavioral pattern identified
5. Connect user actions to established cognitive science principles
6. Make conclusions specific and data-driven, avoiding vague statements\n\n`;
  } else if (analysisType === 'synthesis') {
    guidance = `\n\nIMPORTANT SYNTHESIS INSTRUCTIONS FOR ${model.toUpperCase()}:
1. Create a comprehensive 5+ page report with detailed sections
2. Provide multiple paragraphs (3-5) for each insight or finding
3. Include detailed HTML tables comparing different sessions
4. Connect all findings to specific data points and timestamps
5. Ensure each recommendation has specific examples and rationale
6. Write in a professional, detailed academic style throughout\n\n`;
  }
  
  return prompt + guidance;
}

module.exports = {
  executeWithFallbacks,
  adjustParametersForFallback
}; 