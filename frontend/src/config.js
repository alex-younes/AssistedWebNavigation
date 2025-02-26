/**
 * Global configuration for the DOM Visualizer frontend
 */

// Get the API URLs from environment variables
const apiUrl = process.env.REACT_APP_API_URL;
const serverUrl = process.env.REACT_APP_SERVER_URL;
const wsUrl = process.env.REACT_APP_WS_URL;

if (!apiUrl || !serverUrl || !wsUrl) {
  console.error('Environment variables for API URLs are not set!');
}

// Polling interval (in ms) for checking interaction updates
export const INTERACTION_POLLING_INTERVAL = 500;

// Extension ID (for explicit communication from frontend)
// Note: Change this if your extension ID is different
export const EXTENSION_ID = null; // Set to null to use runtime messaging within the same extension

// Debug mode (enables detailed logging)
export const DEBUG_MODE = true;

// Update your frontend config to point to the extension endpoints
const config = {
  API_BASE_URL: apiUrl,
  SERVER_URL: serverUrl,
  WS_URL: wsUrl,
  EXTENSION_ROUTES: {
    CAPTURE: '/extension/capture',
    INTERACTIONS: '/extension/interactions'
  },
  // other configuration...
};

export default config; 