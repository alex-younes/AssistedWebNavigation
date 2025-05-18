# AI Analysis Server

A dedicated server for AI-powered analysis of DOM State Tracker sessions.

## Structure

```
ai-analysis-server/
├── .env                 # Environment variables
├── package.json         # Dependencies and scripts
├── src/
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   └── index.js         # Entry point
```

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Start the server:
   ```
   npm run dev
   ```

## API Endpoints

- `POST /api/analysis/session` - Analyze a single session
- `POST /api/analysis/batch` - Analyze multiple sessions
- `POST /api/analysis/compare` - Compare different session groups
- `GET /health` - Server health check

## Environment Variables

- `PORT` - Server port (default: 3100)
- `GROQ_API_KEY` - API key for Groq
- `CORS_ALLOWED_ORIGINS` - Comma-separated list of allowed origins
- `NODE_ENV` - Environment (development/production) 