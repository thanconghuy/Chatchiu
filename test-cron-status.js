require('dotenv').config();
const cronJobsService = require('./backend/jobs/cronJobs');

console.log('=== CRON JOBS STATUS ===\n');

const status = cronJobsService.getStatus();

console.log(JSON.stringify(status, null, 2));

console.log('\n=== ANALYSIS ===');
console.log(`isInitialized: ${status.isInitialized}`);
console.log(`autoCronEnabled: ${status.autoCronEnabled}`);
console.log(`jobsCount: ${status.jobsCount}`);
console.log(`\nFrontend will show "chưa được kích hoạt" if:`);
console.log(`  - isInitialized = false OR jobsCount = 0`);
console.log(`\nCurrent result: ${!status.isInitialized || status.jobsCount === 0 ? 'SHOW ERROR MESSAGE ❌' : 'SHOW JOBS LIST ✅'}`);
