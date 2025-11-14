const crypto = require('crypto');

/**
 * Link Generator Service
 * Generates iSclix/AccessTrade affiliate links with UTM tracking
 *
 * Format: https://go.isclix.com/deep_link/{publisher_id}/{merchant_id}?url={encoded_url}&utm_params
 *
 * Trong đó:
 * - publisher_id: 4790392958945222748 (cố định - ID tài khoản publisher)
 * - merchant_id: Lấy từ merchant.campaign_id trong database (VD: 4751584435713464237)
 * - utm_source: "chatchiu" (cố định)
 * - utm_campaign: "cashback" (cố định)
 * - utm_medium: username của người tạo link (tự động)
 * - utm_content: click ID (tự động)
 */

const ISCLIX_BASE = 'https://go.isclix.com/deep_link';
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
 * @param {string} utmMedium - UTM medium (nhập bởi user)
 * @param {string} utmContent - UTM content (nhập bởi user)
 * @param {Object} extraParams - Additional params (userId, clickId, clickType)
 */
function buildUtmParams(utmMedium, utmContent, extraParams = {}) {
  return {
    utm_source: 'chatchiu',      // Cố định
    utm_campaign: 'cashback',     // Cố định
    utm_medium: utmMedium,        // Nhập theo user (username)
    utm_content: utmContent,      // Nhập theo user (click_id)
    // NEW: Sub parameters for better tracking (less likely to be dropped)
    sub1: extraParams.userId || utmMedium,      // User ID (fallback: username)
    sub2: extraParams.clickId || utmContent,    // Click ID (fallback: utm_content)
    sub3: extraParams.clickType || 'unknown',   // Click type (button/link)
    sub4: 'oneatweb'                            // Cố định
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
 * @param {Object} merchant - Merchant object { campaign_id, deep_link_base }
 *   - campaign_id: Merchant ID từ iSclix (bắt buộc) - VD: 4751584435713464237
 *   - deep_link_base: URL trang chủ merchant (cho click type 'button')
 * @param {string} clickId - Click UUID from database
 * @param {string} clickType - 'button' or 'link'
 * @param {string|null} productUrl - Product URL (required for 'link' type)
 * @param {string} utmMedium - UTM medium (username - tự động)
 * @param {string} utmContent - UTM content (click ID - tự động)
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
function generateAffiliateLink(user, merchant, clickId, clickType, productUrl = null, utmMedium, utmContent) {
  // ========== VALIDATION ==========
  validateInputs(user, merchant, clickId, clickType, productUrl, utmMedium, utmContent);

  // ========== GENERATE TRACKING IDs ==========
  const affSid = generateAffSid(user.id);
  const extraParams = {
    userId: user.id,
    clickId: clickId,
    clickType: clickType
  };
  const utmParams = buildUtmParams(utmMedium, utmContent, extraParams);

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
      utmMedium,
      utmContent,
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
function validateInputs(user, merchant, clickId, clickType, productUrl, utmMedium, utmContent) {
  if (!user?.id || !user?.username) {
    throw new Error('Invalid user object - missing id or username');
  }

  if (!merchant?.campaign_id) {
    throw new Error('Invalid merchant - missing campaign_id (merchant_id)');
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

  if (!utmMedium || typeof utmMedium !== 'string') {
    throw new Error('UTM medium is required and must be a string');
  }

  if (!utmContent || typeof utmContent !== 'string') {
    throw new Error('UTM content is required and must be a string');
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
 * Format: https://go.isclix.com/deep_link/{publisher_id}/{merchant_id}?url={encoded_url}&utm_params
 *
 * Lưu ý:
 * - publisher_id = 4790392958945222748 (cố định)
 * - merchant_id = merchant.campaign_id (từ database - VD: 4751584435713464237)
 * - url parameter phải được encode
 */
function buildAffiliateUrl(merchant, destinationUrl, utmParams, affSid) {
  // Build base path: /deep_link/{publisher_id}/{merchant_id}
  const basePath = `${ISCLIX_BASE}/${ISCLIX_PUBLISHER_ID}/${merchant.campaign_id}`;

  // Build query params - url goes FIRST, then UTM params
  const queryParams = {
    url: destinationUrl,  // Destination URL goes FIRST
    ...utmParams,
    aff_sid: affSid
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
