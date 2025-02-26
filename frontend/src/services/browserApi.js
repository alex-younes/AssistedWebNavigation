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

    getExtensionSessions: async () => {
        try {
            console.log('Getting extension recording sessions...');
            const response = await axios.get(`${API_BASE_URL}/extension/recorder/sessions`);
            console.log('Extension sessions response:', response.data);
            return response.data.sessions || [];
        } catch (error) {
            handleError(error);
        }
    },

    getExtensionInteractions: async (sessionId) => {
        try {
            console.log(`Getting interactions for extension session ${sessionId}...`);
            const response = await axios.get(`${API_BASE_URL}/extension/recorder/interactions/${sessionId}`);
            return {
                interactions: response.data.interactions || [],
                sessionData: response.data.sessionData
            };
        } catch (error) {
            handleError(error);
        }
    },

    getExtensionRecordingStatus: async () => {
        try {
            const response = await axios.get(`${API_BASE_URL}/extension/recorder/status`);
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

    // New function to explicitly stop recording from the frontend
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

    // New function to clear all interactions for a session
    clearExtensionInteractions: async (sessionId) => {
        try {
            console.log(`Clearing all interactions for session ${sessionId}...`);
            const response = await axios.post(`${API_BASE_URL}/extension/recorder/clearInteractions/${sessionId}`);
            console.log('Clear interactions response:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error clearing interactions:', error);
            handleError(error);
        }
    },

    // New function to get all DOM captures from the extension
    getExtensionCaptures: async () => {
        try {
            console.log('Getting DOM captures from extension...');
            const response = await axios.get(`${API_BASE_URL}/extension/captures`);
            console.log('Extension captures response:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error getting extension captures:', error);
            // If the endpoint doesn't exist yet, return an empty array
            if (error.response && error.response.status === 404) {
                return { captures: [] };
            }
            handleError(error);
        }
    },

    // New function to get a specific DOM capture by ID
    getExtensionCapture: async (captureId) => {
        try {
            console.log(`Getting DOM capture with ID ${captureId}...`);
            const response = await axios.get(`${API_BASE_URL}/extension/captures/${captureId}`);
            console.log('Extension capture response:', response.data);
            return response.data;
        } catch (error) {
            handleError(error);
        }
    }
};