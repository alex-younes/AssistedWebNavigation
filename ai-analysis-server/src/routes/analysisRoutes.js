const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');

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

module.exports = router; 