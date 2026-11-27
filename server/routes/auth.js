import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import db from '../db.js';
import { HttpError, publicUser, setSession, clearSession, requireAuth } from '../auth.js';
import { str, email, phone, password } from '../validate.js';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 1000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

router.post('/register', limiter, (req, res) => {
  const b = req.body ?? {};
  const name = str(b.name, 'Name', { min: 2, max: 80 });
  const mail = email(b.email);
  const tel = phone(b.phone);
  const pass = password(b.password);

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail))
    throw new HttpError(409, 'An account with this email already exists.');

  const info = db.prepare(
    "INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?,'customer')"
  ).run(name, mail, tel, bcrypt.hashSync(pass, 10));
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  setSession(res, user);
  res.status(201).json({ user: publicUser(user) });
});

router.post('/login', limiter, (req, res) => {
  const mail = String(req.body?.email ?? '').trim().toLowerCase();
  const pass = String(req.body?.password ?? '');
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(mail);
  // Same error for unknown email and wrong password
  if (!user || !bcrypt.compareSync(pass, user.password_hash))
    throw new HttpError(401, 'Incorrect email or password.');
  setSession(res, user);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

router.get('/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

export default router;
