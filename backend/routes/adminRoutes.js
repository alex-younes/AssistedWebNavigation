const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose'); // Import mongoose to access models
const UserActivityFeed = require('../models/UserActivityFeed'); // Import the UserActivityFeed model
// const authMiddleware = require('../middleware/authMiddleware'); // Assuming you might have or create this

// ### Placeholder for Authentication and Authorization Middleware ###
// In a real application, you would have robust middleware here.
// For this development phase, we'll rely on the client-side admin check 
// and assume that a proper backend auth check would be added for production.
const DUMMY_ensureAdmin = (req, res, next) => {
  // This is a placeholder. In a real app, you would check req.user (set by auth middleware)
  // For example: if (req.user && req.user.role === 'admin') {
  //   next();
  // } else {
  //   res.status(403).json({ error: 'Forbidden: Admin access required' });
  // }
  console.log('[Backend] adminRoutes: DUMMY_ensureAdmin - Bypassing actual admin check for development.');
  next(); // For now, allow all to pass for easier development of the endpoint
};

/**
 * @route   GET /api/admin/users
 * @desc    Get all users (for admin panel)
 * @access  Private (Admin)
 */
router.get('/users', DUMMY_ensureAdmin, async (req, res) => {
  try {
    // Fetch users, excluding the password field
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    console.error('[Backend] Error fetching users for admin:', error);
    res.status(500).json({ error: 'Server error while fetching users' });
  }
});

/**
 * @route   GET /api/admin/users/:userId/sessions
 * @desc    Get all sessions for a specific user (for admin panel)
 * @access  Private (Admin)
 */
router.get('/users/:userId/sessions', DUMMY_ensureAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const Session = mongoose.model('Session'); // Get the Session model from mongoose

    const sessions = await Session.find({ userId: userId }).sort({ startTime: -1 }); 

    // No need to check if !sessions, as find() returns [] if no documents match
    // and an error would be caught by the catch block if the query fails.

    res.json(sessions);
  } catch (error) {
    console.error(`[Backend] Error fetching sessions for user ${req.params.userId}:`, error);
    if (error.name === 'MissingSchemaError') {
        console.error('[Backend] adminRoutes: Session schema might not have been registered by Mongoose yet.');
        return res.status(500).json({ error: 'Server configuration error: Session model not found.' });
    }
    res.status(500).json({ error: 'Server error while fetching user sessions' });
  }
});

/**
 * @route   GET /api/admin/states/:stateId/nontransitional
 * @desc    Get non-transitional events for a specific state (for admin panel)
 * @access  Private (Admin)
 */
router.get('/states/:stateId/nontransitional', DUMMY_ensureAdmin, async (req, res) => {
  try {
    const { stateId } = req.params;
    // We might also need sessionId if the service/db layer strictly requires it for lookup.
    // For now, assuming stateId is unique enough or the service layer can handle it.
    // If sessionId is needed, it might have to be passed as a query parameter or in the body for a GET, which is not ideal.
    // Let's assume for now that stateId is sufficient for lookup by the service manager method.
    // The serviceManager.getNonTransitionalEventsByState actually expects both.
    // The frontend will need to know the sessionId of the state being queried.
    // We can pass it as a query param: /api/admin/states/:stateId/nontransitional?sessionId=...
    const { sessionId } = req.query;

    if (!stateId || !sessionId) {
      return res.status(400).json({ error: 'State ID and Session ID query parameter are required' });
    }

    const serviceManager = require('../services/ServiceManager'); // Ensure serviceManager is in scope
    const nonTransitionalEvents = await serviceManager.getNonTransitionalEventsByState(stateId, sessionId);

    if (!nonTransitionalEvents) {
      // If null is returned (meaning not found), send a 404
      return res.status(404).json({ message: 'Non-transitional events not found for this state.' });
    }

    res.json(nonTransitionalEvents);
  } catch (error) {
    console.error(`[Backend] Error fetching non-transitional events for state ${req.params.stateId}:`, error);
    if (error.message.includes('State ID and Session ID are required')) {
        return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error while fetching non-transitional events' });
  }
});

/**
 * @route   GET /api/admin/analysis/user/:userId
 * @desc    Analyze all sessions for a specific user
 * @access  Private (Admin)
 */
router.get('/analysis/user/:userId', DUMMY_ensureAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Use the serviceManager to analyze user sessions
    const serviceManager = require('../services/ServiceManager');
    const analysisResult = await serviceManager.analyzeUserSessions(userId);
    
    res.json(analysisResult);
  } catch (error) {
    console.error(`[Backend] Error analyzing sessions for user ${req.params.userId}:`, error);
    res.status(500).json({ error: 'Server error while analyzing user sessions' });
  }
});

/**
 * @route   GET /api/admin/analysis/session/:sessionId
 * @desc    Analyze a specific session
 * @access  Private (Admin)
 */
router.get('/analysis/session/:sessionId', DUMMY_ensureAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Use the serviceManager to analyze the session
    const serviceManager = require('../services/ServiceManager');
    const analysisResult = await serviceManager.analyzeSession(sessionId);
    
    res.json(analysisResult);
  } catch (error) {
    console.error(`[Backend] Error analyzing session ${req.params.sessionId}:`, error);
    res.status(500).json({ error: 'Server error while analyzing session' });
  }
});

/**
 * @route   GET /api/admin/sessions/:sessionId/activity
 * @desc    Get activity feed for a specific session
 * @access  Private (Admin)
 */
router.get('/sessions/:sessionId/activity', DUMMY_ensureAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 100, skip = 0, sort = 'desc' } = req.query;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Parse query parameters
    const parsedLimit = parseInt(limit) || 100;
    const parsedSkip = parseInt(skip) || 0;
    const sortDirection = sort === 'asc' ? 1 : -1;

    // Find activities for the session
    const activities = await UserActivityFeed.find({ sessionId })
      .sort({ timestamp: sortDirection })
      .skip(parsedSkip)
      .limit(parsedLimit);

    // Count total activities for pagination
    const totalActivities = await UserActivityFeed.countDocuments({ sessionId });

    res.json({
      activities,
      pagination: {
        total: totalActivities,
        limit: parsedLimit,
        skip: parsedSkip,
        sort: sort === 'asc' ? 'asc' : 'desc'
      }
    });
  } catch (error) {
    console.error(`[Backend] Error fetching activity feed for session ${req.params.sessionId}:`, error);
    res.status(500).json({ error: 'Server error while fetching activity feed' });
  }
});

/**
 * @route   POST /api/admin/sessions/:sessionId/activity
 * @desc    Add a manual activity entry to a session's feed
 * @access  Private (Admin)
 */
router.post('/sessions/:sessionId/activity', DUMMY_ensureAdmin, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId, eventType, interaction, details } = req.body;
    
    if (!sessionId || !userId || !eventType || !interaction) {
      return res.status(400).json({ 
        error: 'Session ID, user ID, event type, and interaction text are required' 
      });
    }

    // Create new activity entry
    const activity = new UserActivityFeed({
      sessionId,
      userId,
      eventType,
      interaction,
      details: details || {},
      timestamp: new Date()
    });

    // Save the activity
    await activity.save();

    // Emit the activity to connected clients
    const io = req.app.get('io');
    if (io) {
      io.to(`session:${sessionId}`).emit('activity', activity);
    }

    res.status(201).json({
      success: true,
      message: 'Activity added to feed',
      activity
    });
  } catch (error) {
    console.error(`[Backend] Error adding activity to session ${req.params.sessionId}:`, error);
    res.status(500).json({ error: 'Server error while adding activity' });
  }
});

// Add more admin-specific routes here later, e.g., for sessions by user

module.exports = router; 