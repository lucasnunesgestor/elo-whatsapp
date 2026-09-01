const crypto = require('crypto');
const db = require('./db');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
const COOKIE_NAME = 'elo_session';

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);
  db.prepare(
    'INSERT INTO admin_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)'
  ).run(hashToken(token), now.toISOString(), expires.toISOString());
  return { token, expires };
}

function destroySession(token) {
  if (!token) return;
  db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hashToken(token));
}

function verifySession(token) {
  if (!token) return false;
  const row = db.prepare('SELECT * FROM admin_sessions WHERE token_hash = ?').get(hashToken(token));
  if (!row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM admin_sessions WHERE token_hash = ?').run(hashToken(token));
    return false;
  }
  return true;
}

function checkPassword(input) {
  const expected = process.env.ADMIN_PASSWORD || '';
  const a = Buffer.from(String(input || ''), 'utf8');
  const b = Buffer.from(expected, 'utf8');
  const maxLen = Math.max(a.length, b.length, 1);
  const aPad = Buffer.concat([a, Buffer.alloc(maxLen - a.length)]);
  const bPad = Buffer.concat([b, Buffer.alloc(maxLen - b.length)]);
  const equalPadded = crypto.timingSafeEqual(aPad, bPad);
  return equalPadded && a.length === b.length && b.length > 0;
}

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (verifySession(token)) return next();
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_TTL_MS,
    path: '/',
  };
}

module.exports = {
  COOKIE_NAME,
  createSession,
  destroySession,
  verifySession,
  checkPassword,
  requireAuth,
  cookieOptions,
};
