/**
 * Script to prepare a complete session dataset for AI analysis
 * This fetches session details, states, and non-transitional events 
 * and formats them into a single cohesive dataset for Stage 2 analysis
 * 
 * Usage: node prepare-session-for-analysis.js <sessionId>
 */

// Import required modules
const mongoose = require('mongoose');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Get session ID from command line arguments
const sessionId = process.argv[2];

if (!sessionId) {
  console.error('Error: Session ID is required');
  console.error('Usage: node prepare-session-for-analysis.js <sessionId>');
  process.exit(1);
}

// Define MongoDB schemas (simplified)
const SessionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  userId: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  status: { type: String, enum: ['active', 'completed', 'error'], default: 'active' },
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const DOMStateSchema = new mongoose.Schema({
  stateId: { type: String, required: true },
  sessionId: { type: String, required: true },
  url: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  stateNumber: { type: Number },
  sourceStateId: { type: String },
  // Additional fields can be simplified if not needed
}, { timestamps: true });

const NonTransitionalEventsSchema = new mongoose.Schema({
  stateId: { type: String, required: true, index: true },
  sessionId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  events: { type: mongoose.Schema.Types.Mixed },
  metrics: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now },
  lastUpdated: { type: Date, default: Date.now }
});

// Connect to MongoDB
async function connectToDatabase() {
  try {
    const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/fypTracker';
    await mongoose.connect(mongoURI);
    console.log('[Script] Connected to MongoDB');
  } catch (error) {
    console.error('[Script] MongoDB connection error:', error);
    process.exit(1);
  }
}

// Main function
async function prepareSessionData() {
  // Connect to database
  await connectToDatabase();
  
  // Register models
  const Session = mongoose.model('Session', SessionSchema);
  const DOMState = mongoose.model('DOMState', DOMStateSchema);
  const NonTransitionalEvents = mongoose.model('NonTransitionalEvents', NonTransitionalEventsSchema);
  
  try {
    console.log(`[Script] Preparing data for session: ${sessionId}`);
    
    // Step 1: Fetch the session details
    console.log('[Script] Fetching session details...');
    const session = await Session.findOne({ id: sessionId });
    
    if (!session) {
      console.error(`[Script] Session not found: ${sessionId}`);
      process.exit(1);
    }
    
    console.log(`[Script] Found session for user: ${session.userId}`);
    
    // Step 2: Fetch all states for this session
    console.log('[Script] Fetching states...');
    const states = await DOMState.find({ sessionId }).sort({ timestamp: 1 });
    
    console.log(`[Script] Found ${states.length} states`);
    
    // Step 3: Fetch all non-transitional events for this session
    console.log('[Script] Fetching non-transitional events...');
    const nonTransitionalEvents = await NonTransitionalEvents.find({ sessionId }).sort({ createdAt: 1 });
    
    console.log(`[Script] Found ${nonTransitionalEvents.length} non-transitional event documents`);
    
    // Step 4: Merge the non-transitional events into the corresponding states
    console.log('[Script] Merging data...');
    const statesWithEvents = states.map(state => {
      const stateObj = state.toObject();
      
      // Find the non-transitional events for this state
      const stateEvents = nonTransitionalEvents.find(e => e.stateId === state.stateId);
      
      // Attach the events to the state if found
      if (stateEvents) {
        stateObj.nonTransitionalEvents = stateEvents.events || {};
      } else {
        stateObj.nonTransitionalEvents = {};
      }
      
      return stateObj;
    });
    
    // Step 5: Create the complete session object with all states and events
    const completeSession = {
      ...session.toObject(),
      states: statesWithEvents
    };
    
    // Output to file in the current directory
    const outputPath = path.join(process.cwd(), `complete_session_${sessionId}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(completeSession, null, 2));
    
    console.log(`[Script] Complete session data saved to: ${outputPath}`);
    console.log('[Script] This file can be used directly with Stage 2 analysis in the AI analysis server.');
    console.log('[Script] Copy this file to: ai-analysis-server/data/');
    
    // Step 6: Create a stats overview for quick verification
    const stats = {
      sessionId: session.id,
      userId: session.userId,
      duration: session.endTime ? (new Date(session.endTime) - new Date(session.startTime)) / 1000 : 'Session not ended',
      stateCount: states.length,
      statesWithEvents: statesWithEvents.filter(s => Object.keys(s.nonTransitionalEvents).length > 0).length,
      eventSummary: {}
    };
    
    // Summarize event types across all states
    nonTransitionalEvents.forEach(doc => {
      if (doc.events) {
        Object.keys(doc.events).forEach(eventType => {
          if (!stats.eventSummary[eventType]) {
            stats.eventSummary[eventType] = 0;
          }
          
          // If the event is an array, count the items
          if (Array.isArray(doc.events[eventType])) {
            stats.eventSummary[eventType] += doc.events[eventType].length;
          } else if (typeof doc.events[eventType] === 'object') {
            // If it's an object (like mousemove), count it as 1
            stats.eventSummary[eventType] += 1;
          }
        });
      }
    });
    
    console.log('[Script] Session stats:');
    console.log(JSON.stringify(stats, null, 2));
    
    // Also save the stats
    const statsPath = path.join(process.cwd(), `stats_${sessionId}.json`);
    fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
    
    console.log(`[Script] Stats saved to: ${statsPath}`);
    process.exit(0);
  } catch (error) {
    console.error('[Script] Error preparing session data:', error);
    process.exit(1);
  }
}

// Run the function
prepareSessionData(); 