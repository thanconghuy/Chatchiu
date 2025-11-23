const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

// Generate test JWT token for ADMIN
const adminUserId = '2816c969-3b34-40b1-89ec-8c1667925040'; // Admin user ID (vtphong91@gmail.com)
const jwtSecret = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_1234567890_CHANGE_ME_IN_PRODUCTION';

const token = jwt.sign({ userId: adminUserId }, jwtSecret, { expiresIn: '1h' });

console.log('Testing Conversion Sync API endpoints...');
console.log('Admin User ID:', adminUserId);
console.log('');

// Test 1: Sync missing cashback conversions to system_conversions
console.log('=== Test 1: Sync missing cashback conversions ===');
fetch('http://localhost:3007/api/admin/conversions/sync-to-system', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  }
})
.then(response => {
  console.log('Response status:', response.status, response.statusText);
  return response.json();
})
.then(data => {
  console.log('Result:', JSON.stringify(data, null, 2));
  console.log('');

  // Test 2: Sync status updates
  console.log('=== Test 2: Sync status updates ===');
  return fetch('http://localhost:3007/api/admin/conversions/sync-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
})
.then(response => {
  console.log('Response status:', response.status, response.statusText);
  return response.json();
})
.then(data => {
  console.log('Result:', JSON.stringify(data, null, 2));
})
.catch(error => {
  console.error('Error:', error.message);
});
