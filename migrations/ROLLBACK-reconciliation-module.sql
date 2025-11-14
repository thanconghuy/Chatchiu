-- ============================================================
-- ROLLBACK SCRIPT - RECONCILIATION MODULE
-- ============================================================
-- Description: Xóa toàn bộ tables/functions của reconciliation module
-- Date: 2025-11-11
-- Usage: Chạy script này trước khi chạy lại migration
-- ============================================================

-- Xóa tables theo thứ tự (tránh foreign key errors)
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS reconciliation_logs CASCADE;
DROP TABLE IF EXISTS reconciliation_items CASCADE;
DROP TABLE IF EXISTS reconciliations CASCADE;

-- Xóa columns đã thêm vào conversions
ALTER TABLE conversions
  DROP COLUMN IF EXISTS is_confirmed CASCADE,
  DROP COLUMN IF EXISTS confirmed_time CASCADE,
  DROP COLUMN IF EXISTS order_approved CASCADE,
  DROP COLUMN IF EXISTS order_pending CASCADE,
  DROP COLUMN IF EXISTS order_reject CASCADE;

-- Xóa functions
DROP FUNCTION IF EXISTS update_reconciliation_stats() CASCADE;
DROP FUNCTION IF EXISTS update_parent_reconciliation_latest() CASCADE;
DROP FUNCTION IF EXISTS log_reconciliation_action() CASCADE;

-- Note: Không xóa update_updated_at_column() vì được dùng bởi bảng khác

-- Verify cleanup
DO $$
DECLARE
  remaining_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('reconciliations', 'reconciliation_items', 'reconciliation_logs', 'payments');

  IF remaining_count = 0 THEN
    RAISE NOTICE '✅ Rollback completed successfully!';
    RAISE NOTICE '📝 All reconciliation tables removed';
    RAISE NOTICE '🔄 Ready to re-run migration';
  ELSE
    RAISE NOTICE '⚠️  Warning: % tables still exist', remaining_count;
  END IF;
END $$;
