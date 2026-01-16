const http = require('http');

// Test payment request creation API
const postData = JSON.stringify({
  requestedAmount: 100000,
  bankName: "ACB Ngân Hàng Á Châu",
  bankAccountNumber: "12234556",
  bankAccountName: "Võ Thanh Phong",
  bankBranch: "TÂN ĐỊNH - HỒ CHÍ MINH",
  paymentAccountId: null
});

const options = {
  hostname: 'localhost',
  port: 3007,
  path: '/api/payment-requests',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhNzNiNTVlNy1hMTc2LTQyOTktYjRhYS0zODdjNWVlNDQ4OGMiLCJlbWFpbCI6InRlc3R1c2VyQHRlc3QuY29tIiwiaWF0IjoxNzM3MDAxMjAwfQ.FAKE_TOKEN', // Replace with real token
    'Idempotency-Key': '123e4567-e89b-12d3-a456-426614174000'
  }
};

console.log('Testing POST /api/payment-requests');
console.log('Headers:', options.headers);
console.log('Body:', postData);
console.log('');

const req = http.request(options, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  console.log('');

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response Body:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(data);
    }
  });
});

req.on('error', (error) => {
  console.error('Request Error:', error);
});

req.write(postData);
req.end();
