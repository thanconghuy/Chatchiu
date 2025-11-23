const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

// Generate test JWT token for ADMIN
const adminUserId = '2816c969-3b34-40b1-89ec-8c1667925040'; // Admin user ID (vtphong91@gmail.com)
const jwtSecret = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_1234567890_CHANGE_ME_IN_PRODUCTION';

const token = jwt.sign({ userId: adminUserId }, jwtSecret, { expiresIn: '1h' });

console.log('Testing Conversion Filters API...');
console.log('Admin User ID:', adminUserId);
console.log('');

// Test 1: Filter by user search
console.log('=== Test 1: Search for user "manh" ===');
fetch('http://localhost:3007/api/admin/conversions?limit=10&userSearch=manh', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`
  }
})
.then(response => response.json())
.then(data => {
  console.log('Found:', data.conversions?.length || 0, 'conversions');
  if (data.conversions && data.conversions.length > 0) {
    console.log('First result:', {
      user: data.conversions[0].full_name || data.conversions[0].username,
      email: data.conversions[0].email,
      order_code: data.conversions[0].order_code
    });
  }
  console.log('');

  // Test 2: Filter by date range
  console.log('=== Test 2: Filter by date range (Nov 2025) ===');
  return fetch('http://localhost:3007/api/admin/conversions?limit=10&dateFrom=2025-11-01&dateTo=2025-11-30', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
})
.then(response => response.json())
.then(data => {
  console.log('Found:', data.conversions?.length || 0, 'conversions in Nov 2025');
  if (data.conversions && data.conversions.length > 0) {
    console.log('Date range:', {
      first: new Date(data.conversions[data.conversions.length - 1].order_time).toLocaleDateString('vi-VN'),
      last: new Date(data.conversions[0].order_time).toLocaleDateString('vi-VN')
    });
  }
  console.log('');

  // Test 3: Combine filters
  console.log('=== Test 3: Combine user + status + date ===');
  return fetch('http://localhost:3007/api/admin/conversions?limit=10&userSearch=manh&status=approved&dateFrom=2025-11-01', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
})
.then(response => response.json())
.then(data => {
  console.log('Found:', data.conversions?.length || 0, 'approved conversions for "manh" since Nov 1');
  if (data.stats) {
    console.log('Stats:', {
      approved_count: data.stats.approved_count,
      approved_cashback: parseFloat(data.stats.approved_cashback || 0).toLocaleString('vi-VN') + ' đ'
    });
  }
  console.log('');
  console.log('✅ All filter tests completed!');
})
.catch(error => {
  console.error('Error:', error.message);
});
