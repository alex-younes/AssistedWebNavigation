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
    Tooltip
} from '@mui/material';
import { 
    FiberManualRecord, 
    Stop,
    PlayArrow,
    Timeline,
    FilterList,
    Clear
} from '@mui/icons-material';
import { browserApi } from '../services/browserApi';
import InteractionList from './InteractionList';

const ITEMS_PER_PAGE = 10;
const POLLING_INTERVAL = 1000; // 1 second

const INTERACTION_FILTERS = {
    ALL: 'all',
    CLICKS_ONLY: 'clicks',
    HIDE_PAGE_LOADS: 'hidePageLoads'
};

const InteractionRecorder = () => {
    // State variables for recording
    const [isRecording, setIsRecording] = useState(false);
    const [recordingSessionId, setRecordingSessionId] = useState(null);
    const [interactions, setInteractions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [currentFilter, setCurrentFilter] = useState(INTERACTION_FILTERS.ALL);
    
    // Pagination state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    
    // Polling references
    const pollingRef = useRef(null);
    
    // Cleanup polling on unmount
    useEffect(() => {
        return () => {
            cleanupPolling();
        };
    }, []);
    
    const cleanupPolling = () => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
    };
    
    // Function to get interaction ID for deduplication
    const getInteractionId = (interaction) => {
        return interaction._id || `${interaction.type}-${interaction.timestamp}`;
    };
    
    // Start polling for interactions
    const startPollingExtensionInteractions = (sessionId) => {
        // Clear any existing interval
        cleanupPolling();
        
        // Setup new polling interval
        pollingRef.current = setInterval(async () => {
            try {
                const result = await browserApi.getExtensionInteractions(sessionId);
                
                if (result && Array.isArray(result.interactions)) {
                    // Add any new interactions
                    setInteractions(prev => {
                        // Create a map of existing interactions by ID
                        const existingMap = new Map(
                            prev.map(item => [getInteractionId(item), item])
                        );
                        
                        // Add new interactions if they don't already exist
                        result.interactions.forEach(item => {
                            const id = getInteractionId(item);
                            if (!existingMap.has(id)) {
                                existingMap.set(id, item);
                            }
                        });
                        
                        // Convert map back to array and sort by timestamp
                        return Array.from(existingMap.values())
                            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    });
                }
            } catch (error) {
                console.error('Error polling for interactions:', error);
                // Don't set error state here to avoid UI disruption during polling
            }
        }, POLLING_INTERVAL);
    };
    
    // Start recording
    const startRecording = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const result = await browserApi.startExtensionRecording();
            
            if (result && result.success) {
                setIsRecording(true);
                setRecordingSessionId(result.sessionId);
                
                // Start polling for new interactions
                startPollingExtensionInteractions(result.sessionId);
                
                console.log('Recording started:', result);
            } else {
                setError('Failed to start recording. Please check browser extension.');
            }
        } catch (error) {
            console.error('Error starting recording:', error);
            setError('Error starting recording: ' + (error.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };
    
    // Stop recording
    const stopRecording = async () => {
        setLoading(true);
        setError(null);
        
        try {
            await browserApi.stopExtensionRecording();
            setIsRecording(false);
            
            // Stop polling when recording stops
            cleanupPolling();
        } catch (error) {
            console.error('Error stopping recording:', error);
            setError('Error stopping recording: ' + (error.message || 'Unknown error'));
        } finally {
            setLoading(false);
        }
    };
    
    // Handle pagination
    const handlePageChange = (event, value) => {
        setPage(value);
    };
    
    // Filter interactions based on current filter
    const filterInteractions = (interactions) => {
        if (!interactions) return [];
        
        switch (currentFilter) {
            case INTERACTION_FILTERS.CLICKS_ONLY:
                return interactions.filter(interaction => 
                    interaction.type === 'click' || interaction.type === 'document_click'
                );
            case INTERACTION_FILTERS.HIDE_PAGE_LOADS:
                return interactions.filter(interaction => 
                    interaction.type !== 'page_info' && interaction.type !== 'navigation'
                );
            case INTERACTION_FILTERS.ALL:
            default:
                return interactions;
        }
    };
    
    // Handle filter change
    const handleFilterChange = (filter) => {
        setCurrentFilter(filter);
        setPage(1); // Reset to first page when filter changes
    };
    
    // Clear all interactions
    const clearInteractions = async () => {
        setInteractions([]);
    };
    
    // Calculate the set of interactions to display on the current page
    const filteredInteractions = filterInteractions(interactions);
    const displayedInteractions = filteredInteractions.slice(
        (page - 1) * ITEMS_PER_PAGE, 
        page * ITEMS_PER_PAGE
    );
    
    // Update total pages when filtered interactions change
    useEffect(() => {
        setTotalPages(Math.max(1, Math.ceil(filteredInteractions.length / ITEMS_PER_PAGE)));
        
        // If current page is now beyond the available pages, reset to last page
        if (page > Math.max(1, Math.ceil(filteredInteractions.length / ITEMS_PER_PAGE))) {
            setPage(Math.max(1, Math.ceil(filteredInteractions.length / ITEMS_PER_PAGE)));
        }
    }, [filteredInteractions, page]);
    
    return (
        <Box sx={{ 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column'
        }}>
            <Paper 
                sx={{ 
                    p: 2, 
                    mb: 2, 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: 2
                }}
                elevation={1}
            >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="h6" component="h2">
                        Interaction Recorder
                    </Typography>
                    
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        {!isRecording ? (
                            <Button
                                variant="contained"
                                color="primary"
                                startIcon={<PlayArrow />}
                                onClick={startRecording}
                                disabled={loading}
                            >
                                Start Recording
                            </Button>
                        ) : (
                            <Button
                                variant="contained"
                                color="error"
                                startIcon={<Stop />}
                                onClick={stopRecording}
                                disabled={loading}
                            >
                                Stop Recording
                            </Button>
                        )}
                        
                        <Button
                            variant="outlined"
                            startIcon={<Clear />}
                            onClick={clearInteractions}
                            disabled={interactions.length === 0 || loading}
                        >
                            Clear
                        </Button>
                    </Box>
                </Box>
                
                {error && (
                    <Alert severity="error" onClose={() => setError(null)}>
                        {error}
                    </Alert>
                )}
                
                {isRecording && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FiberManualRecord sx={{ color: 'error.main', animation: 'pulse 1.5s infinite' }} />
                        <Typography>
                            Recording in progress... 
                            {recordingSessionId && (
                                <Typography component="span" sx={{ ml: 1, color: 'text.secondary', fontSize: '0.875rem' }}>
                                    (Session ID: {recordingSessionId.substring(0, 8)})
                                </Typography>
                            )}
                        </Typography>
                    </Box>
                )}
            </Paper>
            
            {/* Filter chips */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ mr: 1, display: 'flex', alignItems: 'center' }}>
                    <FilterList fontSize="small" sx={{ mr: 0.5 }} /> Filters:
                </Typography>
                
                <Chip 
                    label="All Events" 
                    color={currentFilter === INTERACTION_FILTERS.ALL ? "primary" : "default"}
                    onClick={() => handleFilterChange(INTERACTION_FILTERS.ALL)}
                    variant={currentFilter === INTERACTION_FILTERS.ALL ? "filled" : "outlined"}
                />
                
                <Chip 
                    label="Clicks Only" 
                    color={currentFilter === INTERACTION_FILTERS.CLICKS_ONLY ? "primary" : "default"}
                    onClick={() => handleFilterChange(INTERACTION_FILTERS.CLICKS_ONLY)}
                    variant={currentFilter === INTERACTION_FILTERS.CLICKS_ONLY ? "filled" : "outlined"}
                />
                
                <Chip 
                    label="Hide Page Loads" 
                    color={currentFilter === INTERACTION_FILTERS.HIDE_PAGE_LOADS ? "primary" : "default"}
                    onClick={() => handleFilterChange(INTERACTION_FILTERS.HIDE_PAGE_LOADS)}
                    variant={currentFilter === INTERACTION_FILTERS.HIDE_PAGE_LOADS ? "filled" : "outlined"}
                />
            </Box>
            
            <Card sx={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column',
                overflow: 'hidden',
                mb: 2
            }}>
                <CardContent sx={{ 
                    p: 0, 
                    flex: 1, 
                    overflow: 'auto',
                    '&:last-child': { pb: 0 } 
                }}>
                    {loading && interactions.length === 0 ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <CircularProgress />
                        </Box>
                    ) : interactions.length === 0 ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', p: 3 }}>
                            <Typography variant="body1" color="text.secondary" align="center">
                                No interactions recorded yet. <br />
                                Start recording to capture user activity.
                            </Typography>
                        </Box>
                    ) : (
                        <InteractionList interactions={displayedInteractions} />
                    )}
                </CardContent>
            </Card>
            
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    {filteredInteractions.length} interaction{filteredInteractions.length !== 1 ? 's' : ''} recorded
                </Typography>
                
                {totalPages > 1 && (
                    <Pagination 
                        count={totalPages} 
                        page={page} 
                        onChange={handlePageChange} 
                        size="small"
                        color="primary"
                    />
                )}
            </Box>
        </Box>
    );
};

export default InteractionRecorder;