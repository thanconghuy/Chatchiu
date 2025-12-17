# PHÂN TÍCH CHI TIẾT MODULE PAYMENT - CHATCHIU CASHBACK SYSTEM

**Report Generated**: 2025-12-16
**Agent ID**: f93c7967
**Status**: ✅ COMPREHENSIVE ANALYSIS COMPLETE

---

## I. EXECUTIVE SUMMARY

**Module Payment (Thanh toán)** là một phần core của hệ thống ChatChiu Cashback, cho phép users rút cashback đã được xác nhận thông qua payment requests. Hệ thống có kiến trúc phức tạp với 3 layer validation, encryption, và tích hợp sâu với reconciliation system.

### Key Metrics
- **Status Workflow**: `pending → confirmed → paid / rejected`
- **Minimum Amount**: 100,000 VND
- **Validation Layers**: 3 (Input → Database → Pre-linking)
- **Encryption**: AES-256-GCM for bank account data
- **Race Condition Protection**: Database-level `SELECT FOR UPDATE` locks

### Current State
✅ **Hoàn thiện**: Full lifecycle từ creation đến payment
✅ **Security**: Bank account encryption + audit trail
✅ **Integration**: System reconciliation + Email notifications
⚠️ **Needs Work**: Unify reconciliation systems, performance optimization

---

## II. PAYMENT REQUEST LIFECYCLE

```
┌─────────────────────────────────────────────────────────────┐
│                  PAYMENT REQUEST LIFECYCLE                   │
└─────────────────────────────────────────────────────────────┘

1. USER CREATION PHASE
   ├─ Check eligibility (balance ≥ 100K, no pending request)
   ├─ Create payment request
   │  ├─ VALIDATION LAYER 1: Basic input validation
   │  ├─ VALIDATION LAYER 2: Auto-select items + DB locks
   │  └─ VALIDATION LAYER 3: Pre-linking verification
   ├─ Items auto-selected using FIFO
   ├─ Bank account auto-saved (max 5 accounts)
   └─ Status: PENDING

2. ADMIN APPROVAL PHASE
   ├─ Admin views pending requests
   ├─ Admin chooses:
   │  ├─ CONFIRM → Status: CONFIRMED (email sent)
   │  ├─ REJECT → Status: REJECTED + reason (email sent)
   │  └─ Hold for later
   └─ Audit logged automatically

3. PAYMENT EXECUTION PHASE
   ├─ Admin marks as PAID
   ├─ Input: Transaction reference (required)
   ├─ Status: PAID
   ├─ Update system_conversions.payment_status = 'paid'
   └─ Email notification sent (celebration)

4. USER CANCELLATION (Only if Pending)
   ├─ User cancels pending request
   ├─ Soft delete (cancelled_at, cancelled_by)
   ├─ Items unlinked & become available again
   └─ User can resubmit later if still eligible
```

---

## III. MULTI-LAYER VALIDATION SYSTEM

### Layer 1: Application Level
```javascript
// In createPaymentRequest()
requestedAmount >= 100,000 VND ✓
bankName, bankAccountNumber, bankAccountName not empty ✓
bankAccountNumber length >= 6 characters ✓
All required fields present ✓
```

### Layer 2: Database Level (with Locking)
```sql
-- Uses PL/pgSQL function: validate_payment_request_creation()
- User has no pending request ✓
- Available balance >= requested amount ✓
- Minimum amount check ✓
- SELECT FOR UPDATE locks on system_reconciliation_items ✓
  (prevents concurrent selection of same items)
```

### Layer 3: Pre-linking Verification
```sql
-- Uses PL/pgSQL function: verify_items_still_available()
- Items still available (not already mapped) ✓
- Race condition protection ✓
- Double-check items not already paid ✓
- All verification passes → safe to link ✓
```

---

## IV. FIFO (First-In-First-Out) MECHANISM

```
Available Reconciliation Items (sorted by order_time ASC):
┌────────────────────────────────────────────────────────┐
│ Item 1 | Item 2 | Item 3 | Item 4 | Item 5           │
│ 50K    | 75K    | 100K   | 150K   | 200K              │
│ (OLD)  ────────────────────────────────────────> (NEW)│
└────────────────────────────────────────────────────────┘

User requests: 200K
┌────────────────────────────────────────────────────────┐
│ SELECTED FOR PAYMENT:                                  │
│ Item 1 (50K) + Item 2 (75K) + Item 3 (100K) = 225K   │
│ ✓ Sufficient (>= 200K requested)                      │
└────────────────────────────────────────────────────────┘

Implementation:
1. Query: ORDER BY order_time ASC (oldest first)
2. Running total: 0
3. Loop through items until total >= requested_amount
4. Stop and create mappings for selected items
```

---

## V. DATABASE SCHEMA

### Core Tables

#### 1. payment_requests
```sql
Fields:
- id (UUID, PK)
- user_id (UUID, FK → users)
- requested_amount (DECIMAL, >= 100000)

-- Bank Information (Encrypted)
- bank_name
- bank_account_number (masked: ***1234)
- bank_account_number_encrypted (AES-256-GCM)
- bank_account_number_hash (SHA-256)
- bank_account_name (masked)
- bank_account_name_encrypted
- bank_branch
- encryption_version (INTEGER, default 1)

-- Payment Account (saved account)
- payment_account_id (FK → payment_accounts)

-- Status & Workflow
- status (VARCHAR: pending/confirmed/paid/rejected)
- admin_id, admin_notes, transaction_reference

-- Timestamps
- created_at, confirmed_at, paid_at, rejected_at

-- Soft Delete (Cancellation)
- cancelled_at, cancelled_by, cancellation_reason
- resubmitted_at

-- Audit: Decryption Tracking
- last_decrypted_at, last_decrypted_by, decrypt_count

Indexes:
- user_id, status, created_at DESC
- admin_id, bank_account_number_hash
- last_decrypted_by
```

#### 2. payment_accounts
```sql
Fields:
- id (SERIAL, PK)
- user_id (UUID, FK → users)
- account_type (VARCHAR)
- account_holder_name (masked)
- account_number (masked)
- account_holder_name_encrypted
- account_number_encrypted
- account_number_hash
- bank_name, bank_branch
- is_default, is_verified
- last_decrypted_at, last_decrypted_by, decrypt_count

Constraints:
- User can save max 5 accounts
- One can be set as default
```

#### 3. payment_system_reconciliation_mapping
```sql
Purpose: Link payment requests to reconciliation items

Fields:
- id (UUID, PK)
- payment_request_id (FK → payment_requests, CASCADE)
- system_reconciliation_id (FK → system_reconciliations)
- system_reconciliation_item_id (FK → system_reconciliation_items)
- conversion_id (FK → conversions)
- user_id (denormalized for quick lookup)
- cashback_amount
- merchant_name (snapshot)
- order_time (snapshot)

UNIQUE Constraint:
- system_reconciliation_item_id (prevents double-paying items)

Indexes:
- payment_request_id, system_reconciliation_id
- system_reconciliation_item_id, conversion_id
- user_id, created_at DESC
```

#### 4. payment_validation_audit_log
```sql
Purpose: Track all validation attempts

Fields:
- id (UUID, PK)
- user_id, requested_amount
- validation_passed (BOOLEAN)
- error_code, error_message
- available_balance, selected_items_count, selected_items_total
- payment_request_id (if created)
- ip_address, user_agent
- created_at

Indexes:
- user_id, created_at DESC
- validation_passed, error_code
```

### Key Database Functions

```sql
-- Calculate available balance
calculate_user_available_balance_from_system_recon(p_user_id UUID)
→ Returns: DECIMAL(15,2)
→ Sum of unpaid finalized reconciliation items

-- Get available items
get_available_system_recon_items_for_user(p_user_id UUID)
→ Returns: Table of available items
→ Filters: finalized/paid reconciliations, not already paid

-- Get and lock items (race condition prevention)
get_and_lock_available_items_for_payment(p_user_id UUID, p_requested_amount DECIMAL)
→ Returns: Table of items (LOCKED)
→ Uses: SELECT ... FOR UPDATE OF sri SKIP LOCKED

-- Validate payment request
validate_payment_request_creation(p_user_id UUID, p_requested_amount DECIMAL)
→ Returns: is_valid, error_code, error_message
→ Checks: pending request, minimum amount, balance

-- Verify items availability (pre-linking check)
verify_items_still_available(p_item_ids UUID[])
→ Returns: all_available, unavailable_items[]
→ Double-checks before linking
```

### Views

```sql
-- v_payment_requests_with_items
Shows: payment requests + linked items count + total cashback + JSON aggregated items

-- v_user_available_balances
Shows: user balance breakdown (total confirmed, requested, available)
```

---

## VI. SERVICES & BUSINESS LOGIC

### PaymentRequestService
**File**: `backend/services/paymentRequestService.js`

#### Key Methods:

```javascript
1. checkEligibility(userId)
   → Returns: eligibility status + reasons if not eligible
   → Checks: balance, pending request, minimum amount

2. getAvailableItems(userId, requestedAmount)
   → Returns: FIFO selected items + summary
   → Process: Query items, run FIFO selection

3. createPaymentRequest(params) ⭐ CORE METHOD
   → 3-LAYER VALIDATION:
      Layer 1: Basic input validation
      Layer 2: Database validation + auto-select with locks
      Layer 3: Pre-linking verification
   → Auto-saves payment account (max 5)
   → Encrypts bank account data
   → Links payment to reconciliation items
   → Returns: created request with linked items

4. confirmPaymentRequest(paymentRequestId, adminInfo, adminNotes)
   → Updates: pending → confirmed
   → Sends: async email (confirmed)
   → Logs: action to audit

5. rejectPaymentRequest(paymentRequestId, adminInfo, rejectionReason)
   → Updates: pending/confirmed → rejected
   → Sends: async email (rejected + reason)
   → Logs: action to audit

6. markAsPaid(paymentRequestId, adminInfo, transactionReference, adminNotes)
   → Updates: confirmed → paid
   → Updates: system_conversions.payment_status = 'paid'
   → Sends: async email (celebration)
   → Logs: action to audit
```

### PaymentSystemReconciliationService
**File**: `backend/services/paymentSystemReconciliationService.js`

```javascript
Purpose: Reconciliation-specific logic for payments

Methods:
- getAvailableItemsForUser(userId)
- calculateAvailableBalance(userId)
- validatePaymentRequest(userId, requestedAmount, context)
- autoSelectItemsForPayment(userId, requestedAmount, useDbLocking)
- verifyItemsAvailability(itemIds)
- linkPaymentWithItems(paymentRequestId, selectedItems, userId)
- getLinkedItemsForPayment(paymentRequestId)
- logValidationAttempt(params)
```

---

## VII. SECURITY & ENCRYPTION

### Bank Account Encryption Strategy

**Method**: AES-256-GCM (Galois/Counter Mode)

**Stored Data Per Account**:
```
1. account_number (MASKED)
   → Display: ***1234 (only last 4 digits)
   → UI display only

2. account_number_encrypted
   → Full encrypted account number
   → AES-256-GCM encrypted
   → Can be decrypted with key

3. account_number_hash
   → SHA-256 hash of original
   → Duplicate detection
   → One-way (can't be reversed)

4. account_holder_name (MASKED)
   → Display: N* VAN A (first + last two)

5. account_holder_name_encrypted
   → Full encrypted name
   → AES-256-GCM encrypted
```

**When to Decrypt**:
- Admin views payment detail
- Admin marks as paid (needs verification)
- Payment history email

**Audit Trail**:
```sql
last_decrypted_at: TIMESTAMPTZ
last_decrypted_by: UUID (user ID)
decrypt_count: INTEGER (number of decryptions)
```

### Race Condition Prevention

**Problem**: Multiple concurrent requests selecting same items

**Solution**: Database-Level Locking
```sql
SELECT ... FROM system_reconciliation_items
FOR UPDATE OF sri SKIP LOCKED
```

**How it works**:
1. First request: Acquires exclusive locks on selected items
2. Second request: SKIP LOCKED skips locked items
3. Second request: Gets different items OR fails with insufficient balance
4. No double-payment possible ✓

**Lock Duration**: Only for transaction duration (a few seconds)

---

## VIII. EMAIL INTEGRATION

### Email Events

```javascript
1. sendPaymentConfirmedEmail(paymentRequest)
   Trigger: Admin confirms payment
   Template: PAYMENT_CONFIRMED
   Contains: amount, bank info, timestamp, admin notes
   Status: Async (non-blocking)

2. sendPaymentRejectedEmail(paymentRequest)
   Trigger: Admin rejects payment
   Template: PAYMENT_REJECTED
   Contains: amount, bank info, rejection reason
   Link: Create new request

3. sendPaymentPaidEmail(paymentRequest)
   Trigger: Admin marks as paid
   Template: PAYMENT_PAID
   Contains: amount, bank details, transaction ref, celebration
   Status: Async
```

### Non-Blocking Email Flow

```javascript
// In service methods
setImmediate(async () => {
  try {
    await sendPaymentConfirmedEmail(updated);
    logger.info('Email sent');
  } catch (emailError) {
    // Don't fail main request if email fails
    logger.error('Email failed', { error });
  }
});

// Return response immediately to user
// Email sends in background
```

---

## IX. API ENDPOINTS

### User Endpoints
```
GET    /api/payment-requests/eligibility
POST   /api/payment-requests (create)
GET    /api/payment-requests (list user's requests)
GET    /api/payment-requests/:id (detail)
DELETE /api/payment-requests/:id (cancel)
POST   /api/payment-requests/:id/resubmit
GET    /api/payment-requests/:id/items (linked items)
GET    /api/payment-requests/cancelled
```

### Admin Endpoints
```
GET   /api/payment-requests/admin/stats
GET   /api/payment-requests/admin/list (all requests with filters)
GET   /api/payment-requests/admin/:id (detail)
PATCH /api/payment-requests/admin/:id/confirm
PATCH /api/payment-requests/admin/:id/reject
PATCH /api/payment-requests/admin/:id/paid
GET   /api/payment-requests/admin/late-items
POST  /api/payment-requests/admin/reconciliation/:id/add-late-items
GET   /api/payment-requests/order/:conversionId/payment-status
```

---

## X. CURRENT STATE ASSESSMENT

### ✅ What's Implemented

- ✅ Complete payment request workflow (create → approve → pay)
- ✅ 3-layer validation system
- ✅ AES-256-GCM encryption for bank accounts
- ✅ Race condition prevention with DB locks
- ✅ FIFO item selection
- ✅ System reconciliation integration
- ✅ Email notifications (3 types)
- ✅ Payment account auto-save (max 5)
- ✅ Audit trail for all actions
- ✅ Soft delete (cancellation)
- ✅ Resubmission capability

### ⚠️ Known Issues & Limitations

**ISSUE 1: FIFO Order Changed**
```
OLD: ORDER BY confirmed_time DESC (newest first)
NEW: ORDER BY order_time ASC (oldest first - true FIFO)
Status: May need verification with business
Impact: Item selection order changed
```

**ISSUE 2: Dual Reconciliation Systems**
```
Two mapping tables exist:
- payment_reconciliation_mapping (old, manual)
- payment_system_reconciliation_mapping (new, auto-sync)

Impact: Confusion about which to use
Solution: Unify or clarify when to use which
```

**ISSUE 3: Balance Calculation Sources**
```
Multiple sources of truth:
- system_conversions.cashback_amount
- reconciliation_items.cashback_amount (legacy)
- system_reconciliation_items.cashback_amount (current)

Risk: Potential mismatch if out of sync
Solution: Implement consistency check
```

**ISSUE 4: Auto-Save Payment Account**
```
Issues:
- No duplicate check by exact bank + account combination
- Hard limit of 5 accounts
- Can create similar accounts if one digit off

Fix: Stricter duplicate detection, better validation
```

**ISSUE 5: Late Reconciliation Items**
```
Feature: Admin can add late items to reconciliation
Status: Implemented but needs UI refinement
Need: Separate dashboard tab for late items
```

### Performance Considerations

**Good**:
- ✓ All queries have indexes
- ✓ DB functions optimize complex logic
- ✓ Minimal transaction scopes
- ✓ Non-blocking email sending
- ✓ Pagination implemented

**Potential Bottlenecks**:
- ⚠️ Multiple joins in item selection
- ⚠️ Balance calculation queries multiple tables
- ⚠️ Validation functions run on every creation
- ⚠️ Encryption/decryption on every detail view

**Optimization Suggestions**:
1. Cache available balance (5 min per user)
2. Cache payment counts (1 min)
3. Pre-calculate FIFO items periodically
4. Use read replicas for validation queries
5. Batch email sending

---

## XI. IMPROVEMENT RECOMMENDATIONS

### Priority 1: Critical (1-2 weeks)

```
1. UNIFY RECONCILIATION SYSTEM
   - Decide: system_reconciliation_items OR reconciliation_items
   - Current: Both supported, causing confusion
   - Effort: 2-3 weeks
   - Risk: Medium (migration needed)

2. FIX FIFO ORDER CLARIFICATION
   - Clarify: Oldest or newest first?
   - Standardize implementation
   - Effort: 1 day
   - Risk: Low

3. PAYMENT ACCOUNT DUPLICATE DETECTION
   - Improve: Check account + holder name combo
   - Add: Better validation rules
   - Effort: 2-3 days
   - Risk: Low
```

### Priority 2: High (2-4 weeks)

```
1. RECONCILIATION CONSISTENCY CHECK
   - Create: Daily/weekly verification procedure
   - Check: payment_status in system_conversions matches requests
   - Alert: On mismatches
   - Effort: 3-5 days

2. LATE ITEMS MANAGEMENT UI
   - Create: Admin dashboard tab
   - Add: Bulk operations
   - Improve: Visibility
   - Effort: 1-2 weeks

3. PAYMENT ANALYTICS DASHBOARD
   - Graphs: Trends, KPIs
   - Metrics: Top payers, patterns, failure rates
   - Effort: 1-2 weeks

4. AUDIT LOG RETENTION POLICY
   - Archive: Old logs
   - Keep: Recent logs for quick access
   - Effort: 1 week
```

### Priority 3: Medium (1-2 months)

```
1. Batch payment operations
2. Payment export (CSV/Excel)
3. Webhook integration
4. Advanced filtering & search
```

### Priority 4: Low (2-3 months)

```
1. Payment schedules
2. Multi-currency support
3. Payment method diversity
4. Mobile app integration
```

---

## XII. DEVELOPMENT ROADMAP

### Phase 1: Current State ✅
- Basic workflow complete
- Encryption implemented
- Email notifications working
- System reconciliation integrated

### Phase 2: Stabilization (1-2 months)
```
Week 1-2: Fix FIFO, unify reconciliation
Week 3-4: Consistency checks, late items UI
Week 5-6: Batch operations, export feature
Week 7-8: Performance optimization, security audit
```

### Phase 3: Enhancement (2-3 months)
```
- Analytics dashboard
- Webhook integration
- API enhancements
- Mobile support
```

### Phase 4: Scale (3-6 months)
```
- Automatic payment integration
- Payment schedules
- Multi-currency
- International expansion
```

---

## XIII. CRITICAL FILES

### Models
```
backend/models/
  ├─ PaymentRequest.js
  ├─ PaymentRequestEncrypted.js
  └─ PaymentAccount.js
```

### Services
```
backend/services/
  ├─ paymentRequestService.js
  ├─ paymentSystemReconciliationService.js
  └─ emailHelpers/
     └─ paymentEmailHelper.js
```

### Routes
```
backend/routes/
  ├─ paymentRequest.js
  └─ paymentAccount.js
```

### Migrations
```
backend/migrations/
  ├─ 016_create_payment_system_reconciliation_mapping.sql
  ├─ 017_enhanced_payment_validation.sql
  ├─ 029_add_encryption_columns_to_payment_requests.sql
  └─ 032_add_encryption_to_payment_accounts.sql
```

### Frontend
```
frontend/
  ├─ admin/payment-requests.html
  ├─ user/payment-history.html
  └─ admin/js/payment-requests.js
```

---

## XIV. QUICK REFERENCE

### Common Queries
```sql
-- Get user balance
SELECT calculate_user_available_balance_from_system_recon('user-id');

-- Get available items
SELECT * FROM get_available_system_recon_items_for_user('user-id');

-- Validate payment
SELECT * FROM validate_payment_request_creation('user-id', 500000);

-- Get payment with items
SELECT * FROM v_payment_requests_with_items
WHERE payment_request_id = 'req-id';

-- Find late items
SELECT * FROM v_late_reconciliation_items
WHERE original_period = '2025-10';
```

### Common API Calls
```javascript
// Check eligibility
GET /api/payment-requests/eligibility

// Create payment
POST /api/payment-requests
{
  "requestedAmount": 500000,
  "bankName": "Vietcombank",
  "bankAccountNumber": "0123456789",
  "bankAccountName": "NGUYEN VAN A"
}

// Admin confirm
PATCH /api/payment-requests/admin/:id/confirm
{ "adminNotes": "Approved" }

// Admin mark paid
PATCH /api/payment-requests/admin/:id/paid
{ "transactionReference": "FT25121012345" }
```

---

## XV. CONCLUSION

### Summary
Module Payment là một hệ thống **well-architected, secure** với:
- ✅ Multi-layer validation
- ✅ Encryption & security
- ✅ Deep reconciliation integration
- ✅ Complete workflow lifecycle

### Remaining Work
- Unify reconciliation systems
- Performance optimization
- Enhanced admin UI
- GDPR/CCPA compliance

### Next Steps
1. Address Priority 1 critical items
2. Implement consistency checks
3. Optimize for scale
4. Plan Phase 2 enhancements

---

**For detailed implementation guidance, resume Agent ID**: f93c7967
