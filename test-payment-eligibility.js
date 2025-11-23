const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

// Generate test JWT token for the user
const userId = 'eb06669c-03c7-497d-a139-1e89c2a9df58';
const jwtSecret = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_1234567890_CHANGE_ME_IN_PRODUCTION';

const token = jwt.sign({ id: userId, userId }, jwtSecret, { expiresIn: '1h' });

console.log('Testing Payment Eligibility API...');
console.log('User ID:', userId);
console.log('');

// Test the payment eligibility endpoint
fetch('http://localhost:3007/api/payment-requests/eligibility', {
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
  console.log('\n=== Payment Eligibility Result ===');
  console.log(JSON.stringify(data, null, 2));

  if (data.success && data.data) {
    const { isEligible, availableBalance, totalConfirmedCashback, totalRequested, system_available_balance, system_debt_balance } = data.data;
    console.log('\n=== Summary ===');
    console.log('Available Balance:', availableBalance.toLocaleString('vi-VN'), 'VNĐ');
    console.log('Total API Confirmed:', totalConfirmedCashback.toLocaleString('vi-VN'), 'VNĐ');
    console.log('Total Requested:', totalRequested.toLocaleString('vi-VN'), 'VNĐ');
    if (system_available_balance !== undefined) {
      console.log('System Available:', system_available_balance.toLocaleString('vi-VN'), 'VNĐ');
    }
    if (system_debt_balance !== undefined) {
      console.log('System Debt:', system_debt_balance.toLocaleString('vi-VN'), 'VNĐ');
    }
    console.log('Is Eligible:', isEligible ? '✅ YES' : '❌ NO');
  }
})
.catch(error => {
  console.error('Error:', error.message);
});
