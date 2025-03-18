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
import { getNodeLabel, getCustomNodeProps, transformDOMToTree } from '../utils/treeHelpers';

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
            // Get captures from the backend
            const captures = await browserApi.getExtensionCaptures();
            console.log("Retrieved captures:", captures);
            
            if (Array.isArray(captures) && captures.length > 0) {
                setCaptures(captures);
                
                // Auto-select the most recent capture if available
                const mostRecent = captures[0];
                setSelectedCapture(mostRecent);
                
                // Transform DOM content if available
                if (mostRecent.domContent) {
                    console.log("Found DOM content in most recent capture");
                    const treeData = transformDOMToTree(mostRecent.domContent);
                    if (treeData) {
                        console.log("Tree data created successfully");
                        setTreeData(treeData);
                    } else {
                        console.error("Failed to transform DOM content to tree");
                    }
                } else if (mostRecent.domTree) {
                    console.log("Using existing domTree from capture");
                    setTreeData(mostRecent.domTree);
                } else {
                    console.warn("No DOM data in the most recent capture");
                }
            } else {
                console.log("No captures available or invalid captures format");
                setCaptures([]);
                setTreeData(null);
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
            if (response) {
                if (response.domContent) {
                    const treeData = transformDOMToTree(response.domContent);
                    if (treeData) {
                        setTreeData(treeData);
                        setSelectedCapture(capture);
                    } else {
                        setError('Could not parse DOM data');
                    }
                } else if (response.domTree) {
                    // Fall back to existing domTree if available
                    setTreeData(response.domTree);
                    setSelectedCapture(capture);
                } else {
                    setError('DOM data not available for this capture');
                }
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

    const renderCustomNode = ({ nodeDatum }) => {
        // Determine color based on node type
        let nodeColor = '#555';
        if (nodeDatum.tagName === 'a') nodeColor = '#0077cc';
        else if (nodeDatum.tagName === 'button') nodeColor = '#5c6bc0';
        else if (nodeDatum.tagName === 'img') nodeColor = '#43a047';
        else if (nodeDatum.tagName === 'input') nodeColor = '#f57c00';
        else if (nodeDatum.tagName === 'div') nodeColor = '#7e57c2';
        else if (nodeDatum.tagName === '#text') nodeColor = '#9e9e9e';
        
        const nodeProps = getCustomNodeProps();
        // Override the fill color
        nodeProps.nodeSvgShape.shapeProps.fill = nodeColor;
        
        return (
            <g>
                <circle {...nodeProps.nodeSvgShape.shapeProps} />
                <text {...nodeProps.textProps}>
                    {nodeDatum.name || ''}
                </text>
            </g>
        );
    };

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
                                overflow: 'auto',
                                position: 'relative',
                                minHeight: '400px'
                            }}
                        >
                            <div style={{ width: '100%', height: '500px' }}>
                                <Tree
                                    data={treeData}
                                    orientation="vertical"
                                    pathFunc="diagonal"
                                    renderCustomNodeElement={renderCustomNode}
                                    translate={{ x: 250, y: 20 }}
                                    separation={{ siblings: 1.5, nonSiblings: 2 }}
                                    nodeSize={{ x: 300, y: 40 }}
                                    zoomable
                                    scaleExtent={{ min: 0.1, max: 2 }}
                                    zoom={0.8}
                                />
                            </div>
                            <style>{`
                                .rd3t-link {
                                    stroke: #bbb;
                                    stroke-width: 0.8;
                                }
                                .rd3t-label__title {
                                    fill: #333;
                                }
                            `}</style>
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