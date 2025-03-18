const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const debug = require('../utils/debug');

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
router.post('/extension/recorder/verifyConnection', (req, res) => {
    console.log('[Backend] Received connection verification request');
    res.json({ 
        success: true, 
        message: 'Connection verified',
        serverTime: new Date().toISOString()
    });
});

// Endpoint to save a recording session
router.post('/extension/recorder/saveSession', async (req, res) => {
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
router.post('/extension/recorder/saveInteractions', async (req, res) => {
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
router.get('/extension/recorder/interactions/:sessionId', async (req, res) => {
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

// Extension integration endpoint for DOM capture
router.post('/extension/capture', async (req, res) => {
  try {
    debug('Received extension capture request');
    const { url, domContent, metadata } = req.body;
    
    if (!domContent || !domContent.html) {
      debug('Missing DOM content');
      return res.status(400).json({
        success: false,
        error: 'Missing DOM content'
      });
    }
    
    // Generate a unique capture ID
    const captureId = `capture-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    debug(`Generated capture ID: ${captureId}`);
    
    // Store the DOM content
    const captureData = {
      id: captureId,
      url: url,
      domContent: domContent,
      metadata: metadata || {
        url: url,
        title: domContent.title || 'Unknown',
        timestamp: new Date().toISOString()
      },
      createdAt: Date.now()
    };
    
    // Store in database
    const savedCapture = await db.saveDOMCapture(captureData);
    
    // Also store in memory for quick access
    captureStore.captures.push(savedCapture);
    
    debug('DOM capture saved successfully');
    res.json({
      success: true,
      captureId: captureId,
      message: 'DOM capture stored successfully'
    });
  } catch (error) {
    console.error('Error processing DOM capture:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process DOM capture: ' + error.message
    });
  }
});

// Get all DOM captures
router.get('/extension/captures', async (req, res) => {
  try {
    const captures = await db.getDOMCaptures();
    res.json({
      success: true,
      captures: captures
    });
  } catch (error) {
    debug('Error retrieving DOM captures:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve DOM captures'
    });
  }
});

// Get specific DOM capture
router.get('/extension/captures/:captureId', async (req, res) => {
  try {
    const { captureId } = req.params;
    const captures = await db.getDOMCaptures();
    const capture = captures.find(c => c.id === captureId);
    
    if (!capture) {
      return res.status(404).json({
        success: false,
        error: 'Capture not found'
      });
    }
    
    res.json({
      success: true,
      capture: capture
    });
  } catch (error) {
    debug('Error retrieving DOM capture:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve DOM capture'
    });
  }
});

// Store interaction results
router.post('/extension/storeResults', async (req, res) => {
  try {
    const { sessionId, results } = req.body;
    
    if (!sessionId || !results) {
      return res.status(400).json({
        success: false,
        error: 'Missing required data'
      });
    }
    
    // Store results in database
    await db.updateSession(sessionId, { results });
    
    res.json({
      success: true,
      message: 'Results stored successfully'
    });
  } catch (error) {
    debug('Error storing results:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to store results'
    });
  }
});

// Clear interactions for a session
router.post('/extension/recorder/clearInteractions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing session ID'
      });
    }
    
    // Clear interactions from database
    await db.clearInteractions(sessionId);
    
    // Clear from memory store
    if (interactionStore.sessions[sessionId]) {
      interactionStore.sessions[sessionId].interactions = [];
    }
    
    res.json({
      success: true,
      message: 'Interactions cleared successfully'
    });
  } catch (error) {
    debug('Error clearing interactions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear interactions'
    });
  }
});

// Endpoint to finalize a recording session
router.post('/extension/recorder/completeSession', async (req, res) => {
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
router.get('/extension/recorder/sessions', async (req, res) => {
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
router.post('/extension/recorder/status', async (req, res) => {
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
router.get('/extension/recorder/status', (req, res) => {
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