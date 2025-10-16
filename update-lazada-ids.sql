-- Update Lazada merchant with correct campaign_id and offer_id
-- Based on the example: https://go.isclix.com/deep_link/v5/4790392958945222748/5127144557053758578

UPDATE merchants
SET
  campaign_id = '4790392958945222748',  -- Campaign ID chung (shared)
  offer_id = '5127144557053758578'       -- Lazada's specific offer ID
WHERE id = 'lazada';

-- Verify the update
SELECT id, name, campaign_id, offer_id, deep_link_base
FROM merchants
WHERE id = 'lazada';
