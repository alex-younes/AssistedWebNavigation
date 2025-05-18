const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');

/**
 * @route POST /api/analysis/session
 * @desc Analyze a single session
 */
router.post('/session', analysisController.analyzeSession);

/**
 * @route POST /api/analysis/batch
 * @desc Analyze multiple sessions
 */
router.post('/batch', analysisController.analyzeBatchSessions);

/**
 * @route POST /api/analysis/compare
 * @desc Compare different session groups
 */
router.post('/compare', analysisController.compareSessions);

module.exports = router; 