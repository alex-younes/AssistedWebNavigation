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

  /**
   * Get non-transitional events for a state
   * @param {string} stateId - State ID
   * @param {string} sessionId - Session ID
   */
  async getNonTransitionalEventsByState(stateId, sessionId) {
    if (!stateId || !sessionId) {
      debug('[ServiceManager] stateId and sessionId are required to fetch non-transitional events.');
      throw new Error('State ID and Session ID are required.');
    }
    debug(`[ServiceManager] Fetching non-transitional events for stateId: ${stateId}, sessionId: ${sessionId}`);
    try {
      const events = await db.getNonTransitionalEvents(stateId, sessionId);
      if (!events) {
        debug(`[ServiceManager] No non-transitional events found for stateId: ${stateId}, sessionId: ${sessionId}`);
        return null; // Or return an empty object/array as appropriate for the frontend
      }
      debug(`[ServiceManager] Successfully fetched non-transitional events for stateId: ${stateId}`);
      return events;
    } catch (error) {
      console.error(`[ServiceManager] Error fetching non-transitional events for stateId ${stateId}:`, error);
      throw error;
    }
  }

  async saveNonTransitionalEvents(eventsData) {
    if (!eventsData || !eventsData.stateId || !eventsData.sessionId || !eventsData.userId) {
      console.error('[ServiceManager] Missing required fields for saveNonTransitionalEvents:', eventsData);
      throw new Error('State ID, Session ID, and User ID are required for non-transitional events');
    }

    // Log received data structure
    console.log('[ServiceManager] Received saveNonTransitionalEvents with data:', 
                { 
                  stateId: eventsData.stateId, 
                  sessionId: eventsData.sessionId,
                  userId: eventsData.userId, 
                  eventKeys: eventsData.events ? Object.keys(eventsData.events) : 'No events object', 
                  metricKeys: eventsData.metrics ? Object.keys(eventsData.metrics) : 'No metrics object' 
                });
    // For more detailed logging if needed:
    // console.log('[ServiceManager] Detailed events:', JSON.stringify(eventsData.events, null, 2));
    // console.log('[ServiceManager] Detailed metrics:', JSON.stringify(eventsData.metrics, null, 2));

    try {
      const result = await db.updateNonTransitionalEvents(
        eventsData.stateId,
        eventsData.sessionId,
        eventsData.userId,
        { events: eventsData.events, metrics: eventsData.metrics } // Pass events and metrics objects directly
      );
      return { success: true, ...result };
    } catch (error) {
      console.error(`[ServiceManager] Error in saveNonTransitionalEvents for state ${eventsData.stateId}:`, error);
      throw error;
    }
  }

  /**
   * Analyze all sessions for a user
   * @param {string} userId - User ID
   * @returns {Object} Analysis results
   */
  async analyzeUserSessions(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }
    
    try {
      console.log(`[ServiceManager] Analyzing sessions for user ${userId}`);
      
      // In a production environment, this would:
      // 1. Fetch all user sessions from the database
      // 2. For each session, fetch states and non-transitional events
      // 3. Process data into a format suitable for the LLM
      // 4. Send to LLM API for analysis
      // 5. Process and return the results
      
      // For now, return mock data
      return {
        userId,
        summary: "This user appears to be a moderately experienced user who navigates efficiently but occasionally struggles with form submissions. They spend most time on the preferences and dashboard sections.",
        keyInsights: [
          "User typically spends 2-3 minutes per session",
          "Most active between 2pm and 5pm",
          "Navigates through menu options systematically",
          "Revisits the preferences page frequently"
        ],
        struggles: [
          "Repeated form submission errors on the contact page",
          "Multiple attempts needed on dropdown selections",
          "Difficulty with multi-step processes",
          "Gets stuck periodically when trying to save changes"
        ],
        behaviors: [
          "Often hovers extensively before clicking",
          "Uses keyboard shortcuts frequently",
          "Takes time to read content thoroughly",
          "Tends to navigate back and forth between related pages"
        ],
        suggestions: [
          "Simplify the form submission process",
          "Add more explicit instructions for multi-step processes",
          "Consider adding tooltips for complex interface elements",
          "Improve validation feedback on form errors"
        ],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[ServiceManager] Error analyzing sessions for user ${userId}:`, error);
      throw error;
    }
  }
  
  /**
   * Analyze a specific session
   * @param {string} sessionId - Session ID
   * @returns {Object} Analysis results
   */
  async analyzeSession(sessionId) {
    if (!sessionId) {
      throw new Error('Session ID is required');
    }
    
    try {
      console.log(`[ServiceManager] Analyzing session ${sessionId}`);
      
      // In a production environment, this would:
      // 1. Fetch the session data from the database
      // 2. Fetch all states and non-transitional events for this session
      // 3. Process data into a format suitable for the LLM
      // 4. Send to LLM API for analysis
      // 5. Process and return the results
      
      // For now, return mock data
      const session = await db.getSessionById(sessionId);
      const userId = session ? session.userId : "unknown_user";
      
      return {
        sessionId,
        userId,
        summary: "This session shows a user exploring the preferences panel with some hesitation. The user appears to be looking for specific settings but struggled with finding the right options.",
        keyInsights: [
          "Session lasted approximately 5 minutes",
          "User explored multiple preference categories",
          "Several hover events before making selections",
          "Two form submission attempts"
        ],
        struggles: [
          "Difficulty locating the theme selection dropdown",
          "Multiple clicks on non-clickable elements",
          "Hesitation when filling form fields",
          "Backtracked several times through the navigation path"
        ],
        behaviors: [
          "Careful reading of options before selection",
          "Methodical navigation through form fields",
          "Uses tab navigation frequently",
          "Pause periods indicating decision making"
        ],
        suggestions: [
          "Make the theme selection more prominent",
          "Add visual cues for clickable elements",
          "Simplify the preferences layout",
          "Consider a guided setup option for new users"
        ],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`[ServiceManager] Error analyzing session ${sessionId}:`, error);
      throw error;
    }
  }
}

// Create and export singleton instance
const serviceManager = new ServiceManager();
module.exports = serviceManager; 