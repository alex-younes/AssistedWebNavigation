const express = require('express');
const router = express.Router();

// Note: These routes are deprecated. Please use the extension-based endpoints instead.
// See extensionRoutes.js for the new implementation.

// Start recording
router.post('/startRecording', async (req, res) => {
    res.status(410).json({ 
        error: 'This endpoint is deprecated. Please use the extension-based endpoints instead.',
        message: 'See /extension/recorder/status for recording functionality'
    });
});

// Save interaction
router.post('/saveInteraction', (req, res) => {
    res.status(410).json({ 
        error: 'This endpoint is deprecated. Please use the extension-based endpoints instead.',
        message: 'See /extension/recorder/interactions for interaction handling'
    });
});

// Get interactions
router.get('/getInteractions', (req, res) => {
    res.status(410).json({ 
        error: 'This endpoint is deprecated. Please use the extension-based endpoints instead.',
        message: 'See /extension/recorder/interactions for interaction retrieval'
    });
});

// Stop recording
router.post('/stopRecording', async (req, res) => {
    res.status(410).json({ 
        error: 'This endpoint is deprecated. Please use the extension-based endpoints instead.',
        message: 'See /extension/recorder/status for recording control'
    });
});

module.exports = router;