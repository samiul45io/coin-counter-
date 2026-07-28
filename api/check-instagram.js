const { isAuthenticated } = require('../lib/auth');

const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

function classifyHtml(html, username) {
  const compact = html.replace(/\\u0026/g, '&');
  const lower = compact.toLowerCase();

  if (lower.includes("sorry, this page isn't available") || lower.includes('page not found')) {
    return { status: 'not_found', message: 'Profile not found' };
  }

  const livePatterns = [
    /"is_live"\s*:\s*true/i,
    /"is_live_broadcast"\s*:\s*true/i,
    /"broadcast_status"\s*:\s*"active"/i,
    /"live_broadcast_id"\s*:\s*"[^"\\]+"/i,
    /"broadcast_id"\s*:\s*"[^"\\]+"/i
  ];
  if (livePatterns.some(pattern => pattern.test(compact))) {
    return { status: 'live', message: 'Live broadcast detected' };
  }

  const usernamePattern = new RegExp(`"username"\\s*:\\s*"${username.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}"`, 'i');
  const hasProfilePayload = usernamePattern.test(compact) || lower.includes(`<title>${username.toLowerCase()}`) || lower.includes(`@${username.toLowerCase()}`);
  const privateProfile = /"is_private"\s*:\s*true/i.test(compact);

  if (privateProfile) return { status: 'private', message: 'Private profile — not live' };
  if (hasProfilePayload) return { status: 'offline', message: 'Profile found — not live' };

  if (lower.includes('login • instagram') || lower.includes('accounts/login') || lower.includes('challenge_required')) {
    return { status: 'login_required', message: 'Instagram login or verification required' };
  }

  return { status: 'unknown', message: 'Instagram did not return a readable profile status' };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (!isAuthenticated(req)) return res.status(401).json({ status: 'error', message: 'App authentication required' });
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  const username = String(req.query.username || '').replace(/^@/, '').trim();
  if (!USERNAME_RE.test(username)) return res.status(400).json({ status: 'error', message: 'Invalid username' });

  const cookie = process.env.INSTAGRAM_SESSIONID ? `sessionid=${process.env.INSTAGRAM_SESSIONID};` : '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': cookie
      }
    });

    if (response.status === 404) return res.status(200).json({ status: 'not_found', message: 'Profile not found' });
    if (response.status === 429) return res.status(200).json({ status: 'rate_limited', message: 'Instagram rate limit — retry later' });
    if (response.status === 401 || response.status === 403) return res.status(200).json({ status: 'login_required', message: 'Instagram login required' });
    if (!response.ok) return res.status(200).json({ status: 'error', message: `Instagram returned HTTP ${response.status}` });

    const html = await response.text();
    return res.status(200).json({ username, ...classifyHtml(html, username) });
  } catch (error) {
    const timedOut = error && error.name === 'AbortError';
    return res.status(200).json({ status: 'error', message: timedOut ? 'Instagram request timed out' : 'Instagram request failed' });
  } finally {
    clearTimeout(timeout);
  }
};
