const fs = require('fs');
const path = require('path');

console.log('🎨 Updating frontend Conversions Management...\n');

const jsPath = path.join(__dirname, 'frontend/admin/conversions.js');
let jsCode = fs.readFileSync(jsPath, 'utf8');

// 1. Add helper functions for new status badges (insert after line 325)
const findLocation1 = `        const reconciliationClass = conv.isConfirmed ? 'status-approved' : 'status-pending';
        const reconciliationText = conv.isConfirmed ? 'Đã đối soát' : 'Chưa đối soát';`;

const insert1 = `        const reconciliationClass = conv.isConfirmed ? 'status-approved' : 'status-pending';
        const reconciliationText = conv.isConfirmed ? 'Đã đối soát' : 'Chưa đối soát';

        // System Reconciliation Status (TT đối soát HT)
        let systemReconClass = 'status-pending';
        let systemReconText = 'Chưa đối soát';
        if (conv.system_reconciliation_status === 'processing') {
            systemReconClass = 'status-warning';
            systemReconText = 'Đang xử lý';
        } else if (conv.system_reconciliation_status === 'reconciled' || conv.system_reconciliation_status === 'paid') {
            systemReconClass = 'status-approved';
            systemReconText = 'Đã đối soát';
        }

        // Payment Status (TT thanh toán)
        let paymentClass = 'status-inactive';
        let paymentText = 'Chưa tạo yêu cầu';
        if (conv.payment_status === 'pending' || conv.payment_status === 'confirmed') {
            paymentClass = 'status-warning';
            paymentText = 'Đang xử lý';
        } else if (conv.payment_status === 'paid') {
            paymentClass = 'status-approved';
            paymentText = 'Đã thanh toán';
        } else if (conv.payment_status === 'rejected') {
            paymentClass = 'status-rejected';
            paymentText = 'Hủy';
        }`;

if (jsCode.includes(findLocation1)) {
    jsCode = jsCode.replace(findLocation1, insert1);
    console.log('✅ Step 1: Added status badge helper functions');
} else if (jsCode.includes('System Reconciliation Status')) {
    console.log('⏭️  Step 1: Already added');
} else {
    console.log('⚠️  Step 1: Could not find location');
}

// 2. Add new <td> columns (after line 373)
const findLocation2 = `                <td><span class="status-badge \${statusClass}">\${statusText}</span></td>
                <td><span class="status-badge \${reconciliationClass}">\${reconciliationText}</span></td>
                <td>\${formatDate(conv.orderTime)}</td>`;

const insert2 = `                <td><span class="status-badge \${statusClass}">\${statusText}</span></td>
                <td><span class="status-badge \${reconciliationClass}">\${reconciliationText}</span></td>
                <td><span class="status-badge \${systemReconClass}">\${systemReconText}</span></td>
                <td><span class="status-badge \${paymentClass}">\${paymentText}</span></td>
                <td>\${formatDate(conv.orderTime)}</td>`;

if (jsCode.includes(findLocation2)) {
    jsCode = jsCode.replace(findLocation2, insert2);
    console.log('✅ Step 2: Added 2 new table columns');
} else if (jsCode.includes('systemReconClass')) {
    console.log('⏭️  Step 2: Already added');
} else {
    console.log('⚠️  Step 2: Could not find location');
}

// 3. Update empty state colspan from 10 to 12
jsCode = jsCode.replace('colspan="10"', 'colspan="12"');
console.log('✅ Step 3: Updated empty state colspan to 12');

// 4. Update skeleton rows (add 2 more <td>)
const findSkeleton = `                <td><div class="skeleton skeleton-badge"></div></td>
                <td><div class="skeleton skeleton-badge"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>`;

const insertSkeleton = `                <td><div class="skeleton skeleton-badge"></div></td>
                <td><div class="skeleton skeleton-badge"></div></td>
                <td><div class="skeleton skeleton-badge"></div></td>
                <td><div class="skeleton skeleton-badge"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>
                <td><div class="skeleton skeleton-text"></div></td>`;

if (jsCode.includes(findSkeleton)) {
    jsCode = jsCode.replace(findSkeleton, insertSkeleton);
    console.log('✅ Step 4: Updated skeleton loading rows');
} else {
    console.log('⏭️  Step 4: Skeleton already updated or not found');
}

// Write back
fs.writeFileSync(jsPath, jsCode, 'utf8');
console.log('\n💾 Saved: conversions.js\n');

// Add CSS for new status classes
const htmlPath = path.join(__dirname, 'frontend/admin/conversions.html');
let htmlCode = fs.readFileSync(htmlPath, 'utf8');

// Check if CSS already exists
if (!htmlCode.includes('status-warning')) {
    const cssInsert = `
        .status-warning {
            background: #fef3c7;
            color: #92400e;
        }

        .status-inactive {
            background: #f3f4f6;
            color: #6b7280;
        }
`;

    // Insert before </style>
    htmlCode = htmlCode.replace('</style>', cssInsert + '    </style>');
    fs.writeFileSync(htmlPath, htmlCode, 'utf8');
    console.log('✅ Added new CSS classes to conversions.html\n');
} else {
    console.log('⏭️  CSS classes already exist\n');
}

console.log('✨ Frontend update complete!\n');
console.log('Changes:');
console.log('- Added "TT đối soát HT" column');
console.log('- Added "TT thanh toán" column');
console.log('- Added status badge helpers');
console.log('- Added CSS classes for new statuses\n');
