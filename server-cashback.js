require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
// const cron = require('node-cron'); // DISABLED - manual sync only
// const { syncConversions } = require('./backend/jobs/syncConversions'); // Used in admin routes
const logger = require('./backend/utils/logger');

const app = express();
const PORT = process.env.PORT || 3007;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend and public directories
app.use(express.static(path.join(__dirname, 'frontend')));
app.use(express.static(path.join(__dirname, 'public')));

// Import routes
const authRoutes = require('./backend/routes/auth');
const dashboardRoutes = require('./backend/routes/dashboard');
const adminRoutes = require('./backend/routes/admin');

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Cashback API'
  });
});

// Routes for HTML pages (without .html extension)
const pages = ['login', 'register', 'dashboard', 'history', 'index'];
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

// Default route - serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dashboard.html'));
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
