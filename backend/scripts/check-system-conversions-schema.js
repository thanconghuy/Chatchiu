const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  try {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'system_conversions'
      ORDER BY ordinal_position
    `);

    console.log('system_conversions table columns:\n');
    result.rows.forEach(r => {
      const nullable = r.is_nullable === 'YES' ? '(nullable)' : '(NOT NULL)';
      console.log('  - ' + r.column_name.padEnd(30) + r.data_type.padEnd(20) + nullable);
    });
  } finally {
    await pool.end();
  }
})();
