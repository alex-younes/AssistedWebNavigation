const mongoose = require('mongoose');

// Define a schema for the nested arrays 
const PointArraySchema = mongoose.Schema({
  type: [[Number]], 
  default: []
});

const NonTransitionalEventsSchema = new mongoose.Schema({
  stateId: {
    type: String,
    required: true,
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  events: {
    hover: [{
      element: String,
      selector: String,
      duration: Number,
      timestamp: Date
    }],
    mousemove: {
      heatmap: {
        type: [[Number]],
        default: []
      },
      totalDistance: {
        type: Number,
        default: 0
      },
      averageSpeed: {
        type: Number,
        default: 0
      }
    },
    keyTypingCadence: [{
      field: String,
      key: String,
      timeSinceLast: Number,
      timestamp: Date
    }],
    keydownWithoutSubmit: [{
      field: String,
      value: String,
      timestamp: Date
    }],
    escapeBackspace: [{
      field: String,
      key: String,
      timestamp: Date
    }],
    tabNavigation: [{
      sequence: [String],
      timestamp: Date
    }],
    repeatedClicks: [{
      element: String,
      selector: String,
      count: Number,
      timestamp: Date
    }],
    repeatedInputs: [{
      field: String,
      pattern: String,
      timestamp: Date
    }],
    oscillatingHovers: [{
      elements: [{
        element: String,
        selector: String, 
        occurrences: Number
      }],
      totalSwitches: Number,
      duration: Number,
      timestamp: Date,
      hoverPattern: [String]
    }],
    inactivity: [{
      duration: Number,
      timestamp: Date,
      trigger: String
    }],
    inputFieldIdle: [{
      field: String,
      label: String,
      placeholder: String,
      fieldType: String,
      formId: String,
      formName: String,
      url: String,
      page: String,
      eventType: String,
      duration: Number,
      valueChanged: Boolean,
      initialValue: String,
      currentValue: String,
      timestamp: Date
    }],
    pasteWithoutTyping: [{
      field: String,
      content: String,
      timestamp: Date
    }],
    copyText: [{
      text: String,
      source: String,
      timestamp: Date
    }]
  },
  metrics: {
    totalIdleTime: { type: Number, default: 0 },
    longestIdlePeriod: { type: Number, default: 0 },
    dwellTimeBeforeAction: { type: Number, default: 0 },
    totalMouseDistance: { type: Number, default: 0 },
    totalKeystrokes: { type: Number, default: 0 },
    totalClicks: { type: Number, default: 0 },
    totalHoverTime: { type: Number, default: 0 }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
});

// Ensure we have a compound index for efficient lookups
NonTransitionalEventsSchema.index({ sessionId: 1, stateId: 1 }, { unique: true });

module.exports = mongoose.model('NonTransitionalEvents', NonTransitionalEventsSchema); 