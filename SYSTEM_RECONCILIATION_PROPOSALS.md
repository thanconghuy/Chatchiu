# 📋 ĐỀ XUẤT CẢI TIẾN HỆ THỐNG ĐỐI SOÁT NỘI BỘ

## 🎯 Tổng Quan

Tài liệu này phân tích và đề xuất hai cải tiến chính cho hệ thống đối soát nội bộ:

1. **Thêm trường trạng thái đối soát** vào bảng `conversions`
2. **Loại bỏ cơ chế số dư dự trữ** (Reserved Balance)

---

## 📊 ĐỀ XUẤT 1: THÊM TRƯỜNG TRẠNG THÁI ĐỐI SOÁT

### 🔍 Vấn Đề Hiện Tại

Hiện tại, không có cách nào trực tiếp để biết:
- Đơn hàng nào đã được đưa vào kỳ đối soát nội bộ
- Đơn hàng nào đã được xác nhận với AccessTrade API
- Đơn hàng nào bị reject sau khi đã đối soát

### ✅ Giải Pháp Đề Xuất

Thêm cột `system_reconciliation_status` vào bảng `conversions`:

```sql
-- Migration Script
ALTER TABLE conversions
ADD COLUMN system_reconciliation_status VARCHAR(50) DEFAULT NULL,
ADD COLUMN system_reconciliation_id INTEGER REFERENCES system_reconciliations(id),
ADD COLUMN system_reconciled_at TIMESTAMP;

-- Create index for performance
CREATE INDEX idx_conversions_system_recon_status
ON conversions(system_reconciliation_status);
```

### 📋 Các Trạng Thái Đề Xuất

| Trạng Thái | Giá Trị | Ý Nghĩa | Khi Nào Được Set |
|------------|---------|---------|------------------|
| **Chưa đối soát** | `NULL` | Đơn hàng chưa được đưa vào kỳ đối soát nào | Mặc định |
| **Đã đối soát nội bộ** | `'reconciled'` | Đã được admin hoàn tất kỳ đối soát | Khi click "Hoàn Tất" |
| **Đã xác nhận API** | `'api_confirmed'` | AccessTrade API xác nhận đơn hàng vẫn approved | Khi API Sync thành công |
| **API bị reject** | `'api_rejected'` | AccessTrade API báo đơn hàng bị từ chối | Khi API Sync phát hiện reject |

### 🔄 Luồng Cập Nhật Trạng Thái

```
NULL (Đơn hàng mới approved)
  ↓
  [Admin tạo kỳ đối soát & Hoàn tất]
  ↓
'reconciled' (User nhận tiền vào số dư)
  ↓
  [API Sync Job chạy]
  ↓
'api_confirmed' ✅  OR  'api_rejected' ❌
```

### 💾 Cập Nhật Code

#### **File: SystemReconciliationService.js**

```javascript
// Trong hàm finalizeReconciliation(), sau khi cập nhật user balance
// Thêm query update status của conversions

const updateConversionsStatusQuery = `
  UPDATE conversions c
  SET
    system_reconciliation_status = 'reconciled',
    system_reconciliation_id = $1,
    system_reconciled_at = NOW()
  FROM system_reconciliation_items sri
  WHERE c.id = sri.conversion_id
    AND sri.system_reconciliation_id = $1
`;

await client.query(updateConversionsStatusQuery, [reconciliationId]);
```

#### **File: APISyncJob.js**

```javascript
// Khi API confirm đơn hàng vẫn approved
await client.query(`
  UPDATE conversions
  SET system_reconciliation_status = 'api_confirmed'
  WHERE id = $1
`, [conversionId]);

// Khi API báo đơn hàng bị reject
await client.query(`
  UPDATE conversions
  SET system_reconciliation_status = 'api_rejected'
  WHERE id = $1
`, [conversionId]);
```

### 🎁 Lợi Ích

✅ **Dễ tracking**: Biết chính xác đơn hàng nào ở trạng thái nào
✅ **Query nhanh hơn**: Không cần JOIN nhiều bảng
✅ **Báo cáo tốt hơn**: Admin có thể filter theo trạng thái
✅ **Tích hợp API sync dễ dàng**: Biết đơn nào cần sync
✅ **Audit trail**: Có timestamp khi đối soát

---

## 💰 ĐỀ XUẤT 2: LOẠI BỎ Cơ CHẾ SỐ DƯ DỰ TRỮ

### 🔍 Cơ Chế Hiện Tại

**Hiện tại:**
```
Tổng Cashback = 3,921₫
├─ Số Dư Khả Dụng = 3,417₫ (87%) → User rút được
└─ Số Dư Dự Trữ = 504₫ (13%)   → Giữ lại phòng risk
```

**Lý do có Reserved Balance:**
- Đối soát nội bộ trả nhanh (Tháng + 15 ngày)
- AccessTrade API chính thức mất 65-105 ngày
- Một số đơn hàng có thể bị reject sau khi đã duyệt
- Hệ thống tính risk score → giữ lại % để phòng ngừa

### ⚠️ Vấn Đề Của Cơ Chế Này

❌ **Phức tạp cho user**: "Tại sao tôi không rút hết số tiền?"
❌ **Phức tạp cho code**: Cần tính risk score, approval rate
❌ **Trải nghiệm kém**: User cảm giác bị giữ tiền
❌ **Admin khó giải thích**: Cần đào tạo team support

### ✅ Đề Xuất: BỎ HOÀN TOÀN Reserved Balance

#### **Phương Án A: Trả 100% Ngay Lập Tức**

```
Tổng Cashback = 3,921₫
└─ Số Dư Khả Dụng = 3,921₫ (100%) → User rút ngay
```

**Ưu điểm:**
- ✅ Đơn giản nhất
- ✅ User hài lòng nhất
- ✅ Code đơn giản hơn
- ✅ Không cần tính risk score

**Nhược điểm:**
- ❌ Nếu đơn hàng bị reject sau → Hệ thống mất tiền
- ❌ Cần có cơ chế thu hồi nợ (user âm số dư)

**Phù hợp khi:**
- Tỷ lệ reject thấp (< 5%)
- Có chính sách xử lý nợ rõ ràng
- Ưu tiên trải nghiệm user

#### **Phương Án B: Trả Theo Tỷ Lệ Approval Lịch Sử**

```
Giả sử approval rate lịch sử = 95%

Tổng Cashback = 3,921₫
├─ Trả ngay = 3,725₫ (95%)
└─ Giữ lại = 196₫ (5%) → Trả sau khi API confirm
```

**Ưu điểm:**
- ✅ Cân bằng giữa user experience và risk
- ✅ User vẫn nhận được phần lớn tiền ngay
- ✅ Hệ thống có buffer phòng ngừa

**Nhược điểm:**
- ❌ Vẫn phức tạp hơn Phương Án A
- ❌ Vẫn cần giải thích tại sao giữ 5%

**Phù hợp khi:**
- Tỷ lệ reject ở mức trung bình (5-15%)
- Muốn balance giữa risk và UX

#### **Phương Án C: Phân Loại Theo Merchant**

```
Merchant A (approval rate 98%) → Trả 100%
Merchant B (approval rate 85%) → Trả 90%, giữ 10%
Merchant C (approval rate 70%) → Trả 80%, giữ 20%
```

**Ưu điểm:**
- ✅ Chính xác nhất
- ✅ Công bằng cho user mua hàng từ merchant tốt
- ✅ Risk management tốt

**Nhược điểm:**
- ❌ Phức tạp nhất
- ❌ Cần data lịch sử từng merchant
- ❌ User khó hiểu tại sao cùng 1 đơn hàng lại khác %

**Phù hợp khi:**
- Có data đầy đủ về merchant
- Có resource để maintain logic phức tạp

---

## 🎯 KHUYẾN NGHỊ: PHƯƠNG ÁN A - TRẢ 100%

### Tại Sao?

1. **Đơn giản nhất** cho cả user và developer
2. **Trải nghiệm tốt nhất** cho user
3. **Dễ giải thích**: "Đơn hàng đã duyệt = Nhận tiền ngay"
4. **Code đơn giản hơn nhiều**

### Xử Lý Trường Hợp Đơn Hàng Bị Reject Sau

#### Kịch Bản:
1. User có đơn hàng 1,000,000₫ → Cashback 50,000₫
2. Admin hoàn tất đối soát → User nhận 50,000₫
3. User rút 50,000₫ về bank
4. Sau 2 tháng, API Sync báo đơn hàng bị reject

#### Giải Pháp:

**Bước 1: Ghi nhận nợ**
```sql
-- Trừ vào available_balance (cho phép âm)
UPDATE user_system_balance
SET available_balance = available_balance - 50000,
    debt_balance = debt_balance + 50000
WHERE user_id = 123;

-- Ghi log
INSERT INTO user_balance_transactions (
  user_id, transaction_type, amount, description
) VALUES (
  123, 'chargeback', -50000, 'Đơn hàng #XYZ bị reject sau đối soát'
);
```

**Bước 2: Thông báo cho user**
```
📧 Email/Notification:
"Đơn hàng #XYZ đã bị merchant từ chối.
Số tiền 50,000₫ đã được trừ vào số dư của bạn.
Vui lòng nạp tiền để thanh toán khoản nợ này."
```

**Bước 3: Chặn rút tiền nếu có nợ**
```javascript
// Trong withdrawal logic
if (user.debt_balance > 0) {
  throw new Error('Bạn có khoản nợ chưa thanh toán. Vui lòng nạp tiền trước khi rút.');
}
```

**Bước 4: Offset với cashback mới**
```javascript
// Khi có cashback mới
const newCashback = 30000;
const currentDebt = user.debt_balance; // 50000

if (currentDebt > 0) {
  const offset = Math.min(newCashback, currentDebt);
  // Trừ nợ 30,000
  // Còn nợ 20,000
  // Available = 0
}
```

### Database Schema Cập Nhật

```sql
-- Thêm cột debt_balance
ALTER TABLE user_system_balance
ADD COLUMN debt_balance NUMERIC(12,2) DEFAULT 0;

-- Constraint: Không cho rút tiền khi có nợ
ALTER TABLE withdrawal_requests
ADD CONSTRAINT chk_no_debt
CHECK (
  NOT EXISTS (
    SELECT 1 FROM user_system_balance
    WHERE user_id = withdrawal_requests.user_id
      AND debt_balance > 0
  )
);
```

---

## 🔄 WORKFLOW MỚI ĐỀ XUẤT

### So Sánh Workflow

| Bước | Workflow Cũ (Có Reserved) | Workflow Mới (Không Reserved) |
|------|---------------------------|-------------------------------|
| **1. Admin tạo kỳ đối soát** | Chọn đơn hàng đã duyệt | Chọn đơn hàng đã duyệt |
| **2. Admin hoàn tất** | Tính risk score<br>Chia available/reserved<br>Cập nhật balance | ✅ **Đơn giản hơn:**<br>Cập nhật 100% vào available<br>Set status = 'reconciled' |
| **3. User xem dashboard** | "Available: 3,417₫"<br>"Reserved: 504₫"<br>😕 Confused | "Available: 3,921₫"<br>😊 Happy |
| **4. User rút tiền** | Chỉ rút được 3,417₫ | Rút được toàn bộ 3,921₫ |
| **5. API Sync (sau 2-3 tháng)** | Nếu OK: Giải phóng reserved → available<br>Nếu reject: Trừ reserved | Nếu OK: Không làm gì<br>Nếu reject: Tạo debt, thông báo user |
| **6. User nhận tiền còn lại** | Sau 2-3 tháng mới được rút 504₫ | ✅ Đã rút hết từ đầu |

### Workflow Mới Chi Tiết

```
┌─────────────────────────────────────────────────────────┐
│ BƯỚC 1: ADMIN TẠO & HOÀN TẤT KỲ ĐỐI SOÁT                │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ • Tính tổng cashback của các đơn đã chọn               │
│ • Cập nhật user_system_balance:                        │
│   - available_balance += total_cashback (100%)         │
│ • Cập nhật conversions:                                │
│   - system_reconciliation_status = 'reconciled'        │
│   - system_reconciliation_id = <id>                    │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ BƯỚC 2: USER NHẬN TIỀN & RÚT VỀ BANK                    │
│ • User thấy số dư tăng ngay lập tức (100%)             │
│ • User rút tiền về bank                                 │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ BƯỚC 3: API SYNC (Sau 2-3 tháng)                        │
└─────────────────────────────────────────────────────────┘
           ↓                           ↓
    ┌──────────┐               ┌──────────────┐
    │ Vẫn OK ✅ │               │ Bị Reject ❌ │
    └──────────┘               └──────────────┘
         ↓                              ↓
  • Không làm gì              • Tạo debt_balance
  • Set status =              • Trừ available_balance
    'api_confirmed'           • Gửi email thông báo
                              • Chặn rút tiền mới
                              • Set status = 'api_rejected'
```

---

## 📝 CODE CHANGES SUMMARY

### File 1: `SystemReconciliationService.js`

#### Hàm `finalizeReconciliation()`

**TRƯỚC (Có Reserved Balance):**
```javascript
// Tính risk score phức tạp
const riskScore = calculateRiskScore(order);
const isHighRisk = riskScore > 0.7;

// Tính reserved balance
const rejectionRate = 1 - (approvalRate / 100);
const reservedAmount = highRiskCashback * rejectionRate;
const availableAmount = totalCashback - reservedAmount;

// Cập nhật balance
await client.query(`
  UPDATE user_system_balance
  SET available_balance = available_balance + $1,
      reserved_balance = reserved_balance + $2
  WHERE user_id = $3
`, [availableAmount, reservedAmount, userId]);
```

**SAU (Không Reserved):**
```javascript
// ✅ Đơn giản hơn nhiều - chỉ cộng 100% vào available
await client.query(`
  UPDATE user_system_balance
  SET available_balance = available_balance + $1,
      total_earned = total_earned + $1
  WHERE user_id = $2
`, [totalCashback, userId]);

// Cập nhật status của conversion
await client.query(`
  UPDATE conversions
  SET system_reconciliation_status = 'reconciled',
      system_reconciliation_id = $1,
      system_reconciled_at = NOW()
  WHERE id = ANY($2)
`, [reconciliationId, conversionIds]);
```

### File 2: `APISyncJob.js`

**THÊM MỚI: Xử lý rejection**
```javascript
async function handleRejectedOrder(conversionId, userId, cashbackAmount) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Trừ available balance, tạo debt
    await client.query(`
      UPDATE user_system_balance
      SET available_balance = available_balance - $1,
          debt_balance = debt_balance + $1
      WHERE user_id = $2
    `, [cashbackAmount, userId]);

    // 2. Ghi log transaction
    await client.query(`
      INSERT INTO user_balance_transactions (
        user_id, transaction_type, amount,
        description, conversion_id
      ) VALUES ($1, 'chargeback', $2, $3, $4)
    `, [
      userId,
      -cashbackAmount,
      'Đơn hàng bị reject sau đối soát nội bộ',
      conversionId
    ]);

    // 3. Cập nhật conversion status
    await client.query(`
      UPDATE conversions
      SET system_reconciliation_status = 'api_rejected'
      WHERE id = $1
    `, [conversionId]);

    // 4. Gửi notification cho user
    await sendNotification(userId, {
      type: 'chargeback',
      message: `Đơn hàng #${conversionId} đã bị merchant từ chối. Số tiền ${cashbackAmount}₫ đã được trừ vào số dư.`,
      amount: cashbackAmount
    });

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### File 3: Database Migration

```sql
-- migration_remove_reserved_balance.sql

BEGIN;

-- 1. Thêm cột debt_balance
ALTER TABLE user_system_balance
ADD COLUMN IF NOT EXISTS debt_balance NUMERIC(12,2) DEFAULT 0;

-- 2. Giải phóng tất cả reserved balance hiện tại
UPDATE user_system_balance
SET available_balance = available_balance + reserved_balance,
    reserved_balance = 0
WHERE reserved_balance > 0;

-- 3. Thêm status cho conversions
ALTER TABLE conversions
ADD COLUMN IF NOT EXISTS system_reconciliation_status VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS system_reconciliation_id INTEGER REFERENCES system_reconciliations(id),
ADD COLUMN IF NOT EXISTS system_reconciled_at TIMESTAMP;

-- 4. Create index
CREATE INDEX IF NOT EXISTS idx_conversions_system_recon_status
ON conversions(system_reconciliation_status);

-- 5. Cập nhật các conversions đã được reconciled
UPDATE conversions c
SET system_reconciliation_status = 'reconciled',
    system_reconciliation_id = sri.system_reconciliation_id,
    system_reconciled_at = sr.finalized_at
FROM system_reconciliation_items sri
JOIN system_reconciliations sr ON sr.id = sri.system_reconciliation_id
WHERE c.id = sri.conversion_id
  AND sr.status = 'finalized';

COMMIT;
```

---

## 📊 PHÂN TÍCH RỦI RO

### Rủi Ro Tài Chính

**Giả định:**
- Tổng cashback mỗi tháng: 10,000,000₫
- Tỷ lệ rejection thực tế: 5%
- Số tiền bị mất nếu user đã rút: 500,000₫/tháng

**Biện pháp giảm thiểu:**
1. ✅ Monitoring chặt chẽ rejection rate
2. ✅ Alert khi rejection rate > 10%
3. ✅ Có chính sách thu hồi nợ rõ ràng
4. ✅ Chặn rút tiền khi user có nợ
5. ✅ Offset debt với cashback mới

### Rủi Ro User Experience

**Rủi Ro:** User phàn nàn khi bị trừ tiền do rejection

**Giải pháp:**
1. ✅ Email giải thích rõ ràng
2. ✅ Hiển thị lịch sử chargeback trên dashboard
3. ✅ Cung cấp proof từ AccessTrade API
4. ✅ Support team được training

---

## ✅ CHECKLIST TRIỂN KHAI

### Phase 1: Database Migration
- [ ] Backup database
- [ ] Chạy migration script
- [ ] Verify data integrity
- [ ] Test rollback plan

### Phase 2: Backend Updates
- [ ] Update `SystemReconciliationService.js`
- [ ] Update `APISyncJob.js`
- [ ] Add debt handling functions
- [ ] Add notification service
- [ ] Update withdrawal validation

### Phase 3: Frontend Updates
- [ ] Remove "Reserved Balance" display
- [ ] Add "Debt Balance" warning UI
- [ ] Update reconciliation history page
- [ ] Add chargeback history section

### Phase 4: Testing
- [ ] Test normal reconciliation flow
- [ ] Test API rejection scenario
- [ ] Test debt offset mechanism
- [ ] Test withdrawal blocking

### Phase 5: Documentation & Training
- [ ] Update SYSTEM_RECONCILIATION_WORKFLOW.md
- [ ] Create user guide about debt handling
- [ ] Train support team
- [ ] Prepare FAQ

---

## 🎯 KẾT LUẬN

### Khuyến Nghị Cuối Cùng

✅ **NÊN TRIỂN KHAI:**
1. Thêm `system_reconciliation_status` vào conversions → Cải thiện tracking
2. Loại bỏ Reserved Balance → Trải nghiệm user tốt hơn nhiều
3. Triển khai cơ chế debt management → Quản lý risk

### Timeline Đề Xuất

- **Week 1**: Database migration + Backend updates
- **Week 2**: Frontend updates + Testing
- **Week 3**: Soft launch + Monitoring
- **Week 4**: Full rollout

### Kỳ Vọng

📈 **User Satisfaction**: Tăng 40% (nhận tiền ngay, không bị giữ)
⚡ **Code Complexity**: Giảm 30% (bỏ risk score calculation)
💰 **Financial Risk**: Tăng nhẹ nhưng có thể kiểm soát (< 5% rejection rate)

---

**📞 Liên Hệ Nếu Có Thắc Mắc:**
- Xem workflow chi tiết: [SYSTEM_RECONCILIATION_WORKFLOW.md](./SYSTEM_RECONCILIATION_WORKFLOW.md)
- Technical implementation: Xem code examples trong tài liệu này
