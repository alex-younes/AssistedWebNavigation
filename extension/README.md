# Web Interaction Recorder - Browser Extension

This browser extension allows you to record user interactions on web pages and analyze DOM structures. It works in conjunction with the main application to provide a seamless experience for recording and analyzing web interactions.

## Features

- Record clicks, form submissions, and other interactions on any web page
- Capture the DOM structure of web pages for analysis
- Seamlessly integrate with the main application

## Installation

1. Open Chrome extensions page: `chrome://extensions/`
2. Enable "Developer mode" in the top-right corner
3. Click "Load unpacked" and select the `extension` folder

## Usage

### Recording Interactions

1. Navigate to any web page you want to record
2. Click the extension icon in the toolbar
3. Click "Start Recording" to begin capturing interactions
4. Interact with the page normally
5. Click "Stop Recording" when you're done
6. View the recorded interactions in the main application

### Capturing DOM Structure

1. Navigate to the page you want to analyze
2. Click the extension icon in the toolbar
3. Click "Capture DOM Structure"
4. View the DOM analysis in the main application

## Integration with Main Application

The extension automatically communicates with the main application. Make sure the backend server is running on `http://localhost:3001` before using the extension.

In the main application:
1. Go to the Interaction Recorder
2. Select "Browser Extension" as the recording mode
3. Use the dropdown to select and view your recorded sessions

## Troubleshooting

- If the extension isn't recording, make sure the content script is properly loaded
- If you see connection errors, check that the backend server is running
- Try refreshing the page if the extension isn't responding 