const express = require('express');
const router = express.Router();
const { performBasicAnalysis, performStage2Analysis } = require('../services/analysisOrchestrator');
const analysisController = require('../controllers/analysisController');
const analysisOrchestrator = require('../services/analysisOrchestrator');

/**
 * @route POST /api/analysis/user/:userId
 * @desc Perform Stage 1 analysis (detailed event processing)
 */
router.post('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }
    
    console.log(`Received Stage 1 analysis request for user ${userId}`);
    
    const startTime = Date.now();
    
    // Perform Stage 1 analysis only
    const result = await performBasicAnalysis(userId);
    
    if (!result.report) {
      return res.status(500).json({ 
        success: false, 
        message: 'Stage 1 analysis failed to generate report' 
      });
    }
    
    const analysisTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    return res.json({
      success: true,
      userId,
      report: result.report,
      reportLength: result.reportLength,
      modelsUsed: [{ stage: 'Stage1', model: 'gemini-2.0-flash' }],
      analysisTime,
      analysisStagesCompleted: result.analysisStagesCompleted
    });
    
  } catch (error) {
    console.error('Error analyzing user sessions (Stage 1):', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to perform Stage 1 analysis',
      error: error.message
    });
  }
});

/**
 * @route POST /api/analysis/user/:userId/stage2
 * @desc Perform Stage 2 analysis (non-transitional event processing)
 */
router.post('/user/:userId/stage2', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }
    
    console.log(`Received Stage 2 analysis request for user ${userId}`);
    
    const startTime = Date.now();
    
    // Perform Stage 2 analysis
    const result = await analysisOrchestrator.performStage2Analysis(userId);
    
    if (!result.report) {
      return res.status(500).json({ 
        success: false, 
        message: 'Stage 2 analysis failed to generate report' 
      });
    }
    
    const analysisTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    return res.json({
      success: true,
      userId,
      report: result.report,
      reportLength: result.reportLength,
      modelsUsed: [{ stage: 'Stage2', model: 'gemini-2.0-flash' }],
      analysisTime,
      analysisStagesCompleted: result.analysisStagesCompleted
    });
    
  } catch (error) {
    console.error(`[Routes] Error in Stage 2 analysis route for userId ${req.params.userId}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to perform Stage 2 analysis' });
  }
});

// NEW ROUTE for Full (Stage 1 + Stage 2) analysis for a user
router.post('/user/:userId/full', async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID is required' });
    }

    console.log(`[Routes] Received request for full analysis for userId: ${userId}`);
    const result = await analysisOrchestrator.performFullAnalysis(userId);

    // The success flag in the result now indicates overall success of the full flow
    // or partial success if, for example, stage 1 passed but stage 2 failed.
    if (result.success || (result.stage1Report && !result.stage2Error)) { // Consider it a client-side success if stage 1 data is present
      res.json(result);
    } else {
      // Determine appropriate status code based on errors
      let statusCode = 500;
      if (result.stage1Error && !result.stage2Report) statusCode = 500; // Stage 1 failed outright
      else if (result.stage2Error) statusCode = 500; // Stage 2 specifically failed after Stage 1 success
      else if (result.error) statusCode = 500; // Generic error
      else if (!result.success) statusCode = 400; // General failure if not success

      res.status(statusCode).json(result);
    }
  } catch (error) {
    console.error(`[Routes] Error in full analysis route for userId ${req.params.userId}:`, error);
    res.status(500).json({ success: false, error: error.message || 'Failed to perform full analysis' });
  }
});

module.exports = router; 