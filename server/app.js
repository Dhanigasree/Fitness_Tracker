// Initialize Datadog tracing FIRST - must be before other imports
const { tracer, logger } = require('./datadog');

// Import required modules
const express = require('express');          // Express framework for building the server
const path = require('path');                // Node.js module to handle file paths
const mongoose = require('mongoose');        // MongoDB ODM
const authRoutes = require('./routes/auth'); // Import authentication routes from a separate file

// Create an Express app
const app = express();

// Environment configuration
require('dotenv').config();

const redactMongoUri = (uri) => uri.replace(/\/\/.*@/, '//***:***@');

const sanitizeBody = (body = {}) => {
  const sanitized = { ...body };
  if (sanitized.password) {
    sanitized.password = '[REDACTED]';
  }
  return sanitized;
};

// MongoDB connection with environment variable support
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fitness-tracker';

// Connect to MongoDB with error handling and retry logic
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGODB_URI);
    logger.info('Database connection established', {
      host: conn.connection.host,
      database: conn.connection.name,
      action: 'mongodb_connected'
    });
    console.log(`✅ Connected to MongoDB: ${conn.connection.host}`);
  } catch (err) {
    logger.error('Database connection failed', {
      error: err.message,
      mongoUri: redactMongoUri(MONGODB_URI),
      action: 'mongodb_connection_failed'
    });
    console.error('❌ MongoDB connection error:', err.message);
    // Retry connection after 5 seconds
    setTimeout(connectDB, 5000);
  }
};

// Initialize database connection
connectDB();

// Middleware: Parse incoming JSON data in requests (used in POST requests like login/register)
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent')
    });
  });
  
  next();
});

// Middleware: Serve all static files (HTML, CSS, JS, images, etc.) from the "public" folder
app.use(express.static(path.join(__dirname, '..', 'public')));

// Log ALL /api/auth requests for debugging
app.use('/api/auth', (req, res, next) => {
  logger.info('API AUTH REQUEST RECEIVED', {
    method: req.method,
    path: req.path,
    url: req.url,
    body: sanitizeBody(req.body),
    query: req.query,
    headers: req.headers,
    action: 'api_auth_request'
  });
  next();
});

// Mount authentication routes at the path "/api/auth"
// e.g., /api/auth/register, /api/auth/login
app.use('/api/auth', authRoutes);

// Route: Redirect root URL ("/") to the main homepage (index.html in public/pages)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'pages', 'index.html'));
});

// Set server port and start listening with environment variable support
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info('Server started successfully', {
    host: HOST,
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    database: redactMongoUri(MONGODB_URI),
    action: 'server_started'
  });
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: ${redactMongoUri(MONGODB_URI)}`);
});
