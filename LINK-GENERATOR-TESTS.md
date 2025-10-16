# Link Generator - Test Cases & Examples

## 📋 Overview

Test cases for `linkGenerator.js` to verify correct affiliate link generation.

---

## ✅ Test Case 1: Shopee Button Click (Homepage Shopping)

### Input
```js
const user = {
  id: '8c1c7674-036c-47ee-b9b0-12345abcde',
  username: 'conghuynt'
};

const merchant = {
  id: 'shopee',
  name: 'Shopee',
  campaign_id: '4790392958945222748',
  offer_id: '4751584435713464237',
  deep_link_base: 'https://shope.ee/'
};

const clickId = 'a12b1699-3596-4e48-887f-abcdef123456';
const clickType = 'button';
```

### Expected Output
```js
{
  affiliateUrl: 'https://go.isclix.com/deep_link/4790392958945222748/4751584435713464237?utm_source=cashback&utm_medium=conghuynt&utm_campaign=lammmo&utm_content=a12b1699-3596-4e48-887f-abcdef123456&sub4=oneatweb&aff_sid={userId}_{timestamp}_{random}&url=https%3A%2F%2Fshope.ee%2F',

  affSid: '8c1c7674-036c-47ee-b9b0-12345abcde_1760615821594_6e01f',

  utmParams: {
    utm_source: 'cashback',
    utm_medium: 'conghuynt',
    utm_campaign: 'lammmo',
    utm_content: 'a12b1699-3596-4e48-887f-abcdef123456',
    sub4: 'oneatweb'
  },

  originalUrl: 'https://shope.ee/',
  clickId: 'a12b1699-3596-4e48-887f-abcdef123456'
}
```

### Link Format Breakdown
```
https://go.isclix.com/deep_link/{campaign_id}/{offer_id}?
  utm_source=cashback&
  utm_medium=conghuynt&
  utm_campaign=lammmo&
  utm_content={click_id}&
  sub4=oneatweb&
  aff_sid={user_id}_{timestamp}_{random}&
  url={destination_url}
```

---

## ✅ Test Case 2: Lazada Product Link

### Input
```js
const user = {
  id: '8c1c7674-036c-47ee-b9b0-12345abcde',
  username: 'conghuynt'
};

const merchant = {
  id: 'lazada',
  name: 'Lazada',
  campaign_id: '4790392958945222748',
  offer_id: '5127144557053758578',
  deep_link_base: 'https://www.lazada.vn/'
};

const clickId = 'ce5c7c02-80c4-415d-a27a-9aff95939420';
const clickType = 'link';
const productUrl = 'https://www.lazada.vn/products/iphone-15-pro-max-256gb-i123456789.html';
```

### Expected Output
```js
{
  affiliateUrl: 'https://go.isclix.com/deep_link/4790392958945222748/5127144557053758578?utm_source=cashback&utm_medium=conghuynt&utm_campaign=lammmo&utm_content=ce5c7c02-80c4-415d-a27a-9aff95939420&sub4=oneatweb&aff_sid=8c1c7674-036c-47ee-b9b0-12345abcde_1760615900000_abc12&url=https%3A%2F%2Fwww.lazada.vn%2Fproducts%2Fiphone-15-pro-max-256gb-i123456789.html',

  affSid: '8c1c7674-036c-47ee-b9b0-12345abcde_1760615900000_abc12',

  utmParams: {
    utm_source: 'cashback',
    utm_medium: 'conghuynt',
    utm_campaign: 'lammmo',
    utm_content: 'ce5c7c02-80c4-415d-a27a-9aff95939420',
    sub4: 'oneatweb'
  },

  originalUrl: 'https://www.lazada.vn/products/iphone-15-pro-max-256gb-i123456789.html',
  clickId: 'ce5c7c02-80c4-415d-a27a-9aff95939420'
}
```

---

## ❌ Test Case 3: Invalid Product URL (Wrong Domain)

### Input
```js
const merchant = {
  id: 'shopee',
  name: 'Shopee',
  // ... other fields
};

const clickType = 'link';
const productUrl = 'https://www.lazada.vn/products/...'; // WRONG! Should be Shopee
```

### Expected Behavior
```js
// Should throw error in dashboard.js route validation:
throw new Error('Product URL must be from Shopee website');

// OR use validateProductUrl():
const isValid = validateProductUrl(productUrl, 'shopee.vn');
// Returns: false
```

---

## ❌ Test Case 4: Missing Merchant IDs

### Input
```js
const merchant = {
  id: 'tiki',
  name: 'Tiki',
  campaign_id: null,  // ❌ Missing
  offer_id: null      // ❌ Missing
};
```

### Expected Behavior
```js
// Should throw error in validateInputs():
throw new Error('Invalid merchant - missing campaign_id');
// or
throw new Error('Invalid merchant - missing offer_id');
```

---

## 🔍 Debug Logging

Enable development mode to see debug logs:

```bash
# .env file
NODE_ENV=development
```

### Console Output Example
```
🔗 Link Generated: {
  merchant: 'Lazada',
  clickType: 'link',
  affSid: '8c1c7674-036c-47ee-b9b0-12345abcde_1760615900000_abc12',
  destinationUrl: 'https://www.lazada.vn/products/iphone-15-pr...',
  affiliateUrl: 'https://go.isclix.com/deep_link/479039295894...'
}
```

---

## 🧪 Manual Testing Steps

### Step 1: Update Database
```bash
psql -U postgres -d cashback_db -f update-lazada-ids.sql
```

### Step 2: Restart Backend
```bash
cd backend
npm start
```

### Step 3: Test in Browser

1. Login as user
2. Go to Dashboard
3. Click "Lazada" merchant
4. Test **Button Click**:
   - Click "Đi đến Lazada"
   - Check generated link format
   - Verify clicks table in database

5. Test **Product Link**:
   - Enter: `https://www.lazada.vn/products/test-product-123.html`
   - Click "Tạo link mua hàng"
   - Check generated link format

### Step 4: Verify in Database

```sql
-- Check latest click
SELECT
  id,
  merchant_id,
  aff_sid,
  click_type,
  original_url,
  affiliate_url,
  utm_content,
  clicked_at
FROM clicks
ORDER BY clicked_at DESC
LIMIT 1;

-- Check if affiliate_url has correct format
SELECT
  CASE
    WHEN affiliate_url LIKE 'https://go.isclix.com/deep_link/4790392958945222748/%'
    THEN 'CORRECT'
    ELSE 'WRONG'
  END as url_format_check,
  affiliate_url
FROM clicks
WHERE merchant_id = 'lazada'
ORDER BY clicked_at DESC
LIMIT 1;
```

---

## 📊 Validation Checklist

- [ ] Affiliate URL starts with `https://go.isclix.com/deep_link/`
- [ ] Contains campaign_id: `4790392958945222748`
- [ ] Contains correct offer_id (merchant-specific)
- [ ] UTM parameters are present and correct
- [ ] `aff_sid` follows format: `{userId}_{timestamp}_{random}`
- [ ] `utm_content` equals `clickId` (for tracking)
- [ ] Destination URL is properly encoded
- [ ] Product URL validation works (rejects wrong domains)
- [ ] Clicks are saved to database successfully
- [ ] No NULL constraint errors on `aff_sid`

---

## 🐛 Common Issues

### Issue: "Invalid merchant - missing offer_id"
**Solution**: Run `update-lazada-ids.sql` to populate offer_id

### Issue: "null value in column aff_sid"
**Solution**: Run `fix-clicks-aff-sid.sql` to allow NULL aff_sid

### Issue: Link format wrong (missing offer_id in path)
**Solution**: Verify merchant has both campaign_id and offer_id set

### Issue: URL validation too strict
**Solution**: Check `validateProductUrl()` logic - should handle www/non-www variants

---

## 📚 Reference Links

- iSclix Deep Link Format: `https://go.isclix.com/deep_link/{campaign_id}/{offer_id}?params`
- AccessTrade API Docs: https://developers.accesstrade.vn/
- Example Link: https://go.isclix.com/deep_link/v5/4790392958945222748/5127144557053758578

---

**Last Updated**: 2025-01-16
