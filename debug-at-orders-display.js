/**
 * DEBUG SCRIPT - Kiểm tra hiển thị is_confirmed trong AT Orders page
 *
 * Chạy script này trong Browser Console khi đang ở trang:
 * http://localhost:3007/admin/at-orders
 */

// 1. Kiểm tra API response từ backend
async function checkAPIResponse() {
    console.log('=== CHECKING API RESPONSE ===');

    const params = new URLSearchParams({
        page: 1,
        limit: 10,
        dateFrom: '2025-07-01',
        dateTo: '2025-07-31'
    });

    try {
        const token = localStorage.getItem('auth_token');
        const response = await fetch(`/api/admin/at-orders?${params.toString()}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        const data = await response.json();

        console.log('Total orders:', data.total);
        console.log('First 3 orders:');

        data.orders.slice(0, 3).forEach((order, index) => {
            console.log(`\nOrder ${index + 1}:`, {
                orderCode: order.orderCode,
                status: order.status,
                isConfirmed: order.isConfirmed,
                confirmedTime: order.confirmedTime,
                hasIsConfirmedField: 'isConfirmed' in order,
                typeOfIsConfirmed: typeof order.isConfirmed,
                rawValue: order.isConfirmed
            });
        });

        // Check if any order has is_confirmed
        const hasConfirmed = data.orders.some(o => o.isConfirmed === 1);
        const hasNotConfirmed = data.orders.some(o => o.isConfirmed === 0);

        console.log('\n=== SUMMARY ===');
        console.log('Has orders with isConfirmed = 1:', hasConfirmed);
        console.log('Has orders with isConfirmed = 0:', hasNotConfirmed);
        console.log('Missing isConfirmed field:', data.orders.some(o => !('isConfirmed' in o)));

        return data.orders;

    } catch (error) {
        console.error('API Error:', error);
    }
}

// 2. Kiểm tra DOM rendering
function checkDOMRendering() {
    console.log('\n=== CHECKING DOM RENDERING ===');

    const rows = document.querySelectorAll('#ordersTableBody tr');
    console.log('Total rows in table:', rows.length);

    if (rows.length > 0) {
        rows.forEach((row, index) => {
            if (index < 3) { // Check first 3 rows
                const cells = row.querySelectorAll('td');
                if (cells.length > 7) {
                    const statusCell = cells[6]; // TT Đơn hàng
                    const confirmedCell = cells[7]; // TT Đối soát

                    console.log(`\nRow ${index + 1}:`);
                    console.log('  Order ID:', cells[0].textContent.trim());
                    console.log('  TT Đơn hàng:', statusCell.textContent.trim());
                    console.log('  TT Đối soát:', confirmedCell.textContent.trim());
                    console.log('  Confirmed class:', confirmedCell.querySelector('.status-badge')?.className);
                }
            }
        });
    } else {
        console.log('No rows found in table!');
    }
}

// 3. Test logic xử lý is_confirmed
function testIsConfirmedLogic() {
    console.log('\n=== TESTING IS_CONFIRMED LOGIC ===');

    const testCases = [
        { isConfirmed: 1, expected: 'Đã đối soát', expectedClass: 'status-approved' },
        { isConfirmed: 0, expected: 'Chưa đối soát', expectedClass: 'status-pending' },
        { isConfirmed: null, expected: 'Chưa đối soát', expectedClass: 'status-pending' },
        { isConfirmed: undefined, expected: 'Chưa đối soát', expectedClass: 'status-pending' }
    ];

    testCases.forEach(testCase => {
        // Simulate the logic from at-orders.js line 294-296
        const isConfirmed = testCase.isConfirmed ?? 0;
        const confirmedClass = isConfirmed === 1 ? 'status-approved' : 'status-pending';
        const confirmedText = isConfirmed === 1 ? 'Đã đối soát' : 'Chưa đối soát';

        const passed = confirmedText === testCase.expected && confirmedClass === testCase.expectedClass;

        console.log(`\nTest: isConfirmed = ${testCase.isConfirmed}`);
        console.log(`  Result: ${confirmedText} (${confirmedClass})`);
        console.log(`  Expected: ${testCase.expected} (${testCase.expectedClass})`);
        console.log(`  Status: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    });
}

// 4. So sánh database vs UI
async function compareDBvsUI() {
    console.log('\n=== COMPARING DATABASE vs UI ===');
    console.log('Run this SQL in database to compare:');
    console.log(`
SELECT
    order_code,
    status,
    is_confirmed,
    confirmed_time
FROM conversions
WHERE order_code IN (
    SELECT order_code
    FROM conversions
    WHERE order_time >= '2025-07-01' AND order_time < '2025-08-01'
    LIMIT 10
)
ORDER BY order_time DESC;
    `);

    // Get current displayed data
    const apiOrders = await checkAPIResponse();

    console.log('\n=== COPY THIS TO COMPARE WITH DB ===');
    console.log('Order Codes from UI:', apiOrders?.slice(0, 10).map(o => o.orderCode));
}

// 5. Check browser cache
function checkBrowserCache() {
    console.log('\n=== CHECKING BROWSER CACHE ===');
    console.log('Auth token exists:', !!localStorage.getItem('auth_token'));
    console.log('User data:', localStorage.getItem('auth_user'));

    console.log('\nTo clear cache and reload:');
    console.log('1. Press Ctrl+Shift+R (hard reload)');
    console.log('2. Or run: location.reload(true)');
}

// Run all checks
async function runAllChecks() {
    console.clear();
    console.log('🔍 DEBUGGING AT-ORDERS DISPLAY FOR IS_CONFIRMED');
    console.log('='.repeat(60));

    await checkAPIResponse();
    checkDOMRendering();
    testIsConfirmedLogic();
    await compareDBvsUI();
    checkBrowserCache();

    console.log('\n' + '='.repeat(60));
    console.log('✅ DEBUG COMPLETE');
    console.log('\n📋 NEXT STEPS:');
    console.log('1. Check if API returns isConfirmed field');
    console.log('2. Check if database has correct values');
    console.log('3. Hard reload browser (Ctrl+Shift+R)');
    console.log('4. Run sync again if needed');
}

// Auto-run if in correct page
if (window.location.pathname === '/admin/at-orders') {
    console.log('✅ Correct page detected. Running checks...\n');
    runAllChecks();
} else {
    console.log('⚠️ Please navigate to /admin/at-orders first');
    console.log('Then run: runAllChecks()');
}

// Export functions for manual use
window.debugATOrders = {
    checkAPI: checkAPIResponse,
    checkDOM: checkDOMRendering,
    testLogic: testIsConfirmedLogic,
    compareDB: compareDBvsUI,
    checkCache: checkBrowserCache,
    runAll: runAllChecks
};

console.log('\n💡 Available commands:');
console.log('  debugATOrders.checkAPI()    - Check API response');
console.log('  debugATOrders.checkDOM()    - Check DOM rendering');
console.log('  debugATOrders.testLogic()   - Test is_confirmed logic');
console.log('  debugATOrders.compareDB()   - Compare DB vs UI');
console.log('  debugATOrders.runAll()      - Run all checks');
