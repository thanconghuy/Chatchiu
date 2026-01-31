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

      // Update auto_sync_config with last run info
      try {
        const { pool } = require('../config/database');
        const message = `Đã import ${results.created + results.updated} conversions, ${results.skipped} trùng lặp`;

        await pool.query(`
          UPDATE auto_sync_config
          SET
            last_run_at = NOW(),
            last_run_status = $1,
            last_run_message = $2,
            updated_at = NOW()
          WHERE enabled = true
        `, ['success', message]);

        logger.info('Updated auto_sync_config with last run info');
      } catch (configError) {
        logger.error('Failed to update auto_sync_config', { error: configError.message });
        // Don't throw - this is not critical
      }

      // CRITICAL: Sync matched conversions to system_conversions
      // This ensures the Conversion Management module shows all orders
      try {
        logger.info('Syncing matched conversions to system_conversions...');

        // Find conversions that have click_id but not yet in system_conversions
        const missingConversions = await pool.query(`
          SELECT
            c.id as conversion_id,
            c.click_id,
            cl.user_id,
            c.merchant_id,
            c.order_code,
            c.order_amount,
            c.cashback_amount,
            c.status,
            c.order_time,
            c.conversion_time,
            c.products_count,
            c.order_approved,
            c.order_pending,
            c.order_reject
          FROM conversions c
          INNER JOIN clicks cl ON c.click_id = cl.id
          LEFT JOIN system_conversions sc ON sc.at_conversion_id = c.id
          WHERE sc.id IS NULL
            AND cl.user_id IS NOT NULL
        `);

        if (missingConversions.rows.length > 0) {
          logger.info(`Found ${missingConversions.rows.length} conversions to sync to system_conversions`);

          let syncedCount = 0;
          for (const conv of missingConversions.rows) {
            try {
              await pool.query(`
                INSERT INTO system_conversions (
                  at_conversion_id, click_id, user_id, merchant_id,
                  order_code, order_amount, cashback_amount, status,
                  order_time, conversion_time, products_count,
                  order_approved, order_pending, order_reject,
                  created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
                ON CONFLICT (at_conversion_id) DO NOTHING
              `, [
                conv.conversion_id,
                conv.click_id,
                conv.user_id,
                conv.merchant_id,
                conv.order_code,
                conv.order_amount,
                conv.cashback_amount,
                conv.status,
                conv.order_time,
                conv.conversion_time,
                conv.products_count || 0,
                conv.order_approved || 0,
                conv.order_pending || 0,
                conv.order_reject || 0
              ]);
              syncedCount++;
            } catch (insertError) {
              logger.error('Failed to insert system_conversion', {
                conversionId: conv.conversion_id,
                error: insertError.message
              });
            }
          }

          logger.success(`Synced ${syncedCount}/${missingConversions.rows.length} conversions to system_conversions`);

          // Add to results
          results.systemConversionsSynced = syncedCount;
        } else {
          logger.info('No new conversions to sync to system_conversions');
          results.systemConversionsSynced = 0;
        }
      } catch (syncError) {
        logger.error('Failed to sync to system_conversions', { error: syncError.message });
        // Don't throw - the main sync was successful
      }
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

        // Update auto_sync_config with error status
        try {
          const { pool } = require('../config/database');
          await pool.query(`
            UPDATE auto_sync_config
            SET
              last_run_at = NOW(),
              last_run_status = $1,
              last_run_message = $2,
              updated_at = NOW()
            WHERE enabled = true
          `, ['error', error.message]);

          logger.info('Updated auto_sync_config with error status');
        } catch (configError) {
          logger.error('Failed to update auto_sync_config', { error: configError.message });
        }
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
