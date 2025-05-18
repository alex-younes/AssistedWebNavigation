/**
 * DeepSeek Client Module - Specialized for behavioral analysis with thinking capabilities
 * 
 * This module provides a specialized client for DeepSeek models that supports:
 * 1. Thinking tags for more thorough analysis
 * 2. Extended context handling
 * 3. Structured output formatting
 */

const axios = require('axios');
const { enqueueRequest } = require('./rateLimiter');

// Configuration
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const DEFAULT_API_KEY = process.env.DEEPSEEK_API_KEY;

/**
 * Create a DeepSeek API client
 * @param {object} options - Client configuration options
 * @returns {object} DeepSeek client instance
 */
function createDeepseekClient(options = {}) {
  const apiKey = options.apiKey || DEFAULT_API_KEY;
  
  if (!apiKey) {
    throw new Error('DeepSeek API key not provided. Set DEEPSEEK_API_KEY in environment or pass as option.');
  }
  
  const client = {
    /**
     * Generate a completion with optional thinking capabilities
     * @param {object} params - Completion parameters
     * @returns {Promise<object>} Completion response
     */
    completion: async (params) => {
      const { 
        model = 'deepseek-r1-distill-llama-70b', 
        prompt, 
        temperature = 0.7, 
        max_tokens = 4000,
        top_p = 1, 
        top_k,
        thinking = false,
        thinkingDepth = 'normal',
        ...otherParams
      } = params;
      
      // Add thinking tags if requested
      let finalPrompt = prompt;
      if (thinking) {
        let thinkingContent = '';
        
        // Generate different thinking content based on depth
        switch (thinkingDepth) {
          case 'light':
            thinkingContent = 'Think briefly about your approach to this analysis.';
            break;
          case 'extensive':
            thinkingContent = `Think extensively about this analysis problem:
1. What key psychological patterns might be present?
2. How do typing patterns correlate with confidence?
3. What hesitation behaviors can you identify?
4. How might frustration manifest in these metrics?
5. What cognitive models explain these behaviors?
6. What detailed insights can you extract from this data?`;
            break;
          default: // 'normal'
            thinkingContent = `Think step by step about this analysis:
1. What are the main behavioral patterns shown?
2. How do the metrics correlate with user psychology?
3. What insights can you derive from the data?`;
        }
        
        // Wrap prompt with thinking tags
        finalPrompt = `<thinking>${thinkingContent}</thinking>\n\n${prompt}`;
      }
      
      // Prepare request payload
      const payload = {
        model,
        prompt: finalPrompt,
        temperature,
        max_tokens,
        top_p,
        ...(top_k && { top_k }),
        ...otherParams
      };
      
      // Execute request with rate limiting
      return enqueueRequest('deepseek', async () => {
        try {
          const response = await axios.post(`${DEEPSEEK_BASE_URL}/completions`, payload, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            }
          });
          
          // Process and extract thinking if present
          const rawResponse = response.data;
          const text = rawResponse.choices[0]?.text || '';
          
          // Extract thinking content if present
          let thinking = null;
          if (params.thinking) {
            const thinkingMatch = text.match(/<thinking>([\s\S]*?)<\/thinking>/);
            thinking = thinkingMatch ? thinkingMatch[1].trim() : null;
          }
          
          // Clean the response to remove thinking tags
          const cleanedText = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim();
          
          return {
            ...rawResponse,
            choices: [
              {
                ...rawResponse.choices[0],
                text: cleanedText,
                ...(thinking && { thinking })
              }
            ]
          };
        } catch (error) {
          const responseError = error.response?.data?.error;
          if (responseError) {
            throw new Error(`DeepSeek API Error: ${responseError.message || 'Unknown error'}`);
          }
          throw error;
        }
      }, { estimatedTokens: Math.ceil(finalPrompt.length / 4) });
    }
  };
  
  return client;
}

// Default singleton instance
const defaultClient = createDeepseekClient();

module.exports = {
  createDeepseekClient,
  deepseek: defaultClient
}; 