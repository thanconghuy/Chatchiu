const db = require('../config/database');

async function createView() {
    console.log('Creating v_user_available_balances view...\n');

    const sql = `
        CREATE OR REPLACE VIEW v_user_available_balances AS
        SELECT
            u.id as user_id,
            -- Total confirmed cashback (from reconciled orders)
            COALESCE((
                SELECT SUM(ri.cashback_amount)
                FROM reconciliation_items ri
                JOIN reconciliations r ON ri.reconciliation_id = r.id
                JOIN conversions c ON ri.conversion_id = c.id
                WHERE c.user_id = u.id
                    AND r.status = 'confirmed'
            ), 0) as total_confirmed_cashback,

            -- Total requested (pending + confirmed + paid payment requests)
            COALESCE((
                SELECT SUM(pr.requested_amount)
                FROM payment_requests pr
                WHERE pr.user_id = u.id
                    AND pr.status IN ('pending', 'confirmed', 'paid')
            ), 0) as total_requested,

            -- Available balance = total_confirmed - total_requested
            COALESCE((
                SELECT SUM(ri.cashback_amount)
                FROM reconciliation_items ri
                JOIN reconciliations r ON ri.reconciliation_id = r.id
                JOIN conversions c ON ri.conversion_id = c.id
                WHERE c.user_id = u.id
                    AND r.status = 'confirmed'
            ), 0) - COALESCE((
                SELECT SUM(pr.requested_amount)
                FROM payment_requests pr
                WHERE pr.user_id = u.id
                    AND pr.status IN ('pending', 'confirmed', 'paid')
            ), 0) as available_balance,

            -- Has pending request?
            EXISTS(
                SELECT 1
                FROM payment_requests pr
                WHERE pr.user_id = u.id
                    AND pr.status = 'pending'
            ) as has_pending_request,

            -- Is eligible? (balance >= 100k AND no pending request)
            (
                COALESCE((
                    SELECT SUM(ri.cashback_amount)
                    FROM reconciliation_items ri
                    JOIN reconciliations r ON ri.reconciliation_id = r.id
                    JOIN conversions c ON ri.conversion_id = c.id
                    WHERE c.user_id = u.id
                        AND r.status = 'confirmed'
                ), 0) - COALESCE((
                    SELECT SUM(pr.requested_amount)
                    FROM payment_requests pr
                    WHERE pr.user_id = u.id
                        AND pr.status IN ('pending', 'confirmed', 'paid')
                ), 0)
            ) >= 100000
            AND NOT EXISTS(
                SELECT 1
                FROM payment_requests pr
                WHERE pr.user_id = u.id
                    AND pr.status = 'pending'
            ) as is_eligible
        FROM users u
    `;

    try {
        await db.query(sql);
        console.log('✅ View v_user_available_balances created successfully\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error creating view:', error.message);
        process.exit(1);
    }
}

createView();
