const express = require('express');
const router = express.Router();
const browserService = require('../services/BrowserService');
const debug = require('../utils/debug');

// Analyze a webpage
router.post('/analyze', async (req, res) => {
    debug('Received analyze request');
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        if (!browserService.browser) {
            debug('Launching new browser instance');
            await browserService.launchBrowser();
        }
        debug('Navigating to URL:', url);
        await browserService.navigateToUrl(url);
        res.json({ status: 'Browser launched, waiting for DOM capture request' });
    } catch (error) {
        console.error('Error in /analyze:', error);
        res.status(500).json({ error: error.message || 'Failed to launch browser' });
    }
});

// Capture DOM
router.post('/captureDom', async (req, res) => {
    try {
        debug('Attempting to capture DOM');
        if (!browserService.page) {
            debug('No active browser session found');
            return res.status(400).json({ error: 'No active browser session' });
        }

        const domTree = await browserService.captureDom();
        if (!domTree) {
            debug('Failed to capture DOM tree');
            return res.status(500).json({ error: 'Failed to capture DOM tree' });
        }

        debug('DOM capture successful');
        res.json(domTree);
    } catch (error) {
        console.error('Error capturing DOM:', error);
        res.status(500).json({ error: error.message || 'Failed to capture DOM' });
    }
});

// Close browser
router.post('/closeBrowser', async (req, res) => {
    try {
        debug('Attempting to close browser');
        await browserService.closeBrowser();
        debug('Browser closed successfully');
        res.json({ status: 'Browser closed' });
    } catch (error) {
        console.error('Error closing browser:', error);
        res.status(500).json({ error: error.message || 'Failed to close browser' });
    }
});

module.exports = router;