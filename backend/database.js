// Database module for MongoDB connection and operations
const mongoose = require('mongoose');
require('dotenv').config();
const debug = require('./utils/debug');
const DOMState = require('./models/DOMState');
const NonTransitionalEvents = require('./models/NonTransitionalEvents');

// MongoDB connection
const connectToDatabase = async () => {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/fypTracker';
    await mongoose.connect(mongoURI);
    console.log('[Database] Connected to MongoDB');
  } catch (error) {
    console.error('[Database] Connection error:', error);
    throw error;
  }
};

// Define schemas
const interactionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  userId: { type: String, required: true },
  type: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  stateId: { type: String },
  targetElement: mongoose.Schema.Types.Mixed,
  details: mongoose.Schema.Types.Mixed,
  url: String
}, { timestamps: true });

const sessionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  status: { type: String, enum: ['active', 'completed', 'error'], default: 'active' },
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// Create models
const Interaction = mongoose.model('Interaction', interactionSchema);
const Session = mongoose.model('Session', sessionSchema);

// Database operations
const db = {
  async connect() {
    try {
      const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/fypTracker';
      await mongoose.connect(uri);
      console.log('[Database] Connected to MongoDB');
      return true;
    } catch (error) {
      console.error('[Database] Connection error:', error);
      throw error;
    }
  },

  async saveInteraction(interaction) {
    console.log('[Database] Saving interaction:', interaction.type);
    const doc = new Interaction(interaction);
    const saved = await doc.save();
    return saved;
  },
  
  async saveInteractions(interactions) {
    if (!interactions || interactions.length === 0) return [];
    console.log(`[Database] Saving ${interactions.length} interactions`);
    return await Interaction.insertMany(interactions);
  },

  async getInteractions(query = {}) {
    return await Interaction.find(query).sort({ timestamp: 1 });
  },
  
  async getInteractionsByState(stateId) {
    return await Interaction.find({ stateId }).sort({ timestamp: 1 });
  },
  
  async deleteInteractions(query = {}) {
    return await Interaction.deleteMany(query);
  },

  async saveSession(session) {
    console.log('[Database] Saving session:', session.id);
    const doc = new Session(session);
    return await doc.save();
  },

  async getSessions(query = {}) {
    if (query.id) {
      return await Session.findOne({ id: query.id });
    }
    return await Session.find(query);
  },

  async getActiveSession(userId) {
    return await Session.findOne({ userId, status: 'active' });
  },

  async updateSession(sessionId, update) {
    console.log('[Database] Updating session:', sessionId);
    return await Session.findOneAndUpdate(
      { id: sessionId },
      update,
      { new: true }
    );
  },

  // DOM state operations
  async saveDOMState(state) {
    console.log('[Database] Saving DOM state:', state.stateId);
    const doc = new DOMState(state);
    const saved = await doc.save();
    return saved;
  },
  
  async saveDOMStates(states) {
    if (!states || states.length === 0) return [];
    console.log(`[Database] Saving ${states.length} DOM states`);
    return await DOMState.insertMany(states);
  },
  
  async getDOMStates(query = {}) {
    return await DOMState.find(query).sort({ timestamp: 1 });
  },
  
  async getDOMStateById(stateId) {
    return await DOMState.findOne({ stateId });
  },
  
  async getStateSequence(sessionId) {
    return await DOMState.find({ sessionId })
      .sort({ timestamp: 1 })
      .select('stateId url timestamp');
  },
  
  // New methods for working with loading states
  async getLoadingStates(sessionId) {
    return await DOMState.find({ 
      sessionId, 
      $or: [
        { stateId: { $regex: /^loading_/ } },
        { 'loadingInfo.isPartOfLoading': true }
      ]
    })
    .sort({ stateNumber: 1 });
  },
  
  async getFinalStates(sessionId) {
    return await DOMState.find({ 
      sessionId, 
      $and: [
        { stateId: { $not: { $regex: /^loading_/ } } },
        { 'loadingInfo.isPartOfLoading': { $ne: true } }
      ]
    })
    .sort({ stateNumber: 1 });
  },

  // Get states sorted by their decimal state number
  async getStatesByStateNumber(sessionId) {
    return await DOMState.find({ sessionId })
      .sort({ stateNumber: 1 });
  },

  // Group states by base state number (e.g., state 1.1 and 1.2 are grouped with state 1)
  async getStateGroups(sessionId) {
    const states = await DOMState.find({ sessionId }).sort({ stateNumber: 1 });
    
    // Group by the floor of state number (1.1 -> 1, 1.2 -> 1, etc)
    const stateGroups = {};
    
    states.forEach(state => {
      const baseStateNumber = Math.floor(state.stateNumber);
      
      if (!stateGroups[baseStateNumber]) {
        stateGroups[baseStateNumber] = [];
      }
      
      stateGroups[baseStateNumber].push(state);
    });
    
    return stateGroups;
  },
  
  async getStatesByPage(sessionId) {
    // Group states by their base state number to keep loading states with their final state
    const states = await DOMState.find({ sessionId }).sort({ stateNumber: 1 });
    
    // Group states by their base state ID
    const stateGroups = {};
    
    states.forEach(state => {
      let baseId = state.stateId;
      
      // Extract base state number from loading states (state_1_loading_2 -> state_1)
      if (state.stateId.includes('_loading_')) {
        baseId = state.stateId.split('_loading_')[0];
      } else if (state.stateId.includes('_')) {
        // For state_1_1234567890, extract state_1 as the base
        const parts = state.stateId.split('_');
        if (parts.length >= 3) {
          baseId = `${parts[0]}_${parts[1]}`;
        }
      }
      
      if (!stateGroups[baseId]) {
        stateGroups[baseId] = [];
      }
      
      stateGroups[baseId].push(state);
    });
    
    return stateGroups;
  },

  // Add database methods for non-transitional events
  // Create or update non-transitional events for a state
  async updateNonTransitionalEvents(stateId, sessionId, userId, dataToUpdate) {
    try {
      // Log what is about to be set/updated
      console.log(`[Database] updateNonTransitionalEvents for state ${stateId}. Data to update:`, 
                  { 
                    eventKeys: dataToUpdate.events ? Object.keys(dataToUpdate.events) : 'No events object provided to db', 
                    metricKeys: dataToUpdate.metrics ? Object.keys(dataToUpdate.metrics) : 'No metrics object provided to db' 
                  });
      // For more detailed logging if needed:
      // console.log('[Database] Detailed events for update:', JSON.stringify(dataToUpdate.events, null, 2));
      // console.log('[Database] Detailed metrics for update:', JSON.stringify(dataToUpdate.metrics, null, 2));

      // Corrected update logic:
      // We need to separate $push for arrays and $set/$inc for other fields.
      const pushOperations = {};
      const setOperations = {};
      const incOperations = {}; // For metrics we want to increment

      if (dataToUpdate.events) {
        for (const eventType in dataToUpdate.events) {
          const eventData = dataToUpdate.events[eventType];
          if (Array.isArray(eventData) && eventData.length > 0) {
            pushOperations[`events.${eventType}`] = { $each: eventData };
          } else if (eventType === 'mousemove' && typeof eventData === 'object' && eventData !== null) {
            // Always $set mousemove fields to avoid type issues with $inc on existing non-numeric types
            if (eventData.totalDistance !== undefined) setOperations['events.mousemove.totalDistance'] = eventData.totalDistance;
            if (eventData.averageSpeed !== undefined) setOperations['events.mousemove.averageSpeed'] = eventData.averageSpeed;
            if (eventData.heatmap !== undefined) setOperations['events.mousemove.heatmap'] = eventData.heatmap;
          } else if (typeof eventData === 'object' && eventData !== null && Object.keys(eventData).length > 0) {
             setOperations[`events.${eventType}`] = eventData; // For other potential object-based events
          }
        }
      }

      if (dataToUpdate.metrics) {
        for (const metricKey in dataToUpdate.metrics) {
          if (typeof dataToUpdate.metrics[metricKey] === 'number') {
            // ALWAYS USE $set for metrics to avoid type mismatch errors if existing data is an array.
            // If accumulation is needed, it must be handled before this db call.
            setOperations[`metrics.${metricKey}`] = dataToUpdate.metrics[metricKey];
          }
        }
      }

      const finalUpdate = {};
      if (Object.keys(pushOperations).length > 0) finalUpdate.$push = pushOperations;
      if (Object.keys(setOperations).length > 0) finalUpdate.$set = setOperations;
      if (Object.keys(incOperations).length > 0) finalUpdate.$inc = incOperations;
      finalUpdate.$setOnInsert = { stateId, sessionId, userId, createdAt: new Date() }; // Ensure these are set on creation
      finalUpdate.$set = { ...finalUpdate.$set, lastUpdated: new Date() }; // Always update lastUpdated

      if (Object.keys(finalUpdate).length <= 2) { // only $setOnInsert and $set for lastUpdated
        console.log(`[Database] No actual event or metric data to push/set/inc for state ${stateId}.`);
        // Still might want to upsert to ensure the document exists with timestamps if it's the first event batch for a state
        // return { message: 'No data to update', stateId, updated: false };
      }

      console.log('[Database] Final update for findOneAndUpdate:', JSON.stringify(finalUpdate, null, 2));

      const finalResult = await NonTransitionalEvents.findOneAndUpdate(
        { stateId, sessionId, userId },
        finalUpdate,
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );

      console.log(`[Database] Non-transitional events for state ${stateId} updated/created. Result ID: ${finalResult?._id}`);
      return { 
        message: 'Non-transitional events updated', 
        docId: finalResult?._id,
        stateId 
      };
    } catch (error) {
      console.error(`[Database] Error updating non-transitional events for state ${stateId}:`, error);
      throw error;
    }
  },

  // Get non-transitional events for a state
  async getNonTransitionalEvents(stateId, sessionId) {
    try {
      return await NonTransitionalEvents.findOne({ stateId, sessionId });
    } catch (error) {
      console.error(`[Database] Error getting non-transitional events for state ${stateId}:`, error);
      throw error;
    }
  },

  // Get all non-transitional events for a session
  async getNonTransitionalEventsBySession(sessionId) {
    try {
      return await NonTransitionalEvents.find({ sessionId }).sort({ createdAt: 1 });
    } catch (error) {
      console.error(`[Database] Error getting non-transitional events for session ${sessionId}:`, error);
      throw error;
    }
  }
};

module.exports = db; 