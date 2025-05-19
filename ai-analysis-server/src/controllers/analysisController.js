/**
 * Analysis Controller
 * 
 * This module handles incoming requests for user analysis, delegating the processing
 * to the analysis orchestrator.
 */

const { performBasicAnalysis } = require('../services/analysisOrchestrator');

/**
 * Handle request to analyze user sessions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function analyzeUserSessions(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const result = await performBasicAnalysis(userId);
    return res.status(result.success ? 200 : 500).json(result);
  } catch (error) {
    console.error(`[Controller] Error analyzing user sessions: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
}

module.exports = {
  analyzeUserSessions
}; 