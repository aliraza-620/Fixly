import { HttpError } from './auth.js';
import { TIME_SLOTS, TIMEZONE } from './config.js';

export const str = (v, field, { min = 1, max = 200 } = {}) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < min || s.length > max)
    throw new HttpError(400, `${field} must be between ${min} and ${max} characters.`);
  return s;
};

export const email = (v) => {
  const s = str(v, 'Email', { max: 120 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new HttpError(400, 'Please enter a valid email address.');
  return s;
};

export const phone = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!/^03\d{9}$/.test(s)) throw new HttpError(400, 'Phone must be in the format 03XXXXXXXXX.');
  return s;
};

export const password = (v) => {
  if (typeof v !== 'string' || v.length < 8 || v.length > 72)
    throw new HttpError(400, 'Password must be 8-72 characters.');
  return v;
};

export const int = (v, field, { min = -Infinity, max = Infinity } = {}) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${field} is invalid.`);
  return n;
};

// --- date/time helpers (Pakistan time) ---
export const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });

const minutesOfSlot = (slot) => {
  const [, h, m, ap] = slot.match(/^(\d{2}):(\d{2}) (AM|PM)$/);
  return ((Number(h) % 12) + (ap === 'PM' ? 12 : 0)) * 60 + Number(m);
};

const nowMinutes = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date());
  return Number(parts.find(p => p.type === 'hour').value) * 60 + Number(parts.find(p => p.type === 'minute').value);
};

export const isoDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v)))
    throw new HttpError(400, 'Please choose a valid date.');
  return v;
};

export const slotInPast = (date, slot) =>
  date < todayISO() || (date === todayISO() && minutesOfSlot(slot) <= nowMinutes());

export const timeSlot = (v) => {
  if (!TIME_SLOTS.includes(v)) throw new HttpError(400, 'Please choose a valid time slot.');
  return v;
};
