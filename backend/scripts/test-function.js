const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    const result = await client.query(
      `SELECT calculate_user_available_balance_from_system_recon($1::UUID) as balance`,
      [userId]
    );

    console.log('✅ Function result:', result.rows[0].balance);
  } finally {
    client.release();
    await pool.end();
  }
})();
