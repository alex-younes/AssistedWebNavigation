const aiAnalysisService = require('../services/aiAnalysisService');

/**
 * Analyze a single user session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.analyzeSession = async (req, res) => {
  try {
    const { session, analysisType = 'comprehensive' } = req.body;
    
    // Validate input
    if (!session) {
      return res.status(400).json({ error: 'Session data is required' });
    }
    
    // Call AI analysis service
    const result = await aiAnalysisService.analyzeSession(session, analysisType);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error analyzing session:', error);
    return res.status(500).json({ 
      error: 'Failed to analyze session',
      details: error.message 
    });
  }
};

/**
 * Analyze multiple sessions in batch
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.analyzeBatchSessions = async (req, res) => {
  try {
    const { sessions, analysisType = 'comprehensive', maxSessionsToAnalyze } = req.body;
    
    // Validate input
    if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
      return res.status(400).json({ error: 'Sessions array is required' });
    }
    
    // Call AI analysis service
    const result = await aiAnalysisService.analyzeBatchSessions(sessions, {
      analysisType,
      maxSessionsToAnalyze
    });
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error analyzing batch sessions:', error);
    return res.status(500).json({ 
      error: 'Failed to analyze sessions',
      details: error.message 
    });
  }
};

/**
 * Compare different session groups
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.compareSessions = async (req, res) => {
  try {
    const { sessionGroups, specializedPrompt } = req.body;
    
    // Validate input
    if (!sessionGroups || !Array.isArray(sessionGroups) || sessionGroups.length < 2) {
      return res.status(400).json({ 
        error: 'At least two session groups are required for comparison' 
      });
    }
    
    // Call AI analysis service
    const result = await aiAnalysisService.compareSessions(sessionGroups, specializedPrompt);
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error comparing sessions:', error);
    return res.status(500).json({ 
      error: 'Failed to compare sessions',
      details: error.message 
    });
  }
}; 