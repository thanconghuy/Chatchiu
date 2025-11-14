// Load environment variables (safe to call multiple times)
if (!process.env.VERCEL) {
  require('dotenv').config();
}
const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('./backend/config/passport'); // Google OAuth enabled
// const cron = require('node-cron'); // DISABLED - manual sync only
// const { syncConversions } = require('./backend/jobs/syncConversions'); // Used in admin routes
const logger = require('./backend/utils/logger');
const cronJobsService = require('./backend/jobs/cronJobs'); // Cron jobs for retry and cleanup

const app = express();
const PORT = process.env.PORT || 3007;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
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

// Mount API routes (BEFORE static files)
app.use('/api/auth', authRoutes); // Keep old auth for backward compatibility
app.use('/api/neon-auth', neonAuthRoutes); // New Neon Auth routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reconciliation', reconciliationRoutes); // Reconciliation module (admin only)

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Cashback API'
  });
});

// Routes for HTML pages (without .html extension)
const pages = ['login', 'login-neon', 'register', 'dashboard', 'history', 'reconciliation-history', 'forgot-password', 'reset-password'];
pages.forEach(page => {
  app.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend', `${page}.html`));
  });

  // Redirect .html to clean URL
  app.get(`/${page}.html`, (req, res) => {
    res.redirect(301, `/${page}`);
  });
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

  // Serve the HTML file
  res.sendFile(path.join(__dirname, 'frontend', 'admin', `${page}.html`));
});

// Default route - serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html'));
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
    console.log(`🔑 JWT Secret: ${process.env.JWT_SECRET ? 'Configured' : 'Using default'}`);
    console.log(`⏰ Auto Sync: DISABLED (Manual sync only)`);
    console.log('='.repeat(60));

    // Initialize cron jobs for retry and cleanup
    try {
      cronJobsService.initialize();
      const status = cronJobsService.getStatus();
      if (status.isInitialized) {
        console.log(`⏱️  Cron Jobs: ${status.jobsCount} jobs initialized`);
      }
    } catch (error) {
      logger.error('Failed to initialize cron jobs', { error: error.message });
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
