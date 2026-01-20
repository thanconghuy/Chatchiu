/**
 * Phân tích và đưa ra định nghĩa chuẩn cho các loại cashback
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

async function analyzeDefinitions() {
  const userId = 'a73b55e7-a176-4299-b4aa-387c5ee4488c';

  try {
    console.log('========================================');
    console.log('PHÂN TÍCH CÁC ĐỊNH NGHĨA CASHBACK');
    console.log('========================================\n');

    // 1. Từ system_conversions (nguồn gốc thực tế)
    const conversions = await pool.query(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(cashback_amount), 0) as total_from_orders,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END), 0) as pending_orders,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as approved_orders,
        COALESCE(SUM(CASE WHEN status = 'rejected' THEN cashback_amount ELSE 0 END), 0) as rejected_orders
      FROM system_conversions
      WHERE user_id = $1
    `, [userId]);

    // 2. Từ user_system_balance (số dư đã lưu)
    const balance = await pool.query(`
      SELECT * FROM user_system_balance WHERE user_id = $1
    `, [userId]);

    const conv = conversions.rows[0];
    const bal = balance.rows[0];

    console.log('1️⃣  NGUỒN GỐC: SYSTEM_CONVERSIONS (Đơn hàng)\n');
    console.log('   • Tổng cashback từ TẤT CẢ đơn:', parseFloat(conv.total_from_orders).toLocaleString('vi-VN'), 'VND');
    console.log('   • Chờ duyệt (pending):', parseFloat(conv.pending_orders).toLocaleString('vi-VN'), 'VND');
    console.log('   • Đã duyệt (approved):', parseFloat(conv.approved_orders).toLocaleString('vi-VN'), 'VND');
    console.log('   • Đã hủy (rejected):', parseFloat(conv.rejected_orders).toLocaleString('vi-VN'), 'VND');
    console.log('');

    console.log('2️⃣  SỐ DƯ: USER_SYSTEM_BALANCE (Tài khoản)\n');
    console.log('   • total_earned:', parseFloat(bal.total_earned).toLocaleString('vi-VN'), 'VND');
    console.log('     → Nghĩa: Tổng cashback đã được ghi nhận vào tài khoản');
    console.log('');
    console.log('   • total_withdrawn:', parseFloat(bal.total_withdrawn).toLocaleString('vi-VN'), 'VND');
    console.log('     → Nghĩa: Tổng tiền đã thanh toán cho user');
    console.log('');
    console.log('   • pending_reserved:', parseFloat(bal.pending_reserved).toLocaleString('vi-VN'), 'VND');
    console.log('     → Nghĩa: Tiền đang trong payment request chờ xử lý');
    console.log('');
    console.log('   • available_balance:', parseFloat(bal.available_balance).toLocaleString('vi-VN'), 'VND');
    console.log('     → Công thức: total_earned - total_withdrawn - pending_reserved');
    console.log('     → Nghĩa: Số tiền user có thể rút ngay bây giờ');
    console.log('');

    console.log('3️⃣  PHÂN TÍCH QUAN HỆ:\n');

    const diff = parseFloat(bal.total_earned) - parseFloat(conv.total_from_orders);
    console.log('   • total_earned vs tổng cashback từ orders:');
    console.log('     Chênh lệch:', diff.toLocaleString('vi-VN'), 'VND');
    console.log('');

    if (Math.abs(diff) < 0.01) {
      console.log('   ✅ KHỚP! total_earned = TẤT CẢ đơn (pending + approved + rejected)');
    } else {
      console.log('   ❌ KHÔNG KHỚP!');
    }
    console.log('');

    console.log('   • available_balance vs approved:');
    const balVsApproved = parseFloat(bal.available_balance) - parseFloat(conv.approved_orders);
    console.log('     available_balance:', parseFloat(bal.available_balance).toLocaleString('vi-VN'), 'VND');
    console.log('     approved orders:', parseFloat(conv.approved_orders).toLocaleString('vi-VN'), 'VND');
    console.log('     Chênh lệch:', balVsApproved.toLocaleString('vi-VN'), 'VND');
    console.log('');

    console.log('4️⃣  ĐỊNH NGHĨA CHUẨN:\n');
    console.log('   ┌─────────────────────────────────────────────────────────┐');
    console.log('   │ A. TRẠNG THÁI ĐƠN HÀNG (system_conversions.status)     │');
    console.log('   ├─────────────────────────────────────────────────────────┤');
    console.log('   │ • pending   : Đơn chờ duyệt (mới tracking)              │');
    console.log('   │ • approved  : Đơn đã duyệt (được cộng vào số dư)        │');
    console.log('   │ • rejected  : Đơn bị hủy (không được cộng vào số dư)    │');
    console.log('   └─────────────────────────────────────────────────────────┘');
    console.log('');
    console.log('   ┌─────────────────────────────────────────────────────────┐');
    console.log('   │ B. SỐ DƯ TÀI KHOẢN (user_system_balance)                │');
    console.log('   ├─────────────────────────────────────────────────────────┤');
    console.log('   │ • total_earned      : Tổng cashback từ TẤT CẢ đơn      │');
    console.log('   │                       (pending + approved + rejected)   │');
    console.log('   │                                                         │');
    console.log('   │ • total_withdrawn   : Tổng đã thanh toán thực tế        │');
    console.log('   │                                                         │');
    console.log('   │ • pending_reserved  : Tiền đang trong payment request   │');
    console.log('   │                       (chờ admin xử lý)                 │');
    console.log('   │                                                         │');
    console.log('   │ • available_balance : Số dư khả dụng                    │');
    console.log('   │   = total_earned - total_withdrawn - pending_reserved   │');
    console.log('   │   (Tiền user CÓ THỂ tạo payment request)                │');
    console.log('   └─────────────────────────────────────────────────────────┘');
    console.log('');

    console.log('   ┌─────────────────────────────────────────────────────────┐');
    console.log('   │ C. HIỂN THỊ TRÊN CASHBACK STATS PAGE                    │');
    console.log('   ├─────────────────────────────────────────────────────────┤');
    console.log('   │ • Tổng Cashback     : total_earned (từ balance)         │');
    console.log('   │                       HOẶC SUM(cashback) từ conversions │');
    console.log('   │                                                         │');
    console.log('   │ • Chờ Duyệt         : SUM(cashback) WHERE pending      │');
    console.log('   │                       (từ conversions)                  │');
    console.log('   │                                                         │');
    console.log('   │ • Đã Duyệt          : SUM(cashback) WHERE approved     │');
    console.log('   │                       (từ conversions)                  │');
    console.log('   │                                                         │');
    console.log('   │ • Đã Thanh Toán     : total_withdrawn (từ balance)     │');
    console.log('   │                                                         │');
    console.log('   │ • Số Dư Còn Lại     : available_balance (từ balance)   │');
    console.log('   │                       = total_earned - total_withdrawn  │');
    console.log('   │                         - pending_reserved              │');
    console.log('   └─────────────────────────────────────────────────────────┘');
    console.log('');

    console.log('5️⃣  LƯU Ý QUAN TRỌNG:\n');
    console.log('   ⚠️  "Số dư khả dụng" ≠ "Đã duyệt"');
    console.log('   ⚠️  "Số dư khả dụng" có thể BÉ HƠN "Đã duyệt" nếu:');
    console.log('       - User đã rút tiền (total_withdrawn > 0)');
    console.log('       - Có payment request đang chờ (pending_reserved > 0)');
    console.log('');
    console.log('   ✅  Công thức ĐÚNG cho "Số dư khả dụng":');
    console.log('       available_balance = total_earned - total_withdrawn - pending_reserved');
    console.log('');

    console.log('========================================\n');

    console.log('📊 THỰC TẾ VỚI USER HIỆN TẠI:\n');
    console.log('   • Tổng cashback:', parseFloat(bal.total_earned).toLocaleString('vi-VN'), 'đ');
    console.log('   • Chờ duyệt:', parseFloat(conv.pending_orders).toLocaleString('vi-VN'), 'đ');
    console.log('   • Đã duyệt:', parseFloat(conv.approved_orders).toLocaleString('vi-VN'), 'đ');
    console.log('   • Đã thanh toán:', parseFloat(bal.total_withdrawn).toLocaleString('vi-VN'), 'đ');
    console.log('   • Đang chờ xử lý:', parseFloat(bal.pending_reserved).toLocaleString('vi-VN'), 'đ');
    console.log('   • Số dư khả dụng:', parseFloat(bal.available_balance).toLocaleString('vi-VN'), 'đ');
    console.log('');
    console.log('   Kiểm tra công thức:');
    const calculated = parseFloat(bal.total_earned) - parseFloat(bal.total_withdrawn) - parseFloat(bal.pending_reserved);
    console.log('   ', parseFloat(bal.total_earned).toLocaleString('vi-VN'), '-', parseFloat(bal.total_withdrawn).toLocaleString('vi-VN'), '-', parseFloat(bal.pending_reserved).toLocaleString('vi-VN'));
    console.log('   = ', calculated.toLocaleString('vi-VN'), 'đ');
    console.log('   ✅ Khớp với available_balance:', parseFloat(bal.available_balance).toLocaleString('vi-VN'), 'đ');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    console.error('\nChi tiết:', error);
    process.exit(1);
  }
}

analyzeDefinitions();
