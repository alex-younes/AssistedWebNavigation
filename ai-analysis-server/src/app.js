const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { performComprehensiveAnalysis } = require('./services/analysisOrchestrator');

// Load environment variables from .env file
dotenv.config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3100;

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// API health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'AI Analysis server is running' });
});

// Main API endpoint for user session analysis
app.post('/api/analyze/user/:userId', async (req, res) => {
  const { userId } = req.params;
  
  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }
  
  try {
    console.log(`[API] Starting comprehensive analysis for user ${userId}`);
    const startTime = Date.now();
    
    // Call the orchestrator to perform the multi-stage analysis
    const analysisResults = await performComprehensiveAnalysis(userId);
    
    const totalTime = (Date.now() - startTime) / 1000;
    console.log(`[API] Analysis completed in ${totalTime.toFixed(2)} seconds`);
    
    if (!analysisResults.success && analysisResults.message) {
      // Still return a 200 but with an error message
      return res.status(200).json({
        success: false,
        message: analysisResults.message,
        userId
      });
    }
    
    return res.status(200).json({
      success: true,
      userId,
      report: analysisResults.report,
      reportLength: analysisResults.reportLength,
      modelsUsed: analysisResults.modelsUsed || [],
      analysisTime: totalTime.toFixed(2),
      _meta: analysisResults._meta || {}
    });
  } catch (error) {
    console.error(`[API] Error analyzing user ${userId}:`, error);
    
    // Return a friendly error response
    return res.status(500).json({
      success: false,
      error: error.message,
      message: `Failed to analyze user ${userId}: ${error.message}`,
      userId
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[API] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`[Server] AI Analysis server running on port ${PORT}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] Ready to accept requests`);
}); 