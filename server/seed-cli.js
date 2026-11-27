import fs from 'node:fs';
import { DB_PATH } from './config.js';

if (process.argv.includes('--reset')) {
  for (const f of [DB_PATH, DB_PATH + '-wal', DB_PATH + '-shm']) fs.rmSync(f, { force: true });
  console.log('Database deleted.');
}
const { seedIfEmpty, DEMO } = await import('./seed.js');
console.log(seedIfEmpty() ? 'Database seeded with demo data.' : 'Database already has data - nothing seeded (use `npm run reset-db` to start over).');
console.log('Demo logins:', DEMO);
