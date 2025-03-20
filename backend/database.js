// Database module for MongoDB connection and operations
const mongoose = require('mongoose');
require('dotenv').config();
const debug = require('./utils/debug');

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

// Define DOM State schema
const domStateSchema = new mongoose.Schema({
  stateId: { type: String, required: true },
  sessionId: { type: String, required: true },
  userId: { type: String, required: true },
  url: { type: String, required: true },
  pathname: { type: String }, // Store just the path part of URL for easier matching
  timestamp: { type: Date, default: Date.now },
  isNewState: { type: Boolean, default: true },
  stateNumber: { type: Number, default: 0 }, // Track sequential state number
  hash: { type: String, required: true }, // Using hash for more consistency with standard terms
  metrics: {
    domSize: { type: Number },
    elementCount: { type: Number },
    formElements: { type: Number },
    visibleElements: { type: Number }
  },
  title: { type: String }
}, { timestamps: true });

// Create models
const Interaction = mongoose.model('Interaction', interactionSchema);
const Session = mongoose.model('Session', sessionSchema);
const DOMState = mongoose.model('DOMState', domStateSchema);

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
  }
};

module.exports = db; 