require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// AccessTrade API Configuration
const ACCESSTRADE_API_URL = process.env.ACCESSTRADE_API_URL || 'https://api.accesstrade.vn/v1';
const API_TOKEN = process.env.ACCESSTRADE_API_TOKEN;

// Create axios instance with default config
const accessTradeAPI = axios.create({
  baseURL: ACCESSTRADE_API_URL,
  headers: {
    'Authorization': `Token ${API_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

// API Routes

/**
 * GET /api/test-connection
 * Test connection to AccessTrade API
 */
app.get('/api/test-connection', async (req, res) => {
  try {
    if (!API_TOKEN) {
      return res.status(500).json({
        success: false,
        message: 'API Token not configured. Please check .env file'
      });
    }

    // Test with a simple API call to order-list with ISO format
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 7); // Last 7 days

    const testSince = yesterday.toISOString().split('.')[0] + 'Z';
    const testUntil = today.toISOString().split('.')[0] + 'Z';

    const response = await accessTradeAPI.get('/order-list', {
      params: {
        since: testSince,
        until: testUntil
      }
    });

    res.json({
      success: true,
      message: 'Connection successful',
      data: response.data
    });
  } catch (error) {
    console.error('Connection test failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Connection failed',
      error: error.response?.data || error.message
    });
  }
});

/**
 * GET /api/conversions
 * Get transactions (conversions) with date range
 * Query params: start_date, end_date (format: YYYY-MM-DD)
 */
app.get('/api/conversions', async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'start_date and end_date are required'
      });
    }

    // Call AccessTrade order-list endpoint
    // Convert YYYY-MM-DD to ISO format with Z timezone
    const since = `${start_date}T00:00:00Z`;
    const until = `${end_date}T23:59:59Z`;

    const response = await accessTradeAPI.get('/order-list', {
      params: {
        since: since,
        until: until
      }
    });

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Get conversions failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to fetch conversions',
      error: error.response?.data || error.message
    });
  }
});

/**
 * GET /api/transactions
 * Get transactions list with filters
 * Query params: start_date, end_date, status (optional)
 */
app.get('/api/transactions', async (req, res) => {
  try {
    const { start_date, end_date, status } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        message: 'start_date and end_date are required'
      });
    }

    // Convert YYYY-MM-DD to ISO format with Z timezone
    const since = `${start_date}T00:00:00Z`;
    const until = `${end_date}T23:59:59Z`;

    const params = {
      since: since,
      until: until,
      limit: 100
    };

    // Add status filter if provided
    if (status) {
      params.status = status;
    }

    const response = await accessTradeAPI.get('/transactions', {
      params: params
    });

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Get transactions failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to fetch transactions',
      error: error.response?.data || error.message
    });
  }
});

/**
 * GET /api/merchants
 * Get list of merchants
 */
app.get('/api/merchants', async (req, res) => {
  try {
    const response = await accessTradeAPI.get('/offers', {
      params: {
        limit: 100
      }
    });

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Get merchants failed:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      message: 'Failed to fetch merchants',
      error: error.response?.data || error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`API Token configured: ${API_TOKEN ? 'Yes' : 'No'}`);
});
