// Simple in-memory database module
// This is a placeholder for a real database implementation

const mongoose = require('mongoose');
require('dotenv').config();
const debug = require('./utils/debug');

// In-memory storage
const storage = {
    interactions: [],
    sessions: [],
    domCaptures: [] // DOM captures are not yet implemented
};

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
  targetElement: mongoose.Schema.Types.Mixed,
  details: mongoose.Schema.Types.Mixed,
  url: String
}, { timestamps: true, strict: false });

const sessionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  status: { type: String, enum: ['active', 'completed', 'error'], default: 'active' },
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true, strict: false });

const domCaptureSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  content: { type: String, required: true }
}, { timestamps: true });

// Create models
const Interaction = mongoose.model('Interaction', interactionSchema);
const Session = mongoose.model('Session', sessionSchema);
const DOMCapture = mongoose.model('DOMCapture', domCaptureSchema);

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

  async getInteractions(query = {}) {
    return await Interaction.find(query).sort({ timestamp: 1 });
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

  async updateSession(sessionId, update) {
    console.log('[Database] Updating session:', sessionId);
    return await Session.findOneAndUpdate(
      { id: sessionId },
      update,
      { new: true }
    );
  },

  async saveDOMCapture(capture) {
    const doc = new DOMCapture(capture);
    return await doc.save();
  },

  async getDOMCaptures(query = {}) {
    return await DOMCapture.find(query).sort({ timestamp: 1 });
  }
};

module.exports = db; 