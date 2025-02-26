# Testing Guide for Web Interaction Recorder

This guide outlines steps to test the integration between the frontend, backend, and browser extension.

## Prerequisites

1. Start the backend server:
```bash
cd backend
npm install
npm start
```

2. Start the frontend application:
```bash
cd frontend
npm install
npm start
```

3. Install the extension:
   - Open Chrome extensions page: `chrome://extensions/`
   - Enable "Developer mode" in the top-right corner
   - Click "Load unpacked" and select the `extension` folder

## Testing Scenarios

### 1. Extension to Backend Communication

**Test: DOM Capture**
1. Navigate to any website in Chrome
2. Click the extension icon
3. Click "Capture DOM Structure"
4. Verify status shows "Page captured successfully!"
5. Open the frontend application
6. Navigate to the Interaction Recorder
7. Switch to "Browser Extension" mode
8. Verify the captured DOM analysis appears in the list

**Expected Result**: The DOM structure should be captured and available in the frontend.

### 2. Recording Interactions

**Test: Record Browser Tab Interactions**
1. Navigate to any website in Chrome
2. Click the extension icon
3. Click "Start Recording"
4. Perform some interactions (clicks, form submissions)
5. Click "Stop Recording"
6. Open the frontend application
7. Navigate to the Interaction Recorder
8. Switch to "Browser Extension" mode
9. Select the recording session from the dropdown
10. Verify the interactions are displayed in the list

**Expected Result**: All recorded interactions should appear in the frontend.

### 3. Switching Between Recording Modes

**Test: Mode Switching**
1. Open the frontend application
2. Go to the Interaction Recorder
3. Switch between "Headless Browser" and "Browser Extension" modes
4. Verify the UI updates appropriately
5. For Browser Extension mode, verify the session list refreshes when clicking "Refresh"

**Expected Result**: UI should update correctly for both modes.

### 4. Error Handling

**Test: Backend Disconnected**
1. Stop the backend server
2. Try to use the extension
3. Verify appropriate error messages are shown
4. Restart the backend server
5. Verify connection is reestablished

**Expected Result**: Proper error messages should be displayed, and functionality should restore when the server is available again.

## Known Limitations

- The extension doesn't currently work in incognito mode
- Very large DOM structures may cause performance issues
- Certain interactions like hovering and keyboard events aren't recorded

## Troubleshooting

If you encounter issues:

1. Check browser console for errors
2. Verify backend server is running
3. Ensure correct API endpoints are configured
4. Try reloading the extension
5. Clear browser cache if necessary 