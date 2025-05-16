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
      _id: false,
      element: String,
      selector: String,
      name: String,
      duration: Number,
      timestamp: Date,
      eventMeaning: { type: String, default: "User hovered over element." }
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
      _id: false,
      field: String,
      key: String,
      timeSinceLast: Number,
      timestamp: Date,
      eventMeaning: { type: String, default: "Keystroke timing recorded." }
    }],
    keydownWithoutSubmit: [{
      _id: false,
      field: String,
      value: String,
      timestamp: Date,
      eventMeaning: { type: String, default: "Typed input, field then left." }
    }],
    escapeBackspace: [{
      _id: false,
      field: String,
      key: String,
      timestamp: Date,
      eventMeaning: { type: String, default: "Esc/Backspace key pressed." }
    }],
    tabNavigation: [{
      _id: false,
      sequence: [String],
      timestamp: Date,
      eventMeaning: { type: String, default: "Tab key navigation sequence." }
    }],
    repeatedClicks: [{
      _id: false,
      element: String,
      selector: String,
      count: Number,
      timestamp: Date,
      eventMeaning: { type: String, default: "Multiple rapid clicks detected." }
    }],
    repeatedInputs: [{
      _id: false,
      field: String,
      pattern: String,
      timestamp: Date,
      eventMeaning: { type: String, default: "Repeated input pattern detected." }
    }],
    oscillatingHovers: [{
      _id: false,
      elements: [{
        element: String,
        selector: String, 
        occurrences: Number
      }],
      totalSwitches: Number,
      duration: Number,
      timestamp: Date,
      hoverPattern: [String],
      eventMeaning: { type: String, default: "Rapid back-and-forth hovers." }
    }],
    inactivity: [{
      _id: false,
      duration: Number,
      timestamp: Date,
      trigger: String,
      eventMeaning: { type: String, default: "User inactivity period detected." }
    }],
    inputFieldIdle: [{
      _id: false,
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
      timestamp: Date,
      eventMeaning: { type: String, default: "No input in focused field." }
    }],
    pasteWithoutTyping: [{
      _id: false,
      field: String,
      content: String,
      timestamp: Date,
      eventMeaning: { type: String, default: "Pasted content into field." }
    }],
    copyText: [{
      _id: false,
      text: String,
      source: String,
      timestamp: Date,
      eventMeaning: { type: String, default: "Text copied from page." }
    }],
    allKeyPresses: [{
      _id: false,
      key: String,
      timestamp: Date,
      targetElementTag: String,
      targetElementId: String,
      targetElementPath: String,
      isInputField: Boolean,
      fieldIdentifier: String,
      eventMeaning: { type: String, default: "Individual key press recorded." }
    }],
    deadClicks: [{
      _id: false,
      timestamp: Date,
      targetElementTag: String,
      targetElementId: String,
      targetElementPath: String,
      targetElementFriendlyName: String,
      clientX: Number,
      clientY: Number,
      eventMeaning: { type: String, default: "Clicked on a non-interactive element." }
    }],
    scrollEvents: [{
      _id: false,
      timestamp: Date,
      targetElementTag: String,
      targetElementId: String,
      targetElementPath: String,
      scrollX: Number,
      scrollY: Number,
      scrollDepthX: Number,
      scrollDepthY: Number,
      maxScrollX: Number,
      maxScrollY: Number,
      viewportWidth: Number,
      viewportHeight: Number,
      eventMeaning: { type: String, default: "User scrolled the page or an element." }
    }],
    dropdownToggle: [{
      _id: false,
      timestamp: Date,
      elementTag: String,
      elementId: String,
      elementPath: String,
      newState: String,
      eventMeaning: { type: String, default: "Dropdown toggled." }
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