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

    // Handle data formats for interaction visualization
    const getElementData = (interaction) => {
        // For page_info events, customize the display
        if (interaction.type === 'page_info') {
            return {
                tagName: 'Page',
                xpath: '',
                text: interaction.details?.url || interaction.url || '',
                className: '',
                selector: ''
            };
        }
        
        // For navigation events
        if (interaction.type === 'navigation') {
            return {
                tagName: 'Navigation',
                xpath: '',
                text: interaction.details?.toUrl || interaction.url || '',
                className: '',
                selector: ''
            };
        }
        
        // For click events
        if (interaction.type === 'click') {
            const targetElement = interaction.targetElement || interaction.details?.targetElement || {};
            return {
                tagName: targetElement.tagName || 'Element',
                xpath: interaction.details?.xpath || '',
                text: targetElement.text || targetElement.innerText || interaction.details?.text || '',
                className: targetElement.className || '',
                selector: interaction.details?.cssSelector || ''
            };
        }
        
        // Default format
        return {
            tagName: interaction.details?.targetElement?.tagName || interaction.details?.elementType || 'unknown',
            xpath: interaction.details?.xpath || '',
            text: interaction.details?.text || interaction.details?.elementText || '',
            className: interaction.details?.targetElement?.className || interaction.details?.elementClass || '',
            selector: interaction.details?.cssSelector || interaction.details?.selector || ''
        };
    };
    
    const getInteractionIcon = (type) => {
        switch (type) {
            case 'click':
            case 'document_click':
                return <TouchApp color="primary" />;
            case 'navigation':
                return <Navigation color="action" />;
            case 'page_info':
                return <KeyboardTab color="action" />;
            case 'input':
            case 'change':
                return <Input color="secondary" />;
            case 'dom_mutation':
                return <Code color="success" />;
            default:
                return <Schedule />;
        }
    };
    
    const formatTime = (timestamp) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    };
    
    const getDisplayText = (interaction, elementData) => {
        const type = interaction.type;
        
        if (type === 'page_info') {
            return (
                <Typography variant="body2">
                    Page load state: <strong>{interaction.details?.readyState || 'unknown'}</strong>
                    <br />
                    URL: {interaction.details?.url || interaction.url}
                </Typography>
            );
        }
        
        if (type === 'navigation') {
            return (
                <Typography variant="body2">
                    Navigated to: <strong>{interaction.details?.toUrl || interaction.url}</strong>
                    {interaction.details?.fromUrl && (
                        <>
                            <br />
                            From: {interaction.details.fromUrl}
                        </>
                    )}
                </Typography>
            );
        }
        
        if (type === 'dom_mutation') {
            return (
                <Typography variant="body2">
                    {interaction.details?.summary || 'DOM changed'}
                </Typography>
            );
        }
        
        if (type === 'click' || type === 'document_click') {
            return (
                <Typography variant="body2">
                    Clicked on: <strong>{elementData.tagName}</strong>
                    {elementData.text && (
                        <>
                            <br />
                            Text: "{elementData.text.substring(0, 50)}{elementData.text.length > 50 ? '...' : ''}"
                        </>
                    )}
                </Typography>
            );
        }
        
        if (type === 'input' || type === 'change') {
            return (
                <Typography variant="body2">
                    Input on: <strong>{elementData.tagName}</strong>
                    {interaction.details?.fieldName && (
                        <>
                            <br />
                            Field: {interaction.details.fieldName}
                        </>
                    )}
                    {interaction.details?.value && (
                        <>
                            <br />
                            Value: "{interaction.details.value.substring(0, 30)}{interaction.details.value.length > 30 ? '...' : ''}"
                        </>
                    )}
                </Typography>
            );
        }
        
        return (
            <Typography variant="body2">
                {type} on {elementData.tagName || 'element'}
            </Typography>
        );
    };
    
    const elementData = getElementData(interaction);
    
    return (
        <Card 
            variant="outlined" 
            sx={{ 
                mb: 1, 
                borderLeft: '4px solid',
                borderLeftColor: interaction.type === 'click' ? 'primary.main' : 
                                 interaction.type === 'navigation' ? 'secondary.main' : 
                                 interaction.type === 'dom_mutation' ? 'success.main' : 
                                 'grey.400',
                '&:hover': {
                    backgroundColor: 'rgba(0, 0, 0, 0.02)'
                }
            }}
        >
            <ListItem 
                alignItems="flex-start"
                secondaryAction={
                    <IconButton 
                        edge="end" 
                        onClick={() => setExpanded(!expanded)}
                        size="small"
                    >
                        {expanded ? <ExpandLess /> : <ExpandMore />}
                    </IconButton>
                }
                sx={{ 
                    pr: 6,
                    py: 1
                }}
            >
                <Box sx={{ mr: 1, display: 'flex', alignItems: 'center' }}>
                    {getInteractionIcon(interaction.type)}
                </Box>
                
                <Box sx={{ flexGrow: 1 }}>
                    <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'flex-start',
                        mb: 0.5
                    }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="subtitle2" component="span">
                                {interaction.type}
                            </Typography>
                            <Chip 
                                label={formatTime(interaction.timestamp)} 
                                size="small" 
                                sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                        </Box>
                    </Box>
                    
                    {getDisplayText(interaction, elementData)}
                </Box>
            </ListItem>
            
            <Collapse in={expanded} timeout="auto" unmountOnExit>
                <Box sx={{ p: 2, pt: 0, backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                    <Typography variant="subtitle2" sx={{ mt: 1 }}>
                        Details:
                    </Typography>
                    <pre style={{ 
                        overflow: 'auto', 
                        fontSize: '0.75rem',
                        backgroundColor: 'rgba(0, 0, 0, 0.03)',
                        padding: '8px',
                        borderRadius: '4px',
                        maxHeight: '300px'
                    }}>
                        {JSON.stringify(interaction, null, 2)}
                    </pre>
                </Box>
            </Collapse>
        </Card>
    );
};

const InteractionList = ({ interactions }) => {
    return (
        <List sx={{ 
            width: '100%',
            p: 2,
            '& > :first-of-type': {
                mt: 0,
            }
        }}>
            {interactions && interactions.length > 0 ? (
                interactions.map((interaction, index) => (
                    <InteractionItem 
                        key={interaction._id || interaction.id || `${interaction.type}-${index}`} 
                        interaction={interaction} 
                    />
                ))
            ) : (
                <Typography variant="body1" color="text.secondary" align="center" sx={{ py: 3 }}>
                    No interactions to display
                </Typography>
            )}
        </List>
    );
};

export default InteractionList;