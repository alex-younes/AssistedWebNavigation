const express = require('express');
const router = express.Router();
const { performBasicAnalysis, performStage2Analysis } = require('../services/analysisOrchestrator');

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
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }
    
    console.log(`Received Stage 2 analysis request for user ${userId}`);
    
    const startTime = Date.now();
    
    // Perform Stage 2 analysis
    const result = await performStage2Analysis(userId);
    
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
    console.error('Error analyzing user sessions (Stage 2):', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to perform Stage 2 analysis',
      error: error.message
    });
  }
});

module.exports = router; 