require('dotenv').config();
const accessTradeService = require('../services/accesstrade');
const trackingService = require('../services/trackingService');
const AutoSyncHistory = require('../models/AutoSyncHistory');
const logger = require('../utils/logger');

/**
 * Sync conversions from AccessTrade API
 * Can be run standalone or called from cron job
 * @param {number} syncDays - Number of days to sync (default: 7)
 */
async function syncConversions(syncDays = 7, syncType = 'auto') {
  logger.info('='.repeat(60));
  logger.info('Starting conversion sync from AccessTrade');
  logger.info('='.repeat(60));

  // PHASE 2: Create sync history session
  let syncSession = null;

  try {
    // Get conversions from specified days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - syncDays);

    // Create sync session
    syncSession = await AutoSyncHistory.createSession({
      syncType,
      syncDays,
      startDate,
      endDate
    });

    logger.info('Sync session created', { sessionId: syncSession.id });

    logger.info('Fetching conversions', {
      syncDays,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    // CRITICAL FIX: Fetch ALL conversions with pagination
    let allConversions = [];
    let currentPage = 1;
    let totalPages = 1;
    let totalConversions = 0;

    // Fetch first page to get total pages
    logger.info('Fetching page 1...');
    const firstResponse = await accessTradeService.getConversions(startDate, endDate, { limit: 300, page: 1 });
    allConversions.push(...(firstResponse.data || []));
    totalPages = firstResponse.pagination.total_page || 1;
    totalConversions = firstResponse.pagination.total || firstResponse.data.length;

    logger.info(`Page 1/${totalPages} fetched: ${firstResponse.data.length} conversions (Total: ${totalConversions})`);

    // Fetch remaining pages if there are more
    if (totalPages > 1) {
      logger.info(`Fetching remaining ${totalPages - 1} pages...`);

      for (let page = 2; page <= totalPages; page++) {
        logger.info(`Fetching page ${page}/${totalPages}...`);

        const pageResponse = await accessTradeService.getConversions(startDate, endDate, { limit: 300, page });
        allConversions.push(...(pageResponse.data || []));

        logger.info(`Page ${page}/${totalPages} fetched: ${pageResponse.data.length} conversions`);

        // Small delay to avoid rate limiting (500ms between pages)
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const conversions = allConversions;

    if (conversions.length === 0) {
      logger.info('No conversions found in the specified period');
      return {
        total: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
      };
    }

    logger.info(`Processing ${conversions.length} conversions from ${totalPages} pages (API reported total: ${totalConversions})...`);

    // Process each conversion
    const results = {
      total: conversions.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };

    for (const conversion of conversions) {
      try {
        const result = await trackingService.processConversion(conversion);

        switch (result.status) {
          case 'created':
            results.created++;
            logger.success(`✓ Created conversion: ${result.conversionId}`);
            break;
          case 'updated':
            results.updated++;
            logger.success(`✓ Updated conversion: ${result.conversionId} (${result.oldStatus} → ${result.newStatus})`);
            break;
          case 'skipped':
            results.skipped++;
            logger.info(`⊘ Skipped: ${result.reason} (Order: ${conversion._id})`);
            break;
          case 'error':
            results.errors++;
            logger.error(`✗ Error: ${result.reason} (Order: ${conversion._id})`);
            break;
        }

        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        results.errors++;
        logger.error('Error processing conversion', {
          orderId: conversion._id,
          error: error.message
        });
      }
    }

    // Log summary
    logger.info('='.repeat(60));
    logger.success('Conversion sync completed', results);
    logger.info('='.repeat(60));

    // PHASE 2: Update sync session with results
    if (syncSession) {
      await AutoSyncHistory.completeSession(syncSession.id, {
        status: 'completed',
        total: results.total,
        created: results.created,
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors
      });
      logger.info('Sync session completed', { sessionId: syncSession.id });
    }

    // Return format compatible with autoSyncService
    return {
      ...results,
      imported: results.created + results.updated,
      duplicates: results.skipped,
      sessionId: syncSession?.id
    };
  } catch (error) {
    logger.error('Fatal error during conversion sync', {
      error: error.message,
      stack: error.stack
    });

    // PHASE 2: Mark sync session as failed
    if (syncSession) {
      try {
        await AutoSyncHistory.completeSession(syncSession.id, {
          status: 'failed',
          errorMessage: error.message,
          errorStack: error.stack
        });
        logger.info('Sync session marked as failed', { sessionId: syncSession.id });
      } catch (logError) {
        logger.error('Failed to update sync session', { error: logError.message });
      }
    }

    throw error;
  }
}

// Allow running as standalone script
if (require.main === module) {
  (async () => {
    try {
      await syncConversions();
      process.exit(0);
    } catch (error) {
      logger.error('Sync failed', { error: error.message });
      process.exit(1);
    }
  })();
}

module.exports = { syncConversions };
