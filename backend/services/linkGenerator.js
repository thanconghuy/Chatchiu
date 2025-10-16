const crypto = require('crypto');

/**
 * Link Generator Service
 * Generates iSclix/AccessTrade affiliate links with UTM tracking
 *
 * Format: https://go.isclix.com/deep_link/v6/{publisher_id}/{campaign_id}?utm_params&url={destination}
 *
 * Trong đó:
 * - publisher_id: 4790392958945222748 (cố định - ID tài khoản iSclix)
 * - campaign_id: Lấy từ merchant.offer_id trong database
 */

const ISCLIX_BASE = 'https://go.isclix.com/deep_link/v6';
const ISCLIX_PUBLISHER_ID = '4790392958945222748'; // iSclix Publisher ID (cố định)

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate random hex string
 */
function randomString(length = 5) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Generate unique aff_sid
 * Format: {userId}_{timestamp}_{random}
 */
function generateAffSid(userId) {
  return `${userId}_${Date.now()}_${randomString(5)}`;
}

/**
 * Build UTM parameters object
 */
function buildUtmParams(user, clickId) {
  return {
    utm_source: 'cashback',
    utm_medium: user.username,
    utm_campaign: 'lammmo',
    utm_content: clickId, // For conversion tracking
    sub4: 'oneatweb'
  };
}

/**
 * Build URL query string from params object
 */
function buildQueryString(params) {
  return Object.entries(params)
    .filter(([_, value]) => value != null) // Skip null/undefined
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

// ============================================================================
// MAIN LINK GENERATION
// ============================================================================

/**
 * Generate iSclix affiliate link
 *
 * @param {Object} user - User object { id, username }
 * @param {Object} merchant - Merchant object { offer_id, deep_link_base }
 *   - offer_id: Campaign ID từ iSclix (bắt buộc)
 *   - deep_link_base: URL trang chủ merchant (cho click type 'button')
 * @param {string} clickId - Click UUID from database
 * @param {string} clickType - 'button' or 'link'
 * @param {string|null} productUrl - Product URL (required for 'link' type)
 *
 * @returns {Object} {
 *   affiliateUrl: string,
 *   affSid: string,
 *   utmParams: object,
 *   originalUrl: string,
 *   clickId: string
 * }
 *
 * @throws {Error} If validation fails
 */
function generateAffiliateLink(user, merchant, clickId, clickType, productUrl = null) {
  // ========== VALIDATION ==========
  validateInputs(user, merchant, clickId, clickType, productUrl);

  // ========== GENERATE TRACKING IDs ==========
  const affSid = generateAffSid(user.id);
  const utmParams = buildUtmParams(user, clickId);

  // ========== DETERMINE DESTINATION URL ==========
  const destinationUrl = getDestinationUrl(clickType, merchant, productUrl);

  // ========== BUILD AFFILIATE URL ==========
  const affiliateUrl = buildAffiliateUrl(merchant, destinationUrl, utmParams, affSid);

  // ========== DEBUG LOG ==========
  if (process.env.NODE_ENV === 'development') {
    console.log('🔗 Link Generated:', {
      merchant: merchant.name || merchant.id,
      clickType,
      affSid,
      destinationUrl: destinationUrl.substring(0, 50) + '...',
      affiliateUrl: affiliateUrl.substring(0, 100) + '...'
    });
  }

  return {
    affiliateUrl,
    affSid,
    utmParams,
    originalUrl: destinationUrl,
    clickId
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate all inputs
 * @throws {Error} If validation fails
 */
function validateInputs(user, merchant, clickId, clickType, productUrl) {
  if (!user?.id || !user?.username) {
    throw new Error('Invalid user object - missing id or username');
  }

  if (!merchant?.offer_id) {
    throw new Error('Invalid merchant - missing offer_id (campaign_id)');
  }

  if (!clickId) {
    throw new Error('Click ID is required');
  }

  if (!['button', 'link'].includes(clickType)) {
    throw new Error(`Invalid click type: ${clickType}. Must be 'button' or 'link'`);
  }

  if (clickType === 'link' && !productUrl) {
    throw new Error('Product URL required for click type "link"');
  }
}

/**
 * Get destination URL based on click type
 */
function getDestinationUrl(clickType, merchant, productUrl) {
  if (clickType === 'button') {
    // Homepage shopping - use merchant's deep link base
    return merchant.deep_link_base || `https://${merchant.id}.vn`;
  } else {
    // Product link - use provided URL
    return productUrl;
  }
}

/**
 * Build iSclix affiliate URL with correct format
 * Format: https://go.isclix.com/deep_link/v6/{publisher_id}/{campaign_id}?utm_params&url={destination}
 *
 * Lưu ý:
 * - publisher_id = 4790392958945222748 (cố định)
 * - campaign_id = merchant.offer_id (từ database)
 */
function buildAffiliateUrl(merchant, destinationUrl, utmParams, affSid) {
  // Build base path: /deep_link/v6/{publisher_id}/{campaign_id}
  const basePath = `${ISCLIX_BASE}/${ISCLIX_PUBLISHER_ID}/${merchant.offer_id}`;

  // Build query params
  const queryParams = {
    ...utmParams,
    aff_sid: affSid,
    url: destinationUrl  // Destination URL goes LAST
  };

  const queryString = buildQueryString(queryParams);

  return `${basePath}?${queryString}`;
}

// ============================================================================
// URL VALIDATION
// ============================================================================

/**
 * Validate product URL belongs to merchant domain
 *
 * @param {string} productUrl - URL to validate
 * @param {string} merchantDomain - Expected domain (e.g., 'lazada.vn')
 * @returns {boolean} True if URL is from merchant domain
 */
function validateProductUrl(productUrl, merchantDomain) {
  try {
    const url = new URL(productUrl);
    const urlDomain = url.hostname.toLowerCase().replace(/^www\./, '');
    const expectedDomain = merchantDomain.toLowerCase().replace(/^www\./, '');

    // Check if domains match (exact or subdomain)
    return urlDomain === expectedDomain || urlDomain.endsWith(`.${expectedDomain}`);
  } catch (error) {
    console.error('Invalid URL:', productUrl, error.message);
    return false;
  }
}

/**
 * Extract domain from URL
 *
 * @param {string} url - URL to extract domain from
 * @returns {string|null} Domain or null if invalid
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  generateAffiliateLink,
  generateAffSid,
  buildUtmParams,
  validateProductUrl,
  extractDomain,
  randomString,
  buildQueryString
};
