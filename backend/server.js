const express = require('express');
const cors = require('cors');
require('dotenv').config();

const debug = require('./utils/debug');
const { PORT, CORS_CONFIG } = require('./config/constants');
const browserRoutes = require('./routes/browserRoutes');
const recorderRoutes = require('./routes/recorderRoutes');
const extensionRoutes = require('./routes/extensionRoutes');

const app = express();

// Middleware
app.use(cors(CORS_CONFIG));
app.use(express.json({ limit: '50mb' })); // Increased limit for DOM content

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Routes
app.use('/api', browserRoutes);
app.use('/api', recorderRoutes);
app.use('/api/extension', extensionRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Backend][Error]', err);
    res.status(500).json({ 
        error: 'Internal server error',
        details: process.env.DEBUG === 'true' ? err.message : undefined
    });
});

// Add OPTIONS handler for preflight requests
app.options('*', cors());

app.listen(PORT, () => {
    console.log(`Backend server running on port ${PORT}`);
    debug('Debug mode is enabled');
});