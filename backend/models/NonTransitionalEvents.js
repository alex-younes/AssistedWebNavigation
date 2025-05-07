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
      elements: [String],
      selectors: [String],
      count: Number,
      timestamp: Date
    }],
    inactivity: [{
      duration: Number,
      timestamp: Date,
      trigger: String
    }],
    readingTime: [{
      duration: Number,
      timestamp: Date
    }],
    formDwellTime: [{
      formId: String,
      duration: Number,
      timestamp: Date
    }],
    inputFieldIdle: [{
      field: String,
      duration: Number,
      timestamp: Date
    }],
    menuOpenCloseWithoutSelect: [{
      menu: String,
      timestamp: Date
    }],
    formFilledThenCleared: [{
      form: String,
      fields: [String],
      timestamp: Date
    }],
    modalOpenedThenCanceled: [{
      modal: String,
      timestamp: Date
    }],
    noCtaInteraction: [{
      cta: String,
      timestamp: Date
    }],
    interactionWithHiddenElement: [{
      element: String,
      selector: String,
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
    }],
    rapidContextSwitch: [{
      sequence: [String],
      timestamp: Date
    }],
    pauseBeforeSubmit: [{
      form: String,
      duration: Number,
      timestamp: Date
    }]
  },
  metrics: {
    totalIdleTime: { type: Number, default: 0 },
    longestIdlePeriod: { type: Number, default: 0 },
    dwellTimeBeforeAction: { type: Number, default: 0 },
    readingTime: { type: Number, default: 0 },
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