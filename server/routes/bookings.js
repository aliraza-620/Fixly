import { Router } from 'express';
import db from '../db.js';
import { HttpError, requireAuth, requireRole } from '../auth.js';
import { str, int, isoDate, timeSlot, slotInPast } from '../validate.js';

const router = Router();
router.use(requireAuth);

const SELECT = `
  SELECT b.*, p.name AS provider_name, p.area AS provider_area,
         u.name AS customer_name, u.phone AS customer_phone,
         r.rating AS review_rating, r.comment AS review_comment
  FROM bookings b
  JOIN providers p ON p.id = b.provider_id
  JOIN users u ON u.id = b.user_id
  LEFT JOIN reviews r ON r.booking_id = b.id`;

const shape = (b) => ({
  id: b.id, service: b.service, date: b.date, time: b.time, address: b.address,
  problem: b.problem, fee: b.fee, status: b.status, createdAt: b.created_at,
  provider: { id: b.provider_id, name: b.provider_name, area: b.provider_area },
  customer: { id: b.user_id, name: b.customer_name, phone: b.customer_phone },
  review: b.review_rating ? { rating: b.review_rating, comment: b.review_comment } : null,
});

const newId = () => 'FX-' + Math.random().toString(36).slice(2, 8).toUpperCase();

function providerIdOf(user) {
  return db.prepare('SELECT id FROM providers WHERE user_id = ?').get(user.id)?.id ?? -1;
}

// List bookings relevant to the logged-in user
router.get('/', (req, res) => {
  const { role } = req.user;
  let rows;
  if (role === 'admin') rows = db.prepare(`${SELECT} ORDER BY b.date DESC, b.created_at DESC`).all();
  else if (role === 'provider')
    rows = db.prepare(`${SELECT} WHERE b.provider_id = ? ORDER BY b.date DESC, b.created_at DESC`).all(providerIdOf(req.user));
  else rows = db.prepare(`${SELECT} WHERE b.user_id = ? ORDER BY b.created_at DESC`).all(req.user.id);
  res.json({ bookings: rows.map(shape) });
});

// Create a booking (customers only)
router.post('/', requireRole('customer'), (req, res) => {
  const b = req.body ?? {};
  const providerId = int(b.providerId, 'Provider');
  const date = isoDate(b.date);
  const time = timeSlot(b.time);
  const address = str(b.address, 'Address', { min: 5, max: 200 });
  const problem = str(b.problem, 'Problem description', { min: 5, max: 1000 });

  const provider = db.prepare('SELECT * FROM providers WHERE id = ? AND active = 1').get(providerId);
  if (!provider) throw new HttpError(404, 'That provider is not available.');
  if (slotInPast(date, time)) throw new HttpError(400, 'Please choose a time in the future.');

  const id = newId();
  try {
    db.prepare(`INSERT INTO bookings (id,user_id,provider_id,service,date,time,address,problem,fee)
                VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, req.user.id, provider.id, provider.service, date, time, address, problem, provider.fee);
  } catch (e) {
    if (String(e.code).startsWith('SQLITE_CONSTRAINT')) throw new HttpError(409, 'That time slot was just taken. Please pick another.');
    throw e;
  }
  res.status(201).json({ booking: shape(db.prepare(`${SELECT} WHERE b.id = ?`).get(id)) });
});

// Allowed status transitions per role
const TRANSITIONS = {
  customer: { Pending: ['Cancelled'], Confirmed: ['Cancelled'] },
  provider: { Pending: ['Confirmed', 'Rejected'], Confirmed: ['Completed', 'Cancelled'] },
  admin:    { Pending: ['Confirmed', 'Rejected', 'Cancelled'], Confirmed: ['Completed', 'Cancelled'] },
};

router.patch('/:id/status', (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  const { role } = req.user;
  const owns =
    role === 'admin' ||
    (role === 'customer' && booking?.user_id === req.user.id) ||
    (role === 'provider' && booking?.provider_id === providerIdOf(req.user));
  if (!booking || !owns) throw new HttpError(404, 'Booking not found.');

  const next = String(req.body?.status ?? '');
  if (!(TRANSITIONS[role][booking.status] ?? []).includes(next))
    throw new HttpError(400, `A ${booking.status.toLowerCase()} booking cannot be changed to ${next}.`);

  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(next, booking.id);
  res.json({ booking: shape(db.prepare(`${SELECT} WHERE b.id = ?`).get(booking.id)) });
});

// Rate a completed booking (customer, once)
router.post('/:id/review', requireRole('customer'), (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!booking) throw new HttpError(404, 'Booking not found.');
  if (booking.status !== 'Completed') throw new HttpError(400, 'You can only rate completed jobs.');
  const rating = int(req.body?.rating, 'Rating', { min: 1, max: 5 });
  const comment = typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 500) : '';

  db.transaction(() => {
    const inserted = db.prepare('INSERT OR IGNORE INTO reviews (booking_id,rating,comment) VALUES (?,?,?)')
      .run(booking.id, rating, comment);
    if (!inserted.changes) throw new HttpError(409, 'You already rated this booking.');
    // running average
    db.prepare(`UPDATE providers
                SET rating = (rating * rating_count + ?) / (rating_count + 1), rating_count = rating_count + 1
                WHERE id = ?`).run(rating, booking.provider_id);
  })();
  res.status(201).json({ booking: shape(db.prepare(`${SELECT} WHERE b.id = ?`).get(booking.id)) });
});

export default router;
