/**
 * ServiceManager.js
 * Centralized service manager to handle state tracking and coordination
 * between extension and backend components
 */

const db = require('../database');
const debug = require('../utils/debug');

// In-memory recording status tracking (ephemeral)
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
      // Perform any initialization tasks
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
   * Unregister an extension connection
   * @param {string} connectionId - Connection ID
   */
  unregisterConnection(connectionId) {
    if (!connectionId) return false;
    
    if (activeConnections.has(connectionId)) {
      const connection = activeConnections.get(connectionId);
      console.log(`[ServiceManager] Unregistered connection ${connectionId} for user ${connection.userId}`);
      activeConnections.delete(connectionId);
      return true;
    }
    
    return false;
  }

  /**
   * Start recording for a user
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {Object} metadata - Session metadata
   */
  async startRecording(userId, sessionId, metadata = {}) {
    if (!userId || !sessionId) {
      throw new Error('User ID and Session ID are required');
    }
    
    try {
      // Create session in database
      const session = await db.saveSession({
        id: sessionId,
        userId,
        startTime: new Date(),
        status: 'active',
        metadata
      });
      
      // Track in memory
      activeRecordings.set(sessionId, {
        userId,
        startTime: new Date(),
        status: 'active'
      });
      
      console.log(`[ServiceManager] Started recording session ${sessionId} for user ${userId}`);
      return session;
    } catch (error) {
      console.error(`[ServiceManager] Error starting recording:`, error);
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
      // Get interaction count
      const interactions = await db.getInteractions({ sessionId });
      const interactionCount = interactions?.length || 0;
      
      // Update session in database
      const session = await db.updateSession(sessionId, {
        endTime: new Date(),
        status: 'completed',
        metadata: { 
          reason,
          interactionCount
        }
      });
      
      // Update in memory tracking
      if (activeRecordings.has(sessionId)) {
        activeRecordings.delete(sessionId);
      }
      
      console.log(`[ServiceManager] Stopped recording session ${sessionId} with ${interactionCount} interactions`);
      return { session, interactionCount };
    } catch (error) {
      console.error(`[ServiceManager] Error stopping recording:`, error);
      throw error;
    }
  }

  /**
   * Check if a session is active
   * @param {string} sessionId - Session ID
   */
  async isSessionActive(sessionId) {
    if (!sessionId) return false;
    
    // First check in-memory cache
    if (activeRecordings.has(sessionId)) {
      return activeRecordings.get(sessionId).status === 'active';
    }
    
    // Then check database
    try {
      const session = await db.getSessions({ id: sessionId });
      console.log(`[ServiceManager] Checking if session ${sessionId} is active. Result:`, session);
      
      // If the result is a single document (returned when querying by id)
      if (session && !Array.isArray(session)) {
        if (session.status === 'active') {
          // Update in-memory cache
          activeRecordings.set(sessionId, {
            userId: session.userId,
            startTime: session.startTime,
            status: 'active'
          });
          return true;
        }
        return false;
      }
      
      // If the result is an array (multiple sessions)
      if (Array.isArray(session) && session.length > 0) {
        const activeSession = session.find(s => s.status === 'active');
        if (activeSession) {
          // Update in-memory cache
          activeRecordings.set(sessionId, {
            userId: activeSession.userId,
            startTime: activeSession.startTime,
            status: 'active'
          });
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error(`[ServiceManager] Error checking session:`, error);
      return false;
    }
  }

  /**
   * Save interactions to the database
   * @param {Array} interactions - Array of interactions
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   */
  async saveInteractions(interactions, sessionId, userId) {
    if (!interactions || !sessionId || !userId) {
      throw new Error('Interactions, Session ID, and User ID are required');
    }
    
    console.log(`[ServiceManager] Saving ${interactions.length} interactions for session ${sessionId}`);
    
    // First check if session is active
    const isActive = await this.isSessionActive(sessionId);
    console.log(`[ServiceManager] Session ${sessionId} is active: ${isActive}`);
    
    if (!isActive) {
      // Try to create the session if it doesn't exist
      try {
        console.log(`[ServiceManager] Session ${sessionId} not active, creating new session`);
        await this.startRecording(userId, sessionId, {
          startTime: new Date(),
          autoCreated: true
        });
        console.log(`[ServiceManager] Created new session ${sessionId} for user ${userId}`);
      } catch (sessionCreateError) {
        console.error(`[ServiceManager] Failed to create session:`, sessionCreateError);
        throw new Error(`Session ${sessionId} is not active and could not be created`);
      }
    }
    
    try {
      const savedInteractions = [];
      
      // Process each interaction
      for (const interaction of interactions) {
        console.log(`[ServiceManager] Processing interaction: ${interaction.type}`);
        
        const formattedInteraction = {
          ...interaction,
          sessionId,
          userId,
          timestamp: interaction.timestamp || new Date().toISOString()
        };
        
        try {
          const savedInteraction = await db.saveInteraction(formattedInteraction);
          console.log(`[ServiceManager] Saved interaction ID: ${savedInteraction._id}`);
          savedInteractions.push(savedInteraction);
        } catch (saveError) {
          console.error(`[ServiceManager] Error saving individual interaction:`, saveError);
          console.error(`[ServiceManager] Failed interaction data:`, JSON.stringify(formattedInteraction));
        }
      }
      
      console.log(`[ServiceManager] Saved ${savedInteractions.length} interactions for session ${sessionId}`);
      
      // Get updated count
      const allInteractions = await db.getInteractions({ sessionId });
      return { 
        saved: savedInteractions.length,
        total: allInteractions.length
      };
    } catch (error) {
      console.error(`[ServiceManager] Error saving interactions:`, error);
      throw error;
    }
  }
}

// Create singleton instance
const manager = new ServiceManager();

// Export the singleton
module.exports = manager; 