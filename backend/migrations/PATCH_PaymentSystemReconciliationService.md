# PATCH: Update PaymentSystemReconciliationService

## File: backend/services/paymentSystemReconciliationService.js

---

## CHANGE: Update `linkPaymentWithItems` - Set payment_status when linking

**Location:** After inserting mapping records (around line 272-279)

**Find this code:**
```javascript
      const results = await Promise.all(insertPromises);

      // VALIDATION: Verify all inserts succeeded
      if (results.length !== selectedItems.length) {
        throw new Error(`Expected ${selectedItems.length} inserts, got ${results.length}`);
      }

      await client.query('COMMIT');
```

**Replace with:**
```javascript
      const results = await Promise.all(insertPromises);

      // VALIDATION: Verify all inserts succeeded
      if (results.length !== selectedItems.length) {
        throw new Error(`Expected ${selectedItems.length} inserts, got ${results.length}`);
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

      await client.query('COMMIT');
```

---

## WHY THIS CHANGE:

1. **Auto-update payment_status:** When payment request is linked with conversions, the payment_status should be updated immediately
2. **Use database function:** Migration 019 created `update_payment_status_in_system_conversions()` function
3. **Sync with payment request status:** The payment_status matches the payment_request.status

---

## NEXT STEP:

Also need to update `PaymentRequest` model to sync payment_status when status changes (confirmed, paid, rejected).

See: `PATCH_PaymentRequestModel.md`
