// Load environment variables (safe to call multiple times)
if (!process.env.VERCEL) {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('./backend/config/passport'); // Google OAuth enabled
const logger = require('./backend/utils/logger');
const autoSyncService = require('./backend/services/autoSyncService');

const app = express();
const PORT = process.env.PORT || 3007;

// Middleware
// CORS Configuration - Restrict origins in production
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
  : '*';

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
// Increase payload limit to 10MB for importing large conversion batches
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Passport for Google OAuth
app.use(passport.initialize());

// Serve static files from frontend directory only
app.use(express.static(path.join(__dirname, 'frontend')));

// Import routes
const authRoutes = require('./backend/routes/auth');
const neonAuthRoutes = require('./backend/routes/neonAuthRoutes');
const dashboardRoutes = require('./backend/routes/dashboard');
const adminRoutes = require('./backend/routes/admin');
const publicRoutes = require('./backend/routes/public');

// Mount routes
app.use('/api/auth', authRoutes); // Keep old auth for backward compatibility
app.use('/api/neon-auth', neonAuthRoutes); // New Neon Auth routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/public', publicRoutes); // Public endpoints (no auth required)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Cashback API'
  });
});

// Dev login helper (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.get('/dev-login', (req, res) => {
    res.sendFile(path.join(__dirname, 'dev-login.html'));
  });
}

// Routes for HTML pages (without .html extension)
const pages = ['login', 'login-neon', 'register', 'dashboard', 'history', 'index', 'forgot-password', 'reset-password'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', `${page}.html`));
  });
});

// Admin routes
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'admin', 'index.html'));
});

app.get('/admin/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'frontend', 'admin', `${page}.html`));
});

// Default route - serve homepage (landing page)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Ignore source map requests (silent 404)
app.use((req, res, next) => {
  if (req.path.endsWith('.map') || req.path.includes('.map.')) {
    return res.status(204).send(); // No Content
  }
  next();
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

// Initialize auto-sync service (can be enabled/disabled from admin panel)
autoSyncService.initialize()
  .then(() => {
    logger.info('Auto-sync service initialized');
  })
  .catch((error) => {
    logger.error('Failed to initialize auto-sync service', { error: error.message });
  });

// Start server (only if not running on Vercel)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, async () => {
    console.log('='.repeat(60));
    console.log(`🚀 Cashback Server is running`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
    console.log(`🔑 JWT Secret: ${process.env.JWT_SECRET ? 'Configured' : 'Using default'}`);
    console.log(`⏰ Auto Sync: DISABLED (Manual sync only)`);
    console.log('='.repeat(60));

    // Initial sync DISABLED - Use manual sync from admin panel
    // Run initial sync on server start (DISABLED)
    // if (process.env.SYNC_ON_START !== 'false') {
    //   logger.info('Running initial conversion sync...');
    //   try {
    //     await syncConversions();
    //   } catch (error) {
    //     logger.error('Initial sync failed', { error: error.message });
    //   }
    // }
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

// Export for Vercel
module.exports = app;
