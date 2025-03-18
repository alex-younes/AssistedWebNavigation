import axios from 'axios';
import config from '../config';

const API_BASE_URL = config.API_BASE_URL;

const handleError = (error) => {
    console.error('API Error:', error);
    if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Error response:', error.response.data);
        throw new Error(error.response.data.error || 'Server error');
    } else if (error.request) {
        // The request was made but no response was received
        console.error('No response received:', error.request);
        throw new Error('No response from server');
    } else {
        // Something happened in setting up the request that triggered an Error
        console.error('Request setup error:', error.message);
        throw new Error('Failed to make request');
    }
};

export const browserApi = {
    analyzePage: async (url) => {
        try {
            console.log('Analyzing page:', url);
            const response = await axios.post(`${API_BASE_URL}/analyze`, {
                url,
                options: {
                    bypassSecurity: true,
                    recordAllOrigins: true
                }
            });
            console.log('Analyze response:', response.data);
            return response.data;
        } catch (error) {
            handleError(error);
        }
    },

    captureDom: async () => {
        try {
            console.log('Capturing DOM...');
            const response = await axios.post(`${API_BASE_URL}/captureDom`);
            console.log('DOM capture response:', response.data);
            return response.data;
        } catch (error) {
            handleError(error);
        }
    },

    closeBrowser: async () => {
        try {
            console.log('Closing browser...');
            const response = await axios.post(`${API_BASE_URL}/closeBrowser`);
            console.log('Close browser response:', response.data);
            return response.data;
        } catch (error) {
            handleError(error);
        }
    },

    startRecording: async (url) => {
        try {
            console.log('Starting recording...');
            const response = await axios.post(`${API_BASE_URL}/startRecording`, { url });
            console.log('Start recording response:', response.data);
            return response.data;
        } catch (error) {
            handleError(error);
        }
    },

    stopRecording: async () => {
        try {
            console.log('Stopping recording...');
            const response = await axios.post(`${API_BASE_URL}/stopRecording`);
            console.log('Stop recording response:', response.data);
            return response.data;
        } catch (error) {
            handleError(error);
        }
    },

    getInteractions: async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/getInteractions`);
            return response.data;
        } catch (error) {
            handleError(error);
        }
    },

    saveInteraction: async (interaction) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/saveInteraction`, { interaction });
            return response.data;
        } catch (error) {
            handleError(error);
        }
    },

    getRatingCriteria: async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/getRatingCriteria`);
            return response.data;
        } catch (error) {
            handleError(error);
        }
    },

    // Get all DOM captures
    getCaptures: async () => {
        try {
            console.log('Getting DOM captures...');
            const response = await axios.get(`${API_BASE_URL}/extension/captures`);
            console.log('DOM captures response:', response.data);
            return response.data.captures || [];
        } catch (error) {
            handleError(error);
            return [];
        }
    },

    // Get a specific DOM capture
    getCapture: async (captureId) => {
        try {
            console.log(`Getting DOM capture with ID ${captureId}...`);
            const response = await axios.get(`${API_BASE_URL}/extension/captures/${captureId}`);
            console.log('DOM capture response:', response.data);
            return response.data.capture;
        } catch (error) {
            handleError(error);
            return null;
        }
    },

    // Get extension recording sessions
    getExtensionSessions: async (userId) => {
        try {
            console.log('Getting extension recording sessions...');
            const response = await axios.get(`${API_BASE_URL}/extension/recorder/sessions`, {
                params: { userId }
            });
            console.log('Extension sessions response:', response.data);
            return response.data.sessions || [];
        } catch (error) {
            handleError(error);
            return [];
        }
    },

    // Get interactions for a session
    getExtensionInteractions: async (sessionId, userId) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/extension/recorder/interactions/${sessionId}`, {
                params: { userId }
            });
            return response.data;
        } catch (error) {
            handleError(error);
            return null;
        }
    },

    // Get extension recording status
    getExtensionRecordingStatus: async (userId) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/extension/recorder/status`, {
                params: { userId }
            });
            return response.data;
        } catch (error) {
            console.error('Error checking extension status:', error);
            // Always return a status object, even on error
            return { 
                status: 'unknown',
                isExtensionConnected: false,
                error: error.message
            };
        }
    },

    // Stop extension recording
    stopExtensionRecording: async () => {
        try {
            const response = await axios.post(`${API_BASE_URL}/extension/recorder/status`, {
                status: 'idle',
                sessionId: null,
                sessionData: null
            });
            console.log('Sent stop recording command to extension:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error stopping extension recording:', error);
            handleError(error);
        }
    },

    // Clear interactions for a session
    clearExtensionInteractions: async (sessionId, userId) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/extension/recorder/clearInteractions/${sessionId}`, {
                userId
            });
            return response.data;
        } catch (error) {
            handleError(error);
            throw error;
        }
    },

    // Store results from extension
    storeExtensionResults: async (sessionId, results) => {
        try {
            const response = await axios.post(`${API_BASE_URL}/extension/storeResults`, {
                sessionId,
                results
            });
            return response.data;
        } catch (error) {
            handleError(error);
        }
    },

    // Get all DOM captures
    getExtensionCaptures: async () => {
        try {
            console.log('Getting DOM captures...');
            const response = await axios.get(`${API_BASE_URL}/extension/captures`);
            console.log('DOM captures response:', response.data);
            
            // Add more detailed logging
            if (response.data) {
                console.log('Response data type:', typeof response.data);
                console.log('Response data has captures property:', 'captures' in response.data);
                if ('captures' in response.data) {
                    console.log('Captures array length:', response.data.captures.length);
                    console.log('First capture item (if any):', response.data.captures[0]);
                } else {
                    console.log('Full response data:', JSON.stringify(response.data, null, 2));
                }
            }
            
            // If response.data is an array, return it directly
            if (Array.isArray(response.data)) {
                console.log('Response data is an array with length:', response.data.length);
                return response.data;
            }
            
            // Otherwise, try to extract captures
            return response.data.captures || [];
        } catch (error) {
            handleError(error);
            return [];
        }
    },

    // Get a specific DOM capture
    getExtensionCapture: async (captureId) => {
        try {
            console.log(`Getting DOM capture with ID ${captureId}...`);
            const response = await axios.get(`${API_BASE_URL}/extension/captures/${captureId}`);
            console.log('DOM capture response:', response.data);
            return response.data.capture;
        } catch (error) {
            handleError(error);
            return null;
        }
    }
};