const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const debug = require('../utils/debug');
const db = require('../database');
const serviceManager = require('../services/ServiceManager');
const DOMState = require('../models/DOMState');

// Helper function to get user status - now uses serviceManager
const getUserStatus = async (userId) => {
    if (!userId) return null;
    
    try {
        // Get active sessions for this user
        const userSessions = await db.getSessions({ 
            userId, 
            status: 'active' 
        });
        
        // Check if user has an active session
        const hasActiveSession = userSessions && userSessions.length > 0;
        const currentSession = hasActiveSession ? userSessions[0] : null;
        
        return {
            status: hasActiveSession ? 'recording' : 'idle',
            userId: userId,
            currentSession: currentSession ? currentSession.id : null
        };
    } catch (error) {
        console.error(`[Backend] Error getting user status for ${userId}:`, error);
        return {
            status: 'idle',
            userId: userId,
            currentSession: null
        };
    }
};

// Verify connection endpoint
router.post('/extension/recorder/verifyConnection', async (req, res) => {
    console.log('[Backend] Received connection verification request');
    
    const { userId, connectionId } = req.body;
    
    if (userId && connectionId) {
        serviceManager.registerConnection(userId, connectionId);
    }
    
    res.json({ 
        success: true, 
        message: 'Connection verified',
        serverTime: new Date().toISOString()
    });
});

// Endpoint to save a recording session
router.post('/extension/recorder/saveSession', async (req, res) => {
    try {
        console.log('[Backend] Received session save request');
        const { sessionId, userId, url, browser, metadata } = req.body;
        
        if (!sessionId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID or user ID'
            });
        }
        
        // Use ServiceManager to save session
        await serviceManager.startRecording(
            userId, 
            sessionId, 
            {
                url,
                browser,
                ...metadata
            }
        );
        
        console.log(`[Backend] Saved recording session: ${sessionId} for user: ${userId}`);
        
        return res.json({
            success: true,
            sessionId,
            message: 'Recording session started'
        });
    } catch (error) {
        console.error('[Backend] Error saving recording session:', error);
        return res.status(500).json({
            success: false,
            error: 'Error saving recording session: ' + error.message
        });
    }
});

// Endpoint to stop a recording session
router.post('/extension/recorder/stopSession', async (req, res) => {
    try {
        const { sessionId, userId, reason } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID'
            });
        }
        
        // Use ServiceManager to stop session
        await serviceManager.stopRecording(sessionId, reason || 'user_stopped');
        
        console.log(`[Backend] Stopped recording session: ${sessionId}`);
        
        return res.json({
            success: true,
            message: 'Recording session stopped'
        });
    } catch (error) {
        console.error('[Backend] Error stopping recording session:', error);
        return res.status(500).json({
            success: false,
            error: 'Error stopping recording session: ' + error.message
        });
    }
});

// Endpoint to save interactions
router.post('/extension/recorder/saveInteractions', async (req, res) => {
    try {
        const { interactions, sessionId, userId } = req.body;
        console.log(`[Backend] Received ${interactions?.length} interactions for session ${sessionId}`);
        
        if (!interactions || !Array.isArray(interactions) || interactions.length === 0) {
            return res.json({
                success: true,
                message: 'No interactions to save',
                count: 0
            });
        }
        
        if (!sessionId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID or user ID'
            });
        }
        
        // Use ServiceManager to save interactions
        const result = await serviceManager.saveInteractions(interactions, sessionId, userId);
        
        return res.json({
            success: true,
            message: `Saved ${result.count} interactions`,
            count: result.count
        });
    } catch (error) {
        console.error('[Backend] Error saving interactions:', error);
        return res.status(500).json({
            success: false,
            error: 'Error saving interactions: ' + error.message
        });
    }
});

// Endpoint to save DOM state
router.post('/extension/recorder/saveDOMState', async (req, res) => {
    try {
        const { state, sessionId, userId } = req.body;
        
        if (!state || !sessionId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing state data, session ID, or user ID'
            });
        }
        
        // Use ServiceManager to save DOM state
        const result = await serviceManager.saveDOMState(state, sessionId, userId);
        
        return res.json({
            success: true,
            message: 'DOM state saved',
            stateId: result.stateId
        });
    } catch (error) {
        console.error('[Backend] Error saving DOM state:', error);
        return res.status(500).json({
            success: false,
            error: 'Error saving DOM state: ' + error.message
        });
    }
});

// Endpoint to get recording status
router.get('/extension/recorder/status', async (req, res) => {
    try {
        const { userId } = req.query;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing user ID'
            });
        }
        
        // Use ServiceManager to get user status
        const status = await serviceManager.getUserStatus(userId);
        
        return res.json({
            success: true,
            status: status.status,
            sessionId: status.currentSession
        });
    } catch (error) {
        console.error('[Backend] Error getting recording status:', error);
        return res.status(500).json({
            success: false,
            error: 'Error getting recording status: ' + error.message
        });
    }
});

// Endpoint to get session data
router.get('/extension/recorder/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID'
            });
        }
        
        // Get session from database
        const session = await db.getSessions({ id: sessionId });
        
        if (!session) {
            return res.status(404).json({
                success: false,
                error: 'Session not found'
            });
        }
        
        // Get states for this session
        const states = await db.getDOMStates({ sessionId });
        
        // Get interactions for this session
        const interactions = await db.getInteractions({ sessionId });
        
        return res.json({
            success: true,
            session,
            summary: {
                stateCount: states.length,
                interactionCount: interactions.length
            }
        });
    } catch (error) {
        console.error('[Backend] Error getting session data:', error);
        return res.status(500).json({
            success: false,
            error: 'Error getting session data: ' + error.message
        });
    }
});

// Endpoint to get session states
router.get('/extension/recorder/session/:sessionId/states', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID'
            });
        }
        
        // Get states for this session
        const states = await db.getDOMStates({ sessionId });
        
        return res.json({
            success: true,
            states,
            count: states.length
        });
    } catch (error) {
        console.error('[Backend] Error getting session states:', error);
        return res.status(500).json({
            success: false,
            error: 'Error getting session states: ' + error.message
        });
    }
});

// Endpoint to get state interactions
router.get('/extension/recorder/state/:stateId/interactions', async (req, res) => {
    try {
        const { stateId } = req.params;
        
        if (!stateId) {
            return res.status(400).json({
                success: false,
                error: 'Missing state ID'
            });
        }
        
        // Get interactions for this state
        const interactions = await db.getInteractionsByState(stateId);
        
        return res.json({
            success: true,
            interactions,
            count: interactions.length
        });
    } catch (error) {
        console.error('[Backend] Error getting state interactions:', error);
        return res.status(500).json({
            success: false,
            error: 'Error getting state interactions: ' + error.message
        });
    }
});

// POST /states - Record a new state
router.post('/states', async (req, res) => {
  try {
    const { hash, dom, loadingInfo, mutationInfo, tabId, sessionId, userId } = req.body;
    
    // Validate required fields
    if (!hash || !dom) {
      return res.status(400).json({ error: 'Missing required fields: hash and dom are required' });
    }
    
    // Check for duplicate state
    const existingState = await DOMState.findOne({ hash, sessionId });
    if (existingState) {
      return res.status(200).json({ 
        stateId: existingState.stateId,
        isDuplicate: true 
      });
    }
    
    // Get the current state number for this session
    const lastState = await DOMState.findOne({ sessionId })
      .sort({ stateNumber: -1 });
    const stateNumber = lastState ? lastState.stateNumber + 1 : 0;
    
    // Create new state
    const state = new DOMState({
      stateId: `state_${stateNumber}`,
      sessionId,
      userId,
      url: req.headers.origin || 'unknown',
      pathname: new URL(req.headers.origin || 'http://unknown').pathname,
      hash,
      dom,
      stateNumber,
      isNewState: true,
      loadingInfo: {
        isNavigation: loadingInfo?.isNavigation || false,
        isInitial: loadingInfo?.isInitial || false,
        isReload: loadingInfo?.isReload || false,
        isFinalState: loadingInfo?.isFinalState || false,
        isPartOfLoading: loadingInfo?.isPartOfLoading || false,
        loadTime: loadingInfo?.loadTime || 0,
        resourceCount: loadingInfo?.resourceCount || 0,
        resourceTypes: loadingInfo?.resourceTypes || {},
        errorCount: loadingInfo?.errorCount || 0,
        networkInfo: loadingInfo?.networkInfo || {},
        timestamp: loadingInfo?.timestamp || Date.now()
      },
      mutationInfo: {
        count: mutationInfo?.count || 0,
        types: mutationInfo?.types || [],
        timestamp: mutationInfo?.timestamp || Date.now()
      }
    });
    
    await state.save();
    console.log(`[Backend] Saved new state: ${state.stateId} (hash: ${hash})`);
    
    res.status(201).json({ 
      stateId: state.stateId,
      isDuplicate: false
    });
  } catch (error) {
    console.error('[Backend] Error saving state:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /states/:id - Update a state
router.patch('/states/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { loadingInfo } = req.body;
    
    if (!loadingInfo) {
      return res.status(400).json({ error: 'Missing required field: loadingInfo' });
    }
    
    const state = await DOMState.findOne({ stateId: id });
    if (!state) {
      return res.status(404).json({ error: 'State not found' });
    }
    
    // Update loading info
    state.loadingInfo = {
      ...state.loadingInfo,
      ...loadingInfo,
      timestamp: Date.now()
    };
    
    await state.save();
    console.log(`[Backend] Updated state: ${id} with loading info`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Backend] Error updating state:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 