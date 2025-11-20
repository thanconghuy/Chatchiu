# Payment Request Module - Implementation Guide

## 📚 Tổng quan Module

Module **Payment Request** (Yêu cầu Thanh toán) cho phép user tạo yêu cầu rút tiền cashback khi đã được đối soát và có số dư ≥ 100,000 VNĐ.

### Mục tiêu
- ✅ User tự tạo yêu cầu thanh toán
- ✅ Admin quản lý và xử lý yêu cầu
- ✅ Tracking chính xác: cashback nào đã được thanh toán
- ✅ Xử lý đơn hàng confirm muộn
- ✅ Hiển thị trạng thái thanh toán rõ ràng

---

## 📋 Documents

### 1. [payment-request-module-design.md](./payment-request-module-design.md)
**File chính** - Thiết kế chi tiết toàn bộ module:
- ✅ Business requirements & rules
- ✅ Database schema (2 tables + 3 views)
- ✅ API endpoints (User: 5 APIs, Admin: 6 APIs)
- ✅ Frontend UI components (User & Admin)
- ✅ Technical implementation code samples
- ✅ Late reconciliation items handling
- ✅ Order payment status display
- ✅ Mobile optimization
- ✅ Security & validation
- ✅ Testing checklist

### 2. [payment-request-migration.sql](./payment-request-migration.sql)
**Database migration** - SQL scripts để tạo:
- ✅ `payment_requests` table
- ✅ `payment_reconciliation_mapping` table
- ✅ `payment_request_logs` table (audit trail)
- ✅ `reconciliation_logs` table
- ✅ 3 useful views: `v_payment_requests_with_users`, `v_late_reconciliation_items`, `v_user_available_balances`
- ✅ Triggers: auto-update timestamps, auto-logging
- ✅ Function: `get_order_payment_status()`
- ✅ Indexes for performance

---

## 🎯 Key Features

### 1. Payment Request Workflow

```
User có cashback ≥ 100K
    ↓
Tạo yêu cầu thanh toán
    ↓
Status: PENDING (Chờ admin duyệt)
    ↓
Admin xem & xử lý:
    ├─→ CONFIRMED (Đã xác nhận) → Admin chuyển tiền → PAID (Đã thanh toán)
    └─→ REJECTED (Từ chối)
```

### 2. Late Reconciliation Items Handling

**Vấn đề**: Đơn hàng tháng 10 nhưng AccessTrade confirm vào tháng 11

**Giải pháp**:
- Admin có dashboard xem đơn hàng confirm muộn
- Thêm vào kỳ đối soát gốc (nếu chưa paid)
- Hoặc tạo kỳ đối soát bổ sung

### 3. Order Payment Status

6 trạng thái thanh toán:
1. **Paid** (✅ Đã thanh toán)
2. **Payment Confirmed** (⏳ Đang xử lý)
3. **Payment Pending** (⏰ Chờ duyệt)
4. **Payment Rejected** (❌ Bị từ chối)
5. **Reconciled** (📋 Đã đối soát - chưa tạo request)
6. **Not Reconciled** (⚪ Chưa đối soát)

---

## 🗂️ Database Schema Overview

### Core Tables

#### payment_requests
```sql
- id (UUID, PK)
- user_id (UUID, FK to users)
- requested_amount (DECIMAL ≥ 100,000)
- bank_name, bank_account_number, bank_account_name, bank_branch
- status (pending/confirmed/paid/rejected)
- admin_id, admin_notes
- transaction_reference
- created_at, confirmed_at, paid_at, rejected_at
```

#### payment_reconciliation_mapping
```sql
- id (UUID, PK)
- payment_request_id (UUID, FK)
- reconciliation_id (UUID, FK)
- reconciliation_item_id (UUID, FK) -- UNIQUE!
- cashback_amount
```

**Key Constraint**: `reconciliation_item_id` là UNIQUE → mỗi đơn hàng chỉ được thanh toán 1 lần

### Useful Views

#### v_user_available_balances
```sql
SELECT user_id,
    total_confirmed_cashback,
    total_requested,
    available_balance,
    has_pending_request,
    is_eligible
FROM users
```

#### v_late_reconciliation_items
```sql
SELECT conversions chưa có trong reconciliation_items
WHERE status = 'approved' AND is_confirmed = 1
```

---

## 🔌 API Endpoints Summary

### User APIs (5 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/payment-requests/eligibility` | Kiểm tra điều kiện |
| POST | `/api/payment-requests` | Tạo yêu cầu mới |
| GET | `/api/payment-requests` | Xem lịch sử requests |
| GET | `/api/payment-requests/:id` | Chi tiết request |
| DELETE | `/api/payment-requests/:id` | Hủy pending request |

### Admin APIs (6 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/payment-requests` | Xem tất cả requests |
| GET | `/api/admin/payment-requests/:id` | Chi tiết (admin view) |
| PATCH | `/api/admin/payment-requests/:id/confirm` | Xác nhận request |
| PATCH | `/api/admin/payment-requests/:id/reject` | Từ chối request |
| PATCH | `/api/admin/payment-requests/:id/paid` | Đánh dấu đã chuyển tiền |
| GET | `/api/admin/payment-requests/stats` | Thống kê |

### Late Items APIs (3 endpoints)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/admin/reconciliation/late-items` | Xem đơn hàng muộn |
| POST | `/api/admin/reconciliation/:id/add-late-items` | Thêm vào kỳ hiện tại |
| POST | `/api/admin/reconciliation/create-supplementary` | Tạo kỳ bổ sung |

---

## 🎨 Frontend Pages

### User Pages

#### 1. `/payment-requests`
- **Available Balance Card**: Hiển thị số dư khả dụng
- **Create Request Button**: Tạo yêu cầu mới
- **Requests List**: Lịch sử yêu cầu với filter tabs
- **Request Detail Modal**: Xem chi tiết từng request

#### 2. `/dashboard` (Widget)
- Quick balance display
- Link to payment requests page
- Pending request notification

### Admin Pages

#### 1. `/admin/payment-requests`
- **Statistics Overview**: Pending/Confirmed/Paid/Rejected counts
- **Filters**: Status, User, Date range
- **Requests Table**: All payment requests
- **Action Modals**: Confirm, Reject, Mark as Paid

#### 2. `/admin/reconciliation` - Tab "Đơn hàng muộn"
- **Late Items Dashboard**: Đơn hàng confirm muộn
- **Filters**: Period, User, Merchant
- **Bulk Actions**: Add to reconciliation, Create supplementary

---

## 🔐 Business Rules

### Payment Request Creation
- ✅ Minimum amount: **100,000 VNĐ**
- ✅ Maximum: **Available balance**
- ✅ Cannot create if already has **pending request**
- ✅ Bank info required: Name, Account Number, Account Holder Name

### Available Balance Calculation
```
Available Balance = Total Confirmed Cashback - Total Requested
                    (from reconciliations)     (pending+confirmed+paid)
```

### Status Workflow
```
pending → confirmed → paid    (happy path)
pending → rejected            (rejection path)
```

**Rules**:
- Cannot skip from `pending` to `paid`
- `paid` requires `transaction_reference`
- `rejected` requires `admin_notes` (lý do từ chối)

### Late Items Handling
- ✅ Can add to reconciliation if status = `'confirmed'`
- ❌ Cannot add if status = `'paid'` → Create new payment request
- ✅ Each `reconciliation_item` can only be paid once

---

## 🚀 Implementation Steps

### Phase 1: Database Setup
1. ✅ Run `payment-request-migration.sql`
2. ✅ Verify tables created: `payment_requests`, `payment_reconciliation_mapping`
3. ✅ Verify views created: `v_user_available_balances`, `v_late_reconciliation_items`
4. ✅ Test function: `get_order_payment_status()`

### Phase 2: Backend Development
1. Create `backend/models/PaymentRequest.js`
2. Create `backend/services/paymentRequestService.js`
3. Create `backend/routes/paymentRequest.js`
4. Add routes for late items management
5. Write unit tests

### Phase 3: Frontend - User Pages
1. Create `/payment-requests` page
2. Build components:
   - `AvailableBalanceCard`
   - `CreatePaymentRequestForm`
   - `PaymentRequestsList`
   - `PaymentRequestDetail`
3. Add widget to `/dashboard`

### Phase 4: Frontend - Admin Pages
1. Create `/admin/payment-requests` page
2. Build components:
   - `PaymentStatsOverview`
   - `PaymentRequestsTable`
   - `ConfirmModal`, `RejectModal`, `PaidModal`
3. Add "Đơn hàng muộn" tab to `/admin/reconciliation`
4. Build `LateItemsDashboard` component

### Phase 5: Integration & Testing
1. Integration tests: Payment request flow
2. E2E tests: User creates request → Admin processes
3. Test late items handling
4. Mobile responsive testing
5. Performance testing

### Phase 6: Deployment
1. Database migration on production
2. Backend deployment
3. Frontend deployment
4. Monitor & fix issues

---

## 📊 Testing Checklist

### Unit Tests
- [ ] `getAvailableBalance()` calculates correctly
- [ ] Validate minimum amount (100,000 VNĐ)
- [ ] Prevent request when balance insufficient
- [ ] Prevent multiple pending requests
- [ ] FIFO selection of reconciliation items
- [ ] Status transition validation

### Integration Tests
- [ ] Create payment request → items mapped correctly
- [ ] Cancel request → items become available again
- [ ] Confirm → `confirmed_at` timestamp set
- [ ] Mark as paid → `paid_at` timestamp set
- [ ] Reject → `rejected_at` + `admin_notes` set
- [ ] Add late items to reconciliation

### E2E Tests
- [ ] User: Check balance → Create request → View status
- [ ] Admin: View pending → Confirm → Mark paid
- [ ] Admin: Reject request → User sees reason
- [ ] Late items: Filter → Select → Add to reconciliation
- [ ] Mobile: All actions work on mobile devices

---

## 🎯 Success Metrics

### For Users
- ✅ Easy to understand available balance
- ✅ Simple request creation process
- ✅ Clear status tracking
- ✅ Fast payment processing

### For Admin
- ✅ Clear overview of all requests
- ✅ Easy bulk actions
- ✅ Efficient late items management
- ✅ Complete audit trail

### For System
- ✅ No double payments
- ✅ 100% tracking accuracy
- ✅ Fast query performance (< 100ms)
- ✅ Scalable to 10,000+ requests

---

## 🔧 Technical Notes

### Performance Optimizations
1. **Database indexes** on frequently queried columns
2. **Caching** available balance (5 min TTL)
3. **Pagination** for all list views (limit 20-50)
4. **Bulk insert** for reconciliation items mapping

### Security Measures
1. **Access control**: Users see only their own requests
2. **Input validation**: Bank account, amount ranges
3. **Audit logging**: All status changes logged
4. **Transaction safety**: Use DB transactions for critical operations

### Error Handling
1. **Validation errors**: Clear user-friendly messages
2. **Business rule violations**: Explain why action failed
3. **Database errors**: Rollback transactions
4. **API errors**: Proper HTTP status codes

---

## 📞 Support & Maintenance

### Common Issues

**Q: User can't create payment request**
- Check available balance ≥ 100,000 VNĐ
- Check if user has pending request
- Verify bank info is complete

**Q: Reconciliation item already paid error**
- Check `payment_reconciliation_mapping` table
- Item can only be paid once (UNIQUE constraint)

**Q: Late items not showing**
- Verify conversion status = 'approved'
- Verify is_confirmed = 1
- Check if already in reconciliation_items

### Database Maintenance
- Regular vacuum on payment_requests table
- Archive old payment_request_logs (> 1 year)
- Monitor index usage and optimize

---

## 📝 Changelog

### Version 1.0.0 (2025-11-19)
- ✅ Initial design document
- ✅ Database migration scripts
- ✅ API endpoints specification
- ✅ Frontend UI components design
- ✅ Late reconciliation items handling
- ✅ Order payment status display

---

## 🙏 Next Steps

1. Review and approve design document
2. Estimate development time
3. Assign tasks to developers
4. Setup development environment
5. Begin Phase 1: Database setup

---

**Ready to implement!** 🚀

All design documents and migration scripts are complete and ready for development.
