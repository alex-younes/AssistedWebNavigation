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
const authRoutes = require('./routes/authRoutes');
const db = require('./database');
const serviceManager = require('./services/ServiceManager');

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

// Test route for debugging
app.get('/api/test', (req, res) => {
    console.log('[Backend] Test route accessed');
    res.json({ success: true, message: 'Test route works!' });
});

// Direct save session route to bypass extensionRoutes mounting issues
app.post('/api/recorder/saveSession', async (req, res) => {
    console.log('[Backend] Direct saveSession route accessed');
    try {
        const { sessionId, userId, url, browser, metadata } = req.body;
        
        if (!sessionId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID or user ID'
            });
        }
        
        // Use ServiceManager to save session
        await serviceManager.startRecording(
            userId, 
            sessionId, 
            {
                url,
                browser,
                ...metadata
            }
        );
        
        console.log(`[Backend] Saved recording session direct route: ${sessionId} for user: ${userId}`);
        
        return res.json({
            success: true,
            sessionId,
            message: 'Recording session started'
        });
    } catch (error) {
        console.error('[Backend] Error in direct save session route:', error);
        return res.status(500).json({
            success: false,
            error: 'Error saving recording session: ' + error.message
        });
    }
});

// Direct DOM state save route to bypass extensionRoutes mounting issues
app.post('/api/states', async (req, res) => {
    console.log('[Backend] Direct states route accessed');
    try {
        const { 
            stateId, 
            sessionId, 
            userId, 
            url, 
            pathname, 
            timestamp, 
            isNewState, 
            stateNumber, 
            hash, 
            dom, 
            metrics, 
            title, 
            loadingInfo, 
            mutationInfo,
            interactionInfo,
            previousStateId,
            previousHash,
            timeSincePreviousState
        } = req.body;
        
        console.log(`[Backend] Received state: ${stateId}, hash: ${hash}, dom size: ${dom ? dom.length : 0} bytes, timeSincePreviousState: ${timeSincePreviousState}`);
        
        if (!hash || !dom) {
            return res.status(400).json({ error: 'Missing required fields: hash and dom are required' });
        }
        
        const DOMState = require('./models/DOMState');
        
        // Check for duplicate state - but don't return early, just set isDuplicate flag
        let isDuplicate = false;
        let existingState = null;
        
        existingState = await DOMState.findOne({ hash, sessionId });
        if (existingState) {
            console.log(`[Backend] Duplicate state detected with hash: ${hash}, will save with isNewState=false`);
            isDuplicate = true;
        }
        
        // Get the current state number for this session
        const lastState = await DOMState.findOne({ sessionId }).sort({ stateNumber: -1 });
        const nextStateNumber = lastState ? lastState.stateNumber + 1 : 0;
        
        // Determine if this is a loading state from the stateId format
        const isLoadingState = stateId && stateId.includes('loading_');
        
        // Create new state, even if it's a duplicate
        const state = new DOMState({
            stateId: stateId || `state_${Date.now()}`,
            sessionId,
            userId,
            url: url || req.headers.origin || 'unknown',
            pathname: pathname || new URL(url || req.headers.origin || 'http://unknown').pathname,
            timestamp: timestamp || new Date(),
            isNewState: isDuplicate ? false : (isNewState !== undefined ? isNewState : true), // Set to false for duplicates
            stateNumber: stateNumber !== undefined ? stateNumber : nextStateNumber,
            hash,
            previousStateId: previousStateId,
            previousHash: previousHash,
            timeSincePreviousState: timeSincePreviousState !== undefined ? timeSincePreviousState : 0,
            dom,
            metrics: metrics || {
                domSize: 0,
                elementCount: 0,
                formElements: 0,
                visibleElements: 0
            },
            title: title || '',
            // Add interaction info if present
            interactionInfo: interactionInfo || null,
            loadingInfo: {
                isNavigation: loadingInfo?.isNavigation || false,
                isInitial: loadingInfo?.isInitial || false,
                isReload: loadingInfo?.isReload || false,
                isFinalState: loadingInfo?.isFinalState || false,
                isPartOfLoading: isLoadingState || loadingInfo?.isPartOfLoading || false,
                loadTime: loadingInfo?.loadTime || 0,
                resourceCount: loadingInfo?.resourceCount || 0,
                resourceTypes: loadingInfo?.resourceTypes || {},
                errorCount: loadingInfo?.errorCount || 0,
                networkInfo: loadingInfo?.networkInfo || {},
                timestamp: loadingInfo?.timestamp || new Date()
            },
            mutationInfo: {
                count: mutationInfo?.count || 0,
                types: mutationInfo?.types || [],
                timestamp: mutationInfo?.timestamp || new Date()
            }
        });
        
        await state.save();
        console.log(`[Backend] Saved ${isDuplicate ? 'duplicate' : 'new'} state direct route: ${state.stateId} (hash: ${hash}, stateNumber: ${state.stateNumber}, isLoading: ${isLoadingState})`);
        
        res.status(201).json({ 
            stateId: state.stateId,
            isDuplicate: isDuplicate
        });
    } catch (error) {
        console.error('[Backend] Error saving state direct route:', error);
        res.status(500).json({ error: error.message });
    }
});

// Direct stop session route to bypass extensionRoutes mounting issues
app.post('/api/recorder/stopSession', async (req, res) => {
    console.log('[Backend] Direct stopSession route accessed');
    try {
        const { sessionId, userId, reason } = req.body;
        
        if (!sessionId) {
            return res.status(400).json({
                success: false,
                error: 'Missing session ID'
            });
        }
        
        // Use ServiceManager to stop session
        await serviceManager.stopRecording(sessionId, reason || 'user_stopped');
        
        console.log(`[Backend] Stopped recording session direct route: ${sessionId}`);
        
        return res.json({
            success: true,
            message: 'Recording session stopped'
        });
    } catch (error) {
        console.error('[Backend] Error in direct stop session route:', error);
        return res.status(500).json({
            success: false,
            error: 'Error stopping recording session: ' + error.message
        });
    }
});

// Direct non-transitional events route
app.post('/api/nontransitional-events', async (req, res) => {
    console.log('[Backend] Direct non-transitional events route accessed');
    try {
        const { stateId, sessionId, userId, events, metrics } = req.body;
        
        if (!stateId || !sessionId || !userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: stateId, sessionId, or userId'
            });
        }
        
        // Log event types being received
        console.log(`[Backend] Received non-transitional events for stateId ${stateId} with types:`, 
            Object.keys(events || {}).join(', '));
        
        // Log counts for each event type
        if (events) {
            const eventCounts = {};
            for (const [key, value] of Object.entries(events)) {
                if (Array.isArray(value)) {
                    eventCounts[key] = value.length;
                } else if (key === 'keyTyping' && value.fields) {
                    eventCounts[key] = Object.keys(value.fields).length;
                } else if (typeof value === 'object') {
                    eventCounts[key] = 'object';
                }
            }
            console.log(`[Backend] Event counts:`, JSON.stringify(eventCounts));
        }
        
        // Use database service to update non-transitional events
        const result = await db.updateNonTransitionalEvents(stateId, sessionId, userId, {
            events,
            metrics
        });
        
        console.log(`[Backend] Updated non-transitional events for state: ${stateId}`);
        
        return res.json({
            success: true,
            message: 'Non-transitional events saved successfully'
        });
    } catch (error) {
        console.error('[Backend] Error saving non-transitional events:', error);
        return res.status(500).json({
            success: false,
            error: 'Error saving non-transitional events: ' + error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Mount routes
app.use('/api/recorder', recorderRoutes);
app.use('/api/browser', browserRoutes);
app.use('/api/extension', extensionRoutes);
app.use('/api/auth', authRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('[Backend][Error]', err);
    res.status(500).json({ 
        error: 'Internal server error',
        details: process.env.DEBUG === 'true' ? err.message : undefined
    });
});

const localIp = getLocalIpAddress();

// Connect to database and initialize services before starting server
Promise.all([
  db.connect(),
  serviceManager.initialize()
])
  .then(() => {
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
  })
  .catch(err => {
    console.error('Failed to initialize server:', err);
    process.exit(1);
  });