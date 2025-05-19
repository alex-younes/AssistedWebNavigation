require('dotenv').config(); // Load environment variables from .env file

/**
 * AI Analysis Server - Main Entry Point
 * 
 * This file sets up the Express server for the AI analysis service,
 * configuring middleware, routes, and starting the server.
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

// Import controllers or routes
const analysisController = require('./controllers/analysisController');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3100;

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Basic route for health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'AI Analysis Server is running' });
});

// Analysis routes
app.post('/api/analysis/user/:userId', analysisController.analyzeUserSessions);

// Test route for backend connectivity
app.get('/test-connectivity', async (req, res) => {
  try {
    console.log('[Test] Testing backend connectivity by fetching user list');
    const axios = require('axios');
    const MAIN_BACKEND_URL = process.env.MAIN_BACKEND_URL || 'http://localhost:3001';
    const usersResponse = await axios.get(`${MAIN_BACKEND_URL}/api/admin/users`);
    const users = usersResponse.data;
    console.log('[Test] Users fetched from backend:', users.length || 'No count available');
    if (users && users.length > 0) {
      console.log('[Test] Sample user IDs:', users.slice(0, 5).map(u => u.userId || u.id || 'Unknown ID'));
      res.status(200).json({ status: 'OK', message: 'Connectivity test completed', userCount: users.length, sampleUsers: users.slice(0, 5) });
    } else {
      res.status(200).json({ status: 'OK', message: 'Connectivity test completed, but no users found', userCount: 0 });
    }
  } catch (error) {
    console.error('[Test] Connectivity test failed:', error.message);
    res.status(500).json({ status: 'Error', message: 'Connectivity test failed', error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`AI Analysis server listening on port ${PORT}`);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

module.exports = app; 