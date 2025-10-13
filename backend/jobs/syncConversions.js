require('dotenv').config();
const accessTradeService = require('../services/accesstrade');
const trackingService = require('../services/trackingService');
const logger = require('../utils/logger');

/**
 * Sync conversions from AccessTrade API
 * Can be run standalone or called from cron job
 */
async function syncConversions() {
  logger.info('='.repeat(60));
  logger.info('Starting conversion sync from AccessTrade');
  logger.info('='.repeat(60));

  try {
    // Get conversions from last 7 days
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);

    logger.info('Fetching conversions', {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString()
    });

    // Fetch conversions from AccessTrade
    const conversions = await accessTradeService.getConversions(startDate, endDate);

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

    logger.info(`Processing ${conversions.length} conversions...`);

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

    return results;
  } catch (error) {
    logger.error('Fatal error during conversion sync', {
      error: error.message,
      stack: error.stack
    });
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
