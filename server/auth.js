import jwt from 'jsonwebtoken';
import db from './db.js';
import { JWT_SECRET, IS_PROD } from './config.js';

const COOKIE = 'fixly_token';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role };
}

export function setSession(res, user) {
  const token = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: IS_PROD, maxAge: WEEK_MS, path: '/',
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

// Attach req.user if a valid session cookie exists (always loads fresh from DB)
export function loadUser(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (token) {
    try {
      const { sub } = jwt.verify(token, JWT_SECRET);
      req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(sub) || null;
    } catch { req.user = null; }
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Please log in to continue.'));
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(new HttpError(401, 'Please log in to continue.'));
  if (!roles.includes(req.user.role)) return next(new HttpError(403, 'You do not have permission to do that.'));
  next();
};
