const crypto = require('crypto');

/**
 * Link Generator Service
 * Generates affiliate links with UTM tracking
 */

const DEEP_LINK_BASE = process.env.DEEP_LINK_BASE || 'https://go.isclix.com/deep_link/v6';

/**
 * Generate random string
 * @param {number} length
 * @returns {string}
 */
function randomString(length = 5) {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

/**
 * Generate unique aff_sid
 * Format: {userId}_{timestamp}_{random}
 * @param {string} userId
 * @returns {string}
 */
function generateAffSid(userId) {
  const timestamp = Date.now();
  const random = randomString(5);
  return `${userId}_${timestamp}_${random}`;
}

/**
 * Build UTM parameters
 * @param {Object} user
 * @param {string} clickId - Click ID from database
 * @returns {Object} UTM parameters
 */
function buildUtmParams(user, clickId) {
  return {
    utm_source: 'cashback',
    utm_medium: user.username, // Username của user
    utm_campaign: 'lammmo',
    utm_content: clickId, // Click ID để track conversion
    sub4: 'oneatweb'
  };
}

/**
 * Encode URL to base64
 * @param {string} url
 * @returns {string}
 */
function encodeUrl(url) {
  return Buffer.from(url).toString('base64');
}

/**
 * Build query string from params
 * @param {Object} params
 * @returns {string}
 */
function buildQueryString(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

/**
 * Generate affiliate link (NEW: requires clickId)
 * @param {Object} user - User object
 * @param {Object} merchant - Merchant object
 * @param {string} clickId - Click ID from database
 * @param {string} clickType - 'button' or 'link'
 * @param {string|null} productUrl - Product URL (for clickType='link')
 * @returns {Object} {affiliateUrl, affSid, utmParams}
 */
function generateAffiliateLink(user, merchant, clickId, clickType, productUrl = null) {
  // Validate inputs
  if (!user || !user.id || !user.username) {
    throw new Error('Invalid user object');
  }

  if (!merchant || !merchant.campaign_id) {
    throw new Error('Invalid merchant object or missing campaign_id');
  }

  if (!clickId) {
    throw new Error('Click ID is required');
  }

  if (!['button', 'link'].includes(clickType)) {
    throw new Error('Invalid click type. Must be "button" or "link"');
  }

  if (clickType === 'link' && !productUrl) {
    throw new Error('Product URL required for click type "link"');
  }

  // Generate unique aff_sid (vẫn giữ để fallback tracking)
  const affSid = generateAffSid(user.id);

  // Build UTM parameters with clickId as utm_content
  const utmParams = buildUtmParams(user, clickId);

  // Determine destination URL
  let destinationUrl;

  if (clickType === 'button') {
    // For button type, use merchant homepage (deep_link_base)
    destinationUrl = merchant.deep_link_base || merchant.website_url;
  } else {
    // For link type, use provided product URL
    destinationUrl = productUrl;
  }

  // Build deep link with format:
  // https://go.isclix.com/deep_link/{campaign_id}?url={encoded_url}&utm_params&aff_sid
  let affiliateUrl = `https://go.isclix.com/deep_link/${merchant.campaign_id}`;

  // Build query parameters
  const allParams = {
    url: encodeURIComponent(destinationUrl),
    ...utmParams,
    aff_sid: affSid
  };

  // Append query string
  const queryString = buildQueryString(allParams);
  affiliateUrl += `?${queryString}`;

  return {
    affiliateUrl,
    affSid,
    utmParams,
    originalUrl: destinationUrl,
    clickId
  };
}

/**
 * Validate product URL belongs to merchant
 * @param {string} productUrl
 * @param {string} merchantDomain
 * @returns {boolean}
 */
function validateProductUrl(productUrl, merchantDomain) {
  try {
    const url = new URL(productUrl);
    const domain = url.hostname.toLowerCase();

    // Remove 'www.' prefix
    const cleanDomain = domain.replace(/^www\./, '');
    const cleanMerchantDomain = merchantDomain.toLowerCase().replace(/^www\./, '');

    return cleanDomain.includes(cleanMerchantDomain) || cleanMerchantDomain.includes(cleanDomain);
  } catch (error) {
    return false;
  }
}

/**
 * Extract domain from URL
 * @param {string} url
 * @returns {string|null}
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (error) {
    return null;
  }
}

module.exports = {
  generateAffiliateLink,
  generateAffSid,
  buildUtmParams,
  validateProductUrl,
  extractDomain,
  encodeUrl,
  randomString
};
