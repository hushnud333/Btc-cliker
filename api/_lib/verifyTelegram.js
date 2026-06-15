// ==========================================================
// Verifies Telegram Web App "initData" using the bot token.
//
// How it works (per Telegram docs):
//  1. initData is a query-string of fields, including a `hash` field.
//  2. Remove `hash`, sort remaining fields alphabetically, join as
//     "key=value" lines with "\n".
//  3. Compute HMAC-SHA256 of that string using a secret key, where
//     secret = HMAC-SHA256("WebAppData", BOT_TOKEN).
//  4. If the resulting hex digest matches the provided `hash`, the
//     data is authentic and was issued recently by Telegram.
//
// Requires environment variable: TELEGRAM_BOT_TOKEN
// ==========================================================

const crypto = require('crypto');

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60; // reject initData older than 24h

/**
 * Verifies a Telegram initData string.
 * @param {string} initData - raw initData string from Telegram.WebApp.initData
 * @returns {{ valid: boolean, user: object|null, reason?: string }}
 */
function verifyTelegramInitData(initData) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return { valid: false, user: null, reason: 'Server missing TELEGRAM_BOT_TOKEN' };
  }
  if (!initData || typeof initData !== 'string') {
    return { valid: false, user: null, reason: 'Missing initData' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    return { valid: false, user: null, reason: 'Missing hash in initData' };
  }
  params.delete('hash');

  // Build the data-check-string: sorted key=value pairs joined by \n
  const dataCheckArr = [];
  for (const [key, value] of [...params.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    dataCheckArr.push(`${key}=${value}`);
  }
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) {
    return { valid: false, user: null, reason: 'Hash mismatch - invalid initData' };
  }

  // Check freshness
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (ageSeconds > MAX_AUTH_AGE_SECONDS) {
    return { valid: false, user: null, reason: 'initData expired' };
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    user = null;
  }

  if (!user || !user.id) {
    return { valid: false, user: null, reason: 'No user in initData' };
  }

  return { valid: true, user };
}

module.exports = { verifyTelegramInitData };
