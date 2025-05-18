/**
 * Model Selector - Intelligent model selection with fallbacks
 * 
 * This module handles selecting the most appropriate model for each analysis stage,
 * with fallback mechanisms and rate limiting to ensure optimal performance.
 */

// Environment configuration
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'deepseek-r1-distill-llama-70b';

// Specialized models for each stage
const MODELS = {
  STAGE1: process.env.STAGE1_MODEL || 'llama-3.1-8b-instant',
  STAGE2: process.env.STAGE2_MODEL || 'deepseek-r1-distill-llama-70b',
  STAGE3: process.env.STAGE3_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
  STAGE4: process.env.STAGE4_MODEL || 'gemma2-9b-it',
  FINAL: process.env.FINAL_MODEL || 'llama-3.3-70b-versatile'
};

// Thinking configuration for models that support it
const THINKING_ENABLED = process.env.STAGE2_ENABLE_THINKING === 'true';
const THINKING_DEPTH = process.env.STAGE2_THINKING_DEPTH || 'extensive';

// Model performance characteristics and capabilities
const MODEL_CAPABILITIES = {
  'llama-3.1-8b-instant': {
    contextLength: 8192,
    strengths: ['speed', 'metrics', 'summarization'],
    weaknesses: ['detailed analysis', 'complex reasoning'],
    typical_tokens_per_second: 70,
    supports_thinking: false
  },
  'deepseek-r1-distill-llama-70b': {
    contextLength: 32768,
    strengths: ['psychological analysis', 'pattern recognition', 'deep reasoning'],
    weaknesses: ['speed'],
    typical_tokens_per_second: 20,
    supports_thinking: true
  },
  'meta-llama/llama-4-scout-17b-16e-instruct': {
    contextLength: 16384,
    strengths: ['instruction following', 'structured output', 'form analysis'],
    weaknesses: ['creative generation'],
    typical_tokens_per_second: 30,
    supports_thinking: false
  },
  'gemma2-9b-it': {
    contextLength: 8192,
    strengths: ['temporal analysis', 'sequence understanding'],
    weaknesses: ['elaborate reasoning'],
    typical_tokens_per_second: 40,
    supports_thinking: false
  },
  'llama-3.3-70b-versatile': {
    contextLength: 32768,
    strengths: ['comprehensive synthesis', 'report generation', 'detail'],
    weaknesses: ['speed', 'cost'],
    typical_tokens_per_second: 15,
    supports_thinking: true
  }
};

// Fallback cascades - preferred alternatives if primary model unavailable
const FALLBACK_CASCADES = {
  'llama-3.1-8b-instant': ['gemma2-9b-it', 'mixtral-8x7b-32768', DEFAULT_MODEL],
  'deepseek-r1-distill-llama-70b': ['llama-3.3-70b-versatile', 'deepseek-r1-lite-llama-32b', 'llama-3-70b-8192'],
  'meta-llama/llama-4-scout-17b-16e-instruct': ['llama-4-8b-it', 'gemma2-27b-it', DEFAULT_MODEL],
  'gemma2-9b-it': ['mixtral-8x7b-32768', 'llama-3.1-8b-instant', DEFAULT_MODEL],
  'llama-3.3-70b-versatile': ['deepseek-r1-distill-llama-70b', 'llama-3-70b-8192', DEFAULT_MODEL]
};

/**
 * Get the most appropriate model for a specific analysis stage
 * 
 * @param {string} stage - Analysis stage (STAGE1, STAGE2, STAGE3, STAGE4, FINAL)
 * @param {object} data - Data to analyze (for context length calculations)
 * @param {boolean} useThinking - Whether to use thinking capabilities if available
 * @returns {object} Model configuration with model, thinking settings, and fallbacks
 */
function getModelForStage(stage, data, useThinking = false) {
  // Get the primary model for this stage
  const primaryModel = MODELS[stage];
  
  // Calculate approximate input token count (rough estimation)
  const jsonString = JSON.stringify(data);
  const approximateTokenCount = Math.ceil(jsonString.length / 4); // Very rough approximation
  
  // Select the right model based on context requirements and stage characteristics
  let selectedModel = primaryModel;
  let fallbacks = FALLBACK_CASCADES[primaryModel] || [DEFAULT_MODEL];
  
  // Check if we need to use a fallback based on context length
  if (MODEL_CAPABILITIES[primaryModel] && 
      approximateTokenCount > MODEL_CAPABILITIES[primaryModel].contextLength * 0.8) {
    console.log(`[ModelSelector] Primary model ${primaryModel} may not handle context of ${approximateTokenCount} tokens. Checking fallbacks.`);
    
    // Find the first fallback that can handle our context
    for (const fallbackModel of fallbacks) {
      if (MODEL_CAPABILITIES[fallbackModel] && 
          approximateTokenCount <= MODEL_CAPABILITIES[fallbackModel].contextLength * 0.8) {
        console.log(`[ModelSelector] Using fallback model ${fallbackModel} which can handle the context`);
        selectedModel = fallbackModel;
        fallbacks = FALLBACK_CASCADES[fallbackModel] || [];
        break;
      }
    }
  }
  
  // Determine if thinking should be enabled for this model
  const enableThinking = useThinking && THINKING_ENABLED && 
                         MODEL_CAPABILITIES[selectedModel]?.supports_thinking;
  
  return {
    model: selectedModel,
    fallbacks,
    enableThinking,
    thinkingDepth: enableThinking ? THINKING_DEPTH : null,
    approximateTokenCount,
    estimatedResponseTime: approximateTokenCount / (MODEL_CAPABILITIES[selectedModel]?.typical_tokens_per_second || 30)
  };
}

/**
 * Get model parameters optimized for a specific analysis task
 * 
 * @param {string} stage - Analysis stage identifier
 * @param {string} modelName - Model name to use
 * @param {boolean} enableThinking - Whether to enable thinking capabilities
 * @returns {object} Optimized parameters for the model and task
 */
function getOptimizedParameters(stage, modelName, enableThinking = false) {
  // Base parameters that work well for most models
  const baseParams = {
    temperature: 0.3,
    top_p: 0.9,
    stream: false
  };
  
  // Stage-specific optimizations
  const stageSpecificParams = {
    STAGE1: {
      // Metrics stage - more deterministic, factual
      temperature: 0.2,
      max_tokens: 3000
    },
    STAGE2: {
      // Behavioral analysis - allow more creativity for psychological insights
      temperature: 0.4,
      max_tokens: 4000
    },
    STAGE3: {
      // Form interaction - precise analysis with moderate creativity
      temperature: 0.3,
      max_tokens: 5000
    },
    STAGE4: {
      // Temporal analysis - balanced approach
      temperature: 0.3,
      max_tokens: 4000
    },
    FINAL: {
      // Final synthesis - detailed but cohesive synthesis
      temperature: 0.4,
      max_tokens: 8000
    }
  };
  
  // Model-specific optimizations
  const modelSpecificParams = {
    'llama-3.1-8b-instant': {
      top_p: 0.85
    },
    'deepseek-r1-distill-llama-70b': {
      top_p: 0.92,
      thinking: enableThinking
    },
    'meta-llama/llama-4-scout-17b-16e-instruct': {
      top_k: 40
    },
    'gemma2-9b-it': {
      temperature: 0.35
    },
    'llama-3.3-70b-versatile': {
      temperature: 0.4,
      thinking: enableThinking
    }
  };
  
  // Combine all parameters, with more specific ones taking precedence
  return {
    ...baseParams,
    ...(stageSpecificParams[stage] || {}),
    ...(modelSpecificParams[modelName] || {})
  };
}

module.exports = {
  MODELS,
  getModelForStage,
  getOptimizedParameters,
  MODEL_CAPABILITIES,
  FALLBACK_CASCADES
}; 