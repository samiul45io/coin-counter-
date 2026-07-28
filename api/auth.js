const { createToken, isAuthenticated, sessionCookie, clearSessionCookie, pinsMatch } = require('../lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({ authenticated: isAuthenticated(req) });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearSessionCookie());
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!pinsMatch(body.pin)) return res.status(401).json({ error: 'Wrong PIN' });
    res.setHeader('Set-Cookie', sessionCookie(createToken()));
    return res.status(200).json({ authenticated: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Authentication configuration error' });
  }
};
