# Hướng dẫn Triển khai Mã hóa Thông tin Tài khoản Ngân hàng

## Tổng quan

Hệ thống mã hóa thông tin tài khoản ngân hàng đã được triển khai để bảo vệ dữ liệu nhạy cảm của người dùng. Tài liệu này hướng dẫn chi tiết cách triển khai hệ thống mã hóa lên production.

## Yêu cầu

- Node.js >= 14.x
- PostgreSQL >= 12.x
- Quyền truy cập database với quyền CREATE TABLE và ALTER TABLE
- Quyền tạo file .env trên server

## Các bước triển khai

### Bước 1: Tạo Encryption Key

```bash
cd database
node generate-encryption-key.js
```

Script này sẽ:
- Tạo một encryption key ngẫu nhiên 256-bit
- In ra key ở định dạng hexadecimal
- Hướng dẫn thêm key vào file .env

**LƯU Ý QUAN TRỌNG:**
- **BẢO MẬT KEY**: Encryption key là thông tin CỰC KỲ NHẠY CẢM
- Lưu key vào password manager hoặc vault service (như AWS Secrets Manager, HashiCorp Vault)
- KHÔNG commit key vào git
- KHÔNG chia sẻ key qua email hoặc chat
- Nếu mất key, KHÔNG THỂ decrypt dữ liệu cũ

### Bước 2: Thêm Key vào Environment Variables

Mở file `.env` và thêm:

```bash
# Encryption key (64 ký tự hex = 256 bits)
ENCRYPTION_KEY=your_generated_key_here
```

**Ví dụ:**
```bash
ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

### Bước 3: Backup Database

**CỰC KỲ QUAN TRỌNG**: Backup database trước khi thực hiện migration!

```bash
# Backup toàn bộ database
pg_dump -U your_username -d chatchiu_db > backup_before_encryption_$(date +%Y%m%d_%H%M%S).sql

# Hoặc chỉ backup bảng payment_requests
pg_dump -U your_username -d chatchiu_db -t payment_requests > backup_payment_requests_$(date +%Y%m%d_%H%M%S).sql
```

### Bước 4: Áp dụng Migration Schema

```bash
cd database
node apply-encryption-migration.js
```

Script này sẽ:
- Thêm các cột mới vào bảng `payment_requests`:
  - `bank_account_number_encrypted` - Số tài khoản đã mã hóa
  - `bank_account_number_hash` - Hash để tìm kiếm duplicate
  - `bank_account_name_encrypted` - Tên chủ tài khoản đã mã hóa
  - `encryption_version` - Version của thuật toán mã hóa
  - `last_decrypted_at` - Thời điểm decrypt lần cuối
  - `last_decrypted_by` - User ID người decrypt
  - `decrypt_count` - Số lần decrypt
- Tạo index trên `bank_account_number_hash` để tìm kiếm nhanh

**Kết quả mong đợi:**
```
✓ Connected to database
✓ Migration script executed successfully
✓ Columns added: bank_account_number_encrypted, bank_account_number_hash, ...
✓ Index created: idx_payment_requests_bank_account_hash
```

### Bước 5: Migrate Dữ liệu Cũ

```bash
cd database
node migrate-existing-data.js
```

Script này sẽ:
1. Tìm tất cả payment requests chưa được mã hóa (`bank_account_number_encrypted IS NULL`)
2. Với mỗi record:
   - Encrypt số tài khoản và tên chủ tài khoản
   - Tạo hash để tìm kiếm duplicate
   - Tạo phiên bản masked để hiển thị (ví dụ: `******7890`)
   - Cập nhật database

**Lưu ý:**
- Script xử lý từng record một để tránh quá tải
- Hiển thị progress bar khi xử lý
- Tự động rollback nếu có lỗi

**Kết quả mong đợi:**
```
✓ Found 150 payment requests to migrate
✓ Processing... [========================================] 100%
✓ Successfully migrated 150 records
✓ Failed: 0 records
```

### Bước 6: Xác minh Encryption

```bash
cd database
node verify-encryption.js
```

Script này sẽ:
1. Kiểm tra tất cả records đã được mã hóa
2. Test encrypt/decrypt với dữ liệu mẫu
3. Verify hash function hoạt động đúng
4. Test masking function

**Kết quả mong đợi:**
```
=== ENCRYPTION VERIFICATION ===

1. Checking encrypted records...
   ✓ Total payment requests: 150
   ✓ Encrypted records: 150
   ✓ Unencrypted records: 0
   ✓ All records are encrypted!

2. Testing encryption/decryption...
   ✓ Encryption working correctly
   ✓ Decryption working correctly
   ✓ Encrypt/Decrypt cycle successful

3. Testing hash function...
   ✓ Hash generated successfully
   ✓ Hash verification working correctly

4. Testing masking...
   ✓ Masking working correctly
   ✓ Expected: ******1234, Got: ******1234

=== VERIFICATION COMPLETE ===
All tests passed! Encryption system is working correctly.
```

### Bước 7: Restart Application

```bash
# Stop application
pm2 stop chatchiu-backend

# Restart với environment variables mới
pm2 restart chatchiu-backend --update-env

# Check logs
pm2 logs chatchiu-backend
```

### Bước 8: Kiểm tra trên Production

1. **Tạo payment request mới:**
   - Login vào user account
   - Tạo một payment request mới
   - Kiểm tra database xem data đã được encrypt

```sql
SELECT
    id,
    bank_account_number,  -- Phải là masked (******1234)
    bank_account_number_encrypted,  -- Phải có giá trị encrypted
    bank_account_number_hash,  -- Phải có hash
    encryption_version  -- Phải = 1
FROM payment_requests
ORDER BY created_at DESC
LIMIT 1;
```

2. **Xem payment request detail (Admin):**
   - Login vào admin account
   - Xem chi tiết payment request
   - Verify số tài khoản đầy đủ được hiển thị
   - Kiểm tra audit log

```sql
SELECT
    id,
    last_decrypted_at,
    last_decrypted_by,
    decrypt_count
FROM payment_requests
WHERE id = 'payment_request_id';
```

3. **Xem payment request detail (User):**
   - Login vào user account
   - Xem payment request của mình
   - Verify số tài khoản đầy đủ được hiển thị

## Cấu trúc Dữ liệu

### Trước Encryption
```
bank_account_number: "1234567890"
bank_account_name: "NGUYEN VAN A"
```

### Sau Encryption
```
bank_account_number: "******7890" (masked - để hiển thị)
bank_account_number_encrypted: "iv:authTag:encryptedData" (AES-256-GCM)
bank_account_number_hash: "salt:hash" (PBKDF2-HMAC-SHA512)
bank_account_name: "NGUYEN *** A" (masked)
bank_account_name_encrypted: "iv:authTag:encryptedData"
encryption_version: 1
```

## Audit Trail

Mỗi lần decrypt thông tin nhạy cảm, hệ thống tự động ghi log:

```sql
SELECT
    pr.id,
    pr.requested_amount,
    pr.bank_account_number,  -- Masked
    pr.last_decrypted_at,
    u.full_name as last_decrypted_by_name,
    pr.decrypt_count
FROM payment_requests pr
LEFT JOIN users u ON pr.last_decrypted_by = u.id
WHERE pr.last_decrypted_at IS NOT NULL
ORDER BY pr.last_decrypted_at DESC
LIMIT 20;
```

## Bảo mật

### Best Practices đã implement:

1. **AES-256-GCM**: Authenticated encryption với 256-bit key
2. **PBKDF2-HMAC-SHA512**: Hash function để tìm duplicate không cần decrypt
3. **Data Masking**: Hiển thị phiên bản masked thay vì plaintext
4. **Audit Logging**: Track mọi lần truy cập dữ liệu nhạy cảm
5. **Authorization Check**: Verify quyền truy cập trước khi decrypt
6. **Encryption Version**: Hỗ trợ key rotation trong tương lai

### Khuyến nghị bổ sung:

1. **Key Rotation**: Xoay key định kỳ (6-12 tháng)
2. **Access Monitoring**: Setup alerts khi có quá nhiều decrypt requests
3. **Database Encryption**: Enable PostgreSQL encryption at rest
4. **Network Encryption**: Sử dụng SSL/TLS cho database connections
5. **Backup Encryption**: Encrypt database backups

## Troubleshooting

### Lỗi: "ENCRYPTION_KEY not found"

**Nguyên nhân**: Environment variable chưa được set

**Giải pháp:**
```bash
# Kiểm tra .env file
cat .env | grep ENCRYPTION_KEY

# Restart application với env mới
pm2 restart chatchiu-backend --update-env
```

### Lỗi: "Invalid encryption key format"

**Nguyên nhân**: Key không đúng format (phải là 64 ký tự hex)

**Giải pháp:**
```bash
# Generate key mới
node database/generate-encryption-key.js

# Update .env với key mới
```

### Lỗi: "Error decrypting data"

**Nguyên nhân**: Key bị thay đổi hoặc data bị corrupt

**Giải pháp:**
1. Kiểm tra key trong .env có đúng không
2. Restore từ backup nếu cần
3. Contact admin để verify key

### Migration script bị lỗi giữa chừng

**Giải pháp:**
```bash
# Rollback từ backup
psql -U your_username -d chatchiu_db < backup_before_encryption_YYYYMMDD_HHMMSS.sql

# Fix lỗi và chạy lại migration
node database/apply-encryption-migration.js
node database/migrate-existing-data.js
```

## Rollback Plan

Nếu cần rollback encryption:

### Bước 1: Backup current state
```bash
pg_dump -U your_username -d chatchiu_db > backup_current_state_$(date +%Y%m%d_%H%M%S).sql
```

### Bước 2: Restore từ backup trước encryption
```bash
psql -U your_username -d chatchiu_db < backup_before_encryption_YYYYMMDD_HHMMSS.sql
```

### Bước 3: Revert code changes
```bash
git revert <commit_hash>
```

### Bước 4: Restart application
```bash
pm2 restart chatchiu-backend
```

## Testing Checklist

- [ ] Encryption key được generate và lưu an toàn
- [ ] Database migration thành công
- [ ] Tất cả dữ liệu cũ đã được encrypt
- [ ] Verification script pass tất cả tests
- [ ] User có thể tạo payment request mới
- [ ] User có thể xem payment request của mình
- [ ] Admin có thể xem payment request với full details
- [ ] Số tài khoản được masked khi hiển thị danh sách
- [ ] Số tài khoản đầy đủ hiển thị khi xem chi tiết
- [ ] Copy to clipboard hoạt động
- [ ] Audit trail ghi log đúng
- [ ] Application logs không có errors

## Monitoring

### Query để monitor encryption usage:

```sql
-- Số lượng payment requests đã encrypt
SELECT
    COUNT(*) as total,
    COUNT(bank_account_number_encrypted) as encrypted,
    COUNT(*) - COUNT(bank_account_number_encrypted) as not_encrypted
FROM payment_requests;

-- Top 10 payment requests được decrypt nhiều nhất
SELECT
    pr.id,
    pr.requested_amount,
    pr.decrypt_count,
    pr.last_decrypted_at,
    u.full_name as last_decrypted_by
FROM payment_requests pr
LEFT JOIN users u ON pr.last_decrypted_by = u.id
WHERE pr.decrypt_count > 0
ORDER BY pr.decrypt_count DESC
LIMIT 10;

-- Decrypt activity trong 24h qua
SELECT
    DATE_TRUNC('hour', last_decrypted_at) as hour,
    COUNT(*) as decrypt_count
FROM payment_requests
WHERE last_decrypted_at >= NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

## Support

Nếu gặp vấn đề trong quá trình triển khai:

1. Kiểm tra logs: `pm2 logs chatchiu-backend`
2. Kiểm tra database connection
3. Verify encryption key trong .env
4. Chạy verify script: `node database/verify-encryption.js`
5. Contact technical support với error logs

## Changelog

### Version 1.0 (2024-12-06)
- Initial encryption implementation
- AES-256-GCM encryption for bank account data
- PBKDF2-HMAC-SHA512 hashing for duplicate detection
- Data masking for display
- Audit trail for decrypt operations
- Migration scripts for existing data
