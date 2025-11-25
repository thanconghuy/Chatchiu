/**
 * Script to apply patches to service files
 * Run: node apply-patches.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Applying patches to service files...\n');

// =====================================================
// PATCH 1: SystemReconciliationService.createReconciliation
// =====================================================
console.log('📝 Patch 1: SystemReconciliationService.createReconciliation');

const reconciliationServicePath = path.join(__dirname, 'backend/services/systemReconciliation/SystemReconciliationService.js');
let reconciliationService = fs.readFileSync(reconciliationServicePath, 'utf8');

const patch1Find = `        ]);
      }

      // Log creation
      await client.query(\`
        INSERT INTO system_reconciliation_logs (
          system_reconciliation_id, action, performed_by,
          new_status, new_total_cashback, reason
        ) VALUES ($1, $2, $3, $4, $5, $6)
      \`, [
        reconciliation.id,
        'created',
        createdBy,
        'draft',
        totalCashback,
        \`Tạo kỳ đối soát \${periodLabel} với \${totalOrders} đơn hàng\`
      ]);`;

const patch1Replace = `        ]);
      }

      // Update conversions status to 'processing' (Đang xử lý)
      // This will auto-sync to system_conversions via trigger
      await client.query(\`
        UPDATE conversions
        SET
          system_reconciliation_status = 'processing',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2)
      \`, [reconciliation.id, orders.map(o => o.conversion_id)]);

      // Log creation
      await client.query(\`
        INSERT INTO system_reconciliation_logs (
          system_reconciliation_id, action, performed_by,
          new_status, new_total_cashback, reason
        ) VALUES ($1, $2, $3, $4, $5, $6)
      \`, [
        reconciliation.id,
        'created',
        createdBy,
        'draft',
        totalCashback,
        \`Tạo kỳ đối soát \${periodLabel} với \${totalOrders} đơn hàng\`
      ]);`;

if (reconciliationService.includes(patch1Find)) {
  reconciliationService = reconciliationService.replace(patch1Find, patch1Replace);
  console.log('  ✅ Patch 1.1 applied: Added status update to createReconciliation');
} else if (reconciliationService.includes("system_reconciliation_status = 'processing'")) {
  console.log('  ⏭️  Patch 1.1 already applied');
} else {
  console.log('  ⚠️  Patch 1.1 failed: Could not find target code');
}

// =====================================================
// PATCH 2: SystemReconciliationService.finalizeReconciliation
// =====================================================
console.log('\n📝 Patch 2: SystemReconciliationService.finalizeReconciliation');

const patch2Find = `      // Update conversions status to 'reconciled'
      await client.query(\`
        UPDATE conversions c
        SET
          system_reconciliation_status = 'reconciled',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        FROM system_reconciliation_items sri
        WHERE c.id = sri.conversion_id
          AND sri.system_reconciliation_id = $1
          AND c.system_reconciliation_status IS NULL
      \`, [reconciliationId]);`;

const patch2Replace = `      // Update conversions status to 'reconciled'
      await client.query(\`
        UPDATE conversions c
        SET
          system_reconciliation_status = 'reconciled',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        FROM system_reconciliation_items sri
        WHERE c.id = sri.conversion_id
          AND sri.system_reconciliation_id = $1
          AND c.system_reconciliation_status = 'processing'
      \`, [reconciliationId]);`;

if (reconciliationService.includes(patch2Find)) {
  reconciliationService = reconciliationService.replace(patch2Find, patch2Replace);
  console.log('  ✅ Patch 2.1 applied: Changed condition from IS NULL to = \'processing\'');
} else if (reconciliationService.includes("c.system_reconciliation_status = 'processing'")) {
  console.log('  ⏭️  Patch 2.1 already applied');
} else {
  console.log('  ⚠️  Patch 2.1 failed: Could not find target code');
}

// Write back the file
fs.writeFileSync(reconciliationServicePath, reconciliationService, 'utf8');
console.log('\n💾 Saved: SystemReconciliationService.js');

// =====================================================
// PATCH 3: PaymentSystemReconciliationService.linkPaymentWithItems
// =====================================================
console.log('\n📝 Patch 3: PaymentSystemReconciliationService.linkPaymentWithItems');

const paymentServicePath = path.join(__dirname, 'backend/services/paymentSystemReconciliationService.js');
let paymentService = fs.readFileSync(paymentServicePath, 'utf8');

const patch3Find = `      const results = await Promise.all(insertPromises);

      // VALIDATION: Verify all inserts succeeded
      if (results.length !== selectedItems.length) {
        throw new Error(\`Expected \${selectedItems.length} inserts, got \${results.length}\`);
      }

      await client.query('COMMIT');`;

const patch3Replace = `      const results = await Promise.all(insertPromises);

      // VALIDATION: Verify all inserts succeeded
      if (results.length !== selectedItems.length) {
        throw new Error(\`Expected \${selectedItems.length} inserts, got \${results.length}\`);
      }

      // Update payment_status in system_conversions for each linked conversion
      // Get payment request status first
      const prQuery = await client.query(
        'SELECT status FROM payment_requests WHERE id = $1',
        [paymentRequestId]
      );
      const paymentStatus = prQuery.rows[0]?.status || 'pending';

      // Update payment_status for all linked conversions
      for (const item of selectedItems) {
        await client.query(
          'SELECT update_payment_status_in_system_conversions($1, $2, $3)',
          [item.conversionId, paymentRequestId, paymentStatus]
        );
      }

      await client.query('COMMIT');`;

if (paymentService.includes(patch3Find)) {
  paymentService = paymentService.replace(patch3Find, patch3Replace);
  console.log('  ✅ Patch 3.1 applied: Added payment_status update to linkPaymentWithItems');
} else if (paymentService.includes('update_payment_status_in_system_conversions')) {
  console.log('  ⏭️  Patch 3.1 already applied');
} else {
  console.log('  ⚠️  Patch 3.1 failed: Could not find target code');
}

fs.writeFileSync(paymentServicePath, paymentService, 'utf8');
console.log('💾 Saved: paymentSystemReconciliationService.js');

// =====================================================
// PATCH 4: PaymentRequest.updateStatus
// =====================================================
console.log('\n📝 Patch 4: PaymentRequest.updateStatus');

const paymentRequestPath = path.join(__dirname, 'backend/models/PaymentRequest.js');
let paymentRequest = fs.readFileSync(paymentRequestPath, 'utf8');

const patch4Find = `      await this._logAction(client, {
        paymentRequestId: id,
        action: 'status_changed',
        oldStatus: current.status,
        newStatus: status,
        performedBy: adminId || performedBy.id,
        performedByName: performedBy.full_name,
        performedByEmail: performedBy.email,
        notes: adminNotes || \`Status changed from \${current.status} to \${status}\`,
        metadata: { transactionReference }
      });

      await client.query('COMMIT');
      return result.rows[0];`;

const patch4Replace = `      await this._logAction(client, {
        paymentRequestId: id,
        action: 'status_changed',
        oldStatus: current.status,
        newStatus: status,
        performedBy: adminId || performedBy.id,
        performedByName: performedBy.full_name,
        performedByEmail: performedBy.email,
        notes: adminNotes || \`Status changed from \${current.status} to \${status}\`,
        metadata: { transactionReference }
      });

      // Sync payment_status to system_conversions for all linked conversions
      await client.query(\`
        UPDATE system_conversions sc
        SET
          payment_status = $1,
          updated_at = NOW()
        FROM payment_system_reconciliation_mapping psrm
        WHERE psrm.payment_request_id = $2
          AND sc.at_conversion_id = psrm.conversion_id
      \`, [status, id]);

      await client.query('COMMIT');
      return result.rows[0];`;

if (paymentRequest.includes(patch4Find)) {
  paymentRequest = paymentRequest.replace(patch4Find, patch4Replace);
  console.log('  ✅ Patch 4.1 applied: Added payment_status sync to updateStatus');
} else if (paymentRequest.includes('Sync payment_status to system_conversions')) {
  console.log('  ⏭️  Patch 4.1 already applied');
} else {
  console.log('  ⚠️  Patch 4.1 failed: Could not find target code');
}

fs.writeFileSync(paymentRequestPath, paymentRequest, 'utf8');
console.log('💾 Saved: PaymentRequest.js');

console.log('\n✨ All patches applied successfully!\n');
console.log('Next steps:');
console.log('1. Update admin.js query to SELECT new status fields');
console.log('2. Test the workflow\n');
