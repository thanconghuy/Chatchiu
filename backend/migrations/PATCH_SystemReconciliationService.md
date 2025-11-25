# PATCH: Update SystemReconciliationService

## File: backend/services/systemReconciliation/SystemReconciliationService.js

---

## CHANGE 1: Update `createReconciliation` - Set status='processing' when creating reconciliation

**Location:** After inserting reconciliation items (around line 169)

**Find this code:**
```javascript
        ]);
      }

      // Log creation
      await client.query(`
```

**Replace with:**
```javascript
        ]);
      }

      // Update conversions status to 'processing' (Đang xử lý)
      // This will auto-sync to system_conversions via trigger
      await client.query(`
        UPDATE conversions
        SET
          system_reconciliation_status = 'processing',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        WHERE id = ANY($2)
      `, [reconciliation.id, orders.map(o => o.conversion_id)]);

      // Log creation
      await client.query(`
```

---

## CHANGE 2: Update `finalizeReconciliation` - Already has status='reconciled' update

**Location:** Around line 297-308

**Verify this code exists:**
```javascript
      // Update conversions status to 'reconciled'
      await client.query(`
        UPDATE conversions c
        SET
          system_reconciliation_status = 'reconciled',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        FROM system_reconciliation_items sri
        WHERE c.id = sri.conversion_id
          AND sri.system_reconciliation_id = $1
          AND c.system_reconciliation_status IS NULL
      `, [reconciliationId]);
```

✅ **This code is already correct!** The trigger will auto-sync to `system_conversions`.

**BUT need to change one thing:** Remove the condition `AND c.system_reconciliation_status IS NULL`

**Find:**
```javascript
      // Update conversions status to 'reconciled'
      await client.query(`
        UPDATE conversions c
        SET
          system_reconciliation_status = 'reconciled',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        FROM system_reconciliation_items sri
        WHERE c.id = sri.conversion_id
          AND sri.system_reconciliation_id = $1
          AND c.system_reconciliation_status IS NULL
      `, [reconciliationId]);
```

**Replace with:**
```javascript
      // Update conversions status to 'reconciled'
      await client.query(`
        UPDATE conversions c
        SET
          system_reconciliation_status = 'reconciled',
          system_reconciliation_id = $1,
          system_reconciled_at = CURRENT_TIMESTAMP
        FROM system_reconciliation_items sri
        WHERE c.id = sri.conversion_id
          AND sri.system_reconciliation_id = $1
          AND c.system_reconciliation_status = 'processing'
      `, [reconciliationId]);
```

**Reason:** Only update from 'processing' → 'reconciled', not from NULL (which shouldn't happen)

---

## SUMMARY:

1. ✅ **createReconciliation:** Add UPDATE to set status='processing'
2. ✅ **finalizeReconciliation:** Change condition from `IS NULL` to `= 'processing'`
3. ✅ **Trigger sync:** Migration 019 already created trigger to auto-sync to `system_conversions`

---

## Testing after changes:

```sql
-- 1. Check that conversions get status='processing' when reconciliation is created
SELECT c.id, c.system_reconciliation_status, c.system_reconciliation_id
FROM conversions c
INNER JOIN system_reconciliation_items sri ON c.id = sri.conversion_id
WHERE sri.system_reconciliation_id = '<reconciliation_id>';

-- 2. Check that system_conversions is synced
SELECT sc.id, sc.system_reconciliation_status, sc.system_reconciliation_id
FROM system_conversions sc
WHERE sc.system_reconciliation_id = '<reconciliation_id>';

-- 3. After finalize, check status='reconciled'
SELECT c.id, c.system_reconciliation_status
FROM conversions c
WHERE c.system_reconciliation_id = '<reconciliation_id>';
```
