# PATCH: Update PaymentRequest Model

## File: backend/models/PaymentRequest.js

---

## CHANGE: Update `updateStatus` - Sync payment_status to system_conversions

**Location:** After logging status change (around line 400-402)

**Find this code:**
```javascript
      await this._logAction(client, {
        paymentRequestId: id,
        action: 'status_changed',
        oldStatus: current.status,
        newStatus: status,
        performedBy: adminId || performedBy.id,
        performedByName: performedBy.full_name,
        performedByEmail: performedBy.email,
        notes: adminNotes || `Status changed from ${current.status} to ${status}`,
        metadata: { transactionReference }
      });

      await client.query('COMMIT');
      return result.rows[0];
```

**Replace with:**
```javascript
      await this._logAction(client, {
        paymentRequestId: id,
        action: 'status_changed',
        oldStatus: current.status,
        newStatus: status,
        performedBy: adminId || performedBy.id,
        performedByName: performedBy.full_name,
        performedByEmail: performedBy.email,
        notes: adminNotes || `Status changed from ${current.status} to ${status}`,
        metadata: { transactionReference }
      });

      // Sync payment_status to system_conversions for all linked conversions
      await client.query(`
        UPDATE system_conversions sc
        SET
          payment_status = $1,
          updated_at = NOW()
        FROM payment_system_reconciliation_mapping psrm
        WHERE psrm.payment_request_id = $2
          AND sc.at_conversion_id = psrm.conversion_id
      `, [status, id]);

      await client.query('COMMIT');
      return result.rows[0];
```

---

## WHY THIS CHANGE:

1. **Auto-sync when status changes:** When admin changes payment status (confirmed/paid/rejected), all linked conversions should update their payment_status
2. **Direct UPDATE:** Faster than calling function for each conversion
3. **Inside transaction:** Ensures atomicity - status update and sync happen together

---

## TESTING:

```javascript
// 1. Change payment status to 'confirmed'
await PaymentRequest.updateStatus(paymentId, 'confirmed', { adminId: '...' });

// 2. Check system_conversions updated
const result = await pool.query(`
  SELECT sc.id, sc.payment_status, sc.payment_request_id
  FROM system_conversions sc
  INNER JOIN payment_system_reconciliation_mapping psrm
    ON sc.at_conversion_id = psrm.conversion_id
  WHERE psrm.payment_request_id = $1
`, [paymentId]);

// Expect: all rows have payment_status = 'confirmed'
```

---

## SUMMARY OF ALL CHANGES:

1. ✅ **Migration 019:** Added columns + trigger + function
2. ✅ **SystemReconciliationService.createReconciliation:** Set status='processing'
3. ✅ **SystemReconciliationService.finalizeReconciliation:** Set status='reconciled'
4. ✅ **PaymentSystemReconciliationService.linkPaymentWithItems:** Set payment_status when linking
5. ✅ **PaymentRequest.updateStatus:** Sync payment_status when status changes

**Result:** Full automation - status flows automatically through the system! 🚀
