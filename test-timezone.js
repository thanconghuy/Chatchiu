/**
 * Test script to debug timezone issues
 */

require('dotenv').config();
const { pool } = require('./backend/config/database');

async function testTimezone() {
    console.log('\n=== TIMEZONE DEBUG ===\n');

    // 1. Check Node.js timezone
    console.log('1. Node.js Environment:');
    console.log('   - TZ env:', process.env.TZ || 'Not set (uses system timezone)');
    console.log('   - Current time (local):', new Date().toString());
    console.log('   - Current time (UTC):', new Date().toUTCString());
    console.log('   - Current time (ISO):', new Date().toISOString());
    console.log('   - Timezone offset:', new Date().getTimezoneOffset(), 'minutes');

    // 2. Check PostgreSQL timezone
    console.log('\n2. PostgreSQL Database:');
    try {
        const tzQuery = await pool.query('SHOW timezone');
        console.log('   - Database timezone:', tzQuery.rows[0].TimeZone);

        const nowQuery = await pool.query(`
            SELECT
                NOW() as now_with_tz,
                NOW()::timestamp as now_without_tz,
                NOW() AT TIME ZONE 'UTC' as now_utc,
                NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh' as now_vietnam
        `);
        console.log('   - NOW() with TZ:', nowQuery.rows[0].now_with_tz);
        console.log('   - NOW() without TZ:', nowQuery.rows[0].now_without_tz);
        console.log('   - NOW() as UTC:', nowQuery.rows[0].now_utc);
        console.log('   - NOW() as VN time:', nowQuery.rows[0].now_vietnam);
    } catch (error) {
        console.error('   Error querying database:', error.message);
    }

    // 3. Check recent click timestamps
    console.log('\n3. Recent Clicks (last 5):');
    try {
        const clicksQuery = await pool.query(`
            SELECT
                id,
                user_id,
                merchant_id,
                clicked_at,
                clicked_at::timestamp as clicked_at_no_tz,
                clicked_at AT TIME ZONE 'UTC' as clicked_at_utc,
                clicked_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh' as clicked_at_vietnam
            FROM clicks
            ORDER BY clicked_at DESC
            LIMIT 5
        `);

        clicksQuery.rows.forEach((row, index) => {
            console.log(`\n   Click #${index + 1}:`);
            console.log('   - ID:', row.id.substring(0, 8) + '...');
            console.log('   - clicked_at (raw):', row.clicked_at);
            console.log('   - clicked_at (no TZ):', row.clicked_at_no_tz);
            console.log('   - clicked_at (UTC):', row.clicked_at_utc);
            console.log('   - clicked_at (VN):', row.clicked_at_vietnam);
            console.log('   - JavaScript parse:', new Date(row.clicked_at).toString());
        });
    } catch (error) {
        console.error('   Error querying clicks:', error.message);
    }

    // 4. Test creating a new timestamp
    console.log('\n4. Test Create Timestamp:');
    const testDate = new Date();
    console.log('   - JS Date now:', testDate.toString());
    console.log('   - JS Date ISO:', testDate.toISOString());

    try {
        const insertQuery = await pool.query(`
            INSERT INTO clicks (
                user_id, merchant_id, click_type, clicked_at
            ) VALUES (
                (SELECT id FROM users LIMIT 1),
                'test',
                'test',
                NOW()
            )
            RETURNING id, clicked_at
        `);
        console.log('   - Inserted clicked_at:', insertQuery.rows[0].clicked_at);
        console.log('   - JS parse:', new Date(insertQuery.rows[0].clicked_at).toString());

        // Clean up test record
        await pool.query('DELETE FROM clicks WHERE id = $1', [insertQuery.rows[0].id]);
        console.log('   - Test record cleaned up');
    } catch (error) {
        console.error('   Error testing insert:', error.message);
    }

    // 5. Recommendations
    console.log('\n5. Recommendations:');
    const dbTz = await pool.query('SHOW timezone');
    const dbTimezone = dbTz.rows[0].TimeZone;

    if (dbTimezone !== 'UTC') {
        console.log('   ⚠️  Database is NOT using UTC timezone!');
        console.log('   ⚠️  Current database timezone:', dbTimezone);
        console.log('   ✅ Recommended: ALTER DATABASE your_db SET timezone TO \'UTC\';');
    } else {
        console.log('   ✅ Database is using UTC (correct)');
    }

    const nodeOffset = new Date().getTimezoneOffset();
    if (nodeOffset !== 0) {
        console.log('   ⚠️  Node.js is NOT running in UTC!');
        console.log('   ⚠️  Timezone offset:', nodeOffset, 'minutes');
        console.log('   ✅ Recommended: Set TZ=UTC in .env or environment');
    } else {
        console.log('   ✅ Node.js is running in UTC (correct)');
    }

    console.log('\n=== END DEBUG ===\n');
    await pool.end();
}

testTimezone().catch(console.error);
