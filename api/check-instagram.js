const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;
const DEFAULT_IG_APP_ID = '936619743392459';

function cookieHeader() {
  const parts = [];
  if (process.env.INSTAGRAM_SESSIONID) parts.push(`sessionid=${process.env.INSTAGRAM_SESSIONID}`);
  if (process.env.INSTAGRAM_CSRFTOKEN) parts.push(`csrftoken=${process.env.INSTAGRAM_CSRFTOKEN}`);
  if (process.env.INSTAGRAM_DS_USER_ID) parts.push(`ds_user_id=${process.env.INSTAGRAM_DS_USER_ID}`);
  return parts.join('; ');
}

function requestHeaders(username, json = false) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': json ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': `https://www.instagram.com/${encodeURIComponent(username)}/`
  };
  if (json) headers['X-IG-App-ID'] = process.env.INSTAGRAM_APP_ID || DEFAULT_IG_APP_ID;
  const cookie = cookieHeader();
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function classifyProfileJson(data, username) {
  const user = data && data.data && data.data.user;
  if (user && typeof user.username === 'string') {
    return {
      status: 'live',
      message: user.is_private ? 'Account exists • Private' : 'Account exists • Active',
      details: { private: Boolean(user.is_private), verified: Boolean(user.is_verified) }
    };
  }
  const message = String((data && (data.message || data.error || data.status)) || '').toLowerCase();
  if (message.includes('not found') || message.includes('user not found')) {
    return { status: 'not_found', message: 'Account not found • Dead' };
  }
  return null;
}

function classifyProfileHtml(html, username) {
  const compact = String(html || '').replace(/\\u0026/g, '&');
  const lower = compact.toLowerCase();
  const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const notFoundSignals = [
    "sorry, this page isn't available",
    'the link you followed may be broken',
    'page not found',
    'user not found'
  ];
  if (notFoundSignals.some(signal => lower.includes(signal))) {
    return { status: 'not_found', message: 'Account not found • Dead' };
  }

  const existsSignals = [
    new RegExp(`"username"\\s*:\\s*"${escaped}"`, 'i'),
    new RegExp(`property=["']og:title["'][^>]+content=["'][^"']*${escaped}`, 'i'),
    new RegExp(`@${escaped}(?:[\\s•|<]|$)`, 'i'),
    /"profilepage_[0-9]+"/i
  ];
  if (existsSignals.some(signal => signal.test(compact))) {
    const isPrivate = /"is_private"\s*:\s*true/i.test(compact);
    return { status: 'live', message: isPrivate ? 'Account exists • Private' : 'Account exists • Active' };
  }

  if (lower.includes('accounts/login') || lower.includes('login • instagram') || lower.includes('challenge_required')) {
    return { status: 'login_required', message: 'Instagram login or verification required' };
  }
  return { status: 'unknown', message: 'Instagram response was inconclusive • Not counted as Dead' };
}

async function readJsonSafely(response) {
  const text = await response.text();
  try { return JSON.parse(text); } catch { return null; }
}

async function checkJsonEndpoint(username, signal) {
  const response = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
    redirect: 'follow', signal, headers: requestHeaders(username, true)
  });
  if (response.status === 404) return { status: 'not_found', message: 'Account not found • Dead', source: 'profile-json' };
  if (response.status === 429) return { status: 'rate_limited', message: 'Instagram rate limit • Retry later', source: 'profile-json' };
  const data = await readJsonSafely(response);
  if (response.ok) {
    const result = classifyProfileJson(data, username);
    if (result) return { ...result, source: 'profile-json' };
  }
  return null;
}

async function checkHtmlEndpoint(username, signal) {
  const response = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
    redirect: 'follow', signal, headers: requestHeaders(username, false)
  });
  if (response.status === 404) return { status: 'not_found', message: 'Account not found • Dead', source: 'profile-page' };
  if (response.status === 429) return { status: 'rate_limited', message: 'Instagram rate limit • Retry later', source: 'profile-page' };
  if (response.status === 401 || response.status === 403) return { status: 'login_required', message: 'Instagram login required', source: 'profile-page' };
  if (!response.ok) return { status: 'error', message: `Instagram returned HTTP ${response.status}`, source: 'profile-page' };
  const html = await response.text();
  return { ...classifyProfileHtml(html, username), source: 'profile-page' };
}

async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const username = String(req.query.username || '').replace(/^@/, '').trim().toLowerCase();
  if (!USERNAME_RE.test(username)) return res.status(400).json({ status: 'error', message: 'Invalid Instagram username' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const jsonResult = await checkJsonEndpoint(username, controller.signal).catch(() => null);
    if (jsonResult && ['live', 'not_found', 'rate_limited'].includes(jsonResult.status)) {
      return res.status(200).json({ username, ...jsonResult });
    }
    const htmlResult = await checkHtmlEndpoint(username, controller.signal);
    return res.status(200).json({ username, ...htmlResult });
  } catch (error) {
    const timedOut = error && error.name === 'AbortError';
    return res.status(200).json({ status: 'error', message: timedOut ? 'Instagram request timed out' : 'Instagram connection failed' });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = handler;
module.exports._test = { classifyProfileJson, classifyProfileHtml };
