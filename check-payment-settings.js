/**
 * Check current payment settings in database
 */

require('dotenv').config();
const { pool } = require('./backend/config/database');

async function checkSettings() {
  console.log('\n========================================');
  console.log('⚙️  Current Payment Settings');
  console.log('========================================\n');

  try {
    const result = await pool.query(`
      SELECT
        setting_key,
        setting_value,
        setting_type,
        description,
        is_editable,
        updated_at
      FROM system_settings
      WHERE category = 'payment'
      ORDER BY setting_key
    `);

    if (result.rows.length === 0) {
      console.log('⚠️  No payment settings found!');
      return;
    }

    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. ${row.description}`);
      console.log(`   Key: ${row.setting_key}`);

      let displayValue = row.setting_value;
      if (row.setting_type === 'number') {
        displayValue = parseInt(row.setting_value).toLocaleString('vi-VN') + ' VND';
      }

      console.log(`   Value: ${displayValue}`);
      console.log(`   Type: ${row.setting_type}`);
      console.log(`   Editable: ${row.is_editable ? 'Yes ✅' : 'No ❌'}`);
      console.log(`   Last updated: ${new Date(row.updated_at).toLocaleString('vi-VN')}`);
      console.log('');
    });

    console.log('========================================');
    console.log(`✅ Total: ${result.rows.length} payment settings`);
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

checkSettings();
