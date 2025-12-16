// Load environment variables (safe to call multiple times)
// Updated: Fixed homepage route to serve index.html instead of dashboard.html
if (!process.env.VERCEL) {
  require('dotenv').config();
}

// SECURITY: Validate required environment variables
if (!process.env.JWT_SECRET) {
  console.error('❌ CRITICAL: JWT_SECRET environment variable is required');
  console.error('   Generate secure secret: openssl rand -base64 32');
  console.error('   Add to .env file: JWT_SECRET=<your-secret-here>');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('❌ CRITICAL: DATABASE_URL environment variable is required');
  process.exit(1);
}

// Set timezone to Vietnam (UTC+7)
process.env.TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const passport = require('./backend/config/passport'); // Google OAuth enabled
// const cron = require('node-cron'); // DISABLED - manual sync only
// const { syncConversions } = require('./backend/jobs/syncConversions'); // Used in admin routes
const logger = require('./backend/utils/logger');
const cronJobsService = require('./backend/jobs/cronJobs'); // Cron jobs for retry and cleanup

const app = express();
const PORT = process.env.PORT || 3007;

// SECURITY: CORS configuration with specific allowed origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : [
      `http://localhost:${PORT}`,
      'http://localhost:3007',
      'https://chatchiu.online',
      'https://www.chatchiu.online'
    ];

// SECURITY: Helmet.js for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.accesstrade.vn"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false, // Allow embedding resources from CDNs
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    // Log for debugging
    console.log('[CORS] Request origin:', origin || 'no-origin');

    // Allow requests with no origin (like mobile apps, Postman, or same-origin)
    if (!origin) return callback(null, true);

    // Allow all origins in production if ALLOWED_ORIGINS not set (for same-domain deployment)
    if (process.env.VERCEL && !process.env.ALLOWED_ORIGINS) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked request from origin: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS policy`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Increase payload limit to 10MB for importing large conversion batches
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Initialize Passport for Google OAuth
app.use(passport.initialize());

// Import routes
const authRoutes = require('./backend/routes/auth');
const neonAuthRoutes = require('./backend/routes/neonAuthRoutes');
const dashboardRoutes = require('./backend/routes/dashboard');
const adminRoutes = require('./backend/routes/admin');
const reconciliationRoutes = require('./backend/routes/reconciliation');
const paymentRequestRoutes = require('./backend/routes/paymentRequest');
const publicRoutes = require('./backend/routes/public');
const systemReconciliationAdminRoutes = require('./backend/routes/systemReconciliationAdmin');
const systemReconciliationUserRoutes = require('./backend/routes/systemReconciliationUser');
const systemSettingsRoutes = require('./backend/routes/systemSettings');
const userPaymentHistoryRoutes = require('./backend/routes/userPaymentHistory');
const userProfileRoutes = require('./backend/routes/userProfile');
const paymentAccountRoutes = require('./backend/routes/paymentAccount');

// Mount API routes (BEFORE static files)
app.use('/api/auth', authRoutes); // Keep old auth for backward compatibility
app.use('/api/neon-auth', neonAuthRoutes); // New Neon Auth routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reconciliation', reconciliationRoutes); // Reconciliation module (admin only)
app.use('/api/payment-requests', paymentRequestRoutes); // Payment request module (user + admin)
app.use('/api/public', publicRoutes); // Public endpoints (no auth required)
app.use('/api/admin/system-reconciliation', systemReconciliationAdminRoutes); // System Reconciliation module (admin only)
app.use('/api/user/system-reconciliation', systemReconciliationUserRoutes); // System Reconciliation module (user)
app.use('/api/system-settings', systemSettingsRoutes); // System settings (admin only)
app.use('/api/user', userProfileRoutes); // User profile module (must be before userPaymentHistoryRoutes)
app.use('/api/user', userPaymentHistoryRoutes); // User payment history module
app.use('/api/user/payment-accounts', paymentAccountRoutes); // Payment account management

// Health check endpoint with database check
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Cashback API',
    environment: process.env.VERCEL ? 'vercel' : 'local',
    database: 'unknown'
  };

  try {
    const { pool } = require('./backend/config/database');
    const result = await pool.query('SELECT NOW() as time, version() as pg_version');
    health.database = 'connected';
    health.dbTime = result.rows[0].time;
    health.dbVersion = result.rows[0].pg_version.split(' ')[0] + ' ' + result.rows[0].pg_version.split(' ')[1];
  } catch (error) {
    health.database = 'error';
    health.dbError = error.message;
    health.status = 'degraded';
  }

  res.json(health);
});

// Routes for HTML pages (without .html extension)
const pages = ['login', 'login-neon', 'register', 'dashboard', 'history', 'reconciliation-history', 'payment-requests', 'forgot-password', 'reset-password', 'profile'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', `${page}.html`));
  });

  // Redirect .html to clean URL
  app.get(`/${page}.html`, (req, res) => {
    res.redirect(301, `/${page}`);
  });
});

// Payment History routes (user module)
app.get('/payment-history', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'user', 'payment-history.html'));
});

app.get('/payment-history.html', (req, res) => {
  res.redirect(301, '/payment-history');
});

app.get('/payment-detail', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'user', 'payment-detail.html'));
});

app.get('/payment-detail.html', (req, res) => {
  res.redirect(301, '/payment-detail');
});

// Reconciliation history - temporarily disabled (will be a separate module from history)
// app.get('/reconciliation-history', (req, res) => {
//   res.redirect(301, '/history');
// });

// Admin routes (clean URLs without .html)
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'admin', 'index.html'));
});

// Redirect .html URLs to clean URLs (BEFORE dynamic route)
app.get('/admin/index.html', (req, res) => {
  res.redirect(301, '/admin');
});

app.get('/admin/:page', (req, res, next) => {
  const page = req.params.page;

  // IMPORTANT: Skip static files (css, js, images, fonts, etc.)
  // Only handle HTML pages
  if (page.includes('.') && !page.endsWith('.html')) {
    // This is a static file request, pass to next middleware (static handler)
    return next();
  }

  // If page ends with .html, redirect to clean URL
  if (page.endsWith('.html')) {
    const cleanPage = page.replace('.html', '');
    return res.redirect(301, `/admin/${cleanPage}`);
  }

  // Special case: redirect admin profile to user profile (same page for both)
  if (page === 'profile') {
    return res.redirect(301, '/profile');
  }

  // Serve the HTML file
  res.sendFile(path.join(__dirname, 'frontend', 'admin', `${page}.html`));
});

// User routes (clean URLs without .html)
app.get('/user/:page', (req, res, next) => {
  const page = req.params.page;

  // IMPORTANT: Skip static files (css, js, images, fonts, etc.)
  // Only handle HTML pages
  if (page.includes('.') && !page.endsWith('.html')) {
    // This is a static file request, pass to next middleware (static handler)
    return next();
  }

  // If page ends with .html, redirect to clean URL
  if (page.endsWith('.html')) {
    const cleanPage = page.replace('.html', '');
    return res.redirect(301, `/user/${cleanPage}`);
  }

  // Serve the HTML file
  res.sendFile(path.join(__dirname, 'frontend', 'user', `${page}.html`));
});

// Shopping page route
app.get('/shopping', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'shopping.html'));
});

// Redirect shopping.html to clean URL
app.get('/shopping.html', (req, res) => {
  res.redirect(301, '/shopping');
});

// Statistics page route
app.get('/statistics', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'statistics.html'));
});

// Redirect statistics.html to clean URL
app.get('/statistics.html', (req, res) => {
  res.redirect(301, '/statistics');
});

// Dashboard page route (legacy support)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html'));
});

// Redirect dashboard.html to clean URL
app.get('/dashboard.html', (req, res) => {
  res.redirect(301, '/dashboard');
});

// Default route - serve landing page (index.html)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Serve static files AFTER all specific routes
app.use(express.static(path.join(__dirname, 'frontend')));

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

// Auto sync DISABLED - Use manual sync from admin panel
// Setup cron job for automatic conversion sync (DISABLED)
// Run every 3 hours: '0 */3 * * *'
// Or 5 times per day: '0 6,10,14,18,22 * * *'
// const cronSchedule = process.env.SYNC_CRON_SCHEDULE || '0 */3 * * *';

// cron.schedule(cronSchedule, async () => {
//   logger.info('Cron job triggered: Starting conversion sync');
//   try {
//     await syncConversions();
//   } catch (error) {
//     logger.error('Cron job failed', { error: error.message });
//   }
// });

// logger.info(`Cron job scheduled: ${cronSchedule}`);
logger.info('Auto sync DISABLED - Use manual sync from admin panel');

// Start server (only if not running on Vercel)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, async () => {
    console.log('='.repeat(60));
    console.log(`🚀 Cashback Server is running`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
    console.log(`🔑 JWT Secret: ${process.env.JWT_SECRET ? 'Configured ✅' : 'MISSING ❌'}`);
    console.log(`🌐 CORS Origins: ${allowedOrigins.join(', ')}`);
    console.log(`⏰ Auto Sync: DISABLED (Manual sync only)`);
    console.log('='.repeat(60));

    // Load auto cron setting from database (default: true)
    try {
      const SystemSettings = require('./backend/services/systemSettings');
      // Default is true, only changes when user toggles in admin panel
      const autoCronEnabled = await SystemSettings.get('auto_cron_enabled', true);
      process.env.AUTO_CRON_ENABLED = autoCronEnabled ? 'true' : 'false';
      logger.info(`Auto Cron setting: ${process.env.AUTO_CRON_ENABLED}`);
    } catch (error) {
      logger.warn('Failed to load auto cron setting from database, using default (true)', { error: error.message });
      process.env.AUTO_CRON_ENABLED = 'true';
    }

    // Initialize cron jobs for retry and cleanup
    try {
      await cronJobsService.initialize();
      const status = cronJobsService.getStatus();
      if (status.isInitialized) {
        console.log(`⏱️  Cron Jobs: ${status.jobsCount} jobs initialized`);
      }
    } catch (error) {
      logger.error('Failed to initialize cron jobs', { error: error.message });
    }

    // Initialize System Reconciliation jobs
    try {
      const startSystemReconciliationJobs = require('./backend/startSystemReconciliationJobs');
      startSystemReconciliationJobs();
    } catch (error) {
      logger.error('Failed to initialize System Reconciliation jobs', { error: error.message });
    }

    // Initialize Auto-Sync Service for conversions
    try {
      const autoSyncService = require('./backend/services/autoSyncService');
      await autoSyncService.initialize();
      const status = autoSyncService.getStatus();
      console.log(`🔄 Auto-Sync: ${status.hasScheduledJob ? 'Enabled' : 'Disabled'}`);
    } catch (error) {
      logger.error('Failed to initialize Auto-Sync service', { error: error.message });
    }

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
