/**
 * Quick Verification Script
 *
 * Purpose: Test if backend has loaded the updated code with new logging
 *
 * How to use:
 * 1. Make sure backend is running on port 3007
 * 2. Run: node verify-backend-code.js
 * 3. Check the backend console/logs
 * 4. If you see "=== CREATE PAYMENT REQUEST START ===" → Code updated ✅
 * 5. If you DON'T see those logs → Code NOT updated ❌
 */

const http = require('http');

// Use a test token - replace with a real JWT token from your login
const TEST_TOKEN = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhNzNiNTVlNy1hMTc2LTQyOTktYjRhYS0zODdjNWVlNDQ4OGMiLCJlbWFpbCI6InRlc3R1c2VyQHRlc3QuY29tIiwiaWF0IjoxNzM3MDAxMjAwfQ.FAKE_TOKEN';

// Generate a unique idempotency key
const { v4: uuidv4 } = require('uuid');
const idempotencyKey = uuidv4();

const postData = JSON.stringify({
  requestedAmount: 100000,
  bankName: "ZaloPay",
  bankAccountNumber: "0944941491",
  bankAccountName: "LÊ TRỌNG MẠNH",
  bankBranch: null,
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
    'Authorization': TEST_TOKEN,
    'Idempotency-Key': idempotencyKey
  }
};

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║         BACKEND CODE VERIFICATION TEST                        ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('📋 Test Details:');
console.log(`   Endpoint: POST http://localhost:3007/api/payment-requests`);
console.log(`   Idempotency Key: ${idempotencyKey}`);
console.log('');
console.log('⏳ Sending request...');
console.log('');
console.log('🔍 IMPORTANT: Check your BACKEND CONSOLE/LOGS now!');
console.log('');
console.log('   ✅ IF CODE UPDATED: You will see:');
console.log('      =========================');
console.log('      === CREATE PAYMENT REQUEST START ===');
console.log('      User ID: ...');
console.log('      Request body: {...}');
console.log('      Idempotency Key: ...');
console.log('      =========================');
console.log('');
console.log('   ❌ IF CODE NOT UPDATED: You will NOT see those logs');
console.log('');
console.log('───────────────────────────────────────────────────────────────');
console.log('');

const req = http.request(options, (res) => {
  console.log('📡 Response Status:', res.statusCode, res.statusText);
  console.log('');

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📦 Response Body:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(data);
    }
    console.log('');
    console.log('───────────────────────────────────────────────────────────────');
    console.log('');
    console.log('🎯 VERIFICATION RESULT:');
    console.log('');
    console.log('   Go check your backend console/PM2 logs now!');
    console.log('');
    console.log('   ✅ If you see "=== CREATE PAYMENT REQUEST START ==="');
    console.log('      → Backend HAS the updated code');
    console.log('');
    console.log('   ❌ If you DO NOT see those debug logs');
    console.log('      → Backend is STILL RUNNING OLD CODE');
    console.log('      → Follow RESTART_BACKEND_GUIDE.md to properly restart');
    console.log('');
    console.log('╚════════════════════════════════════════════════════════════════╝');
  });
});

req.on('error', (error) => {
  console.error('');
  console.error('❌ Request Error:', error.message);
  console.error('');
  console.error('Possible causes:');
  console.error('  1. Backend is not running on port 3007');
  console.error('  2. Backend crashed');
  console.error('  3. Firewall blocking connection');
  console.error('');
  console.error('Solution:');
  console.error('  1. Check if backend is running: netstat -ano | findstr :3007');
  console.error('  2. Start backend: cd backend && npm run dev');
  console.error('');
});

req.write(postData);
req.end();
