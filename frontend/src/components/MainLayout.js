import React, { useState } from 'react';
import { Box, Tabs, Tab, AppBar, useMediaQuery, useTheme } from '@mui/material';
import DOMVisualizer from './DOMVisualizer';
import InteractionRecorder from './InteractionRecorder';

function TabPanel(props) {
    const { children, value, index, ...other } = props;
    return (
        <Box
            role="tabpanel"
            hidden={value !== index}
            id={`tabpanel-${index}`}
            aria-labelledby={`tab-${index}`}
            sx={{
                flex: 1,
                overflow: 'auto',
                minHeight: 0, // Allow container to shrink
                height: 'calc(100vh - 48px)' // Subtract AppBar height
            }}
            {...other}
        >
            {value === index && (
                <Box sx={{
                    p: { xs: 1, sm: 2 }, // Responsive padding
                    height: '100%',
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    {children}
                </Box>
            )}
        </Box>
    );
}

const MainLayout = () => {
    const [currentTab, setCurrentTab] = useState(0);
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    const handleTabChange = (event, newValue) => {
        setCurrentTab(newValue);
    };

    return (
        <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: '100vh',
            bgcolor: '#f5f5f5',
            overflow: 'hidden' // Prevent double scrollbars
        }}>
            <AppBar 
                position="static" 
                color="default"
                elevation={0}
                sx={{ borderBottom: 1, borderColor: 'divider' }}
            >
                <Tabs 
                    value={currentTab} 
                    onChange={handleTabChange}
                    aria-label="DOM analysis tabs"
                    variant={isMobile ? "fullWidth" : "standard"}
                    sx={{
                        minHeight: '48px', // Reduce tab height
                        '& .MuiTab-root': {
                            minHeight: '48px',
                            padding: { xs: '6px 12px', sm: '6px 16px' },
                            fontSize: { xs: '0.875rem', sm: '1rem' }
                        }
                    }}
                >
                    <Tab 
                        label="DOM Analyzer" 
                        sx={{ 
                            textTransform: 'none',
                            minWidth: { xs: 'auto', sm: 120 }
                        }}
                    />
                    <Tab 
                        label="Interaction Recorder" 
                        sx={{ 
                            textTransform: 'none',
                            minWidth: { xs: 'auto', sm: 120 }
                        }}
                    />
                </Tabs>
            </AppBar>

            <TabPanel value={currentTab} index={0}>
                <DOMVisualizer />
            </TabPanel>
            <TabPanel value={currentTab} index={1}>
                <InteractionRecorder />
            </TabPanel>
        </Box>
    );
};

export default MainLayout;