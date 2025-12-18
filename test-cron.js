// Test script to verify cron jobs initialization
require('dotenv').config();

const cronJobsService = require('./backend/jobs/cronJobs');

(async () => {
    console.log('='.repeat(60));
    console.log('🧪 Testing Cron Jobs Initialization');
    console.log('='.repeat(60));
    console.log('');

    console.log('Environment:');
    console.log('  NODE_ENV:', process.env.NODE_ENV || '(not set)');
    console.log('  AUTO_CRON_ENABLED:', process.env.AUTO_CRON_ENABLED);
    console.log('');

    try {
        console.log('Calling cronJobsService.initialize(true)...');
        console.log('');

        await cronJobsService.initialize(true);

        console.log('');
        console.log('Getting status...');
        const status = cronJobsService.getStatus();

        console.log('');
        console.log('='.repeat(60));
        console.log('📊 Status Result:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(status, null, 2));
        console.log('');

        if (status.jobsCount === 4) {
            console.log('✅ SUCCESS: All 4 jobs initialized');
            console.log('');
            console.log('Jobs:');
            status.jobs.forEach(job => {
                console.log(`  - ${job.name} (${job.schedule}): ${job.status}`);
            });
        } else {
            console.log(`❌ FAILED: Expected 4 jobs, got ${status.jobsCount}`);
            console.log('');
            if (status.jobs.length > 0) {
                console.log('Jobs that did start:');
                status.jobs.forEach(job => {
                    console.log(`  - ${job.name} (${job.schedule}): ${job.status}`);
                });
            }
        }

        console.log('');
        console.log('='.repeat(60));
        console.log('Test completed');
        console.log('='.repeat(60));

        process.exit(0);
    } catch (error) {
        console.log('');
        console.log('='.repeat(60));
        console.log('❌ ERROR OCCURRED:');
        console.log('='.repeat(60));
        console.error('Message:', error.message);
        console.error('');
        console.error('Stack trace:');
        console.error(error.stack);
        console.log('='.repeat(60));

        process.exit(1);
    }
})();
