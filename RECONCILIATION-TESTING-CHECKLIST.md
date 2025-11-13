# ✅ Reconciliation Module - Testing Checklist

## 📋 Phase 1: Database Migration

### Migration Files
- [x] Created `001-add-reconciliation-fields-to-conversions.sql`
- [x] Created `002-create-reconciliations-table.sql`
- [x] Created `003-create-reconciliation-items-table.sql`
- [x] Created `004-create-reconciliation-logs-table.sql`
- [x] Created `005-create-payments-table.sql`
- [x] Created `reconciliation-module-all-in-one.sql`
- [x] Fixed HOTFIX-003 (trigger function optimization)
- [x] Fixed HOTFIX-ALL-IN-ONE (missing prerequisite function)

### Migration Execution
- [ ] Chạy migration trên Neon Dashboard
- [ ] Verify tables created: `reconciliations`, `reconciliation_items`, `reconciliation_logs`, `payments`
- [ ] Verify columns added to `conversions`: `is_confirmed`, `confirmed_time`, `order_approved`, `order_pending`, `order_reject`
- [ ] Verify indexes created (24 indexes total)
- [ ] Verify triggers created (6 triggers total)
- [ ] Verify functions created (3 functions total)

**Verification Query:**
```sql
-- Check tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'reconcil%'
ORDER BY table_name;

-- Check conversions columns
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'conversions'
AND column_name IN ('is_confirmed', 'confirmed_time', 'order_approved', 'order_pending', 'order_reject');

-- Check triggers
SELECT trigger_name, event_object_table, action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
AND trigger_name LIKE '%reconciliation%';
```

---

## 📋 Phase 2: Backend Logic

### Models
- [x] Created `backend/models/Reconciliation.js`
- [x] Created `backend/models/ReconciliationItem.js`
- [x] Updated `backend/models/Conversion.js` (added 5 new fields)

**Test Cases:**

```javascript
// Test Conversion.create() with new fields
const conversion = await Conversion.create({
  // ... existing fields
  isConfirmed: 1,
  confirmedTime: new Date(),
  orderApproved: 5,
  orderPending: 0,
  orderReject: 0
});
console.assert(conversion.is_confirmed === 1);

// Test Reconciliation.create()
const reconciliation = await Reconciliation.create({
  userId: null,
  periodStart: new Date('2025-11-01'),
  periodEnd: new Date('2025-11-30'),
  periodLabel: 'Test Period',
  createdBy: adminUserId
});
console.assert(reconciliation.status === 'draft');
console.assert(reconciliation.version === 1);

// Test ReconciliationItem.bulkCreate()
const items = [
  { reconciliationId, conversionId: 'uuid1', userId: 'uuid', clickId: 'uuid', ... },
  { reconciliationId, conversionId: 'uuid2', userId: 'uuid', clickId: 'uuid', ... }
];
const inserted = await ReconciliationItem.bulkCreate(items);
console.assert(inserted.length === 2);
```

---

### Services
- [x] Updated `backend/services/trackingService.js`
  - [x] Added `mapConversionStatus()`
  - [x] Added `extractConfirmationData()`
  - [x] Updated `handleNewConversion()`
  - [x] Updated `createConversionDirect()`
- [x] Verified `backend/services/accesstrade.js` (no changes needed)
- [x] Created `backend/services/reconciliationService.js`

**Test Cases:**

```javascript
// Test trackingService status mapping
const status1 = trackingService.mapConversionStatus(0);
console.assert(status1 === 'pending');

const status2 = trackingService.mapConversionStatus(1);
console.assert(status2 === 'approved');

// Test extractConfirmationData
const data = {
  is_confirmed: 1,
  confirmed_time: '2025-11-15T10:00:00Z',
  order_approved: 5,
  order_pending: 0,
  order_reject: 0
};
const extracted = trackingService.extractConfirmationData(data);
console.assert(extracted.isConfirmed === 1);
console.assert(extracted.orderApproved === 5);

// Test reconciliationService.previewReconciliation()
const preview = await reconciliationService.previewReconciliation({
  userId: null,
  periodStart: new Date('2025-11-01'),
  periodEnd: new Date('2025-11-30')
});
console.assert(Array.isArray(preview.eligible));
console.assert(typeof preview.stats.eligible_count === 'number');
```

---

### Routes
- [x] Created `backend/routes/reconciliation.js` (admin routes)
- [x] Updated `backend/routes/dashboard.js` (user routes)
- [x] Updated `server-cashback.js` (registered routes)

**Test Cases:**

```bash
# Admin - Preview
curl -X POST http://localhost:3007/api/reconciliation/preview \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": null,
    "periodStart": "2025-11-01",
    "periodEnd": "2025-11-30"
  }'

# Admin - Create
curl -X POST http://localhost:3007/api/reconciliation/create \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": null,
    "periodStart": "2025-11-01",
    "periodEnd": "2025-11-30",
    "periodLabel": "Tháng 11/2025"
  }'

# Admin - List
curl http://localhost:3007/api/reconciliation/list \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# User - View reconciliations
curl http://localhost:3007/api/dashboard/reconciliations \
  -H "Authorization: Bearer $USER_TOKEN"
```

---

## 📋 Integration Testing

### Scenario 1: Full Admin Flow

**Setup:**
1. [ ] Có ít nhất 10 conversions với `is_confirmed=1`, `utm_source='chatchiu'`
2. [ ] Login as admin
3. [ ] Get admin token

**Test Steps:**

```javascript
// 1. Preview
const preview = await fetch('/api/reconciliation/preview', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: null,
    periodStart: '2025-11-01',
    periodEnd: '2025-11-30'
  })
}).then(r => r.json());

console.log('✅ Preview:', preview.data.stats.eligible_count, 'orders');

// 2. Create
const create = await fetch('/api/reconciliation/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: null,
    periodStart: '2025-11-01',
    periodEnd: '2025-11-30',
    periodLabel: 'Tháng 11/2025',
    notes: 'Test reconciliation'
  })
}).then(r => r.json());

const reconciliationId = create.data.reconciliation.id;
console.log('✅ Created:', reconciliationId);

// 3. View details
const details = await fetch(`/api/reconciliation/${reconciliationId}`, {
  headers: { 'Authorization': `Bearer ${adminToken}` }
}).then(r => r.json());

console.log('✅ Details:', details.data.items.length, 'items');

// 4. Update status to confirmed
const confirm = await fetch(`/api/reconciliation/${reconciliationId}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'confirmed' })
}).then(r => r.json());

console.log('✅ Confirmed:', confirm.data.status);

// 5. Export CSV
const csvUrl = `/api/reconciliation/${reconciliationId}/export`;
console.log('✅ CSV Export URL:', csvUrl);

// 6. Update status to paid
const paid = await fetch(`/api/reconciliation/${reconciliationId}/status`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ status: 'paid' })
}).then(r => r.json());

console.log('✅ Paid:', paid.data.status);
```

**Expected Results:**
- [ ] Preview returns eligible conversions
- [ ] Create returns status 201 with reconciliation ID
- [ ] Details returns full data with items
- [ ] Status updates successfully
- [ ] CSV exports correctly
- [ ] Paid status is final (cannot change)

---

### Scenario 2: Re-run Reconciliation

**Setup:**
1. [ ] Đã tạo 1 reconciliation cho tháng 11 (vào ngày 5/12)
2. [ ] Có thêm conversions confirmed từ ngày 5-10/12 (cùng tháng 11)

**Test Steps:**

```javascript
// 1. Preview again (should show new orders)
const preview2 = await fetch('/api/reconciliation/preview', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    userId: null,
    periodStart: '2025-11-01',
    periodEnd: '2025-11-30'
  })
}).then(r => r.json());

console.log('New eligible orders:', preview2.data.stats.eligible_count);

// 2. Re-run
const rerun = await fetch(`/api/reconciliation/${originalReconciliationId}/rerun`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    notes: 'Re-run vì có thêm orders mới'
  })
}).then(r => r.json());

console.log('New version:', rerun.data.reconciliation.version);

// 3. Verify parent's is_latest = false
const parent = await fetch(`/api/reconciliation/${originalReconciliationId}`, {
  headers: { 'Authorization': `Bearer ${adminToken}` }
}).then(r => r.json());

console.assert(parent.data.reconciliation.is_latest === false);
console.assert(rerun.data.reconciliation.is_latest === true);
```

**Expected Results:**
- [ ] Preview shows new orders (not in original reconciliation)
- [ ] Re-run creates new version with incremented version number
- [ ] Parent's `is_latest` is set to `false`
- [ ] New version's `is_latest` is `true`
- [ ] New version has `parent_reconciliation_id` set

---

### Scenario 3: User View

**Setup:**
1. [ ] Login as normal user
2. [ ] Admin đã create và confirm reconciliation cho user này

**Test Steps:**

```javascript
// 1. List reconciliations
const reconciliations = await fetch('/api/dashboard/reconciliations', {
  headers: { 'Authorization': `Bearer ${userToken}` }
}).then(r => r.json());

console.log('User reconciliations:', reconciliations.reconciliations.length);

// 2. View items in first reconciliation
if (reconciliations.reconciliations.length > 0) {
  const reconciliationId = reconciliations.reconciliations[0].id;
  const items = await fetch(`/api/dashboard/reconciliation/${reconciliationId}/items`, {
    headers: { 'Authorization': `Bearer ${userToken}` }
  }).then(r => r.json());

  console.log('User items:', items.items.length);
  console.log('Total cashback:', items.items.reduce((sum, i) => sum + i.cashbackAmount, 0));
}
```

**Expected Results:**
- [ ] User chỉ thấy confirmed reconciliations
- [ ] User chỉ thấy items của mình
- [ ] Items show correct cashback amounts

---

## 📋 Edge Cases & Error Handling

### Test Case: Overlap Detection

```javascript
// Create reconciliation for Nov 1-30
const rec1 = await createReconciliation({
  periodStart: '2025-11-01',
  periodEnd: '2025-11-30'
});

// Try to create overlapping period Nov 15-Dec 15
const rec2 = await createReconciliation({
  periodStart: '2025-11-15',
  periodEnd: '2025-12-15'
});
// Expected: Error "Reconciliation period overlaps with existing period"
```

- [ ] Overlap detection works correctly
- [ ] Returns appropriate error message

---

### Test Case: Invalid Status Transition

```javascript
// Create reconciliation (status = draft)
const rec = await createReconciliation({ ... });

// Confirm it
await updateStatus(rec.id, 'confirmed');

// Mark as paid
await updateStatus(rec.id, 'paid');

// Try to go back to draft (should fail)
const error = await updateStatus(rec.id, 'draft');
// Expected: Error "Invalid status transition: paid -> draft"
```

- [ ] Status workflow validation works
- [ ] Cannot transition from final states (paid, cancelled)

---

### Test Case: Delete Protection

```javascript
// Create draft reconciliation
const draft = await createReconciliation({ ... });

// Delete draft (should succeed)
await deleteReconciliation(draft.id);

// Create and confirm reconciliation
const confirmed = await createReconciliation({ ... });
await updateStatus(confirmed.id, 'confirmed');

// Try to delete confirmed (should fail)
const error = await deleteReconciliation(confirmed.id);
// Expected: Error "Only draft reconciliations can be deleted"
```

- [ ] Can delete draft reconciliations
- [ ] Cannot delete non-draft reconciliations

---

### Test Case: User Access Control

```javascript
// User A login
const userAToken = 'token-for-user-A';

// Admin creates reconciliation for User B
const recUserB = await adminCreateReconciliation({
  userId: 'user-B-uuid',
  ...
});

// User A tries to access User B's items
const error = await fetch(`/api/dashboard/reconciliation/${recUserB.id}/items`, {
  headers: { 'Authorization': `Bearer ${userAToken}` }
});
// Expected: 403 "Access denied"
```

- [ ] Users can only view their own reconciliations
- [ ] Users can only view confirmed reconciliations

---

## 📋 Performance Testing

### Test Case: Bulk Insert Performance

```javascript
// Create reconciliation with 1000 items
const start = Date.now();

const preview = await previewReconciliation({
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31'
});
console.log('Preview time:', Date.now() - start, 'ms');

const createStart = Date.now();
const rec = await createReconciliation({
  periodStart: '2025-01-01',
  periodEnd: '2025-12-31',
  periodLabel: 'Năm 2025'
});
console.log('Create time (1000 items):', Date.now() - createStart, 'ms');
```

**Expected:**
- [ ] Preview < 2 seconds for 1000 conversions
- [ ] Create < 5 seconds for 1000 items (bulk insert)

---

### Test Case: Stats Calculation

```javascript
// Verify trigger auto-updates stats
const rec = await createReconciliation({ ... });

// Check stats before
console.log('Initial stats:', rec.reconciliation.total_orders);

// Manually delete 1 item (for testing)
await db.query('DELETE FROM reconciliation_items WHERE reconciliation_id = $1 LIMIT 1', [rec.id]);

// Check stats after (should be updated by trigger)
const updated = await getReconciliationDetails(rec.id);
console.log('Updated stats:', updated.reconciliation.total_orders);
```

- [ ] Trigger auto-updates stats on item INSERT
- [ ] Trigger auto-updates stats on item DELETE

---

## 📋 Database Verification

### Check Audit Trail

```sql
-- Verify reconciliation_logs are created automatically
SELECT
  r.period_label,
  rl.action,
  rl.performed_at,
  u.full_name as performed_by,
  rl.metadata
FROM reconciliation_logs rl
INNER JOIN reconciliations r ON rl.reconciliation_id = r.id
LEFT JOIN users u ON rl.performed_by = u.id
ORDER BY rl.performed_at DESC
LIMIT 10;
```

**Expected:**
- [ ] Log entry created on reconciliation INSERT (action = 'created')
- [ ] Log entry created on status change (action = 'status_changed', 'confirmed', 'paid', 'cancelled')
- [ ] Metadata contains relevant info (old_status, new_status, etc.)

---

### Check Version Chain

```sql
-- Verify parent-child relationship
SELECT
  r1.id,
  r1.period_label,
  r1.version,
  r1.is_latest,
  r1.parent_reconciliation_id,
  r2.version as parent_version,
  r2.is_latest as parent_is_latest
FROM reconciliations r1
LEFT JOIN reconciliations r2 ON r1.parent_reconciliation_id = r2.id
WHERE r1.period_label = 'Tháng 11/2025'
ORDER BY r1.version;
```

**Expected:**
- [ ] Version increments correctly (1, 2, 3, ...)
- [ ] Parent's `is_latest` is false when child exists
- [ ] Only latest version has `is_latest = true`

---

## 📋 Documentation

- [x] Created `PHASE-2-SUMMARY.md`
- [x] Created `RECONCILIATION-API-GUIDE.md`
- [x] Created `RECONCILIATION-TESTING-CHECKLIST.md` (this file)
- [ ] Update main README.md with reconciliation module section

---

## 📋 Deployment Checklist

### Pre-Deployment
- [ ] All migrations run successfully on staging
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] API documentation reviewed
- [ ] Error handling tested

### Deployment
- [ ] Backup database before running migrations
- [ ] Run migrations on production database
- [ ] Verify migrations with verification queries
- [ ] Deploy backend code
- [ ] Smoke test API endpoints

### Post-Deployment
- [ ] Monitor error logs for 24 hours
- [ ] Verify first admin reconciliation creation
- [ ] Verify user can view reconciliations
- [ ] Check database triggers are working
- [ ] Monitor performance metrics

---

## 🎯 Summary

**Total Test Cases:** 15+
**Required Manual Tests:** 10+
**Database Verification Queries:** 5+

**Estimated Testing Time:** 2-3 hours

**Critical Tests:**
1. ✅ Status vs is_confirmed separation
2. ✅ Bulk insert performance
3. ✅ Trigger auto-updates
4. ✅ Version chain integrity
5. ✅ User access control

---

**Last Updated:** 2025-11-11
**Version:** 2.0.0
