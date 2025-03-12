const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const debug = require('../utils/debug');
const browserService = require('../services/BrowserService');
// Handle missing database gracefully
let db;
try {
  db = require('../database');
  console.log('[Backend] Database module loaded successfully');
} catch (error) {
  console.warn('[Backend] Database module could not be loaded:', error.message);
  // Create a mock database
  db = {
    saveInteraction: async () => ({}),
    getInteractions: async () => ([]),
    saveSession: async () => ({}),
    getSessions: async () => ([]),
    updateSession: async () => ({}),
    saveDOMCapture: async (capture) => capture,
    getDOMCaptures: async () => ([])
  };
}

// In-memory store for recorded interactions
const interactionStore = {
  sessions: {},
  interactions: []
};

// New endpoints for DOM captures
const captureStore = {
  captures: []
};

// Global variable to track recording status per user
const recordingStatusStore = {
    users: {}
};

// Helper function to get or create user status
const getUserStatus = (userId) => {
    if (!userId) return null;
    
    if (!recordingStatusStore.users[userId]) {
        recordingStatusStore.users[userId] = {
            status: 'idle',
            isExtensionConnected: false,
            userId: userId,
            currentSession: null
        };
    }
    return recordingStatusStore.users[userId];
};

// Verify connection endpoint
router.post('/recorder/verifyConnection', (req, res) => {
    console.log('[Backend] Received connection verification request');
    res.json({ 
        success: true, 
        message: 'Connection verified',
        serverTime: new Date().toISOString()
    });
});

// Endpoint to save a recording session
router.post('/recorder/saveSession', async (req, res) => {
  try {
    debug('Received recording session data');
    const sessionData = req.body;
    
    if (!sessionData || !sessionData.sessionId || !sessionData.userId) {
      debug('Missing required session data');
      return res.status(400).json({
        success: false,
        error: 'Missing session ID, user ID, or data'
      });
    }
    
    // Store session data with user ID
    if (!interactionStore.users) {
      interactionStore.users = {};
    }
    
    if (!interactionStore.users[sessionData.userId]) {
      interactionStore.users[sessionData.userId] = {
        sessions: {},
        interactions: []
      };
    }
    
    interactionStore.users[sessionData.userId].sessions[sessionData.sessionId] = {
      ...sessionData,
      interactions: [] // Will be populated as interactions come in
    };
    
    debug(`Saved recording session: ${sessionData.sessionId} for user: ${sessionData.userId}`);
    
    res.json({
      success: true,
      sessionId: sessionData.sessionId,
      message: 'Recording session saved'
    });
  } catch (error) {
    console.error('Error saving recording session:', error);
    res.status(500).json({
      success: false,
      error: 'Server error saving recording session'
    });
  }
});

// Endpoint to save an interaction
router.post('/recorder/saveInteractions', async (req, res) => {
    try {
        const { interactions, sessionId, userId } = req.body;
        console.log(`[Backend] Received ${interactions?.length} interactions for session ${sessionId} user ${userId}`);
        
        if (!interactions || !sessionId || !userId) {
            console.error('[Backend] Missing required data:', { interactions: !!interactions, sessionId, userId });
            return res.status(400).json({
                success: false,
                error: 'Missing required data (interactions, sessionId, or userId)'
            });
        }
        
        // Initialize user store if needed
        if (!interactionStore.users) {
            interactionStore.users = {};
        }
        
        // Initialize user data if needed
        if (!interactionStore.users[userId]) {
            interactionStore.users[userId] = {
                sessions: {},
                interactions: []
            };
        }
        
        // Initialize session if needed
        if (!interactionStore.users[userId].sessions[sessionId]) {
            interactionStore.users[userId].sessions[sessionId] = {
                sessionId,
                userId,
                interactions: []
            };
        }
        
        // Add interactions to the session
        const userSession = interactionStore.users[userId].sessions[sessionId];
        interactions.forEach(interaction => {
            userSession.interactions.push({
                ...interaction,
                sessionId,
                userId,
                timestamp: interaction.timestamp || new Date().toISOString()
            });
        });
        
        console.log(`[Backend] Saved ${interactions.length} interactions for session ${sessionId} user ${userId}`);
        console.log(`[Backend] Total interactions for session: ${userSession.interactions.length}`);
        
        res.json({
            success: true,
            count: interactions.length,
            totalCount: userSession.interactions.length
        });
    } catch (error) {
        console.error('[Backend] Error saving interactions:', error);
        res.status(500).json({
            success: false,
            error: 'Server error saving interactions'
        });
    }
});

// Endpoint to get interactions for a session
router.get('/recorder/interactions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { userId } = req.query;
        
        console.log(`[Backend] Getting interactions for session ${sessionId} user ${userId}`);
        
        if (!sessionId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID and User ID are required'
            });
        }
        
        // Get interactions for the specific user and session
        const userStore = interactionStore.users?.[userId];
        const sessionStore = userStore?.sessions?.[sessionId];
        const interactions = sessionStore?.interactions || [];
        
        console.log(`[Backend] Found ${interactions.length} interactions for session ${sessionId} user ${userId}`);
        
        res.json({
            success: true,
            interactions: interactions,
            count: interactions.length
        });
    } catch (error) {
        console.error('[Backend] Error getting interactions:', error);
        res.status(500).json({
            success: false,
            error: 'Server error getting interactions'
        });
    }
});

// Extension integration endpoint
router.post('/extension/analyze', async (req, res) => {
  try {
    debug('Received extension analyze request');
    const { domContent, sourceUrl } = req.body;
    
    if (!domContent || !domContent.html) {
      debug('Missing DOM content');
      return res.status(400).json({
        success: false,
        error: 'Missing DOM content'
      });
    }
    
    // Generate a unique session ID
    const sessionId = `ext-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    debug(`Generated session ID: ${sessionId}`);
    
    // Store the DOM content for processing
    const tempFilePath = path.join(os.tmpdir(), `${sessionId}.html`);
    fs.writeFileSync(tempFilePath, domContent.html);
    debug(`Stored DOM content at: ${tempFilePath}`);
    
    // Store metadata for retrieval later
    const sessionData = {
      id: sessionId,
      sourceUrl: sourceUrl,
      status: 'processing',
      metadata: domContent.metadata || {
        url: sourceUrl,
        title: 'Unknown',
        timestamp: Date.now()
      },
      createdAt: Date.now(),
      results: null
    };
    
    // In a production app, you would store this in a database
    // For this example, we'll use a global variable in memory
    global.sessionStore = global.sessionStore || {};
    global.sessionStore[sessionId] = sessionData;
    
    // Start processing in the background (non-blocking)
    processExtensionCapture(sessionId, tempFilePath, domContent.metadata, sourceUrl);
    
    // Respond to the extension
    res.json({
      success: true,
      sessionId,
      message: 'DOM received and processing started'
    });
  } catch (error) {
    console.error('Error processing extension DOM:', error);
    res.status(500).json({
      success: false,
      error: 'Server error processing the DOM content'
    });
  }
});

// Get analysis results by session ID
router.get('/analysis/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    debug(`Fetching analysis results for session: ${sessionId}`);
    
    // Check if we have this session in our store
    if (!global.sessionStore || !global.sessionStore[sessionId]) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    const session = global.sessionStore[sessionId];
    
    // If processing is complete, return the results
    if (session.status === 'completed' && session.results) {
      return res.json({
        success: true,
        status: 'completed',
        results: session.results
      });
    } 
    
    // If still processing, just return the status
    if (session.status === 'processing') {
      return res.json({
        success: true,
        status: 'processing',
        progress: 'DOM analysis in progress'
      });
    }
    
    // If there was an error
    if (session.status === 'error') {
      return res.status(500).json({
        success: false,
        error: session.error || 'Unknown error during processing'
      });
    }
    
    // Fallback for any other state
    return res.json({
      success: true,
      status: session.status,
      message: 'Session exists but status is ambiguous'
    });
  } catch (error) {
    console.error(`Error fetching analysis for session ${req.params.sessionId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analysis results'
    });
  }
});

// Endpoint to finalize a recording session
router.post('/recorder/completeSession', async (req, res) => {
  try {
    const { sessionId, endTime, interactionCount, status, reason } = req.body;
    console.log(`[Backend] Completing session ${sessionId}`);
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }
    
    // Get the session data
    if (!interactionStore.sessions[sessionId]) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Update session data
    interactionStore.sessions[sessionId] = {
      ...interactionStore.sessions[sessionId],
      endTime: endTime || new Date().toISOString(),
      status: status || 'completed',
      reason: reason,
      interactionCount: interactionCount || interactionStore.sessions[sessionId].interactionCount || 0
    };
    
    console.log(`[Backend] Session ${sessionId} completed with ${interactionStore.sessions[sessionId].interactionCount} interactions`);
    
    return res.json({
      success: true,
      sessionId: sessionId,
      status: interactionStore.sessions[sessionId].status,
      interactionCount: interactionStore.sessions[sessionId].interactionCount
    });
  } catch (error) {
    console.error('[Backend] Error completing session:', error);
    return res.status(500).json({
      success: false,
      error: 'Error completing session: ' + error.message
    });
  }
});

// Endpoint to get all recording sessions
router.get('/recorder/sessions', async (req, res) => {
  try {
    // Get all sessions, sorted by startTime in descending order
    const sessions = Object.values(interactionStore.sessions)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    
    return res.json({
      success: true,
      sessions: sessions
    });
  } catch (error) {
    console.error('[Backend] Error getting sessions:', error);
    return res.status(500).json({
      success: false,
      error: 'Error getting sessions: ' + error.message
    });
  }
});

// Route to update extension recording status
router.post('/recorder/status', async (req, res) => {
    try {
        const { status, sessionId, userId, sessionData } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        console.log(`[Extension] Status update received for user ${userId}: ${status}`);
        
        // Get or create user status
        const userStatus = getUserStatus(userId);
        
        // Update the status for this specific user
        userStatus.status = status;
        userStatus.isExtensionConnected = true;
        
        // Only update session if one is provided
        if (sessionId) {
            userStatus.currentSession = {
                sessionId,
                userId,
                ...sessionData
            };
            
            // Ensure session exists in interaction store
            if (!interactionStore.users?.[userId]?.sessions?.[sessionId]) {
                if (!interactionStore.users) {
                    interactionStore.users = {};
                }
                if (!interactionStore.users[userId]) {
                    interactionStore.users[userId] = {
                        sessions: {},
                        interactions: []
                    };
                }
                interactionStore.users[userId].sessions[sessionId] = {
                    sessionId,
                    userId,
                    interactions: [],
                    ...sessionData
                };
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating extension status:', error);
        res.status(500).json({ error: 'Failed to update status' });
    }
});

// Route to get extension recording status
router.get('/recorder/status', (req, res) => {
    const { userId } = req.query;
    
    // If no userId is provided, return a default status
    if (!userId) {
        return res.json({
            status: 'idle',
            isExtensionConnected: false,
            userId: null,
            currentSession: null,
            needsUserId: true
        });
    }
    
    // Get status for specific user
    const userStatus = getUserStatus(userId);
    
    if (!userStatus) {
        return res.json({
            status: 'idle',
            isExtensionConnected: false,
            userId: userId,
            currentSession: null
        });
    }
    
    res.json({
        ...userStatus,
        sessionData: {
            ...userStatus.currentSession,
            userId: userStatus.userId
        }
    });
});

// New endpoint to store results directly from content script
router.post('/extension/storeResults', async (req, res) => {
  try {
    debug('Storing DOM results from content script');
    const { sessionId, domTree, metadata } = req.body;
    
    if (!sessionId || !domTree) {
      debug('Missing required data for storing results');
      return res.status(400).json({
        success: false,
        error: 'Missing required data (sessionId, domTree)'
      });
    }
    
    debug(`Received DOM tree structure from content script: ${typeof domTree}, with keys: ${Object.keys(domTree).join(', ')}`);
    
    // Initialize session store if needed
    global.sessionStore = global.sessionStore || {};
    
    // Store the results directly from the content script without any transformation
    global.sessionStore[sessionId] = {
      id: sessionId,
      status: 'completed',
      metadata: metadata || {
        url: 'Unknown URL',
        title: 'Unknown Page',
        timestamp: Date.now()
      },
      createdAt: Date.now(),
      results: {
        // Store the DOM tree exactly as received from the content script
        domTree: domTree,
        metadata
      }
    };
    
    debug(`Successfully stored DOM results from content script for session: ${sessionId}`);
    
    res.json({
      success: true,
      sessionId: sessionId,
      message: 'DOM results stored successfully'
    });
  } catch (error) {
    console.error('Error storing content script DOM results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store results'
    });
  }
});

// Endpoint to capture DOM directly with Playwright and store as a session
router.post('/extension/captureWithPlaywright', async (req, res) => {
  try {
    debug('Received direct Playwright capture request');
    const { url } = req.body;
    
    if (!url) {
      debug('Missing URL for Playwright capture');
      return res.status(400).json({
        success: false,
        error: 'URL is required for Playwright DOM capture'
      });
    }
    
    // Generate a unique session ID
    const sessionId = `ext-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    debug(`Generated session ID: ${sessionId}`);
    
    // Initialize the browser if needed or if it was closed
    try {
      // Check if browser is defined but closed (page.goto will fail)
      if (browserService.browser) {
        debug('Testing if browser is still active...');
        // This is a simple test to see if the browser is responsive
        await browserService.browser.contexts();
      }
    } catch (browserError) {
      debug('Browser instance is closed or unresponsive, will reinitialize');
      // Close it properly first if it exists but is in a bad state
      if (browserService.browser) {
        try {
          await browserService.closeBrowser();
        } catch (closeError) {
          debug(`Error closing existing browser: ${closeError.message}`);
          // We'll continue anyway since we're going to create a new one
        }
      }
      browserService.browser = null;
      browserService.page = null;
    }
    
    // Now launch browser if it's null
    if (!browserService.browser) {
      debug('Launching browser for Playwright capture');
      await browserService.launchBrowser();
    }
    
    try {
      // Navigate to the URL
      debug(`Navigating to ${url} for DOM capture`);
      await browserService.navigateToUrl(url);
      
      // Capture the DOM using Playwright
      debug('Capturing DOM with Playwright');
      const domTree = await browserService.captureDom();
      
      if (!domTree) {
        debug('Failed to capture DOM with Playwright');
        return res.status(500).json({
          success: false,
          error: 'Failed to capture DOM with Playwright'
        });
      }
      
      // Store metadata for the session
      const metadata = {
        url,
        title: req.body.pageTitle || 'Captured with Playwright',
        timestamp: Date.now()
      };
      
      // Store in our session store
      global.sessionStore = global.sessionStore || {};
      global.sessionStore[sessionId] = {
        id: sessionId,
        status: 'completed',
        metadata,
        createdAt: Date.now(),
        results: {
          domTree,
          metadata
        }
      };
      
      debug(`Successfully captured and stored Playwright DOM for session: ${sessionId}`);
      
      // Respond with the session ID
      res.json({
        success: true,
        sessionId,
        message: 'DOM captured with Playwright and stored successfully'
      });
    } catch (navigationError) {
      debug(`Navigation or DOM capture error: ${navigationError.message}`);
      
      // If the error indicates the browser is closed, reinitialize it for next time
      if (navigationError.message.includes('Target page, context or browser has been closed')) {
        try {
          debug('Browser appears to be closed, cleaning up for next capture');
          browserService.browser = null;
          browserService.page = null;
        } catch (cleanupError) {
          debug(`Error during browser cleanup: ${cleanupError.message}`);
        }
      }
      
      throw navigationError; // Re-throw to be caught by outer catch block
    }
    
  } catch (error) {
    console.error('Error in direct Playwright capture:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Error during Playwright DOM capture'
    });
  }
});

// Endpoint to capture DOM from the extension
router.post('/capture', async (req, res) => {
  try {
    console.log('[Backend] Received DOM capture from extension');
    const { url, domContent, metadata } = req.body;
    
    if (!domContent || !domContent.html) {
      console.error('[Backend] Missing DOM content in capture request');
      return res.status(400).json({
        success: false,
        error: 'Missing DOM content'
      });
    }
    
    // Create a capture ID
    const captureId = `dom-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    
    // Process the DOM to extract relevant information
    const title = domContent.title || extractTitle(domContent.html) || 'Unnamed Page';
    
    // Process the HTML to extract the DOM tree
    const domTree = processHTML(domContent.html);
    
    // Create the capture object
    const capture = {
      id: captureId,
      url: url,
      title: title,
      timestamp: new Date().toISOString(),
      metadata: {
        ...metadata,
        capturedWith: 'extension'
      },
      // Store a preview/summary of the DOM tree, not the full HTML
      domTree: domTree
    };
    
    // Store in memory
    captureStore.captures.unshift(capture); // Add at the beginning (newest first)
    
    // Keep only the last 20 captures
    if (captureStore.captures.length > 20) {
      captureStore.captures = captureStore.captures.slice(0, 20);
    }
    
    // Try to store in the database, but don't let it fail the request
    try {
      if (db && typeof db.saveDOMCapture === 'function') {
        await db.saveDOMCapture(capture);
        console.log(`[Backend] DOM capture saved to database with ID: ${captureId}`);
      } else {
        console.log(`[Backend] DOM capture not saved to database (no database available)`);
      }
    } catch (dbError) {
      console.error(`[Backend] Error saving DOM capture to database: ${dbError.message}`);
      // Continue with the request even if database save fails
    }
    
    console.log(`[Backend] DOM capture saved with ID: ${captureId}`);
    
    res.json({
      success: true,
      captureId: captureId,
      message: 'DOM capture saved successfully'
    });
  } catch (error) {
    console.error('[Backend] Error saving DOM capture:', error);
    res.status(500).json({
      success: false,
      error: 'Server error processing DOM capture: ' + error.message
    });
  }
});

// Get all DOM captures
router.get('/captures', async (req, res) => {
  try {
    console.log('[Backend] Getting all DOM captures');
    
    // Get captures from memory
    const allCaptures = [...captureStore.captures];
    
    // Try to get captures from database as well
    try {
      if (db && typeof db.getDOMCaptures === 'function') {
        const dbCaptures = await db.getDOMCaptures();
        if (Array.isArray(dbCaptures)) {
          // Merge with in-memory captures, avoiding duplicates
          dbCaptures.forEach(dbCapture => {
            if (!allCaptures.some(c => c.id === dbCapture.id)) {
              allCaptures.push(dbCapture);
            }
          });
          console.log(`[Backend] Retrieved ${dbCaptures.length} captures from database`);
        }
      } else {
        console.log('[Backend] Skipping database capture retrieval (no database available)');
      }
    } catch (dbError) {
      console.error(`[Backend] Error getting captures from database: ${dbError.message}`);
      // Continue with just the in-memory captures
    }
    
    // Sort by timestamp (newest first)
    allCaptures.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    console.log(`[Backend] Returning ${allCaptures.length} DOM captures`);
    
    res.json({
      success: true,
      captures: allCaptures
    });
  } catch (error) {
    console.error('[Backend] Error getting DOM captures:', error);
    res.status(500).json({
      success: false,
      error: 'Server error getting DOM captures: ' + error.message
    });
  }
});

// Get a specific DOM capture
router.get('/captures/:captureId', async (req, res) => {
  try {
    const { captureId } = req.params;
    console.log(`[Backend] Getting DOM capture with ID: ${captureId}`);
    
    // Find in memory
    let capture = captureStore.captures.find(c => c.id === captureId);
    
    // If not found in memory, try database
    if (!capture) {
      try {
        if (db && typeof db.getDOMCaptures === 'function') {
          capture = await db.getDOMCaptures({ id: captureId });
          if (capture) {
            console.log(`[Backend] Retrieved capture ${captureId} from database`);
          }
        } else {
          console.log('[Backend] Skipping database capture retrieval (no database available)');
        }
      } catch (dbError) {
        console.error(`[Backend] Error getting capture from database: ${dbError.message}`);
        // Continue without the database capture
      }
    }
    
    if (!capture) {
      return res.status(404).json({
        success: false,
        error: 'DOM capture not found'
      });
    }
    
    res.json({
      success: true,
      ...capture
    });
  } catch (error) {
    console.error(`[Backend] Error getting DOM capture ${req.params.captureId}:`, error);
    res.status(500).json({
      success: false,
      error: 'Server error getting DOM capture: ' + error.message
    });
  }
});

// Helper function to extract title from HTML
function extractTitle(html) {
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  return titleMatch ? titleMatch[1] : null;
}

// Helper function to process HTML and extract DOM structure
function processHTML(html) {
  try {
    // Create a DOM parser
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Extract the DOM tree
    function extractNode(element) {
      if (!element) return null;
      
      const nodeInfo = {
        tagName: element.tagName?.toLowerCase() || 'unknown',
      };
      
      // Add class if exists
      if (element.className && typeof element.className === 'string' && element.className.trim()) {
        nodeInfo.className = element.className.trim();
      }
      
      // Get text content if it's a leaf node or has minimal children
      if (element.childNodes.length === 0 || 
          (element.childNodes.length === 1 && element.childNodes[0].nodeType === 3)) {
        const text = element.textContent?.trim();
        if (text) {
          nodeInfo.contentDescription = text.substring(0, 100);
        }
      }
      
      // Process children (excluding script, style, etc.)
      const children = Array.from(element.children || [])
        .filter(child => {
          return child.nodeType === 1 && 
                !['script', 'style', 'meta', 'link', 'noscript'].includes(child.tagName.toLowerCase());
        })
        .map(extractNode)
        .filter(Boolean);
      
      if (children.length > 0) {
        nodeInfo.children = children;
      }
      
      return nodeInfo;
    }
    
    // Start from the body or html element
    const rootElement = document.body || document.documentElement;
    return extractNode(rootElement);
  } catch (error) {
    console.error('[Backend] Error processing HTML:', error);
    return {
      tagName: 'body',
      contentDescription: 'Error processing HTML: ' + error.message
    };
  }
}

// Endpoint to clear all interactions for a specific session (this matches what frontend is calling)
router.post('/recorder/clearInteractions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`[Backend] Clearing all interactions for session ${sessionId}`);
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }
    
    // Check if session exists
    if (!interactionStore.sessions[sessionId]) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Remove all interactions for this session
    interactionStore.interactions = interactionStore.interactions.filter(
      interaction => interaction.sessionId !== sessionId
    );
    
    // Update session interaction count
    if (interactionStore.sessions[sessionId]) {
      interactionStore.sessions[sessionId].interactionCount = 0;
    }
    
    console.log(`[Backend] Cleared all interactions for session ${sessionId}`);
    
    return res.json({
      success: true,
      message: `All interactions cleared for session ${sessionId}`
    });
  } catch (error) {
    console.error('[Backend] Error clearing interactions:', error);
    return res.status(500).json({
      success: false,
      error: 'Error clearing interactions: ' + error.message
    });
  }
});

// Add a duplicate endpoint that matches what the frontend is calling with the /extension/ prefix
router.post('/extension/recorder/clearInteractions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    console.log(`[Backend] Clearing all interactions for session ${sessionId} (from /extension prefix route)`);
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Session ID is required'
      });
    }
    
    // Check if session exists
    if (!interactionStore.sessions[sessionId]) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
    
    // Remove all interactions for this session
    interactionStore.interactions = interactionStore.interactions.filter(
      interaction => interaction.sessionId !== sessionId
    );
    
    // Update session interaction count
    if (interactionStore.sessions[sessionId]) {
      interactionStore.sessions[sessionId].interactionCount = 0;
    }
    
    console.log(`[Backend] Cleared all interactions for session ${sessionId}`);
    
    return res.json({
      success: true,
      message: `All interactions cleared for session ${sessionId}`
    });
  } catch (error) {
    console.error('[Backend] Error clearing interactions:', error);
    return res.status(500).json({
      success: false,
      error: 'Error clearing interactions: ' + error.message
    });
  }
});

module.exports = router; 