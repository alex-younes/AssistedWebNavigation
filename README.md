# FYP Tracker Extension

This extension tracks user interactions on web pages for analytics and research purposes.

## Setup Instructions

### 1. Backend Setup

#### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local installation or MongoDB Atlas account)

#### Installation
1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the backend directory with the following content:
   ```
   PORT=3000
   DEBUG=true
   NODE_ENV=development
   MONGO_URI=mongodb://localhost:27017/fypTracker
   ```

4. Set up MongoDB:
   - If using a local MongoDB installation, make sure MongoDB service is running
   - If using MongoDB Atlas, update the MONGO_URI in the `.env` file with your connection string

5. Start the backend server:
   ```
   npm start
   ```

6. Verify the server is running by accessing the health endpoint:
   ```
   http://localhost:3000/health
   ```

### 2. Extension Setup

1. Open Chrome and navigate to `chrome://extensions/`

2. Enable "Developer mode" (toggle in the top-right corner)

3. Click "Load unpacked" and select the `extension` directory

4. The extension should now appear in your browser toolbar

5. Click on the extension icon and configure the server address:
   - Enter the IP address shown in the backend console output
   - Set the port to match your `.env` file (default: 3000)
   - Click "Save Settings"

6. Test the connection by clicking "Test Connection"

## Usage

1. Navigate to a website you want to track

2. Click the extension icon and click "Start Recording"

3. Your interactions will now be tracked and sent to the backend server

4. To stop recording, click the extension icon and click "Stop Recording"

5. View recorded sessions in the backend dashboard (if implemented)

## Troubleshooting

### Extension Not Recording
- Ensure the backend server is running
- Check that the server address is correctly configured in the extension
- Make sure you're on a valid webpage (not a chrome:// or extension:// page)
- Check the browser console for any error messages

### Connection Issues
- Verify MongoDB is running if using a local installation
- Check that the MONGO_URI in the `.env` file is correct
- Ensure no other service is using the same port (default: 3000)
- Check firewall settings if connecting from a different device

### Database Issues
- Check MongoDB connection status in the backend console logs
- Verify the database and collections are created correctly in MongoDB Compass

## Development

To reload the extension after making changes:
1. Go to `chrome://extensions/`
2. Find the FYP Tracker extension
3. Click the refresh icon

To debug issues:
1. Right-click the extension icon and select "Inspect popup" to debug the popup
2. Open DevTools on any page and check the console for content script logs
3. Review backend server logs for API and database issues 