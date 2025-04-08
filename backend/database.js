// Database module for MongoDB connection and operations
const mongoose = require('mongoose');
require('dotenv').config();
const debug = require('./utils/debug');
const DOMState = require('./models/DOMState');

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
  }
};

module.exports = db; 