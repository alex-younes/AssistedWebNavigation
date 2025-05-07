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
  },

  // Add database methods for non-transitional events
  // Create or update non-transitional events for a state
  async updateNonTransitionalEvents(stateId, sessionId, userId, eventsData) {
    try {
      const NonTransitionalEvents = require('./models/NonTransitionalEvents');
      
      // Log all incoming event types and counts
      console.log(`[Database] Received non-transitional events for state ${stateId}:`,
        Object.keys(eventsData.events || {}).map(type => 
          `${type}: ${Array.isArray(eventsData.events[type]) ? 
            eventsData.events[type].length : 
            (type === 'keyTyping' ? 
              (eventsData.events[type]?.fields ? Object.keys(eventsData.events[type].fields).length : 0) : 
              'object')}`
        ).join(', ')
      );
      
      // Try to find existing document
      let document = await NonTransitionalEvents.findOne({ stateId, sessionId });
      
      if (!document) {
        // Create new document if none exists
        document = new NonTransitionalEvents({
          stateId,
          sessionId,
          userId,
          events: {}, // Will be populated in the update
          metrics: {}  // Will be populated in the update
        });
        console.log(`[Database] Created new non-transitional events document for state ${stateId}`);
      } else {
        console.log(`[Database] Found existing non-transitional events document for state ${stateId}`);
      }
      
      // Update the events and metrics based on the incoming data
      // This uses a deep merge approach for complex nested objects
      if (eventsData.events) {
        for (const [eventType, eventData] of Object.entries(eventsData.events)) {
          console.log(`[Database] Processing event type: ${eventType}`);
          
          // Special case for mousemove with 2D arrays that need careful handling
          if (eventType === 'mousemove' && typeof eventData === 'object') {
            if (!document.events.mousemove) {
              document.events.mousemove = {
                heatmap: [],
                pathPoints: [],
                totalDistance: 0,
                averageSpeed: 0
              };
            }
            
            // Handle pathPoints separately (2D array)
            if (eventData.pathPoints && Array.isArray(eventData.pathPoints)) {
              // Ensure pathPoints exists on document
              if (!document.events.mousemove.pathPoints) {
                document.events.mousemove.pathPoints = [];
              }
              
              // Add each point set as its own array
              eventData.pathPoints.forEach(pointSet => {
                if (Array.isArray(pointSet)) {
                  // Ensure each item is a number
                  const numericPointSet = pointSet.map(Number);
                  document.events.mousemove.pathPoints.push(numericPointSet);
                }
              });
            }
            
            // Handle heatmap separately (2D array)
            if (eventData.heatmap && Array.isArray(eventData.heatmap)) {
              // Ensure heatmap exists on document
              if (!document.events.mousemove.heatmap) {
                document.events.mousemove.heatmap = [];
              }
              
              // If the document heatmap is empty, initialize it
              if (document.events.mousemove.heatmap.length === 0 && eventData.heatmap.length > 0) {
                for (let i = 0; i < eventData.heatmap.length; i++) {
                  if (Array.isArray(eventData.heatmap[i])) {
                    document.events.mousemove.heatmap[i] = [...eventData.heatmap[i].map(Number)];
                  }
                }
              } 
              // Otherwise update the existing heatmap by adding values
              else if (document.events.mousemove.heatmap.length > 0 && eventData.heatmap.length > 0) {
                for (let i = 0; i < Math.min(document.events.mousemove.heatmap.length, eventData.heatmap.length); i++) {
                  const docRow = document.events.mousemove.heatmap[i];
                  const newRow = eventData.heatmap[i];
                  
                  if (Array.isArray(docRow) && Array.isArray(newRow)) {
                    for (let j = 0; j < Math.min(docRow.length, newRow.length); j++) {
                      docRow[j] += Number(newRow[j] || 0);
                    }
                  }
                }
              }
            }
            
            // Handle simple numeric properties
            if (typeof eventData.totalDistance === 'number') {
              document.events.mousemove.totalDistance += eventData.totalDistance;
            }
            
            if (typeof eventData.averageSpeed === 'number') {
              // Calculate new average based on current and new values
              const oldSpeed = document.events.mousemove.averageSpeed || 0;
              document.events.mousemove.averageSpeed = (oldSpeed + eventData.averageSpeed) / 2;
            }
          } 
          // Regular handling for other event types
          else if (Array.isArray(eventData)) {
            // If it's an array (like hover events), push new items
            if (!document.events[eventType]) {
              document.events[eventType] = [];
            }
            console.log(`[Database] Adding ${eventData.length} items to ${eventType} array`);
            document.events[eventType].push(...eventData);
          } 
          else if (typeof eventData === 'object') {
            // For objects with standard structure
            if (!document.events[eventType]) {
              document.events[eventType] = {};
            }
            
            // Process each property
            for (const [key, value] of Object.entries(eventData)) {
              if (Array.isArray(value)) {
                if (!document.events[eventType][key]) {
                  document.events[eventType][key] = [];
                }
                // Regular arrays can use push
                document.events[eventType][key].push(...value);
                console.log(`[Database] Added ${value.length} items to ${eventType}.${key} array`);
              } else if (typeof value === 'number' && document.events[eventType][key]) {
                document.events[eventType][key] += value;
                console.log(`[Database] Updated numeric value for ${eventType}.${key}`);
              } else {
                document.events[eventType][key] = value;
                console.log(`[Database] Set value for ${eventType}.${key}`);
              }
            }
          } 
          else {
            // For simple values, just replace
            document.events[eventType] = eventData;
            console.log(`[Database] Set simple value for ${eventType}`);
          }
        }
      }
      
      // Update metrics
      if (eventsData.metrics) {
        for (const [metricName, metricValue] of Object.entries(eventsData.metrics)) {
          if (typeof metricValue === 'number') {
            // For cumulative metrics, add to existing value
            if (['totalIdleTime', 'totalMouseDistance', 'totalKeystrokes', 'totalClicks', 'totalHoverTime'].includes(metricName)) {
              document.metrics[metricName] = (document.metrics[metricName] || 0) + metricValue;
            } 
            // For max metrics, take the max value
            else if (['longestIdlePeriod'].includes(metricName)) {
              document.metrics[metricName] = Math.max(document.metrics[metricName] || 0, metricValue);
            }
            // For other metrics, just replace if higher
            else {
              document.metrics[metricName] = metricValue;
            }
          } else {
            document.metrics[metricName] = metricValue;
          }
        }
      }
      
      // Update lastUpdated timestamp
      document.lastUpdated = new Date();
      
      await document.save();
      console.log(`[Database] Saved non-transitional events for state: ${stateId} with event types: ${Object.keys(document.events).join(', ')}`);
      
      return document;
    } catch (error) {
      console.error(`[Database] Error updating non-transitional events for state ${stateId}:`, error);
      throw error;
    }
  },

  // Get non-transitional events for a state
  async getNonTransitionalEvents(stateId, sessionId) {
    try {
      const NonTransitionalEvents = require('./models/NonTransitionalEvents');
      return await NonTransitionalEvents.findOne({ stateId, sessionId });
    } catch (error) {
      console.error(`[Database] Error getting non-transitional events for state ${stateId}:`, error);
      throw error;
    }
  },

  // Get all non-transitional events for a session
  async getNonTransitionalEventsBySession(sessionId) {
    try {
      const NonTransitionalEvents = require('./models/NonTransitionalEvents');
      return await NonTransitionalEvents.find({ sessionId }).sort({ createdAt: 1 });
    } catch (error) {
      console.error(`[Database] Error getting non-transitional events for session ${sessionId}:`, error);
      throw error;
    }
  }
};

module.exports = db; 