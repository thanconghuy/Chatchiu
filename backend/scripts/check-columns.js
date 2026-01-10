const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'system_conversions'
        AND (column_name LIKE '%time%' OR column_name LIKE '%at%' OR column_name LIKE '%date%')
      ORDER BY column_name
    `);

    console.log('system_conversions timestamp/date columns:');
    result.rows.forEach(r => {
      console.log('  -', r.column_name, '(' + r.data_type + ')');
    });
  } finally {
    await pool.end();
  }
})();
