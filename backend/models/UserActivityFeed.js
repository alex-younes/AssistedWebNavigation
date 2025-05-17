const mongoose = require('mongoose');

const UserActivityFeedSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    index: true // For faster queries by sessionId
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  interaction: { // Human-readable interaction description
    type: String,
    required: true
  },
  eventType: { // Type of event (e.g., 'click', 'hover', 'keyPress')
    type: String,
    required: true
  },
  details: { // Optional additional details about the interaction
    type: mongoose.Schema.Types.Mixed
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Create a compound index for efficient querying
UserActivityFeedSchema.index({ sessionId: 1, timestamp: -1 });

module.exports = mongoose.model('UserActivityFeed', UserActivityFeedSchema); 