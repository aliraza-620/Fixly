import { Router } from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { HttpError, requireRole } from '../auth.js';
import { SERVICES } from '../config.js';
import { str, email, phone, password, int } from '../validate.js';
import { shapeProvider } from './providers.js';

const router = Router();
router.use(requireRole('admin'));

router.get('/stats', (_req, res) => {
  const count = (sql) => db.prepare(sql).get().c;
  res.json({
    customers: count("SELECT COUNT(*) c FROM users WHERE role = 'customer'"),
    providers: count('SELECT COUNT(*) c FROM providers WHERE active = 1'),
    bookings: count('SELECT COUNT(*) c FROM bookings'),
    pending: count("SELECT COUNT(*) c FROM bookings WHERE status = 'Pending'"),
    completed: count("SELECT COUNT(*) c FROM bookings WHERE status = 'Completed'"),
    revenue: count("SELECT COALESCE(SUM(fee),0) c FROM bookings WHERE status = 'Completed'"),
  });
});

router.get('/providers', (_req, res) => {
  res.json({ providers: db.prepare('SELECT * FROM providers ORDER BY id').all().map(shapeProvider) });
});

// Create a provider together with their login account
router.post('/providers', (req, res) => {
  const b = req.body ?? {};
  const name = str(b.name, 'Name', { min: 2, max: 80 });
  const mail = email(b.email);
  const tel = phone(b.phone);
  const pass = password(b.password);
  const service = SERVICES.includes(b.service) ? b.service : (() => { throw new HttpError(400, 'Choose a valid service.'); })();
  const area = str(b.area, 'Area', { min: 2, max: 100 });
  const experience = int(b.experience ?? 0, 'Experience', { min: 0, max: 60 });
  const fee = int(b.fee ?? 500, 'Fee', { min: 0, max: 100000 });

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(mail))
    throw new HttpError(409, 'A user with this email already exists.');

  const id = db.transaction(() => {
    const u = db.prepare("INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?,'provider')")
      .run(name, mail, tel, bcrypt.hashSync(pass, 10));
    return db.prepare('INSERT INTO providers (user_id,name,service,area,experience,fee) VALUES (?,?,?,?,?,?)')
      .run(u.lastInsertRowid, name, service, area, experience, fee).lastInsertRowid;
  })();
  res.status(201).json({ provider: shapeProvider(db.prepare('SELECT * FROM providers WHERE id = ?').get(id)) });
});

router.patch('/providers/:id', (req, res) => {
  const id = int(req.params.id, 'Provider');
  const p = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
  if (!p) throw new HttpError(404, 'Provider not found.');
  const b = req.body ?? {};
  const active = b.active === undefined ? p.active : (b.active ? 1 : 0);
  const fee = b.fee === undefined ? p.fee : int(b.fee, 'Fee', { min: 0, max: 100000 });
  db.prepare('UPDATE providers SET active = ?, fee = ? WHERE id = ?').run(active, fee, id);
  res.json({ provider: shapeProvider(db.prepare('SELECT * FROM providers WHERE id = ?').get(id)) });
});

export default router;
