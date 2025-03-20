# DOM State Tracker - Browser Extension

This browser extension captures user interactions and DOM state changes on web pages. It focuses on tracking how the DOM changes in response to user actions, providing a clear mapping between interactions and state transitions.

## Core Functionality

- Records user interactions (clicks, form inputs, etc.) on web pages
- Tracks DOM state changes triggered by user interactions
- Creates a sequential record of state transitions
- Sends data to a backend server for analysis

## Installation

1. Open Chrome extensions page: `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select the `extension` folder

## Usage

### Setting Up

1. Click the extension icon in the browser toolbar
2. Enter your backend server IP address and port (default: localhost:3001)
3. Click "Save Configuration" to connect to the backend

### Recording Interactions and States

1. Navigate to the web page you want to analyze
2. Click the extension icon in the toolbar
3. Click "Start Recording" to begin tracking interactions and state changes
4. Interact with the page normally (click buttons, fill forms, etc.)
5. Notice the extension keeps track of interactions and duration
6. Click "Stop Recording" when you're done

### Viewing Results

The recorded data is sent to the backend server, where you can:
1. View the sequence of state transitions
2. See which interactions triggered each state change
3. Analyze the DOM structure at each state

## How It Works

1. **Interaction Tracking**: When a user interacts with a page element (clicks, types, etc.), the extension captures the details of that interaction.

2. **DOM Mutation Tracking**: After each interaction, the extension uses MutationObserver to detect changes to the DOM.

3. **State Management**: When a significant DOM change is detected, a new "state" is created with a unique fingerprint.

4. **Data Flow**: Interactions and state data are buffered locally and periodically sent to the backend server.

## Server Integration

The extension communicates with a backend server that:
- Stores user interactions
- Stores DOM states
- Maintains session information

Make sure the backend server is running at the configured address before using the extension.

## Troubleshooting

- If the extension can't connect to the server, check your server configuration
- If interactions aren't being recorded, try refreshing the page
- Check the browser console for any error messages 