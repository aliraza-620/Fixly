import { Router } from 'express';
import db from '../db.js';
import { HttpError } from '../auth.js';
import { SERVICES, SERVICE_ICONS, TIME_SLOTS } from '../config.js';
import { int, isoDate, slotInPast } from '../validate.js';

const router = Router();

export const shapeProvider = (p) => ({
  id: p.id, name: p.name, service: p.service, area: p.area,
  experience: p.experience, fee: p.fee,
  rating: Math.round(p.rating * 10) / 10, ratingCount: p.rating_count,
  icon: SERVICE_ICONS[p.service] ?? '🛠️', active: !!p.active,
});

router.get('/services', (_req, res) => res.json({ services: SERVICES, timeSlots: TIME_SLOTS }));

router.get('/providers', (req, res) => {
  const { service, q } = req.query;
  let sql = 'SELECT * FROM providers WHERE active = 1';
  const args = [];
  if (service && service !== 'All') { sql += ' AND service = ?'; args.push(String(service)); }
  if (q) {
    sql += ' AND (name LIKE ? OR service LIKE ? OR area LIKE ?)';
    const like = `%${String(q).slice(0, 60)}%`;
    args.push(like, like, like);
  }
  sql += ' ORDER BY rating DESC, rating_count DESC';
  res.json({ providers: db.prepare(sql).all(...args).map(shapeProvider) });
});

// Which time slots are not available for a provider on a date?
router.get('/providers/:id/slots', (req, res) => {
  const id = int(req.params.id, 'Provider');
  const date = isoDate(req.query.date);
  if (!db.prepare('SELECT 1 FROM providers WHERE id = ? AND active = 1').get(id))
    throw new HttpError(404, 'Provider not found.');
  const taken = db.prepare(
    "SELECT time FROM bookings WHERE provider_id = ? AND date = ? AND status IN ('Pending','Confirmed')"
  ).all(id, date).map(r => r.time);
  const unavailable = TIME_SLOTS.filter(s => taken.includes(s) || slotInPast(date, s));
  res.json({ unavailable });
});

export default router;
