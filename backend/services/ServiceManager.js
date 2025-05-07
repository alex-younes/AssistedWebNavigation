/**
 * ServiceManager.js
 * Centralized service manager to handle state tracking and coordination
 * between extension and backend components
 */

const db = require('../database');
const debug = require('../utils/debug');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');

// In-memory recording status tracking
const activeRecordings = new Map();
const activeConnections = new Map();

class ServiceManager {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize the service manager
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      console.log('[ServiceManager] Initializing...');
      
      // Load active sessions from database
      const activeSessions = await db.getSessions({ status: 'active' });
      console.log(`[ServiceManager] Found ${activeSessions.length} active sessions in database`);
      
      // Set them in our in-memory tracking
      activeSessions.forEach(session => {
        activeRecordings.set(session.id, {
          userId: session.userId,
          startTime: session.startTime,
          status: 'active'
        });
      });
      
      this.initialized = true;
      console.log('[ServiceManager] Initialization complete');
    } catch (error) {
      console.error('[ServiceManager] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Register an extension connection
   * @param {string} userId - User ID
   * @param {string} connectionId - Connection ID
   */
  registerConnection(userId, connectionId) {
    if (!userId || !connectionId) return false;
    
    activeConnections.set(connectionId, {
      userId,
      timestamp: new Date(),
      isActive: true
    });
    
    console.log(`[ServiceManager] Registered connection ${connectionId} for user ${userId}`);
    return true;
  }

  /**
   * Start recording for a user
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID (this is the new session being started)
   * @param {Object} metadata - Session metadata
   */
  async startRecording(userId, sessionId, metadata = {}) {
    if (!userId || !sessionId) {
      throw new Error('User ID and Session ID are required');
    }
    
    const newSessionStartTime = new Date();

    try {
      // Find and close any existing active sessions for this user
      const Session = mongoose.model('Session'); // Get Session model
      const existingActiveSessions = await Session.find({ userId: userId, status: 'active' });

      if (existingActiveSessions.length > 0) {
        console.log(`[ServiceManager] User ${userId} has ${existingActiveSessions.length} existing active session(s). Closing them.`);
        for (const oldSession of existingActiveSessions) {
          console.log(`[ServiceManager] Closing old active session ${oldSession.id} for user ${userId}.`);
          await db.updateSession(oldSession.id, {
            endTime: newSessionStartTime, // Or new Date() if preferred
            status: 'completed', // Or 'abandoned'
            'metadata.endReason': 'new_session_started'
          });
          activeRecordings.delete(oldSession.id); // Also remove from in-memory if present
        }
      }

      // Create the new session in database
      const newSession = await db.saveSession({
        id: sessionId,
        userId,
        startTime: newSessionStartTime,
        status: 'active',
        metadata
      });
      
      // Track the new session in memory
      activeRecordings.set(sessionId, {
        userId,
        startTime: newSession.startTime,
        status: 'active'
      });
      
      console.log(`[ServiceManager] Started new recording session ${sessionId} for user ${userId}`);
      return newSession;
    } catch (error) {
      console.error(`[ServiceManager] Error starting recording for ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Stop recording for a session
   * @param {string} sessionId - Session ID
   * @param {string} reason - Reason for stopping
   */
  async stopRecording(sessionId, reason = 'user_stopped') {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    try {
      // Update session in database
      const session = await db.updateSession(sessionId, {
        endTime: new Date(),
        status: 'completed',
        'metadata.endReason': reason
      });
      
      // Remove from in-memory tracking
      activeRecordings.delete(sessionId);
      
      console.log(`[ServiceManager] Stopped recording session ${sessionId}, reason: ${reason}`);
      return session;
    } catch (error) {
      console.error(`[ServiceManager] Error stopping recording for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a session is active
   * @param {string} sessionId - Session ID
   */
  async isSessionActive(sessionId) {
    if (!sessionId) return false;
    
    // Check in-memory first for performance
    if (activeRecordings.has(sessionId)) {
      return activeRecordings.get(sessionId).status === 'active';
    }
    
    // Fall back to database
    try {
      const session = await db.getSessions({ id: sessionId });
      return session && session.status === 'active';
    } catch (error) {
      console.error(`[ServiceManager] Error checking session ${sessionId} status:`, error);
      return false;
    }
  }

  /**
   * Get status for a user
   * @param {string} userId - User ID
   */
  async getUserStatus(userId) {
    if (!userId) return null;
    
    try {
      // Find user's active session
      const session = await db.getActiveSession(userId);
      
      return {
        status: session ? 'recording' : 'idle',
        userId,
        currentSession: session ? session.id : null
      };
    } catch (error) {
      console.error(`[ServiceManager] Error getting user status for ${userId}:`, error);
      return {
        status: 'idle',
        userId,
        currentSession: null
      };
    }
  }

  /**
   * Save interactions to database
   * @param {Array} interactions - Array of interaction objects
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   */
  async saveInteractions(interactions, sessionId, userId) {
    if (!interactions || interactions.length === 0) {
      return { success: true, count: 0 };
    }
    
    if (!sessionId || !userId) {
      throw new Error('Session ID and User ID are required');
    }
    
    try {
      // Check if session is active
      const isActive = await this.isSessionActive(sessionId);
      if (!isActive) {
        console.log(`[ServiceManager] Session ${sessionId} is not active, not saving interactions`);
        return { success: false, error: 'Session not active' };
      }
      
      // Make sure each interaction has session and user IDs
      const processedInteractions = interactions.map(interaction => ({
        ...interaction,
        sessionId,
        userId
      }));
      
      // Save to database
      await db.saveInteractions(processedInteractions);
      
      console.log(`[ServiceManager] Saved ${processedInteractions.length} interactions for session ${sessionId}`);
      return { success: true, count: processedInteractions.length };
    } catch (error) {
      console.error(`[ServiceManager] Error saving interactions for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Save DOM state to database
   * @param {Object} state - DOM state object
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   */
  async saveDOMState(state, sessionId, userId) {
    if (!state || !sessionId || !userId) {
      throw new Error('State, Session ID and User ID are required');
    }
    
    try {
      // Check if session is active
      const isActive = await this.isSessionActive(sessionId);
      if (!isActive) {
        console.log(`[ServiceManager] Session ${sessionId} is not active, not saving state`);
        return { success: false, error: 'Session not active' };
      }
      
      // Make sure state has session and user IDs
      const processedState = {
        ...state,
        sessionId,
        userId
      };
      
      // Save to database
      await db.saveDOMState(processedState);
      
      debug(`[ServiceManager] Saved DOM state ${processedState.stateId} for session ${sessionId}`);
      return { success: true, stateId: processedState.stateId };
    } catch (error) {
      console.error(`[ServiceManager] Error saving DOM state for ${sessionId}:`, error);
      throw error;
    }
  }

  // NEW: User Registration
  async registerUser(username, password) {
    debug('[ServiceManager] Attempting to register user:', username);
    try {
      // Check if user already exists
      const existingUser = await User.findOne({ username });
      if (existingUser) {
        debug('[ServiceManager] Registration failed: Username already exists -', username);
        return { success: false, message: 'Username already exists.' };
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Generate a unique userId
      const newUserId = `user_${uuidv4()}`;

      // Create new user
      const newUser = new User({
        username,
        password: hashedPassword,
        userId: newUserId
      });

      await newUser.save();
      debug('[ServiceManager] User registered successfully:', username, 'userId:', newUserId);
      return { 
        success: true, 
        userId: newUserId, 
        username: newUser.username // Return the stored username (might have been trimmed etc.)
      };

    } catch (error) {
      console.error('[ServiceManager] Error during user registration for:', username, error);
      // Log the specific error message if available
      const errorMessage = error.message || 'Internal server error during registration.';
      debug('[ServiceManager] Registration error details:', errorMessage);
      return { success: false, message: errorMessage };
    }
  }

  // NEW: User Login
  async loginUser(username, password) {
    debug('[ServiceManager] Attempting to login user:', username);
    try {
      // Find user by username
      const user = await User.findOne({ username });
      if (!user) {
        debug('[ServiceManager] Login failed: User not found -', username);
        return { success: false, message: 'Invalid credentials.' }; // Generic message for security
      }

      // Compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        debug('[ServiceManager] Login failed: Password mismatch for user -', username);
        return { success: false, message: 'Invalid credentials.' }; // Generic message
      }

      debug('[ServiceManager] User logged in successfully:', username, 'userId:', user.userId);
      return { 
        success: true, 
        userId: user.userId, 
        username: user.username 
      };

    } catch (error) {
      console.error('[ServiceManager] Error during user login for:', username, error);
      const errorMessage = error.message || 'Internal server error during login.';
      debug('[ServiceManager] Login error details:', errorMessage);
      return { success: false, message: errorMessage };
    }
  }
}

// Create and export singleton instance
const serviceManager = new ServiceManager();
module.exports = serviceManager; 