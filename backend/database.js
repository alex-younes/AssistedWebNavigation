// Simple in-memory database module
// This is a placeholder for a real database implementation

// In-memory storage
const storage = {
    interactions: [],
    sessions: [],
    domCaptures: [] // DOM captures are not yet implemented
};

// Basic database operations
const db = {
    // Interactions
    saveInteraction: async (interaction) => {
        interaction.id = Date.now() + Math.random().toString(36).substring(2, 9);
        storage.interactions.push(interaction);
        return interaction;
    },
    
    getInteractions: async (filter = {}) => {
        // Simple filtering
        if (filter.sessionId) {
            return storage.interactions.filter(i => i.sessionId === filter.sessionId);
        }
        return storage.interactions;
    },
    
    // Sessions
    saveSession: async (session) => {
        session.id = session.id || Date.now() + Math.random().toString(36).substring(2, 9);
        storage.sessions.push(session);
        return session;
    },
    
    getSessions: async (filter = {}) => {
        // Simple filtering
        if (filter.id) {
            return storage.sessions.find(s => s.id === filter.id);
        }
        return storage.sessions;
    },
    
    updateSession: async (sessionId, updates) => {
        const index = storage.sessions.findIndex(s => s.id === sessionId || s.sessionId === sessionId);
        if (index !== -1) {
            storage.sessions[index] = { ...storage.sessions[index], ...updates };
            return storage.sessions[index];
        }
        return null;
    },
    
    // DOM Captures
    saveDOMCapture: async (capture) => {
        capture.id = Date.now() + Math.random().toString(36).substring(2, 9);
        storage.domCaptures.push(capture);
        return capture;
    },
    
    getDOMCaptures: async (filter = {}) => {
        // Simple filtering
        if (filter.id) {
            return storage.domCaptures.find(c => c.id === filter.id);
        }
        return storage.domCaptures;
    }
};

module.exports = db; 