const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const os = require('os');
const debug = require('../utils/debug');
const db = require('../database');
const serviceManager = require('../services/ServiceManager');

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

// Verify connection endpoint - restoring this endpoint
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
        console.log('[Backend] Received session save request:', req.body);
        const sessionData = req.body;
        
        if (!sessionData || !sessionData.sessionId || !sessionData.userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID, user ID, or data'
            });
        }
        
        // Use ServiceManager to save session
        await serviceManager.startRecording(
            sessionData.userId, 
            sessionData.sessionId, 
            {
                url: sessionData.url,
                browser: sessionData.browser,
                ...sessionData.metadata
            }
        );
        
        console.log(`[Backend] Saved recording session: ${sessionData.sessionId} for user: ${sessionData.userId}`);
        
        return res.json({
            success: true,
            sessionId: sessionData.sessionId,
            message: 'Recording session saved'
        });
    } catch (error) {
        console.error('[Backend] Error saving recording session:', error);
        return res.status(500).json({
            success: false,
            error: 'Error saving recording session: ' + error.message
        });
    }
});

// Endpoint to save interactions
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
        
        // Use ServiceManager to save interactions
        const result = await serviceManager.saveInteractions(interactions, sessionId, userId);
        
        console.log(`[Backend] Saved ${result.saved} interactions for session ${sessionId}. Total: ${result.total}`);
        
        return res.json({
            success: true,
            count: result.saved,
            totalCount: result.total
        });
    } catch (error) {
        console.error('[Backend] Error saving interactions:', error);
        return res.status(500).json({
            success: false,
            error: 'Error saving interactions: ' + error.message
        });
    }
});

// Route to get extension recording status
router.get('/extension/recorder/status', async (req, res) => {
    try {
        const { userId } = req.query;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        const userStatus = await getUserStatus(userId);
        
        return res.json({
            success: true,
            ...userStatus
        });
    } catch (error) {
        console.error('[Backend] Error checking recording status:', error);
        return res.status(500).json({
            success: false,
            error: 'Error checking recording status: ' + error.message
        });
    }
});

// Route to start recording session
router.post('/extension/recorder/start', async (req, res) => {
    try {
        const { userId, sessionId, url, metadata } = req.body;
        
        if (!userId || !sessionId) {
            return res.status(400).json({
                success: false,
                error: 'User ID and Session ID are required'
            });
        }
        
        // Start the recording session using the service manager
        const session = await serviceManager.startRecording(userId, sessionId, {
            url,
            ...metadata
        });
        
        // Register the connection
        serviceManager.registerConnection(userId, sessionId);
        
        return res.json({
            success: true,
            message: 'Recording started',
            session
        });
    } catch (error) {
        console.error('[Backend] Error starting recording:', error);
        return res.status(500).json({
            success: false,
            error: 'Error starting recording: ' + error.message
        });
    }
});

// Route to stop recording session
router.post('/extension/recorder/stop', async (req, res) => {
    try {
        const { sessionId, reason } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID is required'
            });
        }
        
        // Stop the recording session using the service manager
        const result = await serviceManager.stopRecording(sessionId, reason);
        
        return res.json({
            success: true,
            message: 'Recording stopped',
            interactionCount: result.interactionCount,
            session: result.session
        });
    } catch (error) {
        console.error('[Backend] Error stopping recording:', error);
        return res.status(500).json({
            success: false,
            error: 'Error stopping recording: ' + error.message
        });
    }
});

// Route to save interactions
router.post('/extension/recorder/interactions', async (req, res) => {
    try {
        const { interactions, sessionId, userId } = req.body;
        
        if (!interactions || !Array.isArray(interactions) || interactions.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Interactions array is required and cannot be empty'
            });
        }
        
        if (!sessionId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID and User ID are required'
            });
        }
        
        // Check if session is active
        const isActive = await serviceManager.isSessionActive(sessionId);
        
        if (!isActive) {
            return res.status(400).json({
                success: false,
                error: 'Cannot save interactions - session is not active'
            });
        }
        
        // Save interactions using the service manager
        const result = await serviceManager.saveInteractions(interactions, sessionId, userId);
        
        return res.json({
            success: true,
            savedCount: result.saved,
            interactionCount: result.total
        });
    } catch (error) {
        console.error('[Backend] Error saving interactions:', error);
        return res.status(500).json({
            success: false,
            error: 'Error saving interactions: ' + error.message
        });
    }
});

// Route to complete recording session
router.post('/extension/recorder/complete', async (req, res) => {
    try {
        const { sessionId } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID is required'
            });
        }
        
        // Stop the recording session
        const result = await serviceManager.stopRecording(sessionId, 'completed');
        const session = result.session;
        
        return res.json({
            success: true,
            sessionId: sessionId,
            status: 'completed',
            interactionCount: result.interactionCount
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
        const { userId } = req.query;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        // Get sessions from database
        const userSessions = await db.getSessions({ userId });
        
        // Sort by startTime in descending order
        const sessions = userSessions.sort((a, b) => 
            new Date(b.startTime) - new Date(a.startTime)
        );
        
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

// Get interactions for a session
router.get('/extension/recorder/interactions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID is required'
            });
        }
        
        // Get interactions from database
        const interactions = await db.getInteractions({ sessionId });
        
        console.log(`[Backend] Retrieved ${interactions.length} interactions for session ${sessionId}`);
        
        return res.json({
            success: true,
            interactions: interactions,
            count: interactions.length
        });
    } catch (error) {
        console.error('[Backend] Error getting interactions:', error);
        return res.status(500).json({
            success: false,
            error: 'Error getting interactions: ' + error.message
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
        
        if (status === 'recording' && sessionId) {
            // Check if session exists, if not create it
            const isActive = await serviceManager.isSessionActive(sessionId);
            
            if (!isActive) {
                await serviceManager.startRecording(userId, sessionId, {
                    ...(sessionData || {}),
                    startTime: new Date()
                });
            }
        } else if (status === 'idle' && sessionId) {
            // Stop recording if it was active
            const isActive = await serviceManager.isSessionActive(sessionId);
            
            if (isActive) {
                await serviceManager.stopRecording(sessionId, 'user_stopped');
            }
        }
        
        // Get updated status
        const userStatus = await getUserStatus(userId);
        
        return res.json({
            success: true,
            ...userStatus
        });
    } catch (error) {
        console.error('[Backend] Error updating recording status:', error);
        return res.status(500).json({
            success: false,
            error: 'Error updating recording status: ' + error.message
        });
    }
});

// Route to clear interactions for a session
router.post('/extension/recorder/clear', async (req, res) => {
    try {
        const { sessionId, userId } = req.body;
        
        if (!sessionId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Session ID and User ID are required'
            });
        }
        
        // Check if session exists
        const isActive = await serviceManager.isSessionActive(sessionId);
        
        if (!isActive) {
            return res.status(400).json({
                success: false,
                error: 'Session does not exist or is not active'
            });
        }
        
        // Delete all interactions for this session
        const interactionFilter = { sessionId };
        // Note: In a real implementation, you would add a method to serviceManager
        // to properly delete interactions. For now, we'll use the db directly.
        await db.deleteInteractions(interactionFilter);
        
        return res.json({
            success: true,
            message: 'Interactions cleared for session'
        });
    } catch (error) {
        console.error('[Backend] Error clearing interactions:', error);
        return res.status(500).json({
            success: false,
            error: 'Error clearing interactions: ' + error.message
        });
    }
});

// Route to reset all recording data for a user
router.post('/extension/recorder/reset', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'User ID is required'
            });
        }
        
        // Get all active sessions for this user
        const userSessions = await db.getSessions({ 
            userId, 
            status: 'active' 
        });
        
        // Stop all active sessions
        for (const session of userSessions) {
            await serviceManager.stopRecording(session.id, 'user_reset');
        }
        
        // Delete all interactions for this user
        // Note: In a real implementation, you would add a method to serviceManager
        // to properly delete a user's data. For now, we'll use the db directly.
        await db.deleteInteractions({ userId });
        
        return res.json({
            success: true,
            message: 'Recording data reset for user'
        });
    } catch (error) {
        console.error('[Backend] Error resetting recording data:', error);
        return res.status(500).json({
            success: false,
            error: 'Error resetting recording data: ' + error.message
        });
    }
});

module.exports = router; 