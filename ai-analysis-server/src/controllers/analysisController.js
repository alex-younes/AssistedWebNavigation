const aiAnalysisService = require('../services/aiAnalysisService');

/**
 * Analyze a single user session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.analyzeSession = async (req, res) => {
  try {
    const { session, analysisType = 'comprehensive' } = req.body;
    
    // Validate input (basic validation, more complex in middleware)
    if (!session) {
      return res.status(400).json({ error: 'Session data is required' });
    }
    
    const result = await aiAnalysisService.analyzeSession(session, analysisType);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in analyzeSession controller:', error);
    return res.status(500).json({ 
      error: 'Failed to analyze session',
      details: error.message 
    });
  }
};

/**
 * Analyze multiple sessions in batch (generic)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.analyzeBatchSessions = async (req, res) => {
  try {
    const { sessions, analysisType = 'comprehensive', maxSessionsToAnalyze } = req.body;
    
    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({ error: 'Sessions array is required' });
    }
    
    const result = await aiAnalysisService.analyzeBatchSessions(sessions, {
      analysisType,
      maxSessionsToAnalyze
    });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in analyzeBatchSessions controller:', error);
    return res.status(500).json({ 
      error: 'Failed to analyze batch sessions',
      details: error.message 
    });
  }
};

/**
 * Compare different session groups (generic)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.compareSessions = async (req, res) => {
  try {
    const { sessionGroups, specializedPrompt } = req.body;
    
    if (!sessionGroups || !Array.isArray(sessionGroups) || sessionGroups.length < 2) {
      return res.status(400).json({ 
        error: 'At least two session groups are required for comparison' 
      });
    }
    
    const result = await aiAnalysisService.compareSessions(sessionGroups, specializedPrompt);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in compareSessions controller:', error);
    return res.status(500).json({ 
      error: 'Failed to compare session groups',
      details: error.message 
    });
  }
};

/**
 * Handle request for user sessions comparison analysis
 * This endpoint fetches all session data for a user from the main backend and performs comparison analysis.
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.handleUserSessionsComparison = async (req, res) => {
  try {
    const { userId } = req.body;

    // Basic validation
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    console.log(`[Controller] Received request for user sessions comparison for userId: ${userId}`);

    // Call the updated service function which now fetches session data itself
    const analysisResult = await aiAnalysisService.performUserSessionsComparison(userId);
    
    return res.status(200).json(analysisResult);
  } catch (error) {
    console.error('Error in handleUserSessionsComparison controller:', error);
    return res.status(500).json({
      error: 'Failed to perform user sessions comparison analysis',
      details: error.message
    });
  }
}; 