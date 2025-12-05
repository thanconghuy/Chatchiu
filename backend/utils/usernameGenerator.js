const { pool } = require('../config/database');

/**
 * Generate a unique, user-friendly username from email or full name
 * @param {string} email - User's email
 * @param {string} fullName - User's full name
 * @returns {Promise<string>} Unique username
 */
async function generateUniqueUsername(email, fullName) {
  // Extract base from email (before @)
  let base = email.split('@')[0];

  // Clean: remove numbers, special chars, convert to lowercase
  base = base.replace(/[^a-zA-Z]/g, '').toLowerCase();

  // If base is too short or empty, use full name
  if (!base || base.length < 3) {
    // Convert "Võ Thanh Phong" -> "vothanhphong"
    base = fullName
      .toLowerCase()
      .normalize('NFD')                    // Decompose accents
      .replace(/[\u0300-\u036f]/g, '')    // Remove accent marks
      .replace(/đ/g, 'd')                 // Vietnamese đ -> d
      .replace(/[^a-z]/g, '')             // Remove non-letters
      .trim();
  }

  // Ensure minimum length
  if (base.length < 3) {
    base = 'user' + base;
  }

  // Max length 20 chars
  if (base.length > 20) {
    base = base.substring(0, 20);
  }

  // Try base username first
  let username = base;
  let isAvailable = await checkUsernameAvailable(username);

  if (isAvailable) {
    return username;
  }

  // If taken, try with year suffix: "vothanhphong2024"
  const year = new Date().getFullYear();
  username = base + year;
  isAvailable = await checkUsernameAvailable(username);

  if (isAvailable) {
    return username;
  }

  // If still taken, try with incremental numbers: "vothanhphong1", "vothanhphong2"
  for (let i = 1; i <= 999; i++) {
    username = base + i;
    isAvailable = await checkUsernameAvailable(username);

    if (isAvailable) {
      return username;
    }
  }

  // Last resort: add random suffix (but prettier than current)
  const randomSuffix = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return base + randomSuffix;
}

/**
 * Check if username is available
 * @param {string} username
 * @returns {Promise<boolean>}
 */
async function checkUsernameAvailable(username) {
  const query = 'SELECT id FROM users WHERE username = $1';
  const result = await pool.query(query, [username]);
  return result.rows.length === 0;
}

/**
 * Suggest alternative usernames
 * @param {string} email
 * @param {string} fullName
 * @returns {Promise<string[]>} Array of 5 suggestions
 */
async function suggestUsernames(email, fullName) {
  const base = await generateUniqueUsername(email, fullName);
  const suggestions = [base];

  // Add variations
  const year = new Date().getFullYear();
  const variations = [
    base + year,
    base + '_official',
    base + '_vn',
    fullName.split(' ')[0].toLowerCase() + base.substring(0, 5)
  ];

  for (const variant of variations) {
    const isAvailable = await checkUsernameAvailable(variant);
    if (isAvailable && !suggestions.includes(variant)) {
      suggestions.push(variant);
    }

    if (suggestions.length >= 5) break;
  }

  return suggestions;
}

module.exports = {
  generateUniqueUsername,
  checkUsernameAvailable,
  suggestUsernames
};
