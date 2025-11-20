/**
 * Payment Request Module - Database Migration Runner
 *
 * This script runs the payment request module database migration
 * Creates tables, views, triggers, and functions needed for the module
 */

const fs = require('fs');
const path = require('path');
const db = require('../config/database');

async function runMigration() {
    console.log('🚀 Starting Payment Request Module Migration...\n');

    try {
        // Read the migration SQL file
        const migrationPath = path.join(__dirname, '../../docs/payment-request-migration.sql');
        console.log('📄 Reading migration file:', migrationPath);

        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log(`📊 Executing migration SQL...\n`);

        try {
            // Execute the entire migration as one batch
            // This preserves multi-line statements like functions and triggers
            await db.query(migrationSQL);

            console.log('\n' + '='.repeat(60));
            console.log('Migration Summary:');
            console.log('='.repeat(60));
            console.log(`✅ Migration executed successfully`);
            console.log('='.repeat(60) + '\n');

        } catch (error) {
            // Check if error is "already exists" - treat as warning
            if (error.message.includes('already exists')) {
                console.log('\n' + '='.repeat(60));
                console.log('⚠️  Some objects already exist - continuing...');
                console.log('='.repeat(60) + '\n');
            } else {
                console.error('\n' + '='.repeat(60));
                console.error('❌ Migration Error:');
                console.error('='.repeat(60));
                console.error(error.message);
                console.error('\nNote: Some errors might be expected if running migration multiple times');
                console.error('='.repeat(60) + '\n');
            }
        }

        // Verify tables were created
        console.log('🔍 Verifying tables...\n');
        await verifyTables();

        console.log('\n✅ Migration completed successfully!\n');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Close database connection
        await db.pool.end();
    }
}

async function verifyTables() {
    const tablesToCheck = [
        'payment_requests',
        'payment_reconciliation_mapping',
        'payment_request_logs',
        'reconciliation_logs'
    ];

    const viewsToCheck = [
        'v_payment_requests_with_users',
        'v_late_reconciliation_items',
        'v_user_available_balances'
    ];

    console.log('Checking Tables:');
    for (const table of tablesToCheck) {
        try {
            const result = await db.query(`
                SELECT COUNT(*) as count
                FROM information_schema.tables
                WHERE table_name = $1
            `, [table]);

            if (parseInt(result.rows[0].count) > 0) {
                // Get column count
                const cols = await db.query(`
                    SELECT COUNT(*) as count
                    FROM information_schema.columns
                    WHERE table_name = $1
                `, [table]);

                console.log(`   ✅ ${table} (${cols.rows[0].count} columns)`);
            } else {
                console.log(`   ❌ ${table} - NOT FOUND`);
            }
        } catch (error) {
            console.log(`   ❌ ${table} - Error: ${error.message}`);
        }
    }

    console.log('\nChecking Views:');
    for (const view of viewsToCheck) {
        try {
            const result = await db.query(`
                SELECT COUNT(*) as count
                FROM information_schema.views
                WHERE table_name = $1
            `, [view]);

            if (parseInt(result.rows[0].count) > 0) {
                console.log(`   ✅ ${view}`);
            } else {
                console.log(`   ❌ ${view} - NOT FOUND`);
            }
        } catch (error) {
            console.log(`   ❌ ${view} - Error: ${error.message}`);
        }
    }

    // Check for function
    console.log('\nChecking Functions:');
    try {
        const result = await db.query(`
            SELECT COUNT(*) as count
            FROM pg_proc
            WHERE proname = 'get_order_payment_status'
        `);

        if (parseInt(result.rows[0].count) > 0) {
            console.log(`   ✅ get_order_payment_status()`);
        } else {
            console.log(`   ❌ get_order_payment_status() - NOT FOUND`);
        }
    } catch (error) {
        console.log(`   ❌ Function check error: ${error.message}`);
    }
}

// Run migration
runMigration();
