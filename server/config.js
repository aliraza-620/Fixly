import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load .env if present (Node 20.12+ built-in, no dotenv package needed)
try { process.loadEnvFile(path.join(ROOT, '.env')); } catch { /* no .env file - fine */ }

export const IS_PROD = process.env.NODE_ENV === 'production';
export const PORT = Number(process.env.PORT) || 3000;
export const DB_PATH = process.env.DB_PATH || path.join(ROOT, 'data', 'fixly.db');
export const PUBLIC_DIR = path.join(ROOT, 'public');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// JWT secret: from env, otherwise generated once and stored next to the database.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (IS_PROD) throw new Error('JWT_SECRET must be set when NODE_ENV=production');
  const file = path.join(path.dirname(DB_PATH), '.jwt_secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}
export const JWT_SECRET = loadSecret();

export const SERVICES = ['Electrician', 'Plumber', 'AC Technician'];
export const SERVICE_ICONS = { 'Electrician': '⚡', 'Plumber': '🔧', 'AC Technician': '❄️' };
export const TIME_SLOTS = ['09:00 AM', '11:00 AM', '02:00 PM', '04:00 PM', '06:00 PM'];
export const TIMEZONE = 'Asia/Karachi';
