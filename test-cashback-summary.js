const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

// Generate test JWT token for ADMIN
const adminUserId = '2816c969-3b34-40b1-89ec-8c1667925040'; // Admin user ID (vtphong91@gmail.com)
const jwtSecret = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_1234567890_CHANGE_ME_IN_PRODUCTION';

const token = jwt.sign({ userId: adminUserId }, jwtSecret, { expiresIn: '1h' });

console.log('Testing Cashback Summary API...');
console.log('Admin User ID:', adminUserId);
console.log('');

// Test with different date ranges
const tests = [
    {
        name: 'Last 30 days',
        from: '2025-10-24',
        to: '2025-11-23'
    },
    {
        name: 'October 2025',
        from: '2025-10-01',
        to: '2025-10-31'
    },
    {
        name: 'November 2025',
        from: '2025-11-01',
        to: '2025-11-23'
    }
];

async function testSummary(testCase) {
    console.log(`\n=== ${testCase.name} ===`);
    console.log(`From: ${testCase.from}, To: ${testCase.to}`);

    const url = `http://localhost:3007/api/admin/users/cashback-stats/summary?from_date=${testCase.from}&to_date=${testCase.to}`;

    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const data = await response.json();

    if (data.success) {
        console.log('✅ Success!');
        console.log('Summary:', {
            totalUsers: data.summary.totalUsers,
            totalOrders: data.summary.totalOrders,
            totalOrderValue: data.summary.totalOrderValue.toLocaleString('vi-VN') + ' đ',
            totalCashback: data.summary.totalCashback.toLocaleString('vi-VN') + ' đ'
        });
    } else {
        console.log('❌ Failed:', data.message);
    }
}

async function runTests() {
    for (const test of tests) {
        await testSummary(test);
    }
}

runTests().catch(console.error);
