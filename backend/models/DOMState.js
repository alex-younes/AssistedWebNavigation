const mongoose = require('mongoose');

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
  dom: { type: String }, // Add the DOM field
  metrics: {
    domSize: { type: Number },
    elementCount: { type: Number },
    formElements: { type: Number },
    visibleElements: { type: Number }
  },
  title: { type: String },
  loadingInfo: {
    isNavigation: { type: Boolean, default: false },
    isInitial: { type: Boolean, default: false },
    isReload: { type: Boolean, default: false },
    isFinalState: { type: Boolean, default: false },
    isPartOfLoading: { type: Boolean, default: false }, // Add loading state info
    loadTime: { type: Number, default: 0 },
    resourceCount: { type: Number, default: 0 },
    resourceTypes: { type: Map, of: Number, default: {} },
    errorCount: { type: Number, default: 0 },
    networkInfo: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now }
  },
  mutationInfo: {
    count: { type: Number, default: 0 },
    types: [String],
    timestamp: { type: Date, default: Date.now }
  }
}, { timestamps: true });

// Create and export the model - check if it already exists first
const DOMState = mongoose.models.DOMState || mongoose.model('DOMState', domStateSchema);

module.exports = DOMState; 