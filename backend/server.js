const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
require('dotenv').config();

const debug = require('./utils/debug');
const { PORT, CORS_CONFIG } = require('./config/constants');
const browserRoutes = require('./routes/browserRoutes');
const recorderRoutes = require('./routes/recorderRoutes');
const extensionRoutes = require('./routes/extensionRoutes');

const app = express();

// Get local IP address
const getLocalIpAddress = () => {
    const interfaces = os.networkInterfaces();
    
    // First try Wi-Fi adapter with typical home network IP
    const wifi = interfaces['Wi-Fi'];
    if (wifi) {
        for (const addr of wifi) {
            if (addr.family === 'IPv4' && !addr.internal) {
                // Check if it's a typical home network IP (192.168.0.x or 192.168.1.x)
                if (addr.address.match(/^192\.168\.[0-1]\.\d+$/)) {
                    return addr.address;
                }
            }
        }
    }
    
    // Then try other interfaces but avoid VM addresses
    for (const interfaceName of Object.keys(interfaces)) {
        const iface = interfaces[interfaceName];
        for (const addr of iface) {
            if (addr.family === 'IPv4' && !addr.internal) {
                // Skip virtual machine and VMware IPs
                if (!addr.address.match(/^192\.168\.(56|17|255)\.\d+$/)) {
                    return addr.address;
                }
            }
        }
    }
    
    return 'localhost';
};

// Enable CORS for all routes
app.use(cors(CORS_CONFIG));

// Add OPTIONS handler for preflight requests
app.options('*', cors(CORS_CONFIG));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Parse JSON bodies
app.use(express.json({ limit: '50mb' })); // Increased limit for DOM content

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Mount routes
app.use('/api', browserRoutes);
app.use('/api', recorderRoutes);
app.use('/api', extensionRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Backend][Error]', err);
    res.status(500).json({ 
        error: 'Internal server error',
        details: process.env.DEBUG === 'true' ? err.message : undefined
    });
});

const localIp = getLocalIpAddress();
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n=== Server Started ===');
    console.log('\nCopy one of these URLs for the extension:');
    console.log('\x1b[36m%s\x1b[0m', `➜ ${localIp}:${PORT}`);
    console.log('\x1b[36m%s\x1b[0m', `➜ http://${localIp}:${PORT}`);
    
    console.log('\nAvailable network interfaces:');
    const interfaces = os.networkInterfaces();
    Object.keys(interfaces).forEach((name) => {
        interfaces[name].forEach((addr) => {
            if (addr.family === 'IPv4') {
                console.log(`  ${name}: ${addr.address}`);
            }
        });
    });
    
    console.log('\nAPI Health Check:');
    console.log('\x1b[36m%s\x1b[0m', `➜ http://${localIp}:${PORT}/health`);
    
    debug('Debug mode is enabled');
});