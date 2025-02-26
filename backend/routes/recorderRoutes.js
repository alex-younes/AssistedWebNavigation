const express = require('express');
const router = express.Router();
const browserService = require('../services/BrowserService');
const starRatingConfig = require('../config/starRatingConfig');

// Start recording
router.post('/startRecording', async (req, res) => {
    console.log('[Backend][API] Start recording request');
    try {
        const result = await browserService.startRecording();
        console.log('[Backend][API] Recording started at:', result.startTime);
        res.json(result);
    } catch (error) {
        console.error('[Backend][API] Start recording failed:', error);
        res.status(500).json({ error: error.message });
    }
});

// Save interaction
router.post('/saveInteraction', (req, res) => {
    console.log('[Backend][API] Received interaction:', JSON.stringify(req.body, null, 2));
    
    const { interaction } = req.body;
    if (!interaction) {
        console.error('[Backend][API] Invalid interaction data received');
        return res.status(400).json({ error: 'Invalid interaction data' });
    }

    try {
        const result = browserService.saveInteraction(interaction);
        res.json(result);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get interactions
router.get('/getInteractions', (req, res) => {
    console.log('[Backend][API] Get interactions request');
    const response = browserService.getInteractions();
    console.log('[Backend][API] Sending interactions:', response.interactions.length);
    res.json(response);
});

// Stop recording
router.post('/stopRecording', async (req, res) => {
    console.log('[Backend] Stop recording request received');
    
    const result = await browserService.stopRecording();
    console.log('[Backend] Total interaction count:', result.totalInteractions);
    
    const starRating = starRatingConfig.calculateStars(result.totalInteractions);
    console.log('[Backend] Calculated star rating:', starRating);
    
    const response = {
        ...result,
        starRating,
        debug: {
            interactionsCount: result.totalInteractions,
            finalStarRating: starRating
        }
    };
    
    console.log('[Backend] Sending response:', response);
    res.json(response);
});

// Get rating criteria
router.get('/getRatingCriteria', (req, res) => {
    res.json({
        levels: starRatingConfig.levels,
        default: starRatingConfig.defaultStars
    });
});

module.exports = router;