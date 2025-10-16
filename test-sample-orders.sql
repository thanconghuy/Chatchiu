-- Sample test data for testing conversions system
-- Creates: 1 test user + 2 clicks + 2 conversions + 2 system_conversions

-- Step 1: Create or use existing test user
DO $$
DECLARE
  test_user_id UUID;
  existing_user_id UUID;
  click_1_id UUID;
  click_2_id UUID;
  conv_1_id UUID;
  conv_2_id UUID;
BEGIN
  -- Check if username 'testuser' exists
  SELECT id INTO existing_user_id FROM users WHERE username = 'testuser' LIMIT 1;

  IF existing_user_id IS NOT NULL THEN
    -- Update existing user
    UPDATE users SET
      available_balance = 50000.00,
      pending_balance = 20000.00,
      total_cashback = 70000.00
    WHERE id = existing_user_id;

    test_user_id := existing_user_id;
    RAISE NOTICE 'Using existing testuser with id: %', existing_user_id;
  ELSE
    -- Create new test user
    INSERT INTO users (
      email,
      password_hash,
      full_name,
      username,
      phone,
      available_balance,
      pending_balance,
      total_cashback
    ) VALUES (
      'test@mmocashback.vn',
      '$2b$10$XqZ9YcT8W5Y.EXAMPLE.HASH.FOR.TEST.USER.ONLY',
      'Nguyen Van Test',
      'testuser',
      '0901234567',
      50000.00,
      20000.00,
      70000.00
    ) RETURNING id INTO test_user_id;
    RAISE NOTICE 'Created new testuser with id: %', test_user_id;
  END IF;

  -- Step 2: Create 2 test clicks (matching the conversions)
  INSERT INTO clicks (
    user_id,
    merchant_id,
    aff_sid,
    click_type,
    original_url,
    affiliate_url,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    clicked_at
  ) VALUES (
    test_user_id,
    'shopee',
    'TEST_AFF_SID_001',
    'button',
    'https://shopee.vn/product/123456',
    'https://shope.ee/TEST_LINK_001',
    'mmocashback',
    'affiliate',
    'TEST_AFF_SID_001',
    'homepage_banner',
    NOW() - INTERVAL '3 days'
  ) ON CONFLICT (aff_sid) DO UPDATE SET
    original_url = EXCLUDED.original_url,
    clicked_at = EXCLUDED.clicked_at
  RETURNING id INTO click_1_id;

  INSERT INTO clicks (
    user_id,
    merchant_id,
    aff_sid,
    click_type,
    original_url,
    affiliate_url,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    clicked_at
  ) VALUES (
    test_user_id,
    'lazada',
    'TEST_AFF_SID_002',
    'link',
    'https://www.lazada.vn/products/test-product-i123456.html',
    'https://c.lazada.vn/TEST_LINK_002',
    'mmocashback',
    'affiliate',
    'TEST_AFF_SID_002',
    'product_page_link',
    NOW() - INTERVAL '2 days'
  ) ON CONFLICT (aff_sid) DO UPDATE SET
    original_url = EXCLUDED.original_url,
    clicked_at = EXCLUDED.clicked_at
  RETURNING id INTO click_2_id;

  -- Get click IDs if they already existed
  IF click_1_id IS NULL THEN
    SELECT id INTO click_1_id FROM clicks WHERE aff_sid = 'TEST_AFF_SID_001';
  END IF;
  IF click_2_id IS NULL THEN
    SELECT id INTO click_2_id FROM clicks WHERE aff_sid = 'TEST_AFF_SID_002';
  END IF;

  -- Step 3: Create 2 conversions (matched with clicks above)
  INSERT INTO conversions (
    user_id,
    click_id,
    accesstrade_id,
    merchant_id,
    merchant_name,
    order_code,
    order_amount,
    commission,
    cashback_amount,
    status,
    aff_sid,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    order_time,
    approval_time
  ) VALUES (
    test_user_id,
    click_1_id,
    'AT_TEST_ORDER_001',
    'shopee',
    'Shopee',
    'SHOPEE2025001',
    1500000.00,
    45000.00,
    31500.00,
    'approved',
    'TEST_AFF_SID_001',
    'mmocashback',
    'affiliate',
    'TEST_AFF_SID_001',
    'homepage_banner',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day'
  ) ON CONFLICT (accesstrade_id) DO UPDATE SET
    status = EXCLUDED.status,
    approval_time = EXCLUDED.approval_time,
    user_id = EXCLUDED.user_id,
    click_id = EXCLUDED.click_id
  RETURNING id INTO conv_1_id;

  INSERT INTO conversions (
    user_id,
    click_id,
    accesstrade_id,
    merchant_id,
    merchant_name,
    order_code,
    order_amount,
    commission,
    cashback_amount,
    status,
    aff_sid,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    order_time,
    approval_time
  ) VALUES (
    test_user_id,
    click_2_id,
    'AT_TEST_ORDER_002',
    'lazada',
    'Lazada',
    'LAZADA2025002',
    850000.00,
    25500.00,
    17850.00,
    'pending',
    'TEST_AFF_SID_002',
    'mmocashback',
    'affiliate',
    'TEST_AFF_SID_002',
    'product_page_link',
    NOW() - INTERVAL '1 day',
    NULL
  ) ON CONFLICT (accesstrade_id) DO UPDATE SET
    status = EXCLUDED.status,
    user_id = EXCLUDED.user_id,
    click_id = EXCLUDED.click_id
  RETURNING id INTO conv_2_id;

  -- Get conversion IDs if they already existed
  IF conv_1_id IS NULL THEN
    SELECT id INTO conv_1_id FROM conversions WHERE accesstrade_id = 'AT_TEST_ORDER_001';
  END IF;
  IF conv_2_id IS NULL THEN
    SELECT id INTO conv_2_id FROM conversions WHERE accesstrade_id = 'AT_TEST_ORDER_002';
  END IF;

  -- Step 4: Create system_conversions (matched conversions only)
  INSERT INTO system_conversions (
    at_conversion_id,
    user_id,
    click_id,
    merchant_id,
    merchant_name,
    order_code,
    order_amount,
    commission,
    cashback_amount,
    status,
    order_time,
    approval_time,
    matched_at
  ) VALUES (
    conv_1_id,
    test_user_id,
    click_1_id,
    'shopee',
    'Shopee',
    'SHOPEE2025001',
    1500000.00,
    45000.00,
    31500.00,
    'approved',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '2 days'
  ) ON CONFLICT (at_conversion_id) DO UPDATE SET
    status = EXCLUDED.status,
    approval_time = EXCLUDED.approval_time;

  INSERT INTO system_conversions (
    at_conversion_id,
    user_id,
    click_id,
    merchant_id,
    merchant_name,
    order_code,
    order_amount,
    commission,
    cashback_amount,
    status,
    order_time,
    approval_time,
    matched_at
  ) VALUES (
    conv_2_id,
    test_user_id,
    click_2_id,
    'lazada',
    'Lazada',
    'LAZADA2025002',
    850000.00,
    25500.00,
    17850.00,
    'pending',
    NOW() - INTERVAL '1 day',
    NULL,
    NOW() - INTERVAL '1 day'
  ) ON CONFLICT (at_conversion_id) DO UPDATE SET
    status = EXCLUDED.status;

  RAISE NOTICE 'Test data created successfully!';
  RAISE NOTICE 'User ID: %', test_user_id;
  RAISE NOTICE 'Click 1 ID: %', click_1_id;
  RAISE NOTICE 'Click 2 ID: %', click_2_id;
  RAISE NOTICE 'Conversion 1 ID: %', conv_1_id;
  RAISE NOTICE 'Conversion 2 ID: %', conv_2_id;
END $$;

-- Display results
SELECT '=== TEST USER ===' as info;
SELECT id, email, username, full_name, available_balance, pending_balance FROM users WHERE username = 'testuser';

SELECT '=== TEST CLICKS ===' as info;
SELECT c.id, c.merchant_id, c.aff_sid, c.utm_campaign, c.clicked_at
FROM clicks c
JOIN users u ON c.user_id = u.id
WHERE u.username = 'testuser'
ORDER BY c.clicked_at DESC;

SELECT '=== TEST CONVERSIONS ===' as info;
SELECT co.id, co.accesstrade_id, co.merchant_name, co.order_code, co.order_amount, co.commission, co.cashback_amount, co.status, co.order_time
FROM conversions co
JOIN users u ON co.user_id = u.id
WHERE u.username = 'testuser'
ORDER BY co.order_time DESC;

SELECT '=== TEST SYSTEM CONVERSIONS ===' as info;
SELECT sc.id, sc.merchant_name, sc.order_code, sc.order_amount, sc.cashback_amount, sc.status, sc.order_time
FROM system_conversions sc
JOIN users u ON sc.user_id = u.id
WHERE u.username = 'testuser'
ORDER BY sc.order_time DESC;
