import React from 'react';
import { 
    List, 
    ListItem, 
    Typography, 
    Box,
    Chip,
    Card,
    IconButton,
    Tooltip,
    Collapse
} from '@mui/material';
import { 
    Mouse, 
    TouchApp, 
    Code, 
    Schedule,
    ExpandMore,
    ExpandLess,
    Navigation,
    Input,
    KeyboardTab
} from '@mui/icons-material';
import { useState } from 'react';

const InteractionItem = ({ interaction }) => {
    const [expanded, setExpanded] = useState(false);

    // Handle different data formats (headless browser vs extension)
    const getElementData = (interaction) => {
        // For pageLoad events, customize the display
        if (interaction.type === 'pageLoad') {
            return {
                tagName: interaction.pageTitle || 'Page',
                xpath: '',
                text: interaction.url || '',
                className: '',
                selector: ''
            };
        }
        
        // Extension format
        if (interaction.details) {
            return {
                tagName: interaction.details.elementType || 'unknown',
                xpath: interaction.details.xpath || '',
                text: interaction.details.elementText || '',
                className: interaction.details.elementClass || '',
                selector: interaction.details.selector || ''
            };
        }
        // Headless browser format
        else if (interaction.element) {
            return {
                tagName: interaction.element.tagName || 'unknown',
                xpath: interaction.element.xpath || '',
                text: interaction.element.text || '',
                className: interaction.element.className || '',
                selector: interaction.element.selector || ''
            };
        }
        // Fallback for unknown format
        return {
            tagName: 'unknown',
            xpath: '',
            text: '',
            className: '',
            selector: ''
        };
    };

    const elementData = getElementData(interaction);

    const getInteractionIcon = (type) => {
        switch (type) {
            case 'click':
                return <Mouse />;
            case 'submit':
                return <TouchApp />;
            case 'navigation':
                return <Navigation />;
            case 'input':
                return <Input />;
            case 'scroll':
                return <KeyboardTab />;
            case 'pageLoad':
                return <Code />;
            default:
                return <TouchApp />;
        }
    };

    const formatTime = (timestamp) => {
        return new Date(timestamp).toLocaleTimeString();
    };
    
    // Format display text based on interaction type
    const getDisplayText = (interaction, elementData) => {
        switch (interaction.type) {
            case 'pageLoad':
                return `PAGE LOADED - ${interaction.pageTitle || interaction.url || 'Unknown page'}`;
            case 'navigation':
                if (interaction.details && interaction.details.navigationType) {
                    return `NAVIGATION (${interaction.details.navigationType}) - ${interaction.pageTitle || 'Page'}`;
                }
                return `NAVIGATION - ${interaction.pageTitle || 'Page'}`;
            default:
                return `${interaction.type.toUpperCase()} - ${elementData.tagName}`;
        }
    };

    return (
        <Card 
            variant="outlined" 
            sx={{ 
                mb: 1,
                borderLeft: interaction.type === 'pageLoad' ? '4px solid #3f51b5' : undefined,
                backgroundColor: interaction.type === 'pageLoad' ? 'rgba(63, 81, 181, 0.05)' : undefined
            }}
        >
            <ListItem
                sx={{
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    gap: 1,
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {getInteractionIcon(interaction.type)}
                        <Typography variant="subtitle2" color="primary">
                            {getDisplayText(interaction, elementData)}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Tooltip title="Interaction time">
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Schedule fontSize="small" color="action" />
                                <Typography variant="caption" color="textSecondary">
                                    {formatTime(interaction.timestamp)}
                                </Typography>
                            </Box>
                        </Tooltip>
                        <IconButton 
                            size="small" 
                            onClick={() => setExpanded(!expanded)}
                            sx={{ transform: expanded ? 'rotate(180deg)' : 'none' }}
                        >
                            {expanded ? <ExpandLess /> : <ExpandMore />}
                        </IconButton>
                    </Box>
                </Box>

                <Collapse in={expanded}>
                    <Box sx={{ pl: 4, pt: 1 }}>
                        {/* Show URL for page loads */}
                        {interaction.type === 'pageLoad' && interaction.url && (
                            <Typography variant="body2" color="textSecondary">
                                URL: {interaction.url}
                            </Typography>
                        )}
                        
                        {/* Show page stats for page loads */}
                        {interaction.type === 'pageLoad' && interaction.details && interaction.details.pageElements && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="body2" color="textSecondary">
                                    Page elements: 
                                    {interaction.details.pageElements.links > 0 && ` ${interaction.details.pageElements.links} links,`}
                                    {interaction.details.pageElements.buttons > 0 && ` ${interaction.details.pageElements.buttons} buttons,`}
                                    {interaction.details.pageElements.forms > 0 && ` ${interaction.details.pageElements.forms} forms,`}
                                    {interaction.details.pageElements.images > 0 && ` ${interaction.details.pageElements.images} images`}
                                </Typography>
                            </Box>
                        )}
                        
                        {/* Show viewport info */}
                        {interaction.details && interaction.details.viewportWidth && (
                            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                                Viewport: {interaction.details.viewportWidth}x{interaction.details.viewportHeight}
                            </Typography>
                        )}
                        
                        {/* For navigation events */}
                        {interaction.type === 'navigation' && interaction.details && (
                            <>
                                <Typography variant="body2" color="textSecondary">
                                    From: {interaction.details.fromUrl || 'Unknown'}
                                </Typography>
                                <Typography variant="body2" color="textSecondary">
                                    To: {interaction.details.toUrl || interaction.url || 'Unknown'}
                                </Typography>
                            </>
                        )}
                    
                        {/* Standard interaction details */}
                        {elementData.xpath && interaction.type !== 'pageLoad' && interaction.type !== 'navigation' && (
                            <Tooltip title="Element XPath">
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                    <Code fontSize="small" color="action" />
                                    <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                        {elementData.xpath}
                                    </Typography>
                                </Box>
                            </Tooltip>
                        )}

                        {elementData.text && interaction.type !== 'pageLoad' && (
                            <Typography variant="body2" color="textSecondary">
                                Content: {elementData.text}
                            </Typography>
                        )}

                        {elementData.className && interaction.type !== 'pageLoad' && (
                            <Chip 
                                label={elementData.className}
                                size="small"
                                variant="outlined"
                                sx={{ mt: 1 }}
                            />
                        )}
                        
                        {/* Display any additional details for extension format */}
                        {interaction.details && interaction.details.position && (
                            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                                Position: x={interaction.details.position.x}, y={interaction.details.position.y}
                            </Typography>
                        )}
                        
                        {interaction.url && interaction.type !== 'pageLoad' && interaction.type !== 'navigation' && (
                            <Typography variant="body2" color="textSecondary" sx={{ mt: 1, fontSize: '0.7rem' }}>
                                URL: {interaction.url}
                            </Typography>
                        )}
                    </Box>
                </Collapse>
            </ListItem>
        </Card>
    );
};

const InteractionList = ({ interactions, isRecording, totalCount }) => {
    return (
        <Box sx={{ flex: 1, minHeight: 0 }}>
            {interactions.length === 0 ? (
                <Box
                    sx={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        height: 200,
                        bgcolor: 'background.paper',
                        borderRadius: 1
                    }}
                >
                    <Typography variant="body2" color="textSecondary">
                        {isRecording ? "Waiting for interactions..." : "No interactions recorded yet"}
                    </Typography>
                </Box>
            ) : (
                <List sx={{
                    p: 0,
                    '& > *:last-child': {
                        mb: 0
                    }
                }}>
                    {interactions.map((interaction, index) => (
                        <InteractionItem 
                            key={`${index}-${interaction.timestamp}`}
                            interaction={interaction}
                        />
                    ))}
                </List>
            )}
        </Box>
    );
};

export default InteractionList;