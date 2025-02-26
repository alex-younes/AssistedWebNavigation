import React, { useState, useEffect } from 'react';
import Tree from 'react-d3-tree';
import { 
    Box, 
    TextField, 
    Button, 
    CircularProgress, 
    Alert, 
    Paper,
    Card,
    CardContent,
    Typography,
    Divider,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
    Tooltip
} from '@mui/material';
import { Launch, Refresh, PhotoCamera, Visibility } from '@mui/icons-material';
import { browserApi } from '../services/browserApi';
import { getNodeLabel, getCustomNodeProps } from '../utils/treeHelpers';

const DOMVisualizer = ({ onBrowserLaunch }) => {
    const [url, setUrl] = useState('');
    const [treeData, setTreeData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [captures, setCaptures] = useState([]);
    const [selectedCapture, setSelectedCapture] = useState(null);

    // Load recent DOM captures on component mount
    useEffect(() => {
        loadRecentCaptures();
    }, []);

    const loadRecentCaptures = async () => {
        setLoading(true);
        try {
            // Get captures from the backend (using our existing browserApi)
            const response = await browserApi.getExtensionCaptures();
            if (response && response.captures) {
                setCaptures(response.captures);
                
                // Auto-select the most recent capture if available
                if (response.captures.length > 0) {
                    const mostRecent = response.captures[0];
                    setSelectedCapture(mostRecent);
                    if (mostRecent.domTree) {
                        setTreeData(mostRecent.domTree);
                    }
                }
            }
        } catch (err) {
            console.error('Error loading captures:', err);
            setError('Failed to load DOM captures. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const viewCapture = async (capture) => {
        setLoading(true);
        try {
            // Get the full capture data from the backend
            const response = await browserApi.getExtensionCapture(capture.id);
            if (response && response.domTree) {
                setTreeData(response.domTree);
                setSelectedCapture(capture);
            } else {
                setError('DOM data not available for this capture');
            }
        } catch (err) {
            console.error('Error loading capture:', err);
            setError('Failed to load DOM capture. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const openInBrowser = (url) => {
        window.open(url, '_blank');
    };

    const renderCustomNode = ({ nodeDatum }) => (
        <g key={`${nodeDatum.tagName}-${nodeDatum.contentDescription}`}>
            <circle {...getCustomNodeProps().nodeSvgShape.shapeProps} />
            <text {...getCustomNodeProps().textProps}>
                {getNodeLabel(nodeDatum)}
            </text>
        </g>
    );

    const formatDate = (timestamp) => {
        return new Date(timestamp).toLocaleString();
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        DOM Analysis
                    </Typography>
                    <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                        Use the browser extension to capture the DOM of any web page. Your captures will appear here.
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <Button
                            variant="contained"
                            onClick={loadRecentCaptures}
                            startIcon={<Refresh />}
                            disabled={loading}
                        >
                            {loading ? <CircularProgress size={24} /> : 'Refresh Captures'}
                        </Button>
                    </Box>
                </CardContent>
            </Card>

            <Box sx={{ display: 'flex', gap: 2, flexGrow: 1, minHeight: 0 }}>
                {/* Left side: List of captures */}
                <Card sx={{ width: 350, overflow: 'auto' }}>
                    <CardContent sx={{ p: 0 }}>
                        <Typography variant="h6" sx={{ p: 2, pb: 1 }}>
                            Recent Captures
                        </Typography>
                        <Divider />
                        {captures.length === 0 ? (
                            <Box sx={{ p: 2 }}>
                                <Typography variant="body2" color="textSecondary">
                                    No captures found. Use the browser extension to capture a web page.
                                </Typography>
                            </Box>
                        ) : (
                            <List>
                                {captures.map((capture) => (
                                    <ListItem 
                                        key={capture.id}
                                        selected={selectedCapture && selectedCapture.id === capture.id}
                                        sx={{ 
                                            borderBottom: '1px solid rgba(0,0,0,0.05)',
                                            '&.Mui-selected': {
                                                backgroundColor: 'rgba(25, 118, 210, 0.08)',
                                            }
                                        }}
                                    >
                                        <ListItemText 
                                            primary={capture.title || 'Unnamed Page'}
                                            secondary={
                                                <>
                                                    {capture.url && <Typography variant="body2" noWrap>{capture.url}</Typography>}
                                                    {capture.timestamp && <Typography variant="caption">{formatDate(capture.timestamp)}</Typography>}
                                                </>
                                            }
                                        />
                                        <ListItemSecondaryAction>
                                            <Tooltip title="View DOM">
                                                <IconButton edge="end" onClick={() => viewCapture(capture)}>
                                                    <Visibility />
                                                </IconButton>
                                            </Tooltip>
                                            {capture.url && (
                                                <Tooltip title="Open in Browser">
                                                    <IconButton edge="end" onClick={() => openInBrowser(capture.url)}>
                                                        <Launch />
                                                    </IconButton>
                                                </Tooltip>
                                            )}
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                ))}
                            </List>
                        )}
                    </CardContent>
                </Card>

                {/* Right side: DOM visualization */}
                <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    {error && (
                        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}

                    {selectedCapture && (
                        <Card sx={{ mb: 2 }}>
                            <CardContent>
                                <Typography variant="subtitle1">
                                    {selectedCapture.title || 'Unnamed Page'}
                                </Typography>
                                {selectedCapture.url && (
                                    <Typography variant="body2" color="textSecondary" noWrap>
                                        {selectedCapture.url}
                                    </Typography>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {treeData ? (
                        <Paper 
                            elevation={3} 
                            sx={{ 
                                flex: 1,
                                overflow: 'hidden',
                                position: 'relative',
                                minHeight: '400px'
                            }}
                        >
                            <Tree
                                data={treeData}
                                orientation="vertical"
                                renderCustomNodeElement={renderCustomNode}
                                translate={{ x: window.innerWidth / 2, y: 50 }}
                                separation={{ siblings: 2, nonSiblings: 2 }}
                                zoom={0.8}
                                enableLegacyTransitions={true}
                                transitionDuration={800}
                            />
                        </Paper>
                    ) : (
                        <Paper sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Box sx={{ textAlign: 'center', p: 3 }}>
                                <Typography variant="h6" color="textSecondary" gutterBottom>
                                    No DOM Visualization
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                    Select a capture from the list to visualize its DOM structure, or use the browser extension to capture a new page.
                                </Typography>
                            </Box>
                        </Paper>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

export default DOMVisualizer;