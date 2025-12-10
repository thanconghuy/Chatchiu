# Phân Tích & Thiết Kế Auto-Sync Đơn Hàng Đã Duyệt

## 📊 Phân Tích Hiện Trạng

### 1. Cấu Trúc Database

#### Bảng `conversions` (Đơn hàng từ AccessTrade API)
```sql
conversions:
  - id (UUID)
  - user_id (UUID)
  - click_id (UUID)
  - accesstrade_id (VARCHAR) - ID từ AT API
  - merchant_id, merchant_name
  - order_code, order_amount
  - commission, cashback_amount
  - status (conversion_status_enum: 'pending', 'approved', 'rejected')
  - order_time (TIMESTAMP) - Thời gian đặt hàng
  - approval_time (TIMESTAMP) - Thời gian AT duyệt đơn ⭐
  - system_reconciliation_status (VARCHAR: NULL, 'pending', 'reconciled', 'paid')
  - system_reconciliation_id (UUID)
  - system_reconciled_at (TIMESTAMP)
```

#### Bảng `system_conversions` (Đơn hàng đã match với click)
```sql
system_conversions:
  - id (UUID)
  - at_conversion_id (UUID) → conversions.id
  - user_id, click_id
  - merchant_id, merchant_name
  - order_code, order_amount
  - commission, cashback_amount
  - status (conversion_status_enum)
  - order_time (TIMESTAMP)
  - approval_time (TIMESTAMP) ⭐
  - matched_at (TIMESTAMP)
  - system_reconciliation_status (VARCHAR)
  - system_reconciliation_id (UUID)
  - payment_status (VARCHAR: NULL, 'pending', 'confirmed', 'paid', 'rejected')
  - payment_request_id (UUID)
```

#### Bảng `system_reconciliations` (Kỳ đối soát)
```sql
system_reconciliations:
  - id (UUID)
  - period_label (VARCHAR) - "Tháng 10/2025"
  - period_start, period_end (DATE)
  - reconciliation_date (DATE) - period_end + 15 days
  - total_orders, total_users, total_cashback
  - approved_orders, pending_orders, rejected_orders
  - status ('draft', 'finalized', 'paid', 'cancelled')
  - created_at, finalized_at, paid_at
```

### 2. Quy Trình Hiện Tại

**Vấn đề:** Hiện tại đơn hàng chỉ được thêm vào đối soát khi:
- Admin thủ công tạo kỳ đối soát mới
- Chọn khoảng thời gian để lọc đơn hàng
- Hệ thống lọc theo `order_time` (thời gian đặt hàng)

**Hạn chế:**
- ❌ Không tự động theo dõi đơn hàng đã duyệt
- ❌ Không đảm bảo đơn được thêm sau approval_time + 15 ngày
- ❌ Có thể bỏ sót đơn duyệt muộn (đặt tháng 10 nhưng duyệt tháng 11)

---

## 🎯 Yêu Cầu Auto-Sync

### Điều Kiện Đủ Để Auto-Add

Đơn hàng sẽ được **tự động thêm** vào danh sách chờ đối soát khi:

1. ✅ **Trạng thái:** `status = 'approved'` trong bảng `conversions`
2. ✅ **Thời gian đủ điều kiện:** `approval_time + 15 ngày <= NOW()`
3. ✅ **Chưa đối soát:** `system_reconciliation_status IS NULL` hoặc `NOT IN ('reconciled', 'paid')`
4. ✅ **Có match với click:** Tồn tại trong `system_conversions` (có user_id)

### Quy Tắc Phân Kỳ

Đơn hàng sẽ được phân vào kỳ đối soát dựa trên:
- **Tháng approval_time** (không phải order_time)
- Ví dụ: Đơn duyệt ngày 15/11/2025 → Kỳ "Tháng 11/2025"

---

## 🔧 Giải Pháp Kỹ Thuật

### Phương Án 1: Cron Job Auto-Sync (Khuyến nghị ⭐)

#### Ưu điểm
- ✅ Tự động chạy hàng ngày, không cần can thiệp
- ✅ Đảm bảo không bỏ sót đơn hàng
- ✅ Có thể chạy vào lúc ít traffic (3AM)
- ✅ Dễ monitor và debug qua logs

#### Cơ Chế Hoạt Động

```javascript
// Cron job chạy hàng ngày lúc 3:00 AM
cron.schedule('0 3 * * *', async () => {
  console.log('[Auto-Sync] Starting daily auto-sync...');

  // 1. Tìm tất cả đơn hàng đủ điều kiện
  const eligibleOrders = await getEligibleOrdersForAutoSync();

  // 2. Nhóm theo tháng approval_time
  const ordersByMonth = groupOrdersByApprovalMonth(eligibleOrders);

  // 3. Với mỗi tháng
  for (const [month, orders] of Object.entries(ordersByMonth)) {
    // 3.1. Tìm/tạo kỳ đối soát cho tháng đó
    let reconciliation = await findOrCreateDraftReconciliation(month);

    // 3.2. Thêm đơn hàng vào kỳ đối soát
    await addOrdersToReconciliation(reconciliation.id, orders);
  }

  console.log('[Auto-Sync] Completed successfully');
});
```

#### Query Tìm Đơn Hàng Đủ Điều Kiện

```sql
-- Function: Get eligible orders for auto-sync
CREATE OR REPLACE FUNCTION get_eligible_orders_for_auto_sync()
RETURNS TABLE (
  conversion_id UUID,
  user_id UUID,
  merchant_id VARCHAR(50),
  merchant_name VARCHAR(255),
  order_code VARCHAR(255),
  order_amount DECIMAL(15,2),
  commission DECIMAL(15,2),
  cashback_amount DECIMAL(15,2),
  order_time TIMESTAMPTZ,
  approval_time TIMESTAMPTZ,
  approval_month DATE,  -- Tháng để phân kỳ
  days_since_approval INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id as conversion_id,
    c.user_id,
    c.merchant_id,
    COALESCE(c.merchant_name, 'Unknown') as merchant_name,
    COALESCE(c.order_code, 'N/A') as order_code,
    COALESCE(c.order_amount, 0) as order_amount,
    COALESCE(c.commission, 0) as commission,
    COALESCE(c.cashback_amount, 0) as cashback_amount,
    c.order_time,
    c.approval_time,

    -- Lấy ngày đầu tháng của approval_time để nhóm
    DATE_TRUNC('month', c.approval_time)::DATE as approval_month,

    -- Số ngày kể từ khi duyệt
    EXTRACT(DAY FROM (NOW() - c.approval_time))::INTEGER as days_since_approval

  FROM conversions c
  INNER JOIN system_conversions sc ON sc.at_conversion_id = c.id

  WHERE
    -- 1. Đơn đã được duyệt
    c.status = 'approved'

    -- 2. Đã đủ 15 ngày kể từ khi duyệt
    AND c.approval_time IS NOT NULL
    AND c.approval_time + INTERVAL '15 days' <= NOW()

    -- 3. Chưa được đối soát
    AND (c.system_reconciliation_status IS NULL
         OR c.system_reconciliation_status NOT IN ('reconciled', 'paid'))

    -- 4. Có match trong system_conversions (có user)
    AND sc.id IS NOT NULL

  ORDER BY c.approval_time ASC;
END;
$$ LANGUAGE plpgsql;
```

#### Auto-Create Draft Reconciliation

```sql
-- Function: Find or create draft reconciliation for month
CREATE OR REPLACE FUNCTION find_or_create_draft_reconciliation(
  p_approval_month DATE  -- Ngày đầu tháng (e.g., 2025-11-01)
)
RETURNS UUID AS $$
DECLARE
  v_reconciliation_id UUID;
  v_period_label VARCHAR(50);
  v_period_start DATE;
  v_period_end DATE;
  v_reconciliation_date DATE;
BEGIN
  -- Tính toán period
  v_period_start := DATE_TRUNC('month', p_approval_month)::DATE;
  v_period_end := (DATE_TRUNC('month', p_approval_month) + INTERVAL '1 month - 1 day')::DATE;
  v_reconciliation_date := v_period_end + INTERVAL '15 days';
  v_period_label := 'Tháng ' || EXTRACT(MONTH FROM p_approval_month) || '/' || EXTRACT(YEAR FROM p_approval_month);

  -- Tìm kỳ đối soát draft hiện có
  SELECT id INTO v_reconciliation_id
  FROM system_reconciliations
  WHERE period_start = v_period_start
    AND period_end = v_period_end
    AND status = 'draft'
  LIMIT 1;

  -- Nếu chưa có, tạo mới
  IF v_reconciliation_id IS NULL THEN
    INSERT INTO system_reconciliations (
      period_label,
      period_start,
      period_end,
      reconciliation_date,
      status,
      created_at
    ) VALUES (
      v_period_label,
      v_period_start,
      v_period_end,
      v_reconciliation_date,
      'draft',
      NOW()
    )
    RETURNING id INTO v_reconciliation_id;

    RAISE NOTICE 'Created new draft reconciliation % for period %', v_reconciliation_id, v_period_label;
  END IF;

  RETURN v_reconciliation_id;
END;
$$ LANGUAGE plpgsql;
```

---

### Phương Án 2: Webhook Trigger (Thời gian thực)

#### Ưu điểm
- ✅ Ngay lập tức khi đơn đủ điều kiện
- ✅ Không cần đợi đến 3AM

#### Nhược điểm
- ❌ Phức tạp hơn để implement
- ❌ Cần scheduler để check approval_time + 15 days
- ❌ Tốn tài nguyên hơn (check liên tục)

---

### Phương Án 3: Manual Trigger + Button (Đơn giản)

#### Thiết kế UI

Thêm tab "Auto-Sync" vào trang System Reconciliation:

```
┌─────────────────────────────────────────────────┐
│  [Danh Sách Kỳ]  [Auto-Sync]  [Thống Kê]       │
└─────────────────────────────────────────────────┘

Auto-Sync Đơn Hàng Đã Duyệt
────────────────────────────────────────────────

📊 Tổng Quan
  • Đơn chờ đối soát: 125 đơn
  • Tổng cashback: 15,450,000 VNĐ
  • Kỳ sẽ tạo: 2 kỳ (Tháng 10/2025, Tháng 11/2025)

┌─────────────────────────────────────────────────┐
│ Tháng 10/2025                                   │
│ • 45 đơn hàng                                   │
│ • Tổng cashback: 5,230,000 VNĐ                 │
│ • Đủ điều kiện từ: 01/11/2025                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Tháng 11/2025                                   │
│ • 80 đơn hàng                                   │
│ • Tổng cashback: 10,220,000 VNĐ                │
│ • Đủ điều kiện từ: 01/12/2025                  │
└─────────────────────────────────────────────────┘

[🔄 Chạy Auto-Sync]  [📋 Xem Chi Tiết]
```

#### Ưu điểm
- ✅ Đơn giản nhất để implement
- ✅ Admin có control hoàn toàn
- ✅ Dễ test và verify

#### Nhược điểm
- ❌ Cần admin trigger thủ công
- ❌ Có thể quên không chạy

---

## 🏆 Khuyến Nghị Giải Pháp Tối Ưu

### Phase 1: Manual Trigger (Ngay lập tức)
1. Tạo tab "Auto-Sync" trong admin panel
2. API endpoint `POST /api/admin/system-reconciliation/auto-sync`
3. Hiển thị preview trước khi sync
4. Button trigger thủ công

**Lý do:** Dễ implement, dễ test, admin có control

### Phase 2: Cron Job (Sau 1-2 tuần)
1. Thêm cron job chạy hàng ngày lúc 3AM
2. Gửi notification email cho admin khi sync xong
3. Log chi tiết vào `system_reconciliation_logs`

**Lý do:** Tự động hóa hoàn toàn, giảm workload

---

## 📝 Cấu Trúc API Đề Xuất

### 1. Preview Eligible Orders

```javascript
GET /api/admin/system-reconciliation/auto-sync/preview

Response:
{
  "success": true,
  "data": {
    "totalOrders": 125,
    "totalCashback": 15450000,
    "periods": [
      {
        "month": "2025-10-01",
        "label": "Tháng 10/2025",
        "orderCount": 45,
        "totalCashback": 5230000,
        "eligibleSince": "2025-11-01",
        "existingReconciliation": {
          "id": "uuid",
          "status": "draft"
        }
      },
      {
        "month": "2025-11-01",
        "label": "Tháng 11/2025",
        "orderCount": 80,
        "totalCashback": 10220000,
        "eligibleSince": "2025-12-01",
        "existingReconciliation": null
      }
    ],
    "orders": [
      {
        "conversionId": "uuid",
        "userId": "uuid",
        "userName": "Nguyen Van A",
        "merchantName": "Shopee",
        "orderCode": "SP12345",
        "cashbackAmount": 125000,
        "approvalTime": "2025-10-15T10:30:00Z",
        "daysSinceApproval": 22,
        "approvalMonth": "2025-10-01"
      }
    ]
  }
}
```

### 2. Execute Auto-Sync

```javascript
POST /api/admin/system-reconciliation/auto-sync
Body: {
  "dryRun": false,  // true = preview only
  "months": ["2025-10-01", "2025-11-01"]  // Optional: filter months
}

Response:
{
  "success": true,
  "data": {
    "periodsCreated": 1,
    "periodsUpdated": 1,
    "ordersAdded": 125,
    "results": [
      {
        "month": "2025-10-01",
        "reconciliationId": "uuid",
        "action": "updated",  // "created" | "updated"
        "ordersAdded": 45,
        "totalCashback": 5230000
      }
    ]
  }
}
```

### 3. Auto-Sync History

```javascript
GET /api/admin/system-reconciliation/auto-sync/history

Response:
{
  "success": true,
  "data": {
    "history": [
      {
        "id": "uuid",
        "executedAt": "2025-12-06T03:00:00Z",
        "executedBy": "cron" | "admin-user-id",
        "ordersAdded": 125,
        "periodsAffected": 2,
        "duration": 1523,  // ms
        "status": "success",
        "errors": null
      }
    ]
  }
}
```

---

## 🗄️ Migration Script

```sql
-- Create auto_sync_history table
CREATE TABLE IF NOT EXISTS system_reconciliation_auto_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_by UUID REFERENCES users(id),  -- NULL if cron
  trigger_type VARCHAR(20) NOT NULL,  -- 'manual' | 'cron'

  orders_added INTEGER DEFAULT 0,
  periods_created INTEGER DEFAULT 0,
  periods_updated INTEGER DEFAULT 0,
  total_cashback DECIMAL(15,2) DEFAULT 0,

  duration_ms INTEGER,  -- Execution time
  status VARCHAR(20) NOT NULL,  -- 'success' | 'failed'
  error_message TEXT,

  metadata JSONB,  -- Details about affected periods

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_auto_sync_history_executed_at ON system_reconciliation_auto_sync_history(executed_at DESC);
CREATE INDEX idx_auto_sync_history_status ON system_reconciliation_auto_sync_history(status);
```

---

## 📊 Metrics & Monitoring

### Log Events
1. `auto_sync_started` - Bắt đầu auto-sync
2. `eligible_orders_found` - Tìm thấy X đơn hàng
3. `reconciliation_created` - Tạo kỳ đối soát mới
4. `reconciliation_updated` - Cập nhật kỳ đối soát hiện có
5. `orders_added` - Thêm đơn hàng vào kỳ
6. `auto_sync_completed` - Hoàn thành
7. `auto_sync_failed` - Lỗi

### Dashboard Metrics
- Total auto-synced orders today
- Success rate (%)
- Average execution time
- Orders pending sync
- Next auto-sync schedule

---

## ✅ Implementation Checklist

### Backend
- [ ] Database migration - create auto_sync_history table
- [ ] SQL function: `get_eligible_orders_for_auto_sync()`
- [ ] SQL function: `find_or_create_draft_reconciliation(month)`
- [ ] Service: `autoSyncService.js`
- [ ] API: GET `/auto-sync/preview`
- [ ] API: POST `/auto-sync/execute`
- [ ] API: GET `/auto-sync/history`
- [ ] Cron job: Daily auto-sync scheduler
- [ ] Logging & error handling
- [ ] Unit tests

### Frontend
- [ ] New tab "Auto-Sync" in system-reconciliation.html
- [ ] Preview UI - show eligible orders by month
- [ ] Execute button with confirmation dialog
- [ ] Progress indicator
- [ ] Success/error notifications
- [ ] Auto-sync history table
- [ ] Filter by month

### Testing
- [ ] Test với đơn hàng đủ 15 ngày
- [ ] Test với đơn hàng chưa đủ 15 ngày
- [ ] Test với đơn đã đối soát
- [ ] Test create new reconciliation
- [ ] Test update existing draft reconciliation
- [ ] Test cron job execution
- [ ] Load test với 1000+ orders

---

## 🎯 Kết Luận

**Giải pháp đề xuất:**
1. **Phase 1 (Tuần 1):** Manual trigger với UI preview - Admin có control hoàn toàn
2. **Phase 2 (Tuần 2-3):** Cron job tự động - Chạy hàng ngày lúc 3AM

**Lợi ích:**
- ✅ Không bỏ sót đơn hàng đã duyệt
- ✅ Đảm bảo quy tắc 15 ngày
- ✅ Phân kỳ đúng theo tháng duyệt đơn
- ✅ Giảm workload thủ công cho admin
- ✅ Có audit trail đầy đủ
- ✅ Dễ monitor và debug

**Rủi ro cần lưu ý:**
- ⚠️ Cần test kỹ logic phân kỳ theo approval_time
- ⚠️ Cần handle edge case: đơn duyệt vào cuối tháng
- ⚠️ Cần notification khi có lỗi trong cron job
