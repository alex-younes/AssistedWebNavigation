/**
 * Global configuration for the DOM Visualizer frontend
 */

// API Base URL for backend communication
export const API_BASE_URL = 'http://localhost:3001/api';

// Polling interval (in ms) for checking interaction updates
export const INTERACTION_POLLING_INTERVAL = 500;

// Extension ID (for explicit communication from frontend)
// Note: Change this if your extension ID is different
export const EXTENSION_ID = null; // Set to null to use runtime messaging within the same extension

// Debug mode (enables detailed logging)
export const DEBUG_MODE = true;

// Update your frontend config to point to the extension endpoints
const config = {
  API_BASE_URL: 'http://localhost:3001/api',
  EXTENSION_ROUTES: {
    CAPTURE: '/extension/capture',
    INTERACTIONS: '/extension/interactions'
  },
  // other configuration...
};

export default config; 