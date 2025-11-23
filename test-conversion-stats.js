const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

// Generate test JWT token for ADMIN
const adminUserId = '2816c969-3b34-40b1-89ec-8c1667925040'; // Admin user ID (vtphong91@gmail.com)
const jwtSecret = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_1234567890_CHANGE_ME_IN_PRODUCTION';

const token = jwt.sign({ userId: adminUserId }, jwtSecret, { expiresIn: '1h' });

console.log('Testing Conversion Statistics API...');
console.log('Admin User ID:', adminUserId);
console.log('');

// Test with default date range (last 30 days)
const today = new Date();
const oneMonthAgo = new Date();
oneMonthAgo.setDate(today.getDate() - 30);

const dateFrom = oneMonthAgo.toISOString().split('T')[0];
const dateTo = today.toISOString().split('T')[0];

console.log('=== Testing with date range (last 30 days) ===');
console.log('From:', dateFrom);
console.log('To:', dateTo);
console.log('');

fetch(`http://localhost:3007/api/admin/conversions?limit=10&dateFrom=${dateFrom}&dateTo=${dateTo}`, {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(response => response.json())
.then(data => {
  if (data.success && data.stats) {
    console.log('📊 Statistics:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    console.log('📈 Order Counts:');
    console.log('  Total Orders:', data.stats.total_count);
    console.log('  ✅ Approved:', data.stats.approved.count);
    console.log('  ⏳ Pending:', data.stats.pending.count);
    console.log('  ❌ Rejected:', data.stats.rejected.count);
    console.log('');

    console.log('💰 Financial Summary:');
    console.log('  Total Commission:', parseFloat(data.stats.total_commission).toLocaleString('vi-VN'), 'đ');
    console.log('  Total Cashback:', parseFloat(data.stats.total_cashback).toLocaleString('vi-VN'), 'đ');
    console.log('');

    console.log('📋 Reconciliation Status:');
    console.log('  ✔️  Reconciled:', data.stats.reconciled_count);
    console.log('  ⚠️  Not Reconciled:', data.stats.not_reconciled_count);
    console.log('');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('✅ Statistics API working correctly!');
  } else {
    console.error('Failed to get stats:', data.message);
  }
})
.catch(error => {
  console.error('Error:', error.message);
});
