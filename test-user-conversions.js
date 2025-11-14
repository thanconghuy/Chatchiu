/**
 * Test script to check user conversions
 */
require('dotenv').config();
const { pool } = require('./backend/config/database');

async function checkUserConversions() {
    try {
        // Find user
        const userResult = await pool.query(
            "SELECT id, username, email FROM users WHERE username = 'mtkonline2018'"
        );

        if (userResult.rows.length === 0) {
            console.log('User mtkonline2018 not found');
            return;
        }

        const user = userResult.rows[0];
        console.log('\n=== USER INFO ===');
        console.log('ID:', user.id);
        console.log('Username:', user.username);
        console.log('Email:', user.email);

        // Get user's conversions
        const convResult = await pool.query(`
            SELECT
                c.id,
                c.status,
                c.order_code,
                c.order_amount,
                c.commission,
                c.cashback_amount,
                c.order_approved,
                c.order_pending,
                c.order_reject,
                c.order_time,
                c.approval_time,
                c.created_at,
                m.name as merchant_name
            FROM conversions c
            JOIN clicks cl ON c.click_id = cl.id
            LEFT JOIN merchants m ON c.merchant_id = m.id
            WHERE cl.user_id = $1
            ORDER BY c.created_at DESC
        `, [user.id]);

        console.log('\n=== CONVERSIONS ===');
        console.log('Total conversions:', convResult.rows.length);

        convResult.rows.forEach((conv, index) => {
            console.log(`\n--- Conversion ${index + 1} ---`);
            console.log('ID:', conv.id);
            console.log('Merchant:', conv.merchant_name);
            console.log('Order Code:', conv.order_code);
            console.log('Status:', conv.status);
            console.log('Order Amount:', conv.order_amount);
            console.log('Commission:', conv.commission);
            console.log('Cashback:', conv.cashback_amount);
            console.log('order_approved:', conv.order_approved);
            console.log('order_pending:', conv.order_pending);
            console.log('order_reject:', conv.order_reject);
            console.log('Order Time:', conv.order_time);
            console.log('Approval Time:', conv.approval_time);
            console.log('Created At:', conv.created_at);
        });

        console.log('\n');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkUserConversions();
