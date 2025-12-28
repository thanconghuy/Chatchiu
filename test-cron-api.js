const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function testCronAPI() {
  try {
    const token = jwt.sign(
      { id: '1', role: 'admin' },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    console.log('\n🧪 Testing Cron Jobs API...\n');

    const response = await axios.get('http://localhost:3007/api/admin/cron/jobs', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data.success) {
      console.log('✅ API Response Success!\n');
      console.log(`📊 Total jobs: ${response.data.data.length}\n`);

      response.data.data.forEach((job, idx) => {
        console.log(`${idx + 1}. ${job.job_name}`);
        console.log(`   Key: ${job.job_key}`);
        console.log(`   Schedule: ${job.cron_schedule}`);
        console.log(`   Enabled: ${job.is_enabled ? '✅' : '❌'}`);
        console.log(`   Running: ${job.is_running ? '🔄' : '⏸️'}`);
        console.log(`   Total runs: ${job.total_runs || 0}`);
        console.log(`   Success rate: ${job.successRate || 'N/A'}`);
        console.log('');
      });
    } else {
      console.error('❌ API returned error:', response.data.message);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testCronAPI();
