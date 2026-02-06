require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    const userId = 'b4e22487-bdfc-41de-8696-53398ec4342a'; // bachanhtivi@gmail.com

    // Check user_system_balance
    console.log('=== USER_SYSTEM_BALANCE ===');
    const balanceResult = await pool.query('SELECT * FROM user_system_balance WHERE user_id = $1', [userId]);
    if (balanceResult.rows.length > 0) {
      const b = balanceResult.rows[0];
      console.log('total_earned:', parseFloat(b.total_earned || 0).toLocaleString('vi-VN'), 'đ');
      console.log('total_withdrawn:', parseFloat(b.total_withdrawn || 0).toLocaleString('vi-VN'), 'đ');
      console.log('available_balance:', parseFloat(b.available_balance || 0).toLocaleString('vi-VN'), 'đ');
      console.log('pending_reserved:', parseFloat(b.pending_reserved || 0).toLocaleString('vi-VN'), 'đ');
    } else {
      console.log('No record found!');
    }

    // Check system_conversions SUM
    console.log('\n=== SYSTEM_CONVERSIONS SUM ===');
    const convResult = await pool.query(`
      SELECT
        SUM(cashback_amount) as total,
        SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END) as pending
      FROM system_conversions
      WHERE user_id = $1
    `, [userId]);
    const c = convResult.rows[0];
    console.log('SUM total:', parseFloat(c.total || 0).toLocaleString('vi-VN'), 'đ');
    console.log('SUM approved:', parseFloat(c.approved || 0).toLocaleString('vi-VN'), 'đ');
    console.log('SUM pending:', parseFloat(c.pending || 0).toLocaleString('vi-VN'), 'đ');

    console.log('\n=== DIFFERENCE ===');
    const totalEarned = parseFloat(balanceResult.rows[0]?.total_earned || 0);
    const scTotal = parseFloat(c.total || 0);
    const diff = scTotal - totalEarned;
    console.log('system_conversions.total - user_system_balance.total_earned =', diff.toLocaleString('vi-VN'), 'đ');

    if (Math.abs(diff) > 0.01) {
      console.log('\n⚠️ DATA NOT IN SYNC! Need to fix user_system_balance.total_earned');
    } else {
      console.log('\n✅ Data is in sync');
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
