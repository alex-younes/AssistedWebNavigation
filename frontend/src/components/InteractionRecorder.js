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

const ITEMS_PER_PAGE = 10;
const POLLING_INTERVAL = 1000; // 1 second

const INTERACTION_FILTERS = {
    ALL: 'all',
    CLICKS_ONLY: 'clicks',
    HIDE_PAGE_LOADS: 'hidePageLoads'
};

const InteractionRecorder = ({ targetUrl }) => {
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
    const [extensionStatus, setExtensionStatus] = useState({
        isConnected: false,
        status: 'unknown',
        currentSession: null
    });
    const [extensionSessions, setExtensionSessions] = useState([]);
    const [selectedExtensionSession, setSelectedExtensionSession] = useState(null);
    const [lastFetchedCount, setLastFetchedCount] = useState(0);
    const [interactionFilter, setInteractionFilter] = useState(INTERACTION_FILTERS.HIDE_PAGE_LOADS);
    // Add a ref to store seen interaction IDs that persists between renders
    const seenInteractionIdsRef = useRef(new Set());
    const [statusPollingInterval, setStatusPollingInterval] = useState(null);
    // Add a new state variable to count non-page load interactions
    const [nonPageLoadCount, setNonPageLoadCount] = useState(0);
    const [error, setError] = useState(null);

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

        // Get extension sessions on mount
        loadExtensionSessions();

        // Check recording status on mount
        checkRecordingStatus();
        
        // Set up regular status polling to detect when recording is stopped from the extension
        const statusInterval = setInterval(() => {
            if (selectedMode === 'extension') {
                checkRecordingStatus();
            }
        }, 3000); // Check every 3 seconds
        
        setStatusPollingInterval(statusInterval);

        return () => {
            cleanupPolling();
            if (statusPollingInterval) {
                clearInterval(statusPollingInterval);
            }
        };
    }, []);

    // Cleanup status polling when component unmounts
    useEffect(() => {
        return () => {
            if (statusPollingInterval) {
                clearInterval(statusPollingInterval);
                setStatusPollingInterval(null);
            }
        };
    }, [statusPollingInterval]);

    // Separate effect for starting polling if we're recording
    useEffect(() => {
        // If we are recording with the extension, set up polling
        if (isRecording && extensionStatus.status === 'recording' && extensionStatus.currentSession) {
            console.log('Setting up polling for extension interactions');
            // Clean up any existing polling first
            cleanupPolling();
            // Start new polling
            startPollingExtensionInteractions(extensionStatus.currentSession.sessionId);
        } else if (!isRecording || extensionStatus.status !== 'recording') {
            // Stop polling if we're not recording
            console.log('Stopping polling because recording status changed:', extensionStatus.status);
            cleanupPolling();
            
            // If we were recording and now we're not, update UI state
            if (isRecording && extensionStatus.status !== 'recording') {
                console.log('Recording was stopped from the extension');
                setIsRecording(false);
            }
        }
        
        // Validate that the selected session exists in the available sessions
        if (selectedExtensionSession && extensionSessions.length > 0) {
            const sessionExists = extensionSessions.some(
                session => session.sessionId === selectedExtensionSession.sessionId
            );
            
            if (!sessionExists) {
                console.log(`Selected session ${selectedExtensionSession.sessionId} is not in the available sessions list`);
                // If we're not recording, reset the selected session
                if (!isRecording) {
                    setSelectedExtensionSession(null);
                }
            }
        }

        return () => {
            cleanupPolling();
        };
    }, [isRecording, extensionStatus, extensionSessions, selectedExtensionSession]);

    // Reset the seen interactions when session changes or when manually clearing interactions
    useEffect(() => {
        if (interactions.length === 0) {
            console.log('Resetting seen interaction IDs cache');
            seenInteractionIdsRef.current = new Set();
            setLastFetchedCount(0);
        }
    }, [interactions.length]);

    // Update the filterInteractions function to also update the non-page-load count
    useEffect(() => {
        // Calculate the number of non-page-load interactions
        const nonPageLoads = interactions.filter(interaction => interaction.type !== 'pageLoad').length;
        setNonPageLoadCount(nonPageLoads);
    }, [interactions]);

    const checkRecordingStatus = async () => {
        try {
            const status = await browserApi.getExtensionRecordingStatus();
            console.log('Extension status:', status);
            
            const previousStatus = extensionStatus.status;
            
            // Update local state with the extension status
            setExtensionStatus({
                isConnected: status.isExtensionConnected || false,
                status: status.status || 'idle',
                currentSession: status.currentSession || null
            });

            // If recording was stopped from the extension, update our state
            if (previousStatus === 'recording' && status.status !== 'recording') {
                console.log('Recording was stopped from the extension');
                setIsRecording(false);
                cleanupPolling();
            }
            
            // If already recording, update UI and start polling
            if (status.status === 'recording' && status.currentSession) {
                setIsRecording(true);
                setSelectedMode('extension');
                
                // Check if this session exists in our list before setting it
                const sessionExists = extensionSessions.some(
                    session => session.sessionId === status.currentSession.sessionId
                );
                
                // If not yet in our list, refresh the session list first
                if (!sessionExists) {
                    await loadExtensionSessions();
                }
                
                // Set selected session
                setSelectedExtensionSession(status.currentSession);
                
                // Load initial interactions
                const result = await browserApi.getExtensionInteractions(status.currentSession.sessionId);
                if (result && result.interactions) {
                    // Initialize the seen interactions set with the initial interactions
                    const initialIds = new Set();
                    result.interactions.forEach(interaction => {
                        const id = getInteractionId(interaction);
                        initialIds.add(id);
                    });
                    seenInteractionIdsRef.current = initialIds;
                    
                    setInteractions(result.interactions);
                    setTotalCount(result.interactions.length);
                    setLastFetchedCount(result.interactions.length);
                }
                
                // Don't start polling here - it will be handled by the useEffect
            }
        } catch (error) {
            console.error('Error checking extension status:', error);
        }
    };

    // Helper function to generate consistent IDs for interactions
    const getInteractionId = (interaction) => {
        return interaction.id || 
               `${interaction.timestamp}-${interaction.type}-${JSON.stringify(interaction.details?.position || {})}`;
    };

    const startPollingExtensionInteractions = (sessionId) => {
        if (!sessionId) return;
        
        console.log(`Starting to poll for interactions in session ${sessionId}`);
        const interval = setInterval(async () => {
            try {
                const result = await browserApi.getExtensionInteractions(sessionId);
                if (!result) return;
                
                const { interactions: fetchedInteractions } = result;
                
                // Only process if we have interactions
                if (fetchedInteractions && fetchedInteractions.length > 0) {
                    // Filter out interactions we've already seen using our ref
                    const newInteractions = fetchedInteractions.filter(interaction => {
                        const interactionId = getInteractionId(interaction);
                        return !seenInteractionIdsRef.current.has(interactionId);
                    });
                    
                    if (newInteractions.length > 0) {
                        console.log(`Found ${newInteractions.length} new interactions out of ${fetchedInteractions.length} total`);
                        
                        // Add new interaction IDs to our seen set
                        newInteractions.forEach(interaction => {
                            const interactionId = getInteractionId(interaction);
                            seenInteractionIdsRef.current.add(interactionId);
                        });
                        
                        // Update the interactions list with new interactions only
                        setInteractions(prev => [...prev, ...newInteractions]);
                        
                        // Update lastFetchedCount to match the total length
                        setLastFetchedCount(fetchedInteractions.length);
                    } else {
                        console.log(`No new interactions in the ${fetchedInteractions.length} fetched interactions`);
                    }
                }
            } catch (error) {
                console.error('Error polling for interactions:', error);
                setErrorCount(prevCount => prevCount + 1);
                if (errorCount > 5) {
                    console.log('Too many errors, stopping polling');
                    clearInterval(interval);
                    setPollingInterval(null);
                }
            }
        }, POLLING_INTERVAL);
        
        setPollingInterval(interval);
        return interval;
    };

    const loadExtensionSessions = async () => {
        try {
            const sessions = await browserApi.getExtensionSessions();
            setExtensionSessions(sessions);
        } catch (error) {
            console.error('Error loading extension sessions:', error);
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

    const loadExtensionSession = async (sessionId) => {
        if (!sessionId) return;
        
        setLoading(true);
        try {
            // Clear any existing polling
            cleanupPolling();
            
            // Reset seen interactions cache
            seenInteractionIdsRef.current = new Set();
            
            const result = await browserApi.getExtensionInteractions(sessionId);
            if (result && result.interactions) {
                // Initialize seen interactions for this session
                result.interactions.forEach(interaction => {
                    const id = getInteractionId(interaction);
                    seenInteractionIdsRef.current.add(id);
                });
                
                setInteractions(result.interactions);
                setTotalCount(result.interactions.length);
                setLastFetchedCount(result.interactions.length);
                setCurrentPage(1);
                
                // Find the session in the list to get more details
                const session = extensionSessions.find(s => s.sessionId === sessionId);
                if (session) {
                    setSelectedExtensionSession(session);
                }
                
                // If this is the currently recording session, start polling
                if (extensionStatus.status === 'recording' && 
                    extensionStatus.currentSession && 
                    extensionStatus.currentSession.sessionId === sessionId) {
                    startPollingExtensionInteractions(sessionId);
                }
            }
        } catch (error) {
            console.error('Failed to load extension session:', error);
        } finally {
            setLoading(false);
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
        if (selectedExtensionSession) {
            const sessionStillExists = extensionSessions.some(
                session => session.sessionId === selectedExtensionSession.sessionId
            );
            
            if (!sessionStillExists) {
                console.log(`Selected session ${selectedExtensionSession.sessionId} no longer exists in the available sessions`);
                setSelectedExtensionSession(null);
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
        if (!selectedExtensionSession) return;
        
        // Prevent clearing while recording is active
        if (isRecording) {
            console.log('Cannot clear interactions while recording is active');
            setError('Please stop recording before clearing interactions');
            return;
        }
        
        setLoading(true);
        try {
            // Call the API to clear interactions on the backend
            await browserApi.clearExtensionInteractions(selectedExtensionSession.sessionId);
            
            // Clear the frontend state
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
                            
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Extension Session</InputLabel>
                                    <Select
                                        value={selectedExtensionSession?.sessionId || ''}
                                        label="Extension Session"
                                        onChange={handleExtensionSessionChange}
                                        disabled={loading || extensionSessions.length === 0}
                                    >
                                        {extensionSessions.length === 0 && (
                                            <MenuItem value="">
                                                <em>No sessions available</em>
                                            </MenuItem>
                                        )}
                                        {extensionSessions.map(session => (
                                            <MenuItem key={session.sessionId} value={session.sessionId}>
                                                {new Date(session.startTime).toLocaleString()} - {session.title?.substring(0, 30) || 'Unnamed Session'}
                                                {extensionStatus.currentSession?.sessionId === session.sessionId && ' (Active)'}
                                            </MenuItem>
                                        ))}
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