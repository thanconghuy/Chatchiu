const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkCronJobs() {
  try {
    const result = await pool.query(`
      SELECT
        job_key,
        job_name,
        cron_schedule,
        is_enabled,
        total_runs,
        success_runs
      FROM cron_jobs
      ORDER BY job_key
    `);

    console.log('\n📊 Cron Jobs trong database:\n');
    console.log(`Tổng số: ${result.rows.length}\n`);

    result.rows.forEach((job, idx) => {
      console.log(`${idx + 1}. ${job.job_name}`);
      console.log(`   Key: ${job.job_key}`);
      console.log(`   Schedule: ${job.cron_schedule}`);
      console.log(`   Enabled: ${job.is_enabled ? '✅ Yes' : '❌ No'}`);
      console.log(`   Total runs: ${job.total_runs || 0}`);
      console.log('');
    });

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkCronJobs();
