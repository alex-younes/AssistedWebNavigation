# Database Direct Access Scripts

These scripts help you directly access MongoDB data for sessions, avoiding API limitations.

## Preparation

1. Make sure MongoDB connection settings are correct in `.env` (should be already set up)
2. Ensure you have the session ID you want to analyze. You can get it from the admin panel or logs.

## Available Scripts

### 1. Prepare Session for Analysis

This script fetches all session data (including states and non-transitional events) and prepares a complete file ready for AI analysis.

```bash
node prepare-session-for-analysis.js <sessionId>
```

Example:
```bash
node prepare-session-for-analysis.js session_1747592459682
```

This creates:
- `complete_session_<sessionId>.json` - The complete session data file
- `stats_<sessionId>.json` - Summary statistics about the session events

### 2. Fetch Only Non-Transitional Events

If you only need the non-transitional events:

```bash
node fetch-nontransitional-data.js <sessionId>
```

## Using Prepared Data with AI Analysis Server

1. Copy the generated `complete_session_<sessionId>.json` file to the `ai-analysis-server/data/` directory

2. Run the direct analysis script:

```bash
cd ../ai-analysis-server
node src/run-direct-analysis.js <sessionId>
```

Or you can specify the full path to the JSON file:

```bash
node src/run-direct-analysis.js data/complete_session_1747592459682.json
```

## Troubleshooting

- If the script reports "No non-transitional events found", check the database collections directly with MongoDB Compass to verify events exist.
- Make sure the session ID is correct - this should match the `id` field in the `sessions` collection.
- Verify MongoDB connection - check the MongoDB URI in `.env` 