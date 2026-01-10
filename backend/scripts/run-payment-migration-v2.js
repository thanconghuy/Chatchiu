/**
 * Payment Request Module - Simplified Migration Runner V2
 * Runs migration in logical chunks to avoid syntax errors
 */

const db = require('../config/database');

async function runMigration() {
    console.log('🚀 Starting Payment Request Module Migration V2...\n');

    const migrations = [
        {
            name: '1. Create payment_requests table',
            sql: `
                CREATE TABLE IF NOT EXISTS payment_requests (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    user_id UUID NOT NULL,
                    requested_amount DECIMAL(15,2) NOT NULL CHECK (requested_amount >= 50000),
                    bank_name VARCHAR(255) NOT NULL,
                    bank_account_number VARCHAR(50) NOT NULL,
                    bank_account_name VARCHAR(255) NOT NULL,
                    bank_branch VARCHAR(255),
                    status VARCHAR(20) NOT NULL DEFAULT 'pending',
                    notes TEXT,
                    admin_id UUID,
                    admin_notes TEXT,
                    transaction_reference VARCHAR(255),
                    created_at TIMESTAMP DEFAULT NOW(),
                    confirmed_at TIMESTAMP,
                    paid_at TIMESTAMP,
                    rejected_at TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT valid_status CHECK (status IN ('pending', 'confirmed', 'paid', 'rejected')),
                    CONSTRAINT valid_bank_account CHECK (LENGTH(bank_account_number) >= 6)
                );
            `
        },
        {
            name: '2. Create indexes for payment_requests',
            sql: `
                CREATE INDEX IF NOT EXISTS idx_payment_requests_user_id ON payment_requests(user_id);
                CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
                CREATE INDEX IF NOT EXISTS idx_payment_requests_created_at ON payment_requests(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_payment_requests_admin_id ON payment_requests(admin_id);
                CREATE INDEX IF NOT EXISTS idx_payment_requests_user_status ON payment_requests(user_id, status);
            `
        },
        {
            name: '3. Create payment_reconciliation_mapping table',
            sql: `
                CREATE TABLE IF NOT EXISTS payment_reconciliation_mapping (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    payment_request_id UUID NOT NULL,
                    reconciliation_id UUID NOT NULL,
                    reconciliation_item_id UUID NOT NULL,
                    cashback_amount DECIMAL(15,2) NOT NULL CHECK (cashback_amount > 0),
                    created_at TIMESTAMP DEFAULT NOW(),
                    CONSTRAINT unique_reconciliation_item UNIQUE(reconciliation_item_id)
                );
            `
        },
        {
            name: '4. Create indexes for payment_reconciliation_mapping',
            sql: `
                CREATE INDEX IF NOT EXISTS idx_prm_payment_request ON payment_reconciliation_mapping(payment_request_id);
                CREATE INDEX IF NOT EXISTS idx_prm_reconciliation ON payment_reconciliation_mapping(reconciliation_id);
                CREATE INDEX IF NOT EXISTS idx_prm_reconciliation_item ON payment_reconciliation_mapping(reconciliation_item_id);
            `
        },
        {
            name: '5. Create payment_request_logs table',
            sql: `
                CREATE TABLE IF NOT EXISTS payment_request_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    payment_request_id UUID NOT NULL,
                    action VARCHAR(50) NOT NULL,
                    old_status VARCHAR(20),
                    new_status VARCHAR(20),
                    performed_by UUID,
                    performed_by_name VARCHAR(255),
                    performed_by_email VARCHAR(255),
                    notes TEXT,
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            `
        },
        {
            name: '6. Create indexes for payment_request_logs',
            sql: `
                CREATE INDEX IF NOT EXISTS idx_prl_payment_request ON payment_request_logs(payment_request_id);
                CREATE INDEX IF NOT EXISTS idx_prl_created_at ON payment_request_logs(created_at DESC);
            `
        },
        {
            name: '7. Create reconciliation_logs table',
            sql: `
                CREATE TABLE IF NOT EXISTS reconciliation_logs (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    reconciliation_id UUID NOT NULL,
                    action VARCHAR(50) NOT NULL,
                    performed_by UUID,
                    notes TEXT,
                    metadata JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                );
            `
        },
        {
            name: '8. Create indexes for reconciliation_logs',
            sql: `
                CREATE INDEX IF NOT EXISTS idx_rec_logs_reconciliation ON reconciliation_logs(reconciliation_id);
                CREATE INDEX IF NOT EXISTS idx_rec_logs_created_at ON reconciliation_logs(created_at DESC);
            `
        },
        {
            name: '9. Create view: v_payment_requests_with_users',
            sql: `
                CREATE OR REPLACE VIEW v_payment_requests_with_users AS
                SELECT
                    pr.*,
                    u.full_name as user_name,
                    u.email as user_email,
                    u.phone as user_phone,
                    admin.full_name as admin_name,
                    admin.email as admin_email,
                    (SELECT COUNT(*) FROM payment_reconciliation_mapping
                     WHERE payment_request_id = pr.id) as items_count,
                    (SELECT COALESCE(SUM(cashback_amount), 0)
                     FROM payment_reconciliation_mapping
                     WHERE payment_request_id = pr.id) as total_from_items
                FROM payment_requests pr
                LEFT JOIN users u ON pr.user_id = u.id
                LEFT JOIN users admin ON pr.admin_id = admin.id;
            `
        },
        {
            name: '10. Create view: v_late_reconciliation_items',
            sql: `
                CREATE OR REPLACE VIEW v_late_reconciliation_items AS
                SELECT
                    c.id,
                    c.order_code,
                    c.user_id,
                    u.full_name as user_name,
                    u.email as user_email,
                    c.merchant_name,
                    c.order_amount,
                    c.commission,
                    c.cashback_amount,
                    c.order_time,
                    c.confirmed_time,
                    TO_CHAR(c.order_time, 'YYYY-MM') as original_period,
                    EXTRACT(DAY FROM (c.confirmed_time - c.order_time))::INTEGER as days_late
                FROM conversions c
                LEFT JOIN users u ON c.user_id = u.id
                LEFT JOIN reconciliation_items ri ON c.id = ri.conversion_id
                WHERE c.status = 'approved'
                    AND c.is_confirmed = 1
                    AND ri.id IS NULL
                ORDER BY c.confirmed_time DESC;
            `
        }
    ];

    let successCount = 0;
    let errorCount = 0;

    for (const migration of migrations) {
        try {
            console.log(`${migration.name}...`);
            await db.query(migration.sql);
            console.log(`   ✅ Success\n`);
            successCount++;
        } catch (error) {
            if (error.message.includes('already exists')) {
                console.log(`   ⚠️  Already exists - skipping\n`);
                successCount++;
            } else {
                console.error(`   ❌ Error: ${error.message}\n`);
                errorCount++;
            }
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary:');
    console.log('='.repeat(60));
    console.log(`✅ Success: ${successCount}/${migrations.length}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log('='.repeat(60) + '\n');

    // Verify
    console.log('🔍 Verifying tables...\n');
    await verifyTables();

    console.log('\n✅ Migration completed!\n');
    await db.pool.end();
}

async function verifyTables() {
    const checks = [
        { type: 'table', name: 'payment_requests' },
        { type: 'table', name: 'payment_reconciliation_mapping' },
        { type: 'table', name: 'payment_request_logs' },
        { type: 'table', name: 'reconciliation_logs' },
        { type: 'view', name: 'v_payment_requests_with_users' },
        { type: 'view', name: 'v_late_reconciliation_items' }
    ];

    for (const check of checks) {
        try {
            const result = await db.query(`
                SELECT COUNT(*) as count
                FROM information_schema.${check.type}s
                WHERE table_name = $1
            `, [check.name]);

            if (parseInt(result.rows[0].count) > 0) {
                if (check.type === 'table') {
                    const cols = await db.query(`
                        SELECT COUNT(*) as count
                        FROM information_schema.columns
                        WHERE table_name = $1
                    `, [check.name]);
                    console.log(`   ✅ ${check.name} (${cols.rows[0].count} columns)`);
                } else {
                    console.log(`   ✅ ${check.name}`);
                }
            } else {
                console.log(`   ❌ ${check.name} - NOT FOUND`);
            }
        } catch (error) {
            console.log(`   ❌ ${check.name} - Error: ${error.message}`);
        }
    }
}

runMigration().catch(console.error);
