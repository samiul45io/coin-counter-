const crypto = require('crypto');

const COOKIE_NAME = 'yasmin_checker_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

function getSecret() {
  return process.env.AUTH_SECRET || 'change-this-auth-secret-before-public-use';
}

function getConfiguredPin() {
  const pin = process.env.APP_PIN || '2580';
  if (!/^\d{4,6}$/.test(pin)) throw new Error('APP_PIN must contain 4 to 6 digits.');
  return pin;
}

function parseCookies(header = '') {
  return header.split(';').reduce((cookies, item) => {
    const separator = item.indexOf('=');
    if (separator < 0) return cookies;
    cookies[item.slice(0, separator).trim()] = decodeURIComponent(item.slice(separator + 1).trim());
    return cookies;
  }, {});
}

function sign(value) {
  return crypto.createHmac('sha256', getSecret()).update(value).digest('base64url');
}

function createToken() {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${expiresAt}.${crypto.randomBytes(18).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload);
  const actual = parts[2];
  if (expected.length !== actual.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return false;
  return Number(parts[0]) > Date.now();
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return verifyToken(cookies[COOKIE_NAME]);
}

function sessionCookie(token) {
  const secure = process.env.VERCEL_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.VERCEL_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function pinsMatch(candidate) {
  const expected = Buffer.from(getConfiguredPin());
  const actual = Buffer.from(String(candidate || ''));
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { createToken, isAuthenticated, sessionCookie, clearSessionCookie, pinsMatch, getConfiguredPin };
