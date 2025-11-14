-- Migration: Add reconciliation fields to conversions table
-- Description: Thêm các trường is_confirmed, confirmed_time và order status counters
-- Date: 2025-11-11
-- Author: Reconciliation Module Implementation

-- Add reconciliation-related columns
ALTER TABLE conversions
  ADD COLUMN IF NOT EXISTS is_confirmed SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS order_approved INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_pending INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_reject INTEGER DEFAULT 0;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversions_is_confirmed ON conversions(is_confirmed);
CREATE INDEX IF NOT EXISTS idx_conversions_confirmed_time ON conversions(confirmed_time);
CREATE INDEX IF NOT EXISTS idx_conversions_is_confirmed_time ON conversions(is_confirmed, confirmed_time);

-- Add comments for documentation
COMMENT ON COLUMN conversions.is_confirmed IS 'Trạng thái đối soát từ AccessTrade API: 0 = chưa duyệt, 1 = đã duyệt';
COMMENT ON COLUMN conversions.confirmed_time IS 'Thời gian xác nhận đối soát từ AccessTrade';
COMMENT ON COLUMN conversions.order_approved IS 'Tổng số lượng item ở trạng thái approved trong đơn hàng';
COMMENT ON COLUMN conversions.order_pending IS 'Tổng số lượng item ở trạng thái pending trong đơn hàng';
COMMENT ON COLUMN conversions.order_reject IS 'Tổng số lượng item ở trạng thái rejected trong đơn hàng';

-- Note:
-- - status column (existing) maps to AccessTrade API 'status' field (0: Pending, 1: Approved, 2: Rejected)
-- - is_confirmed column (new) maps to AccessTrade API 'is_confirmed' field (0: chưa đối soát, 1: đã đối soát)
-- - Only conversions with is_confirmed=1 can be included in reconciliation periods
