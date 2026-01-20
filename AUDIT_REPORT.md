# 📋 BÁO CÁO AUDIT HỆ THỐNG CASHBACK

**Ngày:** 2026-01-16
**Người thực hiện:** Claude
**Mức độ:** NGHIÊM TRỌNG - Liên quan đến tài chính

---

## 🚨 TÓM TẮT VẤN ĐỀ

Hệ thống cashback có **LỖI LOGIC NGHIÊM TRỌNG** dẫn đến dữ liệu tài chính không chính xác:
- Bảng `user_system_balance.total_earned` **KHÔNG được tự động cập nhật** khi có conversion mới
- Dẫn đến số liệu hiển thị trên frontend **KHÔNG KHỚP** với số liệu thực tế
- Ảnh hưởng: **33/181 users** (18% users)

---

## 📊 HIỆN TRẠNG SAU KHI FIX

### ✅ Đã sửa (Tạm thời):
- Chạy script `sync-all-users-balance.js` để đồng bộ dữ liệu
- **TẤT CẢ 33 users** đã có `total_earned` = SUM(cashback) từ conversions
- Không còn balance âm
- Frontend hiển thị đúng (sau khi hard refresh)

### ❌ Chưa sửa (Cần fix ngay):
- **LOGIC TỰ ĐỘNG** chưa có
- Nếu có conversion mới → `total_earned` sẽ lại SAI
- Cần chạy sync script thủ công định kỳ (KHÔNG bền vững)

---

## 🔍 PHÂN TÍCH NGUYÊN NHÂN

### 1. Luồng Tạo Conversion Hiện Tại

```
1. AT Tracking gửi conversion → conversions table (raw data)
2. Match với click → system_conversions table
3. User xem trong Conversions Management
```

**VẤN ĐỀ:** Không có bước nào cập nhật `user_system_balance.total_earned`!

### 2. Các Điểm Code Có Vấn Đề

#### a) `backend/models/SystemConversion.js`
```javascript
static async create(data) {
  // Insert vào system_conversions
  // ❌ THIẾU: Không cập nhật user_system_balance
}
```

#### b) `backend/routes/admin.js` - Approve Conversion
```javascript
// Chỉ UPDATE status = 'approved'
// ❌ THIẾU: Không cộng vào user_system_balance.total_earned
```

#### c) `backend/routes/admin.js` - Reject Conversion
```javascript
// Chỉ UPDATE status = 'rejected'
// ❌ THIẾU: Không trừ khỏi user_system_balance.total_earned (nếu đã cộng)
```

---

## 📋 ĐỊNH NGHĨA CHUẨN CÁC LOẠI CASHBACK

### A. TRẠNG THÁI ĐƠN HÀNG (`system_conversions.status`)

| Status | Định nghĩa | Balance? |
|--------|-----------|----------|
| `pending` | Đơn chờ duyệt | ✅ Đã cộng vào total_earned |
| `approved` | Đơn đã duyệt | ✅ Đã cộng vào total_earned |
| `rejected` | Đơn bị hủy | ❌ Không cộng / Đã trừ ra |

### B. SỐ DƯ TÀI KHOẢN (`user_system_balance`)

| Field | Công thức | Ý nghĩa |
|-------|-----------|---------|
| `total_earned` | `SUM(cashback_amount)` từ TẤT CẢ conversions (pending + approved) | Tổng cashback user đã kiếm được |
| `total_withdrawn` | Tổng tiền đã thanh toán thực tế | Tiền đã chuyển cho user |
| `pending_reserved` | Tổng tiền trong payment requests đang chờ | Tiền đang chờ admin xử lý |
| `available_balance` | `total_earned - total_withdrawn - pending_reserved` | Tiền user có thể rút ngay |

### C. HIỂN THỊ TRÊN FRONTEND

| Cột | Lấy từ đâu | Định nghĩa |
|-----|------------|-----------|
| Tổng Cashback | `user_system_balance.total_earned` | Tổng từ TẤT CẢ đơn |
| Chờ Duyệt | `SUM(cashback) WHERE status='pending'` | Từ conversions pending |
| Đã Duyệt | `SUM(cashback) WHERE status='approved'` | Từ conversions approved |
| Đã Thanh Toán | `user_system_balance.total_withdrawn` | Tiền đã thanh toán |
| Số Dư Còn Lại | `user_system_balance.available_balance` | Tiền khả dụng |

---

## ⚠️ HƯỚNG FIX ĐÚNG

### Giải pháp 1: DATABASE TRIGGER (Khuyến nghị)

Tạo trigger tự động cập nhật `user_system_balance.total_earned` khi:
- INSERT vào `system_conversions`
- UPDATE `system_conversions.cashback_amount`
- DELETE từ `system_conversions`

**Ưu điểm:**
- Tự động 100%, không lo quên
- Đảm bảo data integrity
- Không cần sửa application code nhiều

**Nhược điểm:**
- Phụ thuộc vào database
- Khó debug hơn

### Giải pháp 2: APPLICATION LOGIC

Sửa code tại các điểm:
1. `SystemConversion.create()` → Cộng vào `total_earned`
2. Admin approve conversion → Không làm gì (đã cộng rồi)
3. Admin reject conversion → Trừ khỏi `total_earned`

**Ưu điểm:**
- Logic rõ ràng trong code
- Dễ debug và test

**Nhược điểm:**
- Dễ quên cập nhật khi có code path mới
- Nhiều chỗ phải sửa

### Giải pháp 3: HYBRID (Tốt nhất)

1. **Database trigger** để đảm bảo data integrity
2. **Application logic** để có transaction log rõ ràng
3. **Daily reconciliation job** để phát hiện lỗi nếu có

---

## 📝 KHUYẾN NGHỊ

### Ưu tiên 1: TẠO DATABASE TRIGGER (Ngay lập tức)

```sql
CREATE OR REPLACE FUNCTION update_user_balance_on_conversion()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Cộng vào total_earned
    INSERT INTO user_system_balance (user_id, total_earned, total_withdrawn, pending_reserved)
    VALUES (NEW.user_id, NEW.cashback_amount, 0, 0)
    ON CONFLICT (user_id) DO UPDATE
    SET total_earned = user_system_balance.total_earned + NEW.cashback_amount,
        updated_at = NOW();
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Điều chỉnh nếu cashback_amount thay đổi
    UPDATE user_system_balance
    SET total_earned = total_earned - OLD.cashback_amount + NEW.cashback_amount,
        updated_at = NOW()
    WHERE user_id = NEW.user_id;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    -- Trừ khỏi total_earned
    UPDATE user_system_balance
    SET total_earned = total_earned - OLD.cashback_amount,
        updated_at = NOW()
    WHERE user_id = OLD.user_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_balance_on_conversion
AFTER INSERT OR UPDATE OR DELETE ON system_conversions
FOR EACH ROW
EXECUTE FUNCTION update_user_balance_on_conversion();
```

### Ưu tiên 2: DAILY RECONCILIATION JOB

Tạo cronjob chạy mỗi ngày để verify:
```javascript
// Kiểm tra mọi user
// Nếu total_earned != SUM(cashback từ conversions)
// → Gửi alert email cho admin
// → Tự động sync
```

### Ưu tiên 3: MONITORING & ALERTING

Thêm metrics:
- Số users có balance không khớp
- Alert nếu > 0 users không khớp
- Dashboard hiển thị health check

---

## 🎯 KẾT LUẬN

1. **Vấn đề hiện tại:** Đã fix tạm thời bằng sync script
2. **Nguyên nhân gốc:** Thiếu logic tự động cập nhật balance
3. **Giải pháp:** Tạo database trigger + daily reconciliation
4. **Mức độ khẩn:** URGENT - Cần fix trong 24h

---

**Chú ý:**
- Frontend hiển thị đúng sau khi hard refresh (Ctrl + Shift + R)
- Database đã đồng bộ 100%
- Cần implement trigger để tránh lỗi tương lai
