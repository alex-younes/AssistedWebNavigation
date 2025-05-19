/**
 * Script to directly fetch non-transitional events from MongoDB for a specific session
 * Usage: node fetch-nontransitional-data.js <sessionId>
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
  console.error('Usage: node fetch-nontransitional-data.js <sessionId>');
  process.exit(1);
}

// Define MongoDB schema for NonTransitionalEvents (simplified version)
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
async function fetchNonTransitionalEvents() {
  // Connect to database
  await connectToDatabase();
  
  // Register model
  const NonTransitionalEvents = mongoose.model('NonTransitionalEvents', NonTransitionalEventsSchema);
  
  try {
    console.log(`[Script] Fetching non-transitional events for session: ${sessionId}`);
    
    // Query database for all non-transitional events for this session
    const events = await NonTransitionalEvents.find({ sessionId }).sort({ createdAt: 1 });
    
    if (!events || events.length === 0) {
      console.log('[Script] No non-transitional events found for this session');
      process.exit(0);
    }
    
    console.log(`[Script] Found ${events.length} non-transitional event documents`);
    
    // Format data as needed for Stage 2 analysis
    const formattedData = events.map(event => ({
      stateId: event.stateId,
      events: event.events || {},
      metrics: event.metrics || {}
    }));
    
    // Output to file in the current directory
    const outputPath = path.join(process.cwd(), `nontransitional_${sessionId}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(formattedData, null, 2));
    
    console.log(`[Script] Data saved to: ${outputPath}`);
    
    // Print a sample of event types from the first record
    if (events[0] && events[0].events) {
      console.log('[Script] Sample of event types in first document:');
      const eventTypes = Object.keys(events[0].events);
      console.log(eventTypes.join(', '));
    }
    
    process.exit(0);
  } catch (error) {
    console.error('[Script] Error fetching non-transitional events:', error);
    process.exit(1);
  }
}

// Run the function
fetchNonTransitionalEvents(); 