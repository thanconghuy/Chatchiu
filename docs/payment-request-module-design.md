# Module Payment Request - Chatchiu.Online

## Overview
Module Yêu cầu Thanh toán (Payment Request) là một sub-module trong hệ thống đối soát (Reconciliation), cho phép user tạo yêu cầu thanh toán khi có tổng cashback đã được duyệt ≥ 100,000 VNĐ.

## Business Requirements

### User Eligibility
- User chỉ được tạo yêu cầu thanh toán khi:
  - Tổng cashback trong các reconciliation đã confirmed ≥ 100,000 VNĐ
  - Cashback chưa được yêu cầu thanh toán (available balance)
  - Có reconciliation ít nhất 1 kỳ đã confirmed

### Payment Request Workflow
1. **User tạo yêu cầu**: Nhập thông tin ngân hàng + số tiền muốn rút
2. **Trạng thái "Chờ duyệt" (pending)**: Yêu cầu được gửi đến admin
3. **Admin xem & xử lý**:
   - Xác nhận thanh toán → Chuyển sang "Đã xác nhận" (confirmed)
   - Từ chối → Chuyển sang "Từ chối" (rejected)
   - Đánh dấu đã chuyển tiền → Chuyển sang "Đã thanh toán" (paid)
4. **User xem lịch sử**: Theo dõi tất cả yêu cầu của mình

### Business Rules
- **Minimum Amount**: 100,000 VNĐ/yêu cầu
- **Maximum Amount**: Không được vượt quá số dư khả dụng (available balance)
- **Available Balance = Tổng cashback confirmed - Tổng đã yêu cầu thanh toán (pending + confirmed + paid)**
- **Không được tạo yêu cầu mới** nếu còn yêu cầu đang pending
- **Bank Info**: Phải có đầy đủ: Tên ngân hàng, số tài khoản, tên chủ tài khoản

### Late Reconciliation Items Handling

#### Vấn đề: Đơn hàng được AccessTrade confirm muộn
- Đơn hàng phát sinh trong tháng 10 nhưng được AccessTrade confirm vào tháng 11
- Kỳ đối soát tháng 10 đã kết thúc → Đơn hàng không nằm trong kỳ nào

#### Giải pháp 1: Add Late Items to Existing Reconciliation (Recommended)
- Admin có thể thêm đơn hàng xác nhận muộn vào kỳ đối soát gốc
- **Điều kiện**: Reconciliation status = 'confirmed' (chưa 'paid')
- Nếu đã 'paid', user phải tạo payment request mới cho đơn hàng muộn

#### Giải pháp 2: Create Supplementary Reconciliation
- Tạo kỳ đối soát bổ sung riêng cho các đơn hàng muộn
- Ví dụ: "Tháng 10/2025 - Bổ sung"

### Order Payment Status Display

Mỗi đơn hàng trong reconciliation có thể có các trạng thái thanh toán:

1. **Paid** (Đã thanh toán): Đơn hàng đã được thanh toán qua payment request
2. **Payment Confirmed** (Đang xử lý thanh toán): Payment request đã confirmed, chưa paid
3. **Payment Pending** (Chờ duyệt thanh toán): Payment request đang pending
4. **Payment Rejected** (Yêu cầu thanh toán bị từ chối): Payment request bị reject
5. **Reconciled** (Đã đối soát - Chưa tạo yêu cầu thanh toán): Nằm trong reconciliation confirmed nhưng chưa có payment request
6. **Not Reconciled** (Chưa đối soát): Chưa nằm trong bất kỳ reconciliation nào

---

## Database Schema

### Table: payment_requests

```sql
CREATE TABLE payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),

    -- Payment amount
    requested_amount DECIMAL(15,2) NOT NULL CHECK (requested_amount >= 100000),

    -- Bank information
    bank_name VARCHAR(255) NOT NULL,
    bank_account_number VARCHAR(50) NOT NULL,
    bank_account_name VARCHAR(255) NOT NULL,
    bank_branch VARCHAR(255),

    -- Status workflow: pending -> confirmed/rejected -> paid (if confirmed)
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending: Chờ admin duyệt
    -- confirmed: Admin đã xác nhận, chuẩn bị chuyển tiền
    -- paid: Đã chuyển tiền thành công
    -- rejected: Từ chối yêu cầu

    -- User notes
    notes TEXT,

    -- Admin handling
    admin_id UUID REFERENCES users(id), -- Admin xử lý yêu cầu
    admin_notes TEXT, -- Ghi chú của admin (lý do từ chối, etc.)

    -- Transaction reference
    transaction_reference VARCHAR(255), -- Mã giao dịch ngân hàng khi đã chuyển tiền

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP, -- Thời điểm admin xác nhận
    paid_at TIMESTAMP, -- Thời điểm đã chuyển tiền
    rejected_at TIMESTAMP, -- Thời điểm từ chối

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('pending', 'confirmed', 'paid', 'rejected')),

    -- Indexes
    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_admin_id (admin_id)
);
```

### Table: payment_reconciliation_mapping

Bảng liên kết giữa payment_request và reconciliation_items để tracking cashback nào đã được thanh toán.

```sql
CREATE TABLE payment_reconciliation_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_request_id UUID NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
    reconciliation_id UUID NOT NULL REFERENCES reconciliations(id),
    reconciliation_item_id UUID NOT NULL REFERENCES reconciliation_items(id),

    -- Amount from this specific item
    cashback_amount DECIMAL(15,2) NOT NULL,

    created_at TIMESTAMP DEFAULT NOW(),

    -- Constraints: Mỗi reconciliation_item chỉ được map vào 1 payment request
    UNIQUE(reconciliation_item_id),

    INDEX idx_payment_request (payment_request_id),
    INDEX idx_reconciliation (reconciliation_id)
);
```

---

## Backend API Endpoints

### User APIs

#### 1. Check Payment Eligibility
```http
GET /api/payment-requests/eligibility
Authorization: Bearer {user_token}

Response: {
  success: boolean,
  eligible: boolean,
  available_balance: number, // Số dư khả dụng
  total_confirmed_cashback: number, // Tổng cashback đã confirmed
  total_requested: number, // Tổng đã yêu cầu (pending + confirmed + paid)
  minimum_amount: 100000,
  has_pending_request: boolean, // Có yêu cầu pending không
  reason?: string // Lý do không eligible (nếu có)
}
```

#### 2. Create Payment Request
```http
POST /api/payment-requests
Authorization: Bearer {user_token}

Body: {
  requested_amount: number, // ≥ 100,000 VNĐ
  bank_name: string,
  bank_account_number: string,
  bank_account_name: string,
  bank_branch?: string,
  notes?: string
}

Response: {
  success: boolean,
  message: string,
  data: {
    payment_request: {...},
    reconciliation_items_used: [...] // List các items được map vào request này
  }
}

Validation:
- requested_amount >= 100,000 VNĐ
- requested_amount <= available_balance
- Không có pending request
- Bank fields không được empty
```

#### 3. Get User's Payment Requests
```http
GET /api/payment-requests
Authorization: Bearer {user_token}
Query: ?status={pending|confirmed|paid|rejected}&limit=20&offset=0

Response: {
  success: boolean,
  data: [
    {
      id: uuid,
      requested_amount: number,
      bank_name: string,
      bank_account_number: string,
      bank_account_name: string,
      status: string,
      notes: string,
      admin_notes: string, // Nếu có
      transaction_reference: string, // Nếu đã paid
      created_at: timestamp,
      confirmed_at: timestamp,
      paid_at: timestamp,
      rejected_at: timestamp
    }
  ],
  pagination: { limit, offset, count }
}
```

#### 4. Get Payment Request Detail
```http
GET /api/payment-requests/:id
Authorization: Bearer {user_token}

Response: {
  success: boolean,
  data: {
    payment_request: {...},
    reconciliation_items: [...], // Các items được thanh toán trong request này
    total_items_count: number
  }
}
```

#### 5. Cancel Pending Request
```http
DELETE /api/payment-requests/:id
Authorization: Bearer {user_token}

Response: {
  success: boolean,
  message: string
}

Validation:
- Chỉ được cancel nếu status = 'pending'
- Request phải thuộc về user
```

---

### Admin APIs

#### 1. Get All Payment Requests (Admin)
```http
GET /api/admin/payment-requests
Authorization: Bearer {admin_token}
Query: ?status=pending&userId={uuid}&limit=50&offset=0&sortBy=created_at&sortOrder=desc

Response: {
  success: boolean,
  data: [
    {
      id: uuid,
      user_id: uuid,
      user_name: string,
      user_email: string,
      requested_amount: number,
      bank_name: string,
      bank_account_number: string,
      bank_account_name: string,
      bank_branch: string,
      status: string,
      notes: string,
      admin_notes: string,
      transaction_reference: string,
      created_at: timestamp,
      confirmed_at: timestamp,
      paid_at: timestamp,
      rejected_at: timestamp,
      admin_name: string // Tên admin đã xử lý
    }
  ],
  pagination: { limit, offset, total, count },
  stats: {
    pending_count: number,
    pending_amount: number,
    confirmed_count: number,
    confirmed_amount: number,
    paid_count: number,
    paid_amount: number,
    rejected_count: number
  }
}
```

#### 2. Get Payment Request Detail (Admin)
```http
GET /api/admin/payment-requests/:id
Authorization: Bearer {admin_token}

Response: {
  success: boolean,
  data: {
    payment_request: {...},
    user_info: {
      full_name: string,
      email: string,
      phone: string,
      total_cashback_all_time: number,
      total_paid_requests: number
    },
    reconciliation_items: [...],
    reconciliation_summary: [
      {
        reconciliation_id: uuid,
        period_label: string,
        items_count: number,
        total_cashback_from_this_period: number
      }
    ]
  }
}
```

#### 3. Confirm Payment Request
```http
PATCH /api/admin/payment-requests/:id/confirm
Authorization: Bearer {admin_token}

Body: {
  admin_notes?: string
}

Response: {
  success: boolean,
  message: string,
  data: {...}
}

Validation:
- Status phải là 'pending'
- Admin_id được set = admin đang login
- confirmed_at được set = NOW()
```

#### 4. Reject Payment Request
```http
PATCH /api/admin/payment-requests/:id/reject
Authorization: Bearer {admin_token}

Body: {
  admin_notes: string // Required: Lý do từ chối
}

Response: {
  success: boolean,
  message: string,
  data: {...}
}

Validation:
- Status phải là 'pending' hoặc 'confirmed'
- admin_notes bắt buộc phải có
- rejected_at được set = NOW()
```

#### 5. Mark as Paid
```http
PATCH /api/admin/payment-requests/:id/paid
Authorization: Bearer {admin_token}

Body: {
  transaction_reference: string, // Required: Mã giao dịch ngân hàng
  admin_notes?: string
}

Response: {
  success: boolean,
  message: string,
  data: {...}
}

Validation:
- Status phải là 'confirmed'
- transaction_reference bắt buộc phải có
- paid_at được set = NOW()
```

#### 6. Get Payment Statistics
```http
GET /api/admin/payment-requests/stats
Authorization: Bearer {admin_token}
Query: ?startDate=2025-01-01&endDate=2025-12-31

Response: {
  success: boolean,
  data: {
    total_requests: number,
    total_amount_requested: number,
    total_amount_paid: number,
    pending_count: number,
    pending_amount: number,
    confirmed_count: number,
    confirmed_amount: number,
    paid_count: number,
    paid_amount: number,
    rejected_count: number,
    rejected_amount: number,
    avg_processing_time_hours: number, // Thời gian xử lý trung bình (pending -> paid)
    top_users: [
      {
        user_id: uuid,
        user_name: string,
        user_email: string,
        total_requests: number,
        total_amount_paid: number
      }
    ]
  }
}
```

---

## Frontend UI Components

### 1. User Pages

#### Page: /payment-requests (User View)

**Sections:**

##### A. Available Balance Card
```html
<div class="balance-card">
  <h3>Số dư khả dụng</h3>
  <div class="balance-amount">₫1,250,000</div>
  <div class="balance-details">
    <p>Tổng cashback đã duyệt: ₫1,500,000</p>
    <p>Đã yêu cầu thanh toán: ₫250,000</p>
  </div>
  <button class="btn-create-request" [disabled]="!eligible">
    Tạo yêu cầu thanh toán
  </button>
  <div class="minimum-note">Số tiền tối thiểu: ₫100,000</div>
</div>
```

##### B. Create Payment Request Form (Modal/Drawer)
```html
<form class="payment-request-form">
  <h3>Tạo yêu cầu thanh toán</h3>

  <div class="form-group">
    <label>Số tiền yêu cầu *</label>
    <input type="number"
           min="100000"
           max="{available_balance}"
           placeholder="Nhập số tiền (tối thiểu 100,000đ)" />
    <span class="helper">Số dư khả dụng: ₫{available_balance}</span>
  </div>

  <div class="form-group">
    <label>Ngân hàng *</label>
    <select>
      <option value="">Chọn ngân hàng</option>
      <option value="Vietcombank">Vietcombank</option>
      <option value="Techcombank">Techcombank</option>
      <option value="VPBank">VPBank</option>
      <!-- More banks -->
    </select>
  </div>

  <div class="form-group">
    <label>Số tài khoản *</label>
    <input type="text" placeholder="Nhập số tài khoản" />
  </div>

  <div class="form-group">
    <label>Tên chủ tài khoản *</label>
    <input type="text" placeholder="Tên chủ tài khoản (theo CMND)" />
  </div>

  <div class="form-group">
    <label>Chi nhánh</label>
    <input type="text" placeholder="Chi nhánh ngân hàng (không bắt buộc)" />
  </div>

  <div class="form-group">
    <label>Ghi chú</label>
    <textarea placeholder="Ghi chú thêm (không bắt buộc)"></textarea>
  </div>

  <div class="form-actions">
    <button type="button" class="btn-cancel">Hủy</button>
    <button type="submit" class="btn-submit">Gửi yêu cầu</button>
  </div>
</form>
```

##### C. Payment Requests List
```html
<div class="payment-requests-list">
  <div class="filter-tabs">
    <button class="tab active">Tất cả</button>
    <button class="tab">Chờ duyệt</button>
    <button class="tab">Đã xác nhận</button>
    <button class="tab">Đã thanh toán</button>
    <button class="tab">Từ chối</button>
  </div>

  <div class="request-cards">
    <div class="request-card status-pending">
      <div class="card-header">
        <span class="status-badge pending">Chờ duyệt</span>
        <span class="request-date">19/11/2025 14:30</span>
      </div>
      <div class="card-body">
        <div class="amount">₫500,000</div>
        <div class="bank-info">
          <p><strong>Ngân hàng:</strong> Vietcombank</p>
          <p><strong>Số TK:</strong> 0123456789</p>
          <p><strong>Chủ TK:</strong> NGUYEN VAN A</p>
        </div>
        <div class="notes" v-if="notes">
          <strong>Ghi chú:</strong> {notes}
        </div>
      </div>
      <div class="card-footer">
        <button class="btn-view-detail">Xem chi tiết</button>
        <button class="btn-cancel" v-if="status === 'pending'">Hủy yêu cầu</button>
      </div>
    </div>

    <div class="request-card status-confirmed">
      <div class="card-header">
        <span class="status-badge confirmed">Đã xác nhận</span>
        <span class="request-date">15/11/2025 10:20</span>
      </div>
      <div class="card-body">
        <div class="amount">₫750,000</div>
        <div class="bank-info">...</div>
        <div class="admin-notes">
          <strong>Admin:</strong> Yêu cầu đã được xác nhận, đang xử lý chuyển khoản
        </div>
      </div>
      <div class="card-footer">
        <button class="btn-view-detail">Xem chi tiết</button>
      </div>
    </div>

    <div class="request-card status-paid">
      <div class="card-header">
        <span class="status-badge paid">Đã thanh toán</span>
        <span class="request-date">10/11/2025 09:15</span>
      </div>
      <div class="card-body">
        <div class="amount">₫1,000,000</div>
        <div class="bank-info">...</div>
        <div class="transaction-ref">
          <strong>Mã GD:</strong> FT25111012345678
        </div>
        <div class="paid-info">
          <p><strong>Thanh toán lúc:</strong> 12/11/2025 16:45</p>
        </div>
      </div>
      <div class="card-footer">
        <button class="btn-view-detail">Xem chi tiết</button>
      </div>
    </div>
  </div>
</div>
```

##### D. Payment Request Detail Modal
```html
<div class="payment-detail-modal">
  <h3>Chi tiết yêu cầu thanh toán</h3>

  <div class="detail-section">
    <h4>Thông tin yêu cầu</h4>
    <div class="detail-row">
      <span class="label">Mã yêu cầu:</span>
      <span class="value">#PR-123456</span>
    </div>
    <div class="detail-row">
      <span class="label">Số tiền:</span>
      <span class="value amount">₫500,000</span>
    </div>
    <div class="detail-row">
      <span class="label">Trạng thái:</span>
      <span class="value"><span class="status-badge">Đã xác nhận</span></span>
    </div>
    <div class="detail-row">
      <span class="label">Ngày tạo:</span>
      <span class="value">19/11/2025 14:30</span>
    </div>
  </div>

  <div class="detail-section">
    <h4>Thông tin ngân hàng</h4>
    <div class="detail-row">
      <span class="label">Ngân hàng:</span>
      <span class="value">Vietcombank</span>
    </div>
    <div class="detail-row">
      <span class="label">Số tài khoản:</span>
      <span class="value">0123456789</span>
    </div>
    <div class="detail-row">
      <span class="label">Chủ tài khoản:</span>
      <span class="value">NGUYEN VAN A</span>
    </div>
    <div class="detail-row">
      <span class="label">Chi nhánh:</span>
      <span class="value">Hà Nội</span>
    </div>
  </div>

  <div class="detail-section">
    <h4>Các đơn hàng được thanh toán</h4>
    <table class="items-table">
      <thead>
        <tr>
          <th>Kỳ đối soát</th>
          <th>Mã đơn</th>
          <th>Merchant</th>
          <th>Cashback</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Tháng 10/2025</td>
          <td>OR12345</td>
          <td>Shopee</td>
          <td>₫50,000</td>
        </tr>
        <!-- More items -->
      </tbody>
      <tfoot>
        <tr>
          <td colspan="3"><strong>Tổng cộng:</strong></td>
          <td><strong>₫500,000</strong></td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>
```

---

### 2. Admin Pages

#### Page: /admin/payment-requests

**Sections:**

##### A. Statistics Overview
```html
<div class="stats-grid">
  <div class="stat-card pending">
    <h4>Chờ duyệt</h4>
    <div class="stat-value">15</div>
    <div class="stat-amount">₫12,500,000</div>
  </div>

  <div class="stat-card confirmed">
    <h4>Đã xác nhận</h4>
    <div class="stat-value">8</div>
    <div class="stat-amount">₫6,800,000</div>
  </div>

  <div class="stat-card paid">
    <h4>Đã thanh toán</h4>
    <div class="stat-value">142</div>
    <div class="stat-amount">₫125,400,000</div>
  </div>

  <div class="stat-card rejected">
    <h4>Từ chối</h4>
    <div class="stat-value">3</div>
    <div class="stat-amount">₫500,000</div>
  </div>
</div>
```

##### B. Filters & Search
```html
<div class="filters-section">
  <div class="filter-group">
    <label>Trạng thái</label>
    <select>
      <option value="">Tất cả</option>
      <option value="pending">Chờ duyệt</option>
      <option value="confirmed">Đã xác nhận</option>
      <option value="paid">Đã thanh toán</option>
      <option value="rejected">Từ chối</option>
    </select>
  </div>

  <div class="filter-group">
    <label>Tìm user</label>
    <input type="text" placeholder="Email hoặc tên user" />
  </div>

  <div class="filter-group">
    <label>Thời gian</label>
    <input type="date" placeholder="Từ ngày" />
    <input type="date" placeholder="Đến ngày" />
  </div>

  <button class="btn-filter">Lọc</button>
  <button class="btn-reset">Reset</button>
</div>
```

##### C. Payment Requests Table
```html
<table class="admin-payment-table">
  <thead>
    <tr>
      <th>Mã YC</th>
      <th>User</th>
      <th>Số tiền</th>
      <th>Ngân hàng</th>
      <th>Trạng thái</th>
      <th>Ngày tạo</th>
      <th>Xử lý</th>
    </tr>
  </thead>
  <tbody>
    <tr class="status-pending">
      <td>#PR-001</td>
      <td>
        <div class="user-info">
          <div class="user-name">Nguyễn Văn A</div>
          <div class="user-email">user@example.com</div>
        </div>
      </td>
      <td class="amount">₫500,000</td>
      <td>
        <div class="bank-info">
          <div>Vietcombank</div>
          <div class="account">0123456789</div>
        </div>
      </td>
      <td><span class="status-badge pending">Chờ duyệt</span></td>
      <td>19/11/2025 14:30</td>
      <td>
        <button class="btn-action btn-view">Xem</button>
        <button class="btn-action btn-confirm">Duyệt</button>
        <button class="btn-action btn-reject">Từ chối</button>
      </td>
    </tr>
    <!-- More rows -->
  </tbody>
</table>
```

##### D. Admin Action Modals

**Confirm Payment Modal:**
```html
<div class="confirm-modal">
  <h3>Xác nhận yêu cầu thanh toán</h3>

  <div class="summary">
    <p><strong>User:</strong> Nguyễn Văn A (user@example.com)</p>
    <p><strong>Số tiền:</strong> ₫500,000</p>
    <p><strong>Ngân hàng:</strong> Vietcombank - 0123456789 - NGUYEN VAN A</p>
  </div>

  <div class="form-group">
    <label>Ghi chú của admin</label>
    <textarea placeholder="Ghi chú (không bắt buộc)"></textarea>
  </div>

  <div class="warning">
    ⚠️ Sau khi xác nhận, yêu cầu sẽ chuyển sang trạng thái "Đã xác nhận"
  </div>

  <div class="actions">
    <button class="btn-cancel">Hủy</button>
    <button class="btn-confirm">Xác nhận</button>
  </div>
</div>
```

**Reject Payment Modal:**
```html
<div class="reject-modal">
  <h3>Từ chối yêu cầu thanh toán</h3>

  <div class="summary">
    <p><strong>User:</strong> Nguyễn Văn A (user@example.com)</p>
    <p><strong>Số tiền:</strong> ₫500,000</p>
  </div>

  <div class="form-group">
    <label>Lý do từ chối *</label>
    <textarea required placeholder="Nhập lý do từ chối (bắt buộc)"></textarea>
  </div>

  <div class="warning">
    ⚠️ User sẽ nhận được thông báo về lý do từ chối
  </div>

  <div class="actions">
    <button class="btn-cancel">Hủy</button>
    <button class="btn-reject">Từ chối yêu cầu</button>
  </div>
</div>
```

**Mark as Paid Modal:**
```html
<div class="paid-modal">
  <h3>Đánh dấu đã thanh toán</h3>

  <div class="summary">
    <p><strong>User:</strong> Nguyễn Văn A (user@example.com)</p>
    <p><strong>Số tiền:</strong> ₫500,000</p>
    <p><strong>Ngân hàng:</strong> Vietcombank - 0123456789 - NGUYEN VAN A</p>
  </div>

  <div class="form-group">
    <label>Mã giao dịch ngân hàng *</label>
    <input type="text" required placeholder="Nhập mã giao dịch (bắt buộc)" />
  </div>

  <div class="form-group">
    <label>Ghi chú</label>
    <textarea placeholder="Ghi chú thêm (không bắt buộc)"></textarea>
  </div>

  <div class="info">
    ✓ Sau khi đánh dấu, yêu cầu sẽ chuyển sang trạng thái "Đã thanh toán"
  </div>

  <div class="actions">
    <button class="btn-cancel">Hủy</button>
    <button class="btn-confirm">Xác nhận đã chuyển tiền</button>
  </div>
</div>
```

---

## Technical Implementation

### Backend Services

#### PaymentRequestService (backend/services/paymentRequestService.js)

```javascript
class PaymentRequestService {
  // Check user eligibility
  async checkEligibility(userId)

  // Calculate available balance
  async getAvailableBalance(userId)

  // Create new payment request
  async createPaymentRequest(userId, data)

  // Get user's payment requests
  async getUserPaymentRequests(userId, filters)

  // Get payment request by ID
  async getPaymentRequestById(requestId)

  // Cancel pending request (user)
  async cancelPaymentRequest(requestId, userId)

  // Admin: Get all payment requests
  async getAllPaymentRequests(filters)

  // Admin: Confirm request
  async confirmPaymentRequest(requestId, adminId, adminNotes)

  // Admin: Reject request
  async rejectPaymentRequest(requestId, adminId, adminNotes)

  // Admin: Mark as paid
  async markAsPaid(requestId, adminId, transactionRef, adminNotes)

  // Get statistics
  async getPaymentStats(filters)

  // Helper: Get reconciliation items for payment mapping
  async getReconciliationItemsForPayment(userId, amount)
}
```

### Key Business Logic

#### 1. Calculate Available Balance
```javascript
async getAvailableBalance(userId) {
  // Step 1: Get total confirmed cashback
  const confirmedCashback = await db.query(`
    SELECT COALESCE(SUM(ri.cashback_amount), 0) as total
    FROM reconciliation_items ri
    JOIN reconciliations r ON ri.reconciliation_id = r.id
    WHERE ri.user_id = $1
      AND r.status = 'confirmed'
      AND r.is_latest = true
  `, [userId]);

  // Step 2: Get total requested (pending + confirmed + paid)
  const requestedAmount = await db.query(`
    SELECT COALESCE(SUM(requested_amount), 0) as total
    FROM payment_requests
    WHERE user_id = $1
      AND status IN ('pending', 'confirmed', 'paid')
  `, [userId]);

  const available = confirmedCashback.total - requestedAmount.total;

  return {
    total_confirmed_cashback: confirmedCashback.total,
    total_requested: requestedAmount.total,
    available_balance: Math.max(0, available)
  };
}
```

#### 2. Create Payment Request with Mapping
```javascript
async createPaymentRequest(userId, data) {
  const { requested_amount, bank_name, bank_account_number,
          bank_account_name, bank_branch, notes } = data;

  // Validation
  const balance = await this.getAvailableBalance(userId);

  if (requested_amount < 100000) {
    throw new Error('Minimum amount is 100,000 VNĐ');
  }

  if (requested_amount > balance.available_balance) {
    throw new Error('Insufficient balance');
  }

  // Check for pending requests
  const pendingCheck = await db.query(`
    SELECT COUNT(*) as count
    FROM payment_requests
    WHERE user_id = $1 AND status = 'pending'
  `, [userId]);

  if (pendingCheck.rows[0].count > 0) {
    throw new Error('You already have a pending request');
  }

  // Start transaction
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Create payment request
    const paymentRequest = await client.query(`
      INSERT INTO payment_requests (
        user_id, requested_amount, bank_name,
        bank_account_number, bank_account_name,
        bank_branch, notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *
    `, [userId, requested_amount, bank_name, bank_account_number,
        bank_account_name, bank_branch, notes]);

    const requestId = paymentRequest.rows[0].id;

    // Get reconciliation items to map (FIFO: oldest first)
    const items = await this.getReconciliationItemsForPayment(
      userId,
      requested_amount,
      client
    );

    // Create mappings
    for (const item of items) {
      await client.query(`
        INSERT INTO payment_reconciliation_mapping (
          payment_request_id, reconciliation_id,
          reconciliation_item_id, cashback_amount
        ) VALUES ($1, $2, $3, $4)
      `, [requestId, item.reconciliation_id,
          item.id, item.cashback_amount]);
    }

    await client.query('COMMIT');

    return {
      payment_request: paymentRequest.rows[0],
      reconciliation_items_used: items
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

#### 3. Get Reconciliation Items for Payment (FIFO)
```javascript
async getReconciliationItemsForPayment(userId, requestedAmount, client) {
  // Get items that haven't been paid yet (FIFO order)
  const query = `
    SELECT ri.id, ri.reconciliation_id, ri.cashback_amount,
           ri.order_code, ri.merchant_name, r.period_label
    FROM reconciliation_items ri
    JOIN reconciliations r ON ri.reconciliation_id = r.id
    WHERE ri.user_id = $1
      AND r.status = 'confirmed'
      AND r.is_latest = true
      AND ri.id NOT IN (
        SELECT reconciliation_item_id
        FROM payment_reconciliation_mapping
      )
    ORDER BY ri.confirmed_time ASC
  `;

  const result = await client.query(query, [userId]);
  const allItems = result.rows;

  // Select items until we reach the requested amount
  let remaining = requestedAmount;
  const selectedItems = [];

  for (const item of allItems) {
    if (remaining <= 0) break;

    const amountToUse = Math.min(
      parseFloat(item.cashback_amount),
      remaining
    );

    selectedItems.push({
      ...item,
      cashback_amount: amountToUse
    });

    remaining -= amountToUse;
  }

  if (remaining > 0) {
    throw new Error('Insufficient confirmed cashback items');
  }

  return selectedItems;
}
```

---

## Integration with Reconciliation System

### 1. Reconciliation Status Flow
```
Conversions (approved)
  → Reconciliation Created (draft)
  → Reconciliation Confirmed
  → User can create Payment Request
  → Payment Request (pending → confirmed → paid)
```

### 2. Data Relationship
```
reconciliations (1) ←→ (N) reconciliation_items
reconciliation_items (1) ←→ (1) payment_reconciliation_mapping
payment_reconciliation_mapping (N) ←→ (1) payment_requests
```

### 3. User Dashboard Integration

Add to existing `/dashboard` page:

```html
<!-- Payment Request Widget -->
<div class="dashboard-widget payment-widget">
  <h3>Thanh toán</h3>
  <div class="balance-display">
    <div class="balance-label">Số dư khả dụng</div>
    <div class="balance-value">₫{available_balance}</div>
  </div>

  <div class="pending-requests" v-if="has_pending">
    <div class="pending-alert">
      ⏳ Có {pending_count} yêu cầu đang chờ xử lý
    </div>
  </div>

  <div class="quick-actions">
    <a href="/payment-requests" class="btn-link">
      Xem tất cả yêu cầu
    </a>
    <button
      class="btn-primary"
      @click="createPaymentRequest"
      :disabled="!eligible">
      Tạo yêu cầu mới
    </button>
  </div>
</div>
```

---

## Mobile Optimization

### User Mobile View
- **Card-based layout** for payment requests list
- **Swipeable cards** with status indicators
- **One-tap actions**: View detail, Cancel
- **Bottom sheet** for create payment form
- **Copy bank info** with one tap
- **Push notifications** for status changes

### Admin Mobile View
- **Compact table** with essential info only
- **Quick actions drawer**: Confirm, Reject, Mark Paid
- **Swipe gestures** for quick approve/reject
- **Filters in collapsible panel**

---

## Late Reconciliation Items Management (Admin)

### API Endpoints for Late Items

#### 1. Get Late Reconciliation Items
```http
GET /api/admin/reconciliation/late-items
Authorization: Bearer {admin_token}
Query: {
  period_start?: date,
  period_end?: date,
  user_id?: uuid,
  limit?: number,
  offset?: number
}

Response: {
  success: boolean,
  data: [
    {
      id: uuid,
      order_code: string,
      user_id: uuid,
      user_email: string,
      user_name: string,
      merchant_name: string,
      order_amount: number,
      cashback_amount: number,
      order_time: timestamp, // Thời điểm đặt hàng
      confirmed_time: timestamp, // Thời điểm AccessTrade confirm (muộn)
      original_period: string, // "2025-10" - Kỳ mà đơn hàng nên thuộc về
      days_late: number // Số ngày confirm muộn
    }
  ],
  total: number,
  pagination: { limit, offset, count }
}

Business Logic:
- Query các conversion có status='approved', is_confirmed=1
- Chưa có trong bất kỳ reconciliation_items nào
- confirmed_time > period_end của reconciliation tương ứng
```

#### 2. Add Late Items to Existing Reconciliation
```http
POST /api/admin/reconciliation/:id/add-late-items
Authorization: Bearer {admin_token}

Body: {
  conversion_ids: string[],
  admin_notes: string
}

Response: {
  success: boolean,
  message: string,
  data: {
    added_items_count: number,
    new_total_cashback: number,
    reconciliation: {...}
  }
}

Validation:
- Reconciliation status must be 'confirmed' (not 'paid' or 'cancelled')
- Conversions must be approved & confirmed by AccessTrade
- Conversions must not already be in any reconciliation
- Auto-update reconciliation.total_cashback
- Log action to reconciliation_logs table

Error Cases:
- If reconciliation status = 'paid': Return error "Cannot add items to paid reconciliation. Please create new payment request."
- If conversion already reconciled: Return error "Conversion {order_code} already in reconciliation {period_label}"
```

#### 3. Create Supplementary Reconciliation
```http
POST /api/admin/reconciliation/create-supplementary
Authorization: Bearer {admin_token}

Body: {
  original_reconciliation_id: uuid,
  conversion_ids: string[],
  period_label: string, // "Tháng 10/2025 - Bổ sung"
  notes: string
}

Response: {
  success: boolean,
  message: string,
  data: {
    reconciliation: {...},
    items: [...],
    stats: {
      total_orders: number,
      total_cashback: number
    }
  }
}

Business Logic:
- Create new reconciliation with same period_start/period_end as original
- Add " - Bổ sung" to period_label
- Link to original via parent_reconciliation_id
- Status starts as 'draft'
```

### Admin UI: Late Items Dashboard

Add to `/admin/reconciliation` page as a new tab:

```html
<!-- Tab: Đơn hàng xác nhận muộn -->
<div class="late-items-dashboard">
  <div class="dashboard-header">
    <h2>Đơn hàng xác nhận muộn (Chưa đối soát)</h2>
    <p class="description">
      Các đơn hàng được AccessTrade xác nhận sau khi kỳ đối soát đã kết thúc
    </p>
    <div class="stats-summary">
      <div class="stat">
        <span class="label">Tổng đơn hàng muộn:</span>
        <span class="value">12 đơn</span>
      </div>
      <div class="stat">
        <span class="label">Tổng cashback:</span>
        <span class="value">₫850,000</span>
      </div>
    </div>
  </div>

  <div class="filters-section">
    <div class="filter-group">
      <label>Kỳ đối soát gốc</label>
      <select id="originalPeriodFilter">
        <option value="">Tất cả</option>
        <option value="2025-10">Tháng 10/2025</option>
        <option value="2025-11">Tháng 11/2025</option>
      </select>
    </div>

    <div class="filter-group">
      <label>User</label>
      <input type="text" placeholder="Email hoặc tên user" />
    </div>

    <div class="filter-group">
      <label>Merchant</label>
      <input type="text" placeholder="Tên merchant" />
    </div>

    <button class="btn-filter">Lọc</button>
    <button class="btn-reset">Reset</button>
  </div>

  <table class="late-items-table">
    <thead>
      <tr>
        <th><input type="checkbox" id="selectAll" /></th>
        <th>Mã đơn</th>
        <th>User</th>
        <th>Merchant</th>
        <th>Cashback</th>
        <th>Thời gian đặt</th>
        <th>Thời gian confirm</th>
        <th>Muộn</th>
        <th>Thuộc kỳ</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><input type="checkbox" class="item-checkbox" value="conv-123" /></td>
        <td>OR12345</td>
        <td>
          <div class="user-info">
            <div class="user-name">Nguyễn Văn A</div>
            <div class="user-email">user@example.com</div>
          </div>
        </td>
        <td>Shopee</td>
        <td class="amount">₫50,000</td>
        <td>20/10/2025 14:30</td>
        <td class="late-confirm">05/11/2025 10:20</td>
        <td class="days-late">
          <span class="badge warning">15 ngày</span>
        </td>
        <td>Tháng 10/2025</td>
      </tr>
      <!-- More rows -->
    </tbody>
  </table>

  <div class="bulk-actions">
    <div class="selected-info">
      <span id="selectedCount">0</span> đơn hàng được chọn
      <span class="separator">|</span>
      Tổng: <span id="selectedTotal">₫0</span>
    </div>
    <div class="actions">
      <button class="btn-primary" id="addToReconciliation" disabled>
        Thêm vào kỳ đối soát
      </button>
      <button class="btn-secondary" id="createSupplementary" disabled>
        Tạo kỳ bổ sung
      </button>
    </div>
  </div>
</div>
```

### JavaScript Logic for Late Items

```javascript
// frontend/admin/reconciliation-late-items.js

class LateItemsManager {
  constructor() {
    this.selectedItems = new Set();
    this.init();
  }

  async init() {
    await this.loadLateItems();
    this.setupEventListeners();
  }

  async loadLateItems(filters = {}) {
    try {
      const queryParams = new URLSearchParams(filters);
      const response = await fetch(`${API_URL}/api/admin/reconciliation/late-items?${queryParams}`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });

      const result = await response.json();
      if (result.success) {
        this.renderLateItems(result.data);
        this.updateStats(result.data);
      }
    } catch (error) {
      console.error('Failed to load late items:', error);
      showNotification('Lỗi khi tải đơn hàng muộn', 'error');
    }
  }

  renderLateItems(items) {
    const tbody = document.querySelector('.late-items-table tbody');
    tbody.innerHTML = items.map(item => `
      <tr data-item-id="${item.id}">
        <td><input type="checkbox" class="item-checkbox" value="${item.id}" /></td>
        <td>${item.order_code}</td>
        <td>
          <div class="user-info">
            <div class="user-name">${item.user_name || 'N/A'}</div>
            <div class="user-email">${item.user_email}</div>
          </div>
        </td>
        <td>${item.merchant_name}</td>
        <td class="amount">${formatCurrency(item.cashback_amount)}</td>
        <td>${formatDate(item.order_time)}</td>
        <td class="late-confirm">${formatDate(item.confirmed_time)}</td>
        <td class="days-late">
          <span class="badge ${item.days_late > 30 ? 'danger' : 'warning'}">
            ${item.days_late} ngày
          </span>
        </td>
        <td>${item.original_period}</td>
      </tr>
    `).join('');

    this.setupCheckboxes();
  }

  setupCheckboxes() {
    // Select all
    document.getElementById('selectAll').addEventListener('change', (e) => {
      const checkboxes = document.querySelectorAll('.item-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        if (e.target.checked) {
          this.selectedItems.add(cb.value);
        } else {
          this.selectedItems.delete(cb.value);
        }
      });
      this.updateSelectedInfo();
    });

    // Individual checkboxes
    document.querySelectorAll('.item-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedItems.add(e.target.value);
        } else {
          this.selectedItems.delete(e.target.value);
        }
        this.updateSelectedInfo();
      });
    });
  }

  updateSelectedInfo() {
    const count = this.selectedItems.size;
    document.getElementById('selectedCount').textContent = count;

    // Enable/disable buttons
    const addBtn = document.getElementById('addToReconciliation');
    const createBtn = document.getElementById('createSupplementary');
    addBtn.disabled = count === 0;
    createBtn.disabled = count === 0;

    // Calculate total
    // ... (calculate from selected items)
  }

  async addToExistingReconciliation() {
    if (this.selectedItems.size === 0) return;

    // Show modal to select reconciliation
    const reconciliationId = await this.showReconciliationSelector();
    if (!reconciliationId) return;

    const adminNotes = prompt('Ghi chú (tùy chọn):');

    try {
      const response = await fetch(`${API_URL}/api/admin/reconciliation/${reconciliationId}/add-late-items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          conversion_ids: Array.from(this.selectedItems),
          admin_notes: adminNotes
        })
      });

      const result = await response.json();
      if (result.success) {
        showNotification(`Đã thêm ${result.data.added_items_count} đơn hàng vào kỳ đối soát`, 'success');
        this.selectedItems.clear();
        await this.loadLateItems();
      } else {
        showNotification(result.message, 'error');
      }
    } catch (error) {
      console.error('Failed to add late items:', error);
      showNotification('Lỗi khi thêm đơn hàng', 'error');
    }
  }

  async createSupplementaryReconciliation() {
    if (this.selectedItems.size === 0) return;

    // Show modal to input period label
    const periodLabel = prompt('Nhập tên kỳ đối soát bổ sung:', 'Tháng XX/2025 - Bổ sung');
    if (!periodLabel) return;

    // ... implementation
  }
}

// Initialize
const lateItemsManager = new LateItemsManager();
```

---

## Notifications & Alerts

### User Notifications
1. **Payment Request Created**: "Yêu cầu thanh toán ₫{amount} đã được gửi"
2. **Request Confirmed**: "Yêu cầu thanh toán ₫{amount} đã được xác nhận"
3. **Payment Completed**: "Đã chuyển ₫{amount} vào tài khoản {bank_account}"
4. **Request Rejected**: "Yêu cầu thanh toán bị từ chối: {reason}"

### Admin Notifications
1. **New Payment Request**: "{user_name} tạo yêu cầu thanh toán ₫{amount}"
2. **Request Cancelled**: "{user_name} đã hủy yêu cầu thanh toán"

---

## Security & Validation

### Input Validation
- **Amount**: >= 100,000 VNĐ, <= available_balance, numeric only
- **Bank Account**: Alphanumeric, 6-20 characters
- **Bank Account Name**: Letters and spaces only, match uppercase
- **Transaction Reference**: Required for paid status

### Access Control
- **Users**: Chỉ xem/tạo/hủy request của chính mình
- **Admins**: Xem tất cả requests, thực hiện actions

### Data Integrity
- **Prevent double payment**: Mỗi reconciliation_item chỉ được map vào 1 payment request
- **Status workflow enforcement**: pending → confirmed → paid (không thể skip)
- **Transaction logging**: Log mọi thay đổi status

---

## Testing Checklist

### Unit Tests
- ✅ Calculate available balance correctly
- ✅ Validate minimum amount (100,000 VNĐ)
- ✅ Prevent creating request when balance insufficient
- ✅ Prevent multiple pending requests
- ✅ FIFO selection of reconciliation items
- ✅ Status transition validation

### Integration Tests
- ✅ Create payment request → reconciliation items mapped correctly
- ✅ Cancel request → items become available again
- ✅ Confirm → confirmed_at timestamp set
- ✅ Mark as paid → paid_at timestamp set
- ✅ Reject → rejected_at + admin_notes set

### E2E Tests
- ✅ User flow: Check balance → Create request → View status
- ✅ Admin flow: View pending → Confirm → Mark paid
- ✅ Rejection flow: Admin reject → User sees reason
- ✅ Mobile responsive: All actions work on mobile

---

## Performance Optimization

### Database Indexes
```sql
-- Already defined in schema
CREATE INDEX idx_payment_user_id ON payment_requests(user_id);
CREATE INDEX idx_payment_status ON payment_requests(status);
CREATE INDEX idx_payment_created_at ON payment_requests(created_at);
CREATE INDEX idx_mapping_payment ON payment_reconciliation_mapping(payment_request_id);
CREATE INDEX idx_mapping_reconciliation ON payment_reconciliation_mapping(reconciliation_id);
```

### Caching Strategy
- Cache available balance for 5 minutes
- Cache user's payment request count for 1 minute
- Invalidate cache on new request creation

### Query Optimization
- Use JOIN instead of multiple queries
- Pagination for list views (limit 20-50)
- Aggregate queries for stats

---

## Deployment Checklist

### Database Migration
1. Create `payment_requests` table
2. Create `payment_reconciliation_mapping` table
3. Add indexes
4. Test with sample data

### Backend Deployment
1. Implement PaymentRequestService
2. Create API routes
3. Add authentication middleware
4. Test all endpoints

### Frontend Deployment
1. Build user payment requests page
2. Build admin payment management page
3. Integrate with existing dashboard
4. Mobile responsive testing

### Documentation
1. API documentation
2. User guide
3. Admin manual
4. Database schema documentation

---

## Future Enhancements

### Phase 2 (Optional)
1. **Automatic Payment Integration**: Tích hợp API ngân hàng tự động chuyển tiền
2. **Payment Schedules**: Cho phép user đặt lịch thanh toán định kỳ
3. **Multiple Bank Accounts**: User lưu nhiều tài khoản ngân hàng
4. **Payment Batching**: Admin xử lý nhiều requests cùng lúc
5. **Email Notifications**: Gửi email khi có thay đổi status
6. **Payment Invoice**: Generate PDF invoice cho mỗi payment
7. **Tax Reporting**: Báo cáo thuế cho cashback
8. **Payment Analytics**: Biểu đồ thống kê payment theo thời gian

---

## Summary

Module Payment Request cung cấp:

✅ **User-friendly**: Giao diện đơn giản, dễ sử dụng
✅ **Secure**: Validation chặt chẽ, access control
✅ **Transparent**: User theo dõi được toàn bộ quá trình
✅ **Efficient**: Admin dễ dàng quản lý và xử lý
✅ **Integrated**: Tích hợp chặt chẽ với reconciliation system
✅ **Scalable**: Dễ mở rộng thêm tính năng

**Tech Stack:**
- Backend: Node.js + Express
- Database: PostgreSQL with JSONB
- Frontend: Vanilla JS / Vue.js (tùy chọn)
- Authentication: JWT tokens
- API: RESTful

**Next Steps:**
1. Review & approve design
2. Create database migration scripts
3. Implement backend services & APIs
4. Build frontend UI components
5. Testing & deployment
