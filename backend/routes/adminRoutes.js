const express = require('express');
const router = express.Router();
const User = require('../models/User');
const mongoose = require('mongoose'); // Import mongoose to access models
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

// Add more admin-specific routes here later, e.g., for sessions by user

module.exports = router; 