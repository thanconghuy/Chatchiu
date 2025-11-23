const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

// Generate test JWT token for ADMIN
const adminUserId = '2816c969-3b34-40b1-89ec-8c1667925040'; // Admin user ID (vtphong91@gmail.com)
const jwtSecret = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_1234567890_CHANGE_ME_IN_PRODUCTION';

const token = jwt.sign({ userId: adminUserId }, jwtSecret, { expiresIn: '1h' });

const reconciliationId = 'e75d6e2e-ca34-4a95-bb81-c441f6c8fb36';

console.log('Testing Sync API endpoint...');
console.log('Admin User ID:', adminUserId);
console.log('Reconciliation ID:', reconciliationId);
console.log('');

// Test the sync endpoint
fetch(`http://localhost:3007/api/admin/system-reconciliation/${reconciliationId}/sync`, {
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
  console.log('\n=== Sync Result ===');
  console.log(JSON.stringify(data, null, 2));

  if (data.success && data.data) {
    console.log('\n=== Summary ===');
    console.log('Synced items:', data.data.synced);
    console.log('Released items:', data.data.released);
    console.log('Released amount:', data.data.released_amount?.toLocaleString('vi-VN'), 'VNĐ');
    console.log('Deducted items:', data.data.deducted);
    console.log('Deducted amount:', data.data.deducted_amount?.toLocaleString('vi-VN'), 'VNĐ');
    console.log('Duration:', data.data.duration, 'ms');
  }
})
.catch(error => {
  console.error('Error:', error.message);
});
