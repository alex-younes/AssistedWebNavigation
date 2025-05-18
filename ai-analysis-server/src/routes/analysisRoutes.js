const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');
const { performComprehensiveAnalysis } = require('../services/analysisOrchestrator');

/**
 * @route POST /api/analysis/session
 * @desc Analyze a single session
 */
router.post(
  '/session',
  analysisController.analyzeSession
);

/**
 * @route POST /api/analysis/batch
 * @desc Analyze multiple sessions (generic batch)
 */
router.post(
  '/batch',
  analysisController.analyzeBatchSessions
);

/**
 * @route POST /api/analysis/compare
 * @desc Compare different session groups (generic comparison)
 */
router.post(
  '/compare',
  analysisController.compareSessions
);

/**
 * @route POST /api/analysis/user-sessions-comparison
 * @desc Perform a comparative analysis of all sessions for a single user
 */
router.post(
  '/user-sessions-comparison',
  analysisController.handleUserSessionsComparison
);

/**
 * @route POST /api/analysis/user/:userId
 * @desc Perform comprehensive multi-model analysis using the orchestrator
 */
router.post('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }
    
    console.log(`Received analysis request for user ${userId}`);
    
    const startTime = Date.now();
    
    // Perform the comprehensive analysis
    const result = await performComprehensiveAnalysis(userId);
    
    if (!result.report) {
      return res.status(500).json({ 
        success: false, 
        message: 'Analysis failed to generate report' 
      });
    }
    
    // Convert modelsUsed array format if needed
    let formattedModels = result.modelsUsed;
    if (Array.isArray(result.modelsUsed) && typeof result.modelsUsed[0] === 'string') {
      // Convert from string[] to array of objects
      formattedModels = result.modelsUsed.map(model => ({
        stage: 'analysis',
        model: model
      }));
    }
    
    const analysisTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    return res.json({
      success: true,
      userId,
      report: result.report,
      reportLength: result.reportLength,
      modelsUsed: formattedModels,
      stageResults: {
        metrics: result.stageResults?.stage1,
        behavioral: result.stageResults?.stage2,
        progression: result.stageResults?.stage3,
        temporal: result.stageResults?.stage4
      },
      analysisTime,
      _meta: result._meta
    });
    
  } catch (error) {
    console.error('Error analyzing user sessions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to analyze user sessions',
      error: error.message
    });
  }
});

module.exports = router; 