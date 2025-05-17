const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const debug = require('./utils/debug');
const { PORT, CORS_CONFIG } = require('./config/constants');
const browserRoutes = require('./routes/browserRoutes');
const recorderRoutes = require('./routes/recorderRoutes');
const extensionRoutes = require('./routes/extensionRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const db = require('./database');
const serviceManager = require('./services/ServiceManager');
const UserActivityFeed = require('./models/UserActivityFeed');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: CORS_CONFIG });

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[Socket.IO] New client connected: ${socket.id}`);

  // Join a session room to receive updates for a specific session
  socket.on('joinSession', (sessionId) => {
    if (!sessionId) return;
    
    socket.join(`session:${sessionId}`);
    console.log(`[Socket.IO] Client ${socket.id} joined session room: ${sessionId}`);
    
    // Emit recent activity history when joining
    UserActivityFeed.find({ sessionId })
      .sort({ timestamp: -1 })
      .limit(50)
      .then(activities => {
        socket.emit('activityHistory', activities.reverse());
      })
      .catch(err => {
        console.error('[Socket.IO] Error fetching activity history:', err);
      });
  });

  // Leave a session room
  socket.on('leaveSession', (sessionId) => {
    if (!sessionId) return;
    socket.leave(`session:${sessionId}`);
    console.log(`[Socket.IO] Client ${socket.id} left session room: ${sessionId}`);
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Client disconnected: ${socket.id}`);
  });
});

// Make io available to request handlers
app.set('io', io);

// Helper function to emit activity to session room and save to database
const emitAndSaveActivity = async (sessionId, userId, eventType, interaction, details = {}) => {
  if (!sessionId || !userId) return;
  
  const activity = new UserActivityFeed({
    sessionId,
    userId,
    eventType,
    interaction,
    details,
    timestamp: new Date()
  });

  try {
    await activity.save();
    io.to(`session:${sessionId}`).emit('activity', activity);
    return activity;
  } catch (err) {
    console.error('[Socket.IO] Error saving activity:', err);
    return null;
  }
};

// Expose emitAndSaveActivity globally
app.set('emitAndSaveActivity', emitAndSaveActivity);

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
        
        // Detailed log of the entire body, especially interactionInfo
        console.log(`[Backend /api/states] Received state with body: ${JSON.stringify(req.body, null, 2)}`);

        // console.log(`[Backend] Received state: ${stateId}, hash: ${hash}, dom size: ${dom ? dom.length : 0} bytes, timeSincePreviousState: ${timeSincePreviousState}`);
        
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
                visibleElements: 0,
                title: title || 'N/A'
            },
            title: title || 'N/A',
            loadingInfo: loadingInfo || { isNavigation: false, isInitial: false, isReload: false },
            mutationInfo: mutationInfo || { count: 0, types: [] },
            interactionInfo: interactionInfo // Ensure this is saved
        });
        
        await state.save();
        console.log(`[Backend] Successfully saved state: ${state.stateId} for session: ${sessionId}`);

        // Emit activity for the interaction that led to this state change, if interactionInfo is present
        if (interactionInfo && interactionInfo.type) {
            const activityEmitter = req.app.get('emitAndSaveActivity');
            if (activityEmitter) {
                let interactionDescription = interactionInfo.element || interactionInfo.selector || interactionInfo.type;
                if (interactionInfo.text && interactionInfo.text.length < 100) { // Add text if reasonable length
                    interactionDescription += ` ("${interactionInfo.text}")`;
                }
                
                await activityEmitter(
                    sessionId,
                    userId,
                    interactionInfo.type, // e.g., 'click', 'change', 'submit'
                    `${interactionInfo.type.charAt(0).toUpperCase() + interactionInfo.type.slice(1)}: ${interactionDescription}`, // More descriptive
                    { 
                        target: interactionInfo.element,
                        selector: interactionInfo.selector,
                        value: interactionInfo.value,
                        previousValue: interactionInfo.previousValue,
                        details: interactionInfo.details, // Keep original details
                        newStateId: state.stateId, // Link to the new state
                        url: state.url
                    }
                );
                console.log(`[Socket.IO] Emitted activity for transitional event: ${interactionInfo.type} on ${interactionInfo.element || interactionInfo.selector}`);
            }
        }
        
        // Emit the new DOM state itself for real-time graph updates
        io.to(`session:${sessionId}`).emit('newState', state);
        
        return res.status(201).json({
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

// Modify direct non-transitional events route to emit activities
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
        
        if (!events || typeof events !== 'object') {
            console.log(`[Backend] No events object found or not an object for stateId ${stateId}. Skipping event emission.`);
            // Still save metrics if present
            if (metrics) {
                await db.updateNonTransitionalEvents(stateId, sessionId, userId, { events: {}, metrics });
            }
            return res.json({
                success: true,
                message: 'Non-transitional data (metrics only) saved. No events to emit.'
            });
        }
        
        console.log(`[Backend] Received non-transitional events for stateId ${stateId} with event types:`, 
            Object.keys(events).join(', '));
        
        const emitAndSaveActivity = req.app.get('emitAndSaveActivity');
        if (!emitAndSaveActivity) {
            console.error('[Backend] emitAndSaveActivity not found on app. Cannot emit activities.');
            // Fallback to just saving
            await db.updateNonTransitionalEvents(stateId, sessionId, userId, { events, metrics });
            return res.status(500).json({
                success: false,
                error: 'Internal server error: Activity emitter not configured.'
            });
        }

        for (const [eventType, eventArray] of Object.entries(events)) {
            if (Array.isArray(eventArray) && eventArray.length > 0) {
                for (const eventDetail of eventArray) {
                    let interactionMessage = eventDetail.eventMeaning || eventType;
                    const activityDetails = { ...eventDetail, originalEventType: eventType }; // Store original type
                    let specificEventType = eventType; // Use the key from events object as specific type

                    switch (eventType) {
                        case 'allKeyPresses':
                            specificEventType = 'key_press';
                            interactionMessage = `Pressed key: ${eventDetail.key} in ${eventDetail.fieldIdentifier || eventDetail.targetElementPath || 'input'}`;
                            break;
                        case 'deadClicks':
                            specificEventType = 'dead_click';
                            interactionMessage = `Dead click on ${eventDetail.targetElementFriendlyName || eventDetail.targetElementTag || 'element'}`;
                            break;
                        case 'hover': // Keep hover, but consider sampling if too many
                            // Example: Limit to last 3 hover events if eventArray is too large
                            // This loop processes all, but you could add sampling logic here or before the loop for 'hover'
                            interactionMessage = `Hovered over ${eventDetail.name || eventDetail.element || eventDetail.selector}`;
                            if (eventDetail.duration) interactionMessage += ` for ${eventDetail.duration}ms`;
                            break;
                        case 'dropdownToggle':
                            specificEventType = 'dropdown_toggle';
                            interactionMessage = `Toggled dropdown ${eventDetail.elementId || eventDetail.elementPath || eventDetail.elementTag}`;
                            break;
                        case 'escapeBackspace': // Assuming this array contains objects with 'key' or 'type'
                             specificEventType = 'control_key_press';
                             interactionMessage = `Pressed ${eventDetail.key || 'control key'} on ${eventDetail.elementPath || 'page'}`;
                             break;
                        case 'inactivity':
                            interactionMessage = `User inactivity: ${eventDetail.trigger} for ${eventDetail.duration}ms`;
                            break;
                        case 'inputFieldIdle':
                            specificEventType = 'field_idle';
                            interactionMessage = `Idle in field ${eventDetail.field || eventDetail.elementPath} for ${eventDetail.duration}ms`;
                            break;
                        case 'keyTypingCadence': // This is often for analytics, allKeyPresses is better for live feed of typing
                            // Let's make this more specific to the field, summarizing the typing session
                            specificEventType = 'typing_summary';
                            interactionMessage = `Typed in ${eventDetail.field || 'a field'}. Cadence: ${eventDetail.timeSinceLast}ms since last key.`;
                            // This might be too granular. Consider if allKeyPresses is enough or if a different summary is needed.
                            // For now, emitting it as is. User feedback mentioned allKeyPresses is what they want to see for typing.
                            // We could choose to skip this if allKeyPresses provides enough detail.
                            break;
                        case 'keydownWithoutSubmit':
                            specificEventType = 'field_abandoned_after_typing';
                            interactionMessage = `Typed "${eventDetail.value}" in ${eventDetail.field || eventDetail.targetElementPath}, then left`;
                            break;
                        case 'oscillatingHovers':
                            specificEventType = 'oscillating_hover';
                            const elements = eventDetail.elements.map(e => e.selector || e.element).join(', ');
                            interactionMessage = `Oscillating hovers over: ${elements}`;
                            if (eventDetail.duration) interactionMessage += ` for ${eventDetail.duration}ms`;
                            break;
                        case 'pasteWithoutTyping':
                            specificEventType = 'paste_event';
                            interactionMessage = `Pasted content into ${eventDetail.field || eventDetail.targetElementPath}`;
                            break;
                        case 'repeatedClicks':
                            specificEventType = 'repeated_clicks';
                            interactionMessage = `Repeatedly clicked ${eventDetail.targetElementFriendlyName || eventDetail.targetElementTag} (${eventDetail.count} times)`;
                            break;
                        case 'repeatedInputs':
                            specificEventType = 'repeated_input';
                            interactionMessage = `Repeated input pattern "${eventDetail.pattern}" in ${eventDetail.field}`;
                            break;
                        case 'scrollEvents':
                            specificEventType = 'scroll';
                            interactionMessage = `Scrolled on page (direction: ${eventDetail.direction || 'N/A'}, magnitude: ${eventDetail.magnitude || 'N/A'})`;
                            break;
                        case 'tabNavigation':
                            specificEventType = 'tab_navigation';
                            interactionMessage = `Tabbed to ${eventDetail.targetElementFriendlyName || eventDetail.targetElementTag || eventDetail.elementPath}`;
                            break;
                        // Default case for any other event types not explicitly handled
                        default:
                            console.log(`[Backend] Emitting generic activity for unhandled event type: ${eventType}`);
                            interactionMessage = eventDetail.eventMeaning || `User action: ${eventType}`;
                            break;
                    }

                    await emitAndSaveActivity(
                        sessionId,
                        userId,
                        specificEventType, // Use the more specific event type
                        interactionMessage,
                        activityDetails // Send all details from the event item
                    );
                }
            }
        }
        
        // Original database update remains the same
        const result = await db.updateNonTransitionalEvents(stateId, sessionId, userId, {
            events,
            metrics
        });
        
        console.log(`[Backend] Updated non-transitional events for state: ${stateId} and emitted ${Object.values(events).flat().length} activities.`);
        
        return res.json({
            success: true,
            message: 'Non-transitional events saved and activities emitted successfully'
        });
    } catch (error) {
        console.error('[Backend] Error saving/emitting non-transitional events:', error);
        return res.status(500).json({
            success: false,
            error: 'Error saving/emitting non-transitional events: ' + error.message
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
app.use('/api/admin', adminRoutes);

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
    server.listen(PORT, '0.0.0.0', () => {
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
      
      // Add Socket.IO info
      console.log('\nSocket.IO endpoint:');
      console.log('\x1b[36m%s\x1b[0m', `➜ ws://${localIp}:${PORT}`);
      
      debug('Debug mode is enabled');
    });
  })
  .catch(err => {
    console.error('Failed to initialize server:', err);
    process.exit(1);
  });