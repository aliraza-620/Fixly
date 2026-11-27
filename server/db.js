import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','provider','admin')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS providers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  service      TEXT NOT NULL,
  area         TEXT NOT NULL,
  experience   INTEGER NOT NULL DEFAULT 0,
  fee          INTEGER NOT NULL DEFAULT 500,
  rating       REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bookings (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  provider_id INTEGER NOT NULL REFERENCES providers(id),
  service     TEXT NOT NULL,
  date        TEXT NOT NULL,
  time        TEXT NOT NULL,
  address     TEXT NOT NULL,
  problem     TEXT NOT NULL,
  fee         INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Pending'
              CHECK (status IN ('Pending','Confirmed','Completed','Cancelled','Rejected')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- A provider can only have one active booking per date + time slot (prevents double booking)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_slot
  ON bookings(provider_id, date, time) WHERE status IN ('Pending','Confirmed');

CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider ON bookings(provider_id);

CREATE TABLE IF NOT EXISTS reviews (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export default db;
