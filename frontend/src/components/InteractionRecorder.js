import React, { useState, useEffect, useRef } from 'react';
import { 
    Box, 
    Button, 
    Typography, 
    Paper, 
    Pagination,
    Card,
    CardContent,
    List,
    Divider,
    CircularProgress,
    Chip,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    Tabs,
    Tab,
    Switch,
    FormControlLabel,
    Tooltip
} from '@mui/material';
import { 
    FiberManualRecord, 
    Stop,
    PlayArrow,
    Timeline,
    Extension,
    Web,
    FilterList,
    Clear
} from '@mui/icons-material';
import { browserApi } from '../services/browserApi';
import InteractionList from './InteractionList';
import StarRating from './StarRating';
import TaskManager from './TaskManager';
import { useLocation, useNavigate } from 'react-router-dom';

const ITEMS_PER_PAGE = 10;
const POLLING_INTERVAL = 1000; // 1 second

const INTERACTION_FILTERS = {
    ALL: 'all',
    CLICKS_ONLY: 'clicks',
    HIDE_PAGE_LOADS: 'hidePageLoads'
};

const InteractionRecorder = ({ targetUrl }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const [isRecording, setIsRecording] = useState(false);
    const [interactions, setInteractions] = useState([]);
    const [pollingInterval, setPollingInterval] = useState(null);
    const [errorCount, setErrorCount] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [ratingCriteria, setRatingCriteria] = useState([]);
    const [starRating, setStarRating] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [selectedMode, setSelectedMode] = useState('extension'); // 'browser' or 'extension'
    const [extensionStatus, setExtensionStatus] = useState({ status: 'unknown' });
    const [extensionSessions, setExtensionSessions] = useState([]);
    const [selectedSession, setSelectedSession] = useState(null);
    const [lastFetchedCount, setLastFetchedCount] = useState(0);
    const [interactionFilter, setInteractionFilter] = useState(INTERACTION_FILTERS.HIDE_PAGE_LOADS);
    // Add a ref to store seen interaction IDs that persists between renders
    const seenInteractionIdsRef = useRef(new Set());
    // Add a new state variable to count non-page load interactions
    const [nonPageLoadCount, setNonPageLoadCount] = useState(0);
    const [error, setError] = useState(null);
    const [forcedUserId, setForcedUserId] = useState(null);
    const [statusInterval, setStatusInterval] = useState(null);

    const totalPages = Math.ceil(interactions.length / ITEMS_PER_PAGE);

    const cleanupPolling = () => {
        if (pollingInterval) {
            console.log('Cleaning up polling interval');
            clearInterval(pollingInterval);
            setPollingInterval(null);
        }
    };

    // Effect for initialization
    useEffect(() => {
        browserApi.getRatingCriteria()
            .then(response => setRatingCriteria(response))
            .catch(console.error);

        // Get userId from URL parameters
        const params = new URLSearchParams(location.search);
        const urlUserId = params.get('userId');
        if (urlUserId) {
            setForcedUserId(urlUserId);
            loadExtensionSessions(urlUserId);
        }

        // Check recording status on mount
        checkRecordingStatus();
        
        // Set up polling for status updates
        const statusCheckInterval = setInterval(() => {
            checkRecordingStatus();
        }, 3000); // Check every 3 seconds
        
        setStatusInterval(statusCheckInterval);
        
        return () => {
            cleanupPolling();
            if (statusInterval) {
                clearInterval(statusInterval);
            }
        };
    }, [location]);

    // Separate effect for maintaining selected session
    useEffect(() => {
        if (extensionStatus.currentSession) {
            setSelectedSession(extensionStatus.currentSession);
            // Start polling for the current session if we're recording
            if (extensionStatus.status === 'recording') {
                startPollingExtensionInteractions(extensionStatus.currentSession.sessionId);
            }
        }
    }, [extensionStatus.currentSession]);

    // Effect for session list updates
    useEffect(() => {
        const updateSessions = async () => {
            const currentUserId = extensionStatus.userId || forcedUserId;
            if (!currentUserId) return;

            try {
                const sessions = await browserApi.getExtensionSessions(currentUserId);
                if (Array.isArray(sessions)) {
                    setExtensionSessions(prev => {
                        // Preserve current sessions and add/update new ones
                        const updatedSessions = [...prev];
                        sessions.forEach(newSession => {
                            const existingIndex = updatedSessions.findIndex(
                                s => s.sessionId === newSession.sessionId
                            );
                            if (existingIndex === -1) {
                                updatedSessions.unshift(newSession);
                            } else {
                                updatedSessions[existingIndex] = newSession;
                            }
                        });
                        return updatedSessions;
                    });
                }
            } catch (error) {
                console.error('Error updating sessions:', error);
            }
        };

        // Update sessions every 3 seconds
        const sessionUpdateInterval = setInterval(updateSessions, 3000);
        return () => clearInterval(sessionUpdateInterval);
    }, [extensionStatus.userId, forcedUserId]);

    const checkRecordingStatus = async () => {
        try {
            // Get current userId from state or localStorage
            let currentUserId = forcedUserId || localStorage.getItem('recordingUserId');
            
            let status = await browserApi.getExtensionRecordingStatus(currentUserId);
            console.log('Extension status:', status);
            
            // If we need a userId and don't have one, generate one and persist it
            if (status.needsUserId && !currentUserId) {
                currentUserId = `user_${Date.now()}_${Math.random().toString(36).substring(2)}`;
                localStorage.setItem('recordingUserId', currentUserId);
                setForcedUserId(currentUserId);
                
                // Retry with new userId
                status = await browserApi.getExtensionRecordingStatus(currentUserId);
            }

            // If we have a userId but no sessions loaded, load them
            if (currentUserId && extensionSessions.length === 0) {
                await loadExtensionSessions(currentUserId);
            }
            
            // Update extension status
            setExtensionStatus(prevStatus => ({
                ...prevStatus,
                ...status,
                isConnected: true, // Set to true since we got a response
                userId: currentUserId || status.userId || status.sessionData?.userId,
                currentSession: status.currentSession || null
            }));

            // If we have an active recording session, make sure it's in our sessions list
            // and start polling for interactions
            if (status.status === 'recording' && status.currentSession) {
                setExtensionSessions(prev => {
                    const sessionExists = prev.some(s => s.sessionId === status.currentSession.sessionId);
                    if (!sessionExists) {
                        return [status.currentSession, ...prev];
                    }
                    return prev;
                });
                
                // Set the current session as selected
                setSelectedSession(status.currentSession);
                
                // Start polling for this session's interactions
                if (!pollingInterval) {
                    startPollingExtensionInteractions(status.currentSession.sessionId);
                }
            }
        } catch (error) {
            console.error('Error checking recording status:', error);
            setExtensionStatus(prev => ({
                ...prev,
                isConnected: false
            }));
        }
    };

    // Helper function to generate consistent IDs for interactions
    const getInteractionId = (interaction) => {
        return interaction.id || 
               `${interaction.timestamp}-${interaction.type}-${JSON.stringify(interaction.details?.position || {})}`;
    };

    const startPollingExtensionInteractions = (sessionId) => {
        if (!sessionId) {
            console.log('No session ID provided for polling');
            return;
        }
        
        console.log('Starting to poll interactions for session:', sessionId);
        
        // Clean up any existing polling first
        cleanupPolling();
        
        const interval = setInterval(async () => {
            try {
                const currentUserId = extensionStatus.userId || forcedUserId;
                if (!currentUserId) {
                    console.log('No user ID available for polling');
                    return;
                }

                // Get interactions for the current session
                const response = await browserApi.getExtensionInteractions(
                    sessionId,
                    currentUserId
                );
                
                if (response && response.interactions) {
                    console.log(`Received ${response.interactions.length} interactions`);
                    // Update interactions while preserving the state
                    setInteractions(prevInteractions => {
                        // Only update if we have new interactions
                        if (response.interactions.length > prevInteractions.length) {
                            return response.interactions;
                        }
                        return prevInteractions;
                    });
                    setTotalCount(response.interactions.length);
                }
            } catch (error) {
                console.error('Error polling interactions:', error);
            }
        }, 1000);
        
        setPollingInterval(interval);
    };

    const loadExtensionSessions = async (userId = forcedUserId) => {
        if (!userId) {
            console.log('No userId provided for loading sessions');
            return;
        }
        
        try {
            console.log('Loading sessions for user:', userId);
            const sessions = await browserApi.getExtensionSessions(userId);
            console.log('Loaded sessions:', sessions);
            
            if (Array.isArray(sessions)) {
                setExtensionSessions(sessions);
                
                // If we have sessions and none selected, select the first one
                if (sessions.length > 0 && !selectedSession) {
                    const latestSession = sessions[0];
                    setSelectedSession(latestSession);
                    await loadExtensionSession(latestSession.sessionId, userId);
                }
            } else {
                console.error('Invalid sessions response:', sessions);
            }
        } catch (error) {
            console.error('Error loading extension sessions:', error);
        }
    };

    const loadExtensionSession = async (sessionId, userId = forcedUserId) => {
        if (!sessionId || !userId) return;
        
        try {
            const response = await browserApi.getExtensionInteractions(sessionId, userId);
            if (response && response.interactions) {
                setInteractions(response.interactions);
                setTotalCount(response.interactions.length);
                // Start polling for this session
                startPollingExtensionInteractions(sessionId);
            }
        } catch (error) {
            console.error('Error loading session:', error);
        }
    };

    const startRecording = async () => {
        setLoading(true);
        try {
            if (selectedMode === 'browser') {
                // Headless browser recording
                await browserApi.startRecording(targetUrl);
                setIsRecording(true);
                setInteractions([]);
                setErrorCount(0);
                setTotalCount(0);
                setCurrentPage(1);
                
                const interval = setInterval(async () => {
                    try {
                        const response = await browserApi.getInteractions();
                        if (response.interactions.length > 0) {
                            setInteractions(prev => [...prev, ...response.interactions]);
                            setTotalCount(prev => prev + response.interactions.length);
                        }
                        setErrorCount(0);
                    } catch (error) {
                        console.error('Polling error:', error);
                        setErrorCount(prev => prev + 1);
                        if (errorCount >= 5) {
                            cleanupPolling();
                        }
                    }
                }, 1000);
                
                setPollingInterval(interval);
            } else {
                // Extension recording - tell user to use the extension
                alert('Please use the browser extension to start recording.');
            }
        } catch (error) {
            console.error('Failed to start recording:', error);
        } finally {
            setLoading(false);
        }
    };

    const stopRecording = async () => {
        setLoading(true);
        try {
            cleanupPolling();
            
            if (selectedMode === 'browser') {
                // Headless browser recording
                const response = await browserApi.stopRecording();
                setStarRating(response.starRating);
            } else {
                // Extension recording - explicitly tell the extension to stop
                await browserApi.stopExtensionRecording();
            }
            
            setIsRecording(false);
        } catch (error) {
            console.error('Failed to stop recording:', error);
        } finally {
            setLoading(false);
        }
    };

    const handlePageChange = (event, value) => {
        setCurrentPage(value);
    };

    const handleModeChange = (event) => {
        const newMode = event.target.value;
        setSelectedMode(newMode);
        
        // Reset sessions and interactions if switching modes
        if (newMode === 'extension') {
            loadExtensionSessions();
            checkRecordingStatus();
        } else {
            // Clear any extension polling
            cleanupPolling();
        }
    };

    const handleExtensionSessionChange = (event) => {
        const sessionId = event.target.value;
        loadExtensionSession(sessionId);
    };

    const refreshExtensionSessions = async () => {
        setLoading(true);
        await loadExtensionSessions();
        await checkRecordingStatus();
        
        // After loading sessions, check if the currently selected session still exists
        // If not, reset the selection to avoid MUI "out-of-range value" errors
        if (selectedSession) {
            const sessionStillExists = extensionSessions.some(
                session => session.sessionId === selectedSession.sessionId
            );
            
            if (!sessionStillExists) {
                console.log(`Selected session ${selectedSession.sessionId} no longer exists in the available sessions`);
                setSelectedSession(null);
            }
        }
        
        setLoading(false);
    };

    const filterInteractions = (interactions) => {
        if (!interactions) return [];
        
        switch (interactionFilter) {
            case INTERACTION_FILTERS.CLICKS_ONLY:
                return interactions.filter(interaction => interaction.type === 'click');
            case INTERACTION_FILTERS.HIDE_PAGE_LOADS:
                return interactions.filter(interaction => interaction.type !== 'pageLoad');
            case INTERACTION_FILTERS.ALL:
            default:
                return interactions;
        }
    };

    const filteredInteractions = filterInteractions(interactions);
    const paginatedInteractions = filteredInteractions.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const handleFilterChange = (filter) => {
        setInteractionFilter(filter);
        setCurrentPage(1); // Reset to first page when filter changes
    };

    // Add a new function to clear interactions
    const clearInteractions = async () => {
        if (!selectedSession || !forcedUserId) return;
        
        if (isRecording) {
            console.log('Cannot clear interactions while recording is active');
            setError('Please stop recording before clearing interactions');
            return;
        }
        
        setLoading(true);
        try {
            await browserApi.clearExtensionInteractions(
                selectedSession.sessionId,
                forcedUserId
            );
            
            setInteractions([]);
            setTotalCount(0);
            setNonPageLoadCount(0);
            seenInteractionIdsRef.current = new Set();
            setLastFetchedCount(0);
            
            console.log('All interactions cleared');
        } catch (error) {
            console.error('Failed to clear interactions:', error);
            setError('Failed to clear interactions. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            height: '100%',
            overflow: 'hidden'
        }}>
            <Card sx={{ flexShrink: 0 }}>
                <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">
                            Interaction Recorder
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {selectedMode === 'browser' && (
                                <Chip 
                                    label={isRecording ? "Recording" : "Ready"} 
                                    color={isRecording ? "error" : "default"}
                                    icon={isRecording ? <FiberManualRecord /> : undefined}
                                />
                            )}
                            {selectedMode === 'extension' && (
                                <Chip 
                                    label={extensionStatus.status === 'recording' ? "Extension Recording" : "Extension Ready"} 
                                    color={extensionStatus.status === 'recording' ? "error" : "default"}
                                    icon={extensionStatus.status === 'recording' ? <FiberManualRecord /> : <Extension />}
                                />
                            )}
                        </Box>
                    </Box>
                    <Divider sx={{ my: 2 }} />
                    
                    <Box sx={{ mb: 2 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Recording Mode</InputLabel>
                            <Select
                                value={selectedMode}
                                label="Recording Mode"
                                onChange={handleModeChange}
                            >
                                <MenuItem value="browser">
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Web sx={{ mr: 1 }} fontSize="small" />
                                        Headless Browser
                                    </Box>
                                </MenuItem>
                                <MenuItem value="extension">
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                        <Extension sx={{ mr: 1 }} fontSize="small" />
                                        Browser Extension
                                    </Box>
                                </MenuItem>
                            </Select>
                        </FormControl>
                    </Box>

                    {selectedMode === 'browser' && (
                        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                            <Button
                                variant="contained"
                                color="primary"
                                onClick={startRecording}
                                disabled={isRecording || loading}
                                startIcon={<PlayArrow />}
                                fullWidth
                            >
                                {loading ? <CircularProgress size={24} /> : 'Start Recording'}
                            </Button>
                            <Button
                                variant="contained"
                                color="error"
                                onClick={stopRecording}
                                disabled={!isRecording || loading}
                                startIcon={<Stop />}
                                fullWidth
                            >
                                Stop Recording
                            </Button>
                        </Box>
                    )}

                    {selectedMode === 'extension' && (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {!extensionStatus.isConnected && (
                                <Alert severity="warning">
                                    Extension not connected. Please install and activate the browser extension.
                                </Alert>
                            )}
                            
                            {extensionStatus.status === 'recording' && extensionStatus.currentSession && (
                                <Alert severity="info" icon={<FiberManualRecord />}>
                                    Recording session: {extensionStatus.currentSession.sessionId}
                                </Alert>
                            )}
                            
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Extension Session</InputLabel>
                                    <Select
                                        value={selectedSession?.sessionId || ''}
                                        label="Extension Session"
                                        onChange={handleExtensionSessionChange}
                                        disabled={loading || extensionSessions.length === 0}
                                    >
                                        {extensionSessions.length === 0 ? (
                                            <MenuItem value="">
                                                <em>No sessions available</em>
                                            </MenuItem>
                                        ) : (
                                            extensionSessions.map(session => (
                                                <MenuItem key={session.sessionId} value={session.sessionId}>
                                                    {session.sessionId} - {new Date(session.startTime).toLocaleString()}
                                                    {extensionStatus.currentSession?.sessionId === session.sessionId && ' (Active)'}
                                                </MenuItem>
                                            ))
                                        )}
                                    </Select>
                                </FormControl>
                                <Button
                                    variant="outlined"
                                    onClick={refreshExtensionSessions}
                                    disabled={loading}
                                >
                                    Refresh
                                </Button>
                            </Box>
                            
                            <Alert severity="info">
                                {extensionStatus.status === 'recording' ? (
                                    <>Recording in progress. Use the browser extension to stop recording.</>
                                ) : (
                                    <>Use the browser extension to start and stop recording on the current tab.</>
                                )}
                            </Alert>
                        </Box>
                    )}
                </CardContent>
            </Card>

            {selectedMode === 'browser' && <StarRating rating={starRating} criteria={ratingCriteria} />}

            <Box sx={{
                display: 'flex',
                gap: 2,
                flexGrow: 1,
                minHeight: 0
            }}>
                {/* Left side: Interaction List */}
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <Card sx={{
                        flexGrow: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden'
                    }}>
                        <CardContent sx={{
                            flexGrow: 1,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            p: 2,
                            '&:last-child': { pb: 2 }
                        }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6" component="div">
                                    Recorded Interactions 
                                    {interactions.length > 0 && (
                                        <Box component="span" sx={{ ml: 1 }}>
                                            <Chip 
                                                size="small" 
                                                label={`Total: ${totalCount}`} 
                                                color="primary" 
                                                sx={{ mr: 1 }}
                                            />
                                            <Chip 
                                                size="small" 
                                                label={`Without Page Loads: ${nonPageLoadCount}`} 
                                                color="secondary" 
                                            />
                                        </Box>
                                    )}
                                </Typography>
                                
                                {/* Add error alert for display */}
                                {error && (
                                    <Alert 
                                        severity="error" 
                                        onClose={() => setError(null)}
                                        sx={{ mb: 2, mt: 1 }}
                                    >
                                        {error}
                                    </Alert>
                                )}
                                
                                {/* Add filter controls */}
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <FormControl size="small" sx={{ minWidth: 180 }}>
                                        <InputLabel>Filter</InputLabel>
                                        <Select
                                            value={interactionFilter}
                                            label="Filter"
                                            onChange={(e) => handleFilterChange(e.target.value)}
                                            startAdornment={<FilterList sx={{ mr: 1, ml: -0.5 }} />}
                                        >
                                            <MenuItem value={INTERACTION_FILTERS.ALL}>Show All</MenuItem>
                                            <MenuItem value={INTERACTION_FILTERS.HIDE_PAGE_LOADS}>Hide Page Loads</MenuItem>
                                            <MenuItem value={INTERACTION_FILTERS.CLICKS_ONLY}>Clicks Only</MenuItem>
                                        </Select>
                                    </FormControl>
                                    
                                    {interactions.length > 0 && (
                                        <Tooltip title={isRecording ? "Stop recording to clear interactions" : "Clear Interactions"}>
                                            <Button 
                                                variant="outlined" 
                                                color="error"
                                                size="small"
                                                onClick={clearInteractions}
                                                startIcon={<Clear />}
                                                disabled={isRecording}
                                            >
                                                Clear
                                            </Button>
                                        </Tooltip>
                                    )}
                                </Box>
                            </Box>
                            
                            <InteractionList 
                                interactions={paginatedInteractions} 
                                isRecording={isRecording || extensionStatus.status === 'recording'} 
                                totalCount={totalCount}
                            />
                            
                            {filteredInteractions.length > ITEMS_PER_PAGE && (
                                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
                                    <Pagination 
                                        count={Math.ceil(filteredInteractions.length / ITEMS_PER_PAGE)} 
                                        page={currentPage}
                                        onChange={handlePageChange}
                                        color="primary"
                                    />
                                </Box>
                            )}
                            
                            {filteredInteractions.length === 0 && interactions.length > 0 && (
                                <Alert severity="info" sx={{ mt: 2 }}>
                                    No interactions match the current filter. <Button size="small" onClick={() => setInteractionFilter(INTERACTION_FILTERS.ALL)}>Show All</Button>
                                </Alert>
                            )}
                        </CardContent>
                    </Card>
                </Box>

                {/* Right side: Task Manager */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <TaskManager 
                        interactions={interactions}
                        isRecording={isRecording || extensionStatus.status === 'recording'}
                    />
                </Box>
            </Box>
        </Box>
    );
};

export default InteractionRecorder;