const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

// Generate test JWT token for the user
const userId = 'eb06669c-03c7-497d-a139-1e89c2a9df58';
const jwtSecret = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_1234567890_CHANGE_ME_IN_PRODUCTION';

const token = jwt.sign({ userId }, jwtSecret, { expiresIn: '1h' });

console.log('Testing API endpoint...');
console.log('User ID:', userId);
console.log('Token:', token.substring(0, 50) + '...');
console.log('');

// Test the reconciliations endpoint
fetch('http://localhost:3007/api/user/system-reconciliation/reconciliations?page=1&limit=50', {
  method: 'GET',
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
  console.log('Response data:', JSON.stringify(data, null, 2));
})
.catch(error => {
  console.error('Error:', error);
});
