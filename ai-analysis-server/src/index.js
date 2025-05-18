require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

// Import routes
const analysisRoutes = require('./routes/analysisRoutes');

// Initialize express app
const app = express();
const PORT = process.env.PORT || 3100;

// Middleware
app.use(morgan('dev'));
app.use(cors({
  origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173']
}));
app.use(express.json({ limit: '10mb' })); // For handling large JSON payloads

// Routes
app.use('/api/analysis', analysisRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'AI Analysis server is running' });
});

// Start the server
app.listen(PORT, () => {
  console.log(`AI Analysis server listening on port ${PORT}`);
}); 