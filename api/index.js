// Vercel Serverless Function Entry Point
// Load environment variables first
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Import the Express app
const app = require('../server-cashback');

// Export as a Vercel serverless function handler
module.exports = app;
