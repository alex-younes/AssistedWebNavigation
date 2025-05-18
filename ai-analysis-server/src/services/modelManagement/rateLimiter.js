/**
 * Rate Limiter Module - Advanced API request rate management
 * 
 * This module provides sophisticated rate limiting functionality to prevent
 * hitting API rate limits while maximizing throughput. It implements:
 * 
 * 1. Token bucket algorithm for request throttling
 * 2. Exponential backoff for error handling
 * 3. Queue management for parallel/sequential execution
 * 4. Adaptive rate limiting based on response behavior
 */

// Configuration
const RATE_LIMIT_DELAY_MS = parseInt(process.env.RATE_LIMIT_DELAY_MS) || 2000;
const MAX_RETRIES = 5;
const PARALLEL_EXECUTION = process.env.PARALLEL_EXECUTION === 'true';

// Rate limit windows by model provider (in milliseconds)
const PROVIDER_RATE_WINDOWS = {
  'groq': {
    defaultWindow: 60000, // 1 minute window
    defaultTokensPerWindow: 200000, // Tokens per minute
    defaultRequestsPerWindow: 100    // Requests per minute
  },
  'openai': {
    defaultWindow: 60000,
    defaultTokensPerWindow: 150000,
    defaultRequestsPerWindow: 90
  },
  'anthropic': {
    defaultWindow: 60000,
    defaultTokensPerWindow: 100000,
    defaultRequestsPerWindow: 50
  },
  'deepseek': {
    defaultWindow: 60000,
    defaultTokensPerWindow: 100000,
    defaultRequestsPerWindow: 40
  }
};

// Buckets to track requests and tokens for each provider
const rateBuckets = new Map();

// Request queues for each provider
const requestQueues = new Map();

/**
 * Initialize a rate bucket for a provider if it doesn't exist
 * @param {string} provider - API provider name
 */
function initBucketIfNeeded(provider) {
  if (!rateBuckets.has(provider)) {
    const providerConfig = PROVIDER_RATE_WINDOWS[provider] || PROVIDER_RATE_WINDOWS.groq;
    
    rateBuckets.set(provider, {
      tokens: {
        remaining: providerConfig.defaultTokensPerWindow,
        lastRefill: Date.now(),
        max: providerConfig.defaultTokensPerWindow,
        window: providerConfig.defaultWindow
      },
      requests: {
        remaining: providerConfig.defaultRequestsPerWindow,
        lastRefill: Date.now(),
        max: providerConfig.defaultRequestsPerWindow,
        window: providerConfig.defaultWindow
      },
      lastRequestTime: 0,
      consecutiveErrors: 0,
      adaptiveDelay: RATE_LIMIT_DELAY_MS
    });
  }
  
  if (!requestQueues.has(provider)) {
    requestQueues.set(provider, {
      queue: [],
      processing: false
    });
  }
}

/**
 * Refill token and request buckets based on elapsed time
 * @param {string} provider - API provider name
 */
function refillBuckets(provider) {
  const bucket = rateBuckets.get(provider);
  if (!bucket) return;
  
  const now = Date.now();
  
  // Refill tokens bucket
  const tokenElapsed = now - bucket.tokens.lastRefill;
  if (tokenElapsed > 0) {
    const tokenRate = bucket.tokens.max / bucket.tokens.window;
    const tokensToAdd = Math.floor(tokenElapsed * tokenRate);
    
    bucket.tokens.remaining = Math.min(
      bucket.tokens.max, 
      bucket.tokens.remaining + tokensToAdd
    );
    bucket.tokens.lastRefill = now;
  }
  
  // Refill requests bucket
  const requestElapsed = now - bucket.requests.lastRefill;
  if (requestElapsed > 0) {
    const requestRate = bucket.requests.max / bucket.requests.window;
    const requestsToAdd = Math.floor(requestElapsed * requestRate);
    
    bucket.requests.remaining = Math.min(
      bucket.requests.max, 
      bucket.requests.remaining + requestsToAdd
    );
    bucket.requests.lastRefill = now;
  }
}

/**
 * Calculate delay needed before next request can be made
 * @param {string} provider - API provider name
 * @param {number} tokenCount - Estimated token count for request
 * @returns {number} Delay in milliseconds before request can be made
 */
function calculateRequiredDelay(provider, tokenCount = 0) {
  const bucket = rateBuckets.get(provider);
  if (!bucket) return 0;
  
  refillBuckets(provider);
  
  // Check if we have enough tokens
  if (bucket.tokens.remaining < tokenCount) {
    const tokenRate = bucket.tokens.max / bucket.tokens.window;
    const tokenDelay = Math.ceil((tokenCount - bucket.tokens.remaining) / tokenRate);
    return tokenDelay;
  }
  
  // Check if we have request quota
  if (bucket.requests.remaining < 1) {
    const requestRate = bucket.requests.max / bucket.requests.window;
    const requestDelay = Math.ceil(1 / requestRate);
    return requestDelay;
  }
  
  // Apply minimum delay between requests
  const timeSinceLastRequest = Date.now() - bucket.lastRequestTime;
  if (timeSinceLastRequest < bucket.adaptiveDelay) {
    return bucket.adaptiveDelay - timeSinceLastRequest;
  }
  
  return 0;
}

/**
 * Update buckets after a successful request
 * @param {string} provider - API provider name
 * @param {number} inputTokens - Input token count used
 * @param {number} outputTokens - Output token count used
 */
function recordSuccessfulRequest(provider, inputTokens = 0, outputTokens = 0) {
  const bucket = rateBuckets.get(provider);
  if (!bucket) return;
  
  refillBuckets(provider);
  
  // Deduct tokens
  const totalTokens = inputTokens + outputTokens;
  bucket.tokens.remaining = Math.max(0, bucket.tokens.remaining - totalTokens);
  
  // Deduct request
  bucket.requests.remaining = Math.max(0, bucket.requests.remaining - 1);
  
  // Update last request time
  bucket.lastRequestTime = Date.now();
  
  // Reset error counter on success and gradually reduce adaptive delay
  if (bucket.consecutiveErrors > 0) {
    bucket.consecutiveErrors = 0;
    bucket.adaptiveDelay = Math.max(
      RATE_LIMIT_DELAY_MS,
      bucket.adaptiveDelay * 0.9
    );
  }
}

/**
 * Update rate limiting after a failed request, implementing exponential backoff
 * @param {string} provider - API provider name
 * @param {Error} error - Error that occurred
 */
function recordFailedRequest(provider, error) {
  const bucket = rateBuckets.get(provider);
  if (!bucket) return;
  
  // Check if error is related to rate limiting
  const isRateLimit = error.message?.includes('rate limit') || 
                     error.message?.includes('too many requests') ||
                     error.status === 429;
  
  // Increment consecutive error counter
  bucket.consecutiveErrors += 1;
  
  // Exponential backoff for adaptive delay
  if (isRateLimit || bucket.consecutiveErrors > 2) {
    bucket.adaptiveDelay = Math.min(
      60000, // Max 60 second delay
      bucket.adaptiveDelay * (1 + (bucket.consecutiveErrors * 0.5))
    );
    
    // If we hit rate limits, significantly reduce our estimate of available tokens/requests
    if (isRateLimit) {
      bucket.tokens.remaining = Math.floor(bucket.tokens.remaining * 0.5);
      bucket.requests.remaining = Math.floor(bucket.requests.remaining * 0.5);
      console.warn(`[RateLimiter] Rate limit hit for ${provider}, reducing quota estimates and increasing delay to ${bucket.adaptiveDelay}ms`);
    }
  }
}

/**
 * Process the request queue for a provider
 * @param {string} provider - API provider name
 */
async function processQueue(provider) {
  const queueData = requestQueues.get(provider);
  if (!queueData || queueData.processing || queueData.queue.length === 0) return;
  
  queueData.processing = true;
  
  try {
    const task = queueData.queue.shift();
    
    // Calculate how long to wait before making the request
    const delay = calculateRequiredDelay(provider, task.estimatedTokens);
    
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    try {
      const result = await task.handler();
      recordSuccessfulRequest(
        provider, 
        task.estimatedTokens, 
        Math.ceil(result.length / 4) // Very rough output token estimation
      );
      task.resolve(result);
    } catch (error) {
      recordFailedRequest(provider, error);
      
      if (task.retries < MAX_RETRIES) {
        // Put back in queue with incremented retry count
        console.log(`[RateLimiter] Retrying failed request for ${provider}, attempt ${task.retries + 1}/${MAX_RETRIES}`);
        requestQueues.get(provider).queue.unshift({
          ...task,
          retries: task.retries + 1
        });
      } else {
        task.reject(new Error(`Max retries exceeded: ${error.message}`));
      }
    }
  } finally {
    queueData.processing = false;
    
    // Process next item if available
    if (queueData.queue.length > 0) {
      processQueue(provider);
    }
  }
}

/**
 * Enqueue a request to be executed with rate limiting
 * @param {string} provider - API provider name
 * @param {Function} handler - Async function to execute
 * @param {object} options - Options for the request
 * @returns {Promise} Promise that resolves with the result of the handler
 */
function enqueueRequest(provider, handler, options = {}) {
  const { estimatedTokens = 1000, priority = 0 } = options;
  
  initBucketIfNeeded(provider);
  
  return new Promise((resolve, reject) => {
    const task = {
      handler,
      estimatedTokens,
      resolve,
      reject,
      priority,
      retries: 0,
      timestamp: Date.now()
    };
    
    const queueData = requestQueues.get(provider);
    
    // Add task to queue based on priority
    if (priority > 0 && queueData.queue.length > 0) {
      // Find position based on priority
      const index = queueData.queue.findIndex(t => t.priority < priority);
      if (index >= 0) {
        queueData.queue.splice(index, 0, task);
      } else {
        queueData.queue.push(task);
      }
    } else {
      queueData.queue.push(task);
    }
    
    // Start processing if not already running
    if (PARALLEL_EXECUTION) {
      // For parallel execution, start a new processor if not at limit
      const runningProcessors = Array.from(requestQueues.values())
        .filter(q => q.processing).length;
      
      if (runningProcessors < 3) { // Limit parallel executions
        processQueue(provider);
      }
    } else if (!queueData.processing) {
      // For sequential execution
      processQueue(provider);
    }
  });
}

/**
 * Wraps an API client's methods with rate limiting
 * @param {object} client - API client to wrap
 * @param {string} provider - API provider name
 * @returns {object} Wrapped client with rate limiting
 */
function wrapClientWithRateLimiting(client, provider) {
  const wrappedClient = {};
  
  // Look for completion/chat methods to wrap
  if (client.chat?.completions?.create) {
    wrappedClient.chat = {
      completions: {
        create: (params) => {
          const estimatedTokens = params.messages.reduce(
            (sum, msg) => sum + Math.ceil(msg.content.length / 4), 
            0
          );
          
          return enqueueRequest(provider, 
            () => client.chat.completions.create(params),
            { estimatedTokens }
          );
        }
      }
    };
  }
  
  if (client.completions?.create) {
    wrappedClient.completions = {
      create: (params) => {
        const estimatedTokens = Math.ceil(params.prompt.length / 4);
        
        return enqueueRequest(provider,
          () => client.completions.create(params),
          { estimatedTokens }
        );
      }
    };
  }
  
  if (client.completion) {
    wrappedClient.completion = (params) => {
      const estimatedTokens = Math.ceil(params.prompt.length / 4);
      
      return enqueueRequest(provider,
        () => client.completion(params),
        { estimatedTokens }
      );
    };
  }
  
  // If no methods were wrapped, return original client
  return Object.keys(wrappedClient).length > 0 ? wrappedClient : client;
}

/**
 * Get current rate limiting status
 * @returns {object} Current rate limiting status for all providers
 */
function getRateLimitStatus() {
  const status = {};
  
  for (const [provider, bucket] of rateBuckets.entries()) {
    refillBuckets(provider);
    
    status[provider] = {
      tokensRemaining: bucket.tokens.remaining,
      requestsRemaining: bucket.requests.remaining,
      adaptiveDelay: bucket.adaptiveDelay,
      consecutiveErrors: bucket.consecutiveErrors,
      queueLength: requestQueues.get(provider)?.queue.length || 0
    };
  }
  
  return status;
}

module.exports = {
  enqueueRequest,
  wrapClientWithRateLimiting,
  recordSuccessfulRequest,
  recordFailedRequest,
  getRateLimitStatus
}; 