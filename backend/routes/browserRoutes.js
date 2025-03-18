const express = require('express');
const router = express.Router();
const debug = require('../utils/debug');

// Note: These routes are deprecated. Please use the extension-based endpoints instead.
// See extensionRoutes.js for the new implementation.

// Analyze a webpage
router.post('/analyze', async (req, res) => {
    debug('Received analyze request');
    res.status(410).json({ 
        error: 'This endpoint is deprecated. Please use the extension-based endpoints instead.',
        message: 'See /extension/captures for DOM capture functionality'
    });
});

// Capture DOM
router.post('/captureDom', async (req, res) => {
    res.status(410).json({ 
        error: 'This endpoint is deprecated. Please use the extension-based endpoints instead.',
        message: 'See /extension/captures for DOM capture functionality'
    });
});

// Close browser
router.post('/closeBrowser', async (req, res) => {
    res.status(410).json({ 
        error: 'This endpoint is deprecated. Please use the extension-based endpoints instead.',
        message: 'Browser management is now handled by the extension'
    });
});

module.exports = router;