# Payment Request Module - Visual Workflows

## 🔄 1. Payment Request Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER JOURNEY                              │
└─────────────────────────────────────────────────────────────────┘

User Dashboard
    ↓
Check Available Balance
    ├─ Total Confirmed Cashback: ₫1,500,000
    ├─ Total Requested: ₫500,000
    └─ Available Balance: ₫1,000,000 ✓
    ↓
Is Balance ≥ ₫100,000?
    ├─ NO → Show message: "Số dư không đủ"
    └─ YES → Continue
    ↓
Has Pending Request?
    ├─ YES → Show message: "Bạn đang có yêu cầu chờ xử lý"
    └─ NO → Continue
    ↓
Create Payment Request Form
    ├─ Amount: ₫800,000
    ├─ Bank: Vietcombank
    ├─ Account Number: 0123456789
    ├─ Account Name: NGUYEN VAN A
    ├─ Branch: Hà Nội
    └─ Notes: "Thanh toán tháng 11"
    ↓
Submit Request
    ↓
System Creates:
    ├─ payment_requests record (status: 'pending')
    └─ payment_reconciliation_mapping records (FIFO)
    ↓
Status: PENDING ⏰
    ↓

┌─────────────────────────────────────────────────────────────────┐
│                       ADMIN PROCESSING                           │
└─────────────────────────────────────────────────────────────────┘

Admin Dashboard
    ↓
View Payment Requests
    ├─ Pending: 15 requests
    ├─ Filter by: Status, User, Date
    └─ Sort by: Created date DESC
    ↓
Select Request to Process
    ↓
View Request Details
    ├─ User: Nguyễn Văn A
    ├─ Amount: ₫800,000
    ├─ Bank: Vietcombank - 0123456789
    ├─ Reconciliation Items: 12 orders
    └─ Total from items: ₫800,000 ✓
    ↓
Admin Decision
    ├────────────────────┬────────────────────┐
    ↓                    ↓                    ↓
CONFIRM             REJECT              WAIT
    ↓                    ↓
Add notes (optional)  Add notes (required!)
    ↓                    ↓
Confirm               Reject Reason:
    ↓                 "Thông tin ngân hàng sai"
    ↓                    ↓
Status: CONFIRMED    Status: REJECTED ❌
    ↓                    ↓
Admin transfers      User receives
money via bank       notification
    ↓                    ↓
Enter transaction    Can create new
reference            request
    ↓
Mark as PAID
    ↓
Status: PAID ✅
    ↓
User receives
notification
```

---

## 💰 2. Available Balance Calculation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              AVAILABLE BALANCE CALCULATION                       │
└─────────────────────────────────────────────────────────────────┘

Step 1: Get Total Confirmed Cashback
    ↓
SELECT SUM(ri.cashback_amount)
FROM reconciliation_items ri
JOIN reconciliations r ON ri.reconciliation_id = r.id
WHERE ri.user_id = 'user-123'
  AND r.status = 'confirmed'
  AND r.is_latest = true
    ↓
Result: ₫2,500,000

Step 2: Get Total Requested Amount
    ↓
SELECT SUM(pr.requested_amount)
FROM payment_requests pr
WHERE pr.user_id = 'user-123'
  AND pr.status IN ('pending', 'confirmed', 'paid')
    ↓
Result: ₫1,200,000
    ├─ Pending: ₫500,000
    ├─ Confirmed: ₫300,000
    └─ Paid: ₫400,000

Step 3: Calculate Available Balance
    ↓
Available = Total Confirmed - Total Requested
         = ₫2,500,000 - ₫1,200,000
         = ₫1,300,000 ✓

Step 4: Check Eligibility
    ↓
Is Available ≥ ₫100,000?
    ├─ YES → Eligible ✓
    └─ NO → Not eligible ✗

Has Pending Request?
    ├─ YES → Cannot create new request
    └─ NO → Can create request ✓
```

---

## 🔍 3. Late Reconciliation Items Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│              LATE RECONCILIATION ITEMS FLOW                      │
└─────────────────────────────────────────────────────────────────┘

Scenario:
  - Reconciliation Period: Oct 1-31, 2025
  - Reconciliation Created: Nov 1, 2025
  - Order placed: Oct 25, 2025
  - Order confirmed by AT: Nov 5, 2025 (late!)

Timeline:
Oct 25      Nov 1           Nov 5         Nov 10
  |           |               |              |
Order      Create Rec     Order         Admin discovers
Placed     (Tháng 10)     Confirmed     late order
  ↓           ↓               ↓              ↓
  └───────────┴───────────────┴──────────────┘
        Order NOT in reconciliation!

Admin Action Flow:
    ↓
Admin Dashboard → Tab "Đơn hàng muộn"
    ↓
Query Late Items:
SELECT c.*
FROM conversions c
LEFT JOIN reconciliation_items ri ON c.id = ri.conversion_id
WHERE c.status = 'approved'
  AND c.is_confirmed = 1
  AND ri.id IS NULL  -- Not in any reconciliation
  AND c.order_time >= '2025-10-01'
  AND c.order_time < '2025-11-01'
  AND c.confirmed_time > '2025-11-01'
    ↓
Found: 5 orders, Total: ₫350,000
    ├─ Order OR12345: ₫50,000 (confirmed 15 days late)
    ├─ Order OR12346: ₫80,000 (confirmed 8 days late)
    ├─ Order OR12347: ₫100,000 (confirmed 20 days late)
    ├─ Order OR12348: ₫60,000 (confirmed 12 days late)
    └─ Order OR12349: ₫60,000 (confirmed 10 days late)
    ↓
Admin selects orders and chooses action:
    ├────────────────────────────┬─────────────────────────┐
    ↓                            ↓                         ↓
OPTION A:                   OPTION B:              DO NOTHING
Add to Existing Rec       Create Supplementary
    ↓                            ↓
Check Reconciliation       Create new reconciliation:
Status = 'confirmed'?       - Period: Oct 1-31, 2025
    ├─ YES → Add items      - Label: "Tháng 10/2025 - Bổ sung"
    └─ NO  → Error          - parent_reconciliation_id: rec-oct
    ↓                        - Status: 'draft'
POST /api/admin/            ↓
  reconciliation/           Add 5 late orders
  rec-oct/add-late-items    ↓
    ↓                       Confirm reconciliation
Update reconciliation       ↓
Total: ₫X + ₫350,000       User creates payment request
    ↓                       for ₫350,000
Log action
    ↓
User notified
```

---

## 📊 4. Order Payment Status Determination

```
┌─────────────────────────────────────────────────────────────────┐
│           ORDER PAYMENT STATUS LOGIC TREE                        │
└─────────────────────────────────────────────────────────────────┘

Given: reconciliation_item_id = 'ri-123'
    ↓
Query payment_reconciliation_mapping
    ↓
Is item in mapping?
    ├─ NO → Check reconciliation status
    │         ↓
    │     Reconciliation status = 'confirmed'?
    │         ├─ YES → Status: "Reconciled" 📋 (gray)
    │         │         "Đã đối soát - Chưa tạo yêu cầu thanh toán"
    │         └─ NO  → Status: "Not Reconciled" ⚪ (gray)
    │                   "Chưa đối soát"
    │
    └─ YES → Get payment_request
                ↓
            Payment request status?
                ├─ 'pending'
                │     ↓
                │  Status: "Payment Pending" ⏰ (orange)
                │  "Chờ duyệt thanh toán"
                │
                ├─ 'confirmed'
                │     ↓
                │  Status: "Payment Confirmed" ⏳ (blue)
                │  "Đang xử lý thanh toán"
                │
                ├─ 'paid'
                │     ↓
                │  Status: "Paid" ✅ (green)
                │  "Đã thanh toán"
                │  Display: Transaction ref, Paid date
                │
                └─ 'rejected'
                      ↓
                   Status: "Payment Rejected" ❌ (red)
                   "Yêu cầu thanh toán bị từ chối"
                   Display: Admin notes (reason)

Visual Status Icons:
┌────────────┬─────────────────────────────┬────────┐
│ Status     │ Label                       │ Color  │
├────────────┼─────────────────────────────┼────────┤
│ ✅ Paid    │ Đã thanh toán              │ Green  │
│ ⏳ Conf.   │ Đang xử lý thanh toán      │ Blue   │
│ ⏰ Pending │ Chờ duyệt thanh toán       │ Orange │
│ ❌ Reject  │ Yêu cầu bị từ chối         │ Red    │
│ 📋 Recon.  │ Đã đối soát - chưa tạo YC  │ Gray   │
│ ⚪ Not Rec │ Chưa đối soát              │ Gray   │
└────────────┴─────────────────────────────┴────────┘
```

---

## 🗂️ 5. FIFO Reconciliation Items Selection

```
┌─────────────────────────────────────────────────────────────────┐
│         FIFO SELECTION FOR PAYMENT REQUEST                       │
└─────────────────────────────────────────────────────────────────┘

User wants to request: ₫800,000

Step 1: Get all unpaid reconciliation items (FIFO order)
    ↓
SELECT ri.*
FROM reconciliation_items ri
JOIN reconciliations r ON ri.reconciliation_id = r.id
WHERE ri.user_id = 'user-123'
  AND r.status = 'confirmed'
  AND r.is_latest = true
  AND ri.id NOT IN (
    SELECT reconciliation_item_id
    FROM payment_reconciliation_mapping
  )
ORDER BY ri.confirmed_time ASC  -- FIFO: Oldest first
    ↓
Available items (sorted by date):
┌────────┬──────────────┬────────────┬────────────┐
│ Item   │ Order Date   │ Cashback   │ Running    │
├────────┼──────────────┼────────────┼────────────┤
│ ri-001 │ Oct 1, 2025  │ ₫100,000   │ ₫100,000   │
│ ri-002 │ Oct 3, 2025  │ ₫150,000   │ ₫250,000   │
│ ri-003 │ Oct 5, 2025  │ ₫200,000   │ ₫450,000   │ ← Need more
│ ri-004 │ Oct 7, 2025  │ ₫180,000   │ ₫630,000   │ ← Need more
│ ri-005 │ Oct 10, 2025 │ ₫250,000   │ ₫880,000   │ ← Enough! (₫800K)
│ ri-006 │ Oct 12, 2025 │ ₫120,000   │ (unused)   │
│ ri-007 │ Oct 15, 2025 │ ₫90,000    │ (unused)   │
└────────┴──────────────┴────────────┴────────────┘

Step 2: Select items until reaching requested amount
    ↓
Selected items:
  - ri-001: ₫100,000
  - ri-002: ₫150,000
  - ri-003: ₫200,000
  - ri-004: ₫180,000
  - ri-005: ₫170,000 (partial, only need ₫170K from ₫250K item)
    ↓
Total selected: ₫800,000 ✓

Step 3: Create mappings
    ↓
INSERT INTO payment_reconciliation_mapping (
  payment_request_id,
  reconciliation_id,
  reconciliation_item_id,
  cashback_amount
) VALUES
  ('pr-123', 'rec-oct', 'ri-001', 100000),
  ('pr-123', 'rec-oct', 'ri-002', 150000),
  ('pr-123', 'rec-oct', 'ri-003', 200000),
  ('pr-123', 'rec-oct', 'ri-004', 180000),
  ('pr-123', 'rec-oct', 'ri-005', 170000);  -- Partial!

Note: ri-005 still has ₫80,000 available for future requests
```

---

## 🔒 6. Data Integrity & Constraints

```
┌─────────────────────────────────────────────────────────────────┐
│              PREVENTING DOUBLE PAYMENT                           │
└─────────────────────────────────────────────────────────────────┘

Scenario: User tries to create 2 payment requests using same items

Request 1:
  - Amount: ₫500,000
  - Items: ri-001, ri-002, ri-003
  - Status: pending
    ↓
Database:
payment_reconciliation_mapping:
  - pr-001 → ri-001
  - pr-001 → ri-002
  - pr-001 → ri-003

Request 2 (should fail):
  - Amount: ₫300,000
  - Items should be: ri-001, ri-002  ← Same items!
    ↓
Query for available items:
SELECT ri.*
WHERE ri.id NOT IN (
  SELECT reconciliation_item_id
  FROM payment_reconciliation_mapping
)
    ↓
Result: ri-001, ri-002, ri-003 are EXCLUDED
    ↓
Use next available items: ri-004, ri-005
    ↓
✓ No double payment possible!

UNIQUE Constraint Protection:
  - reconciliation_item_id is UNIQUE in payment_reconciliation_mapping
  - Database prevents inserting same item_id twice
  - Error: "duplicate key value violates unique constraint"
```

---

## 📱 7. Mobile User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   MOBILE USER JOURNEY                            │
└─────────────────────────────────────────────────────────────────┘

[Dashboard Widget]
┌───────────────────────────────────┐
│ 💰 Số dư khả dụng                │
│                                   │
│        ₫1,250,000                │
│                                   │
│ ⏳ 1 yêu cầu đang chờ xử lý      │
│                                   │
│ [Xem chi tiết]  [Tạo yêu cầu]   │
└───────────────────────────────────┘
        ↓
[Payment Requests Page]
┌───────────────────────────────────┐
│  ← Payment Requests        🔍     │
├───────────────────────────────────┤
│ [Tất cả] [Chờ] [Đã duyệt] [Đã TT]│
├───────────────────────────────────┤
│ ┌─────────────────────────────┐  │
│ │ ⏰ Chờ duyệt   19/11 14:30  │  │
│ │ ₫500,000                    │  │
│ │ Vietcombank - 0123456789    │  │
│ │ [Xem] [Hủy]                 │  │
│ └─────────────────────────────┘  │
│                                   │
│ ┌─────────────────────────────┐  │
│ │ ✅ Đã TT      15/11 10:20   │  │
│ │ ₫750,000                    │  │
│ │ Mã GD: FT25111012345678     │  │
│ │ [Xem]                       │  │
│ └─────────────────────────────┘  │
└───────────────────────────────────┘
        ↓ Tap "Tạo yêu cầu"
[Bottom Sheet Form]
┌───────────────────────────────────┐
│ Tạo yêu cầu thanh toán     ✕     │
├───────────────────────────────────┤
│ Số tiền *                         │
│ ┌─────────────────────────────┐  │
│ │ 500,000                     │  │
│ └─────────────────────────────┘  │
│ Số dư: ₫1,250,000                │
│                                   │
│ Ngân hàng *                      │
│ ┌─────────────────────────────┐  │
│ │ Vietcombank            ▼    │  │
│ └─────────────────────────────┘  │
│                                   │
│ Số tài khoản *                   │
│ ┌─────────────────────────────┐  │
│ │ 0123456789                  │  │
│ └─────────────────────────────┘  │
│                                   │
│ [Hủy]              [Gửi yêu cầu] │
└───────────────────────────────────┘
```

---

## 🎯 8. Status Transition Diagram

```
                    ┌──────────────┐
                    │   PENDING    │
                    │   (Chờ duyệt) │
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌───────────┐    ┌──────────┐
    │ CONFIRMED│    │ REJECTED  │    │ CANCELLED│
    │(Đã duyệt)│    │(Từ chối)  │    │(User hủy)│
    └─────┬────┘    └───────────┘    └──────────┘
          │              (final)         (final)
          │
          ▼
    ┌──────────┐
    │   PAID   │
    │(Đã chuyển│
    │   tiền)  │
    └──────────┘
      (final)

Allowed Transitions:
✅ pending → confirmed (Admin confirms)
✅ pending → rejected (Admin rejects)
✅ pending → cancelled (User cancels within 5 min)
✅ confirmed → paid (Admin marks as transferred)

Forbidden Transitions:
❌ pending → paid (must go through confirmed)
❌ confirmed → rejected
❌ paid → any other status
❌ rejected → any other status
```

---

**End of Workflows Document** 📋
