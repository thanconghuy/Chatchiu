require('dotenv').config();
const { pool } = require('../config/database');
const SystemConversion = require('../models/SystemConversion');
const logger = require('../utils/logger');

/**
 * Sync conversion statuses from conversions table to system_conversions table
 * This script fixes any mismatched statuses between the two tables
 */
async function syncConversionsStatus() {
  logger.info('='.repeat(60));
  logger.info('Starting status sync from conversions to system_conversions');
  logger.info('='.repeat(60));

  try {
    // Step 1: Get all conversions that have click_id (matched conversions)
    const conversionsQuery = `
      SELECT
        c.id,
        c.user_id,
        c.click_id,
        c.merchant_id,
        c.merchant_name,
        c.order_code,
        c.order_amount,
        c.commission,
        c.cashback_amount,
        c.status,
        c.order_time,
        c.approval_time,
        c.created_at
      FROM conversions c
      WHERE c.click_id IS NOT NULL
        AND c.user_id IS NOT NULL
      ORDER BY c.created_at ASC
    `;

    const conversionsResult = await pool.query(conversionsQuery);
    const conversions = conversionsResult.rows;

    if (conversions.length === 0) {
      logger.info('No matched conversions found to sync');
      return {
        total: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0
      };
    }

    logger.info(`Found ${conversions.length} matched conversions to process`);

    const results = {
      total: conversions.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0
    };

    // Step 2: Process each conversion
    for (const conversion of conversions) {
      try {
        // Check if system_conversion exists
        const existsQuery = `
          SELECT id, status
          FROM system_conversions
          WHERE at_conversion_id = $1
        `;
        const existsResult = await pool.query(existsQuery, [conversion.id]);

        if (existsResult.rows.length === 0) {
          // System conversion doesn't exist - create it
          try {
            await SystemConversion.create({
              atConversionId: conversion.id,
              userId: conversion.user_id,
              clickId: conversion.click_id,
              merchantId: conversion.merchant_id,
              merchantName: conversion.merchant_name,
              orderCode: conversion.order_code,
              orderAmount: conversion.order_amount,
              commission: conversion.commission,
              cashbackAmount: conversion.cashback_amount,
              status: conversion.status,
              orderTime: conversion.order_time,
              approvalTime: conversion.approval_time
            });

            results.created++;
            logger.success(`✓ Created system_conversion for conversion ${conversion.id} (${conversion.status})`);
          } catch (createError) {
            results.errors++;
            logger.error(`✗ Error creating system_conversion for ${conversion.id}:`, createError.message);
          }
        } else {
          // System conversion exists - check if status matches
          const systemConversion = existsResult.rows[0];

          if (systemConversion.status !== conversion.status) {
            // Status mismatch - update it
            await SystemConversion.updateStatusByATConversionId(
              conversion.id,
              conversion.status,
              conversion.approval_time
            );

            results.updated++;
            logger.success(`✓ Updated system_conversion for conversion ${conversion.id} (${systemConversion.status} → ${conversion.status})`);
          } else {
            // Status matches - skip
            results.skipped++;
            logger.info(`○ Skipped conversion ${conversion.id} (status already matches: ${conversion.status})`);
          }
        }

        // Small delay to avoid overwhelming the database
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        results.errors++;
        logger.error(`✗ Error processing conversion ${conversion.id}:`, error.message);
      }
    }

    // Log summary
    logger.info('='.repeat(60));
    logger.success('Status sync completed', results);
    logger.info('='.repeat(60));

    return results;
  } catch (error) {
    logger.error('Fatal error during status sync', {
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
      const results = await syncConversionsStatus();

      console.log('\n📊 Summary:');
      console.log(`   Total processed: ${results.total}`);
      console.log(`   Created: ${results.created}`);
      console.log(`   Updated: ${results.updated}`);
      console.log(`   Skipped: ${results.skipped}`);
      console.log(`   Errors: ${results.errors}`);

      process.exit(results.errors > 0 ? 1 : 0);
    } catch (error) {
      console.error('Sync failed:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = { syncConversionsStatus };
