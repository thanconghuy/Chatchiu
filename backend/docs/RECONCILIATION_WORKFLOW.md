# System Reconciliation Workflow

## Tổng Quan

Hệ thống đối soát nội bộ cho phép thanh toán cashback nhanh hơn (Tháng + 15 ngày) so với đối soát API (65-105 ngày).

## Cấu Trúc Database

```
┌─────────────────────────┐
│    system_conversions   │  ← Đơn hàng từ Cashback System
│  (source of truth)      │
├─────────────────────────┤
│ id (UUID)               │
│ user_id                 │
│ status: approved/pending│
│ cashback_amount         │
│ approval_time           │
│ system_reconciliation_id│  ← Link to reconciliation (SET khi finalize)
│ system_reconciliation_  │
│   status: reconciled    │  ← SET khi finalize
│ payment_status: paid    │  ← SET khi thanh toán
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐
│ reconciliation_waiting_ │  ← Danh sách chờ đối soát
│        list             │
├─────────────────────────┤
│ id                      │
│ system_conversion_id    │  ← Link to system_conversions
│ user_id                 │
│ approval_month          │
│ status: waiting         │
└─────────────────────────┘
           │
           ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│ system_reconciliation_  │────▶│  system_reconciliations │
│        items            │     │    (metadata kỳ đối     │
├─────────────────────────┤     │         soát)           │
│ id                      │     ├─────────────────────────┤
│ system_reconciliation_id│     │ id                      │
│ system_conversion_id    │     │ period_label            │
│ user_id                 │     │ status: draft/finalized │
│ cashback_amount         │     │ total_cashback          │
└─────────────────────────┘     └─────────────────────────┘
```

## Workflow Chi Tiết

### Phase 1: Thu Thập Đơn Hàng

```
[Đơn hàng mới] → [system_conversions]
                      │
                      ▼
              status = 'approved'
              approval_time = NOW()
```

**Điều kiện đủ điều kiện đối soát:**
- `status = 'approved'`
- `approval_time + 15 days <= NOW()`
- `system_reconciliation_id IS NULL`
- `NOT EXISTS in system_reconciliation_items`
- `payment_status != 'paid'`

### Phase 2: Auto-Sync (Tự động)

```
[Cron Job / Manual Trigger]
         │
         ▼
┌─────────────────────────────────────┐
│ get_eligible_conversions_for_       │
│         waiting_list()              │
│                                     │
│ Filters:                            │
│ - approved                          │
│ - approval_time + 15 days <= NOW()  │
│ - NOT in waiting_list               │
│ - NOT in system_reconciliation_items│
│ - system_reconciliation_id IS NULL  │
│ - payment_status != 'paid'          │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ add_eligible_conversions_to_        │
│         waiting_list()              │
│                                     │
│ → INSERT into reconciliation_       │
│   waiting_list                      │
└─────────────────────────────────────┘
```

### Phase 3: Tạo Kỳ Đối Soát (Admin)

```
[Admin chọn orders từ waiting list]
         │
         ▼
┌─────────────────────────────────────┐
│ SystemReconciliationService.        │
│     createReconciliation()          │
│                                     │
│ 1. Validate orders chưa reconciled  │
│ 2. CREATE system_reconciliations    │
│    (status = 'draft')               │
│ 3. INSERT system_reconciliation_    │
│    items                            │
│ 4. UPDATE system_conversions        │
│    SET system_reconciliation_id = X │
│ 5. DELETE from waiting_list         │
└─────────────────────────────────────┘
         │
         ▼
[Kỳ đối soát status = 'draft']
```

### Phase 4: Finalize Kỳ Đối Soát (Admin)

```
[Admin click Finalize]
         │
         ▼
┌─────────────────────────────────────┐
│ SystemReconciliationService.        │
│     finalizeReconciliation()        │
│                                     │
│ 1. UPDATE system_reconciliations    │
│    SET status = 'finalized'         │
│                                     │
│ 2. UPDATE system_conversions        │
│    SET system_reconciliation_status │
│        = 'reconciled'               │
│                                     │
│ 3. UPDATE user_system_balance       │
│    - Recalculate total_earned       │
│    - Update last_reconciliation_date│
└─────────────────────────────────────┘
         │
         ▼
[User có thể rút tiền]
```

### Phase 5: Thanh Toán (Admin)

```
[User tạo payment request]
         │
         ▼
┌─────────────────────────────────────┐
│ PaymentRequestService.              │
│     createPaymentRequest()          │
│                                     │
│ Validate:                           │
│ - availableBalance >= requestAmount │
│ - availableBalance = SUM(cashback)  │
│   WHERE reconciled AND unpaid       │
│   - total_withdrawn                 │
│   - pending_reserved                │
└─────────────────────────────────────┘
         │
         ▼
[Admin confirm → pending_reserved += amount]
         │
         ▼
[Admin mark as paid]
         │
         ▼
┌─────────────────────────────────────┐
│ UPDATE system_conversions           │
│ SET payment_status = 'paid'         │
│ (FIFO - oldest first)               │
│                                     │
│ UPDATE user_system_balance          │
│ SET total_withdrawn += amount       │
│     pending_reserved -= amount      │
└─────────────────────────────────────┘
```

## Công Thức Tính Số Dư

```sql
-- Số dư khả dụng (có thể rút)
available_balance =
    SUM(cashback_amount) WHERE reconciled AND unpaid
  - total_withdrawn
  - pending_reserved

-- Tổng cashback (hiển thị)
total_earned = SUM(cashback_amount) WHERE approved
```

## Data Integrity Rules

| Rule | Mô tả |
|------|-------|
| 1 | Mỗi conversion chỉ có thể thuộc 1 reconciliation |
| 2 | Khi tạo reconciliation → SET `system_reconciliation_id` |
| 3 | Khi finalize → SET `system_reconciliation_status = 'reconciled'` |
| 4 | Khi thanh toán → SET `payment_status = 'paid'` |
| 5 | `system_reconciliation_items` là mapping table |
| 6 | Source of truth: `system_conversions` fields |

## Trạng Thái Đơn Hàng

```
┌──────────┐    ┌───────────┐    ┌────────────┐    ┌──────┐
│ approved │ → │ in_recon  │ → │ reconciled │ → │ paid │
│ (chờ)    │    │ (draft)   │    │ (finalized)│    │      │
└──────────┘    └───────────┘    └────────────┘    └──────┘

system_reconciliation_id:  NULL    SET           SET         SET
system_reconciliation_    NULL    NULL          reconciled  reconciled
  status:
payment_status:           NULL    NULL          NULL        paid
```

## API Endpoints

| Endpoint | Mô tả |
|----------|-------|
| `GET /auto-sync/preview` | Xem orders đủ điều kiện |
| `POST /auto-sync/add-to-waiting` | Thêm vào waiting list |
| `GET /auto-sync/waiting-list` | Xem waiting list |
| `POST /auto-sync/create-from-waiting` | Tạo kỳ đối soát |
| `POST /create` | Tạo kỳ đối soát (manual) |
| `POST /:id/finalize` | Finalize kỳ đối soát |
| `GET /preview` | Preview orders cho manual selection |
