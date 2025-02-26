# Web Interaction Recorder

A comprehensive tool for recording and analyzing user interactions on web pages. This project consists of three main components:

1. **Frontend**: React application for viewing and managing recordings
2. **Backend**: Node.js server that processes recordings and analyzes DOM structures
3. **Browser Extension**: Chrome extension that records interactions on active tabs

## Architecture

The system is designed to support two modes of recording:

### Headless Browser Mode
- Uses Playwright to control a headless browser
- Records interactions within the controlled browser
- Captures DOM structure and analyzes pages

### Browser Extension Mode
- Records interactions directly in the user's browser tab
- Captures DOM structure from the active tab
- Sends data to the backend for processing

## Installation

### Backend
```bash
cd backend
npm install
npm start
```

### Frontend
```bash
cd frontend
npm install
npm start
```

### Browser Extension
1. Open Chrome extensions page: `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select the `extension` folder

## Integration Flow

The integration between the components works as follows:

1. **User Initiates Recording**: 
   - In Headless Mode: From the frontend UI
   - In Extension Mode: From the browser extension popup

2. **Recording Process**:
   - Interactions are captured as events (clicks, form submissions, etc.)
   - Each interaction is stored with metadata (timestamp, element information, etc.)

3. **Viewing Recordings**:
   - The frontend application displays recorded sessions
   - Users can select a session to view detailed interactions
   - The DOM structure can be visualized and analyzed

## Development

### Directory Structure
```
/
├── frontend/           # React frontend application
├── backend/            # Node.js server
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   └── utils/          # Utility functions
└── extension/          # Chrome extension
    ├── background.js   # Background script
    ├── content.js      # Content script for web pages
    └── popup/          # Extension UI
```

### Key Files

- `backend/routes/extensionRoutes.js`: Handles API requests from the extension
- `extension/background.js`: Manages extension state and communication
- `extension/content.js`: Records DOM events on web pages
- `frontend/src/components/InteractionRecorder.js`: Main UI for recording management

## Future Enhancements

- Support for additional browsers (Firefox, Safari)
- Advanced filtering and search of recorded interactions
- AI-powered analysis of user behaviors
- Performance optimization for large DOM structures 