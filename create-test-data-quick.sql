-- Quick fix: Create test conversions data
-- This will create complete test data including system_conversions

-- First, ensure we have merchants
INSERT INTO merchants (id, name, logo_url, commission_rate, policy_note, is_active)
VALUES
  ('shopee', 'Shopee', 'https://down-vn.img.susercontent.com/file/vn-50009109-159200e3e365de418aae52b840f24185', '3-8%', 'Hoàn tiền 3-8% giá trị đơn hàng', true),
  ('lazada', 'Lazada', 'https://laz-img-cdn.alicdn.com/images/ims-web/TB1T7D3dpXXXXXMXFXXXXXXXXXX.png', '2-6%', 'Hoàn tiền 2-6% giá trị đơn hàng', true)
ON CONFLICT (id) DO NOTHING;

-- Run the full test data script
\i test-sample-orders.sql
