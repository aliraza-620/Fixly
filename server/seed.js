import bcrypt from 'bcryptjs';
import db from './db.js';
import { SERVICE_ICONS } from './config.js';

export const DEMO = {
  admin:    { email: 'admin@fixly.pk',    password: 'Admin@12345' },
  customer: { email: 'customer@fixly.pk', password: 'Custom
    er@123' },
  provider: { email: 'ahmed.ali@fixly.pk', password: 'Provider@123' },
};

const PROVIDERS = [
  ['Ahmed Ali',   'ahmed.ali@fixly.pk',   'Electrician',   'Military Road, Sukkur',  5, 4.8, 24],
  ['Usman Khan',  'usman.khan@fixly.pk',  'Electrician',   'Shikarpur Road, Sukkur', 4, 4.6, 17],
  ['Bilal Ahmed', 'bilal.ahmed@fixly.pk', 'Plumber',       'Queens Road, Sukkur',    6, 4.9, 31],
  ['Hassan Raza', 'hassan.raza@fixly.pk', 'Plumber',       'Airport Road, Sukkur',   3, 4.7, 12],
  ['Ali Hassan',  'ali.hassan@fixly.pk',  'AC Technician', 'Barrage Road, Sukkur',   7, 4.9, 38],
  ['Saad Ahmed',  'saad.ahmed@fixly.pk',  'AC Technician', 'Sukkur City',            4, 4.5, 9],
];

export function seedIfEmpty() {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return false;

  const addUser = db.prepare(
    'INSERT INTO users (name,email,phone,password_hash,role) VALUES (?,?,?,?,?)');
  const addProvider = db.prepare(
    `INSERT INTO providers (user_id,name,service,area,experience,fee,rating,rating_count)
     VALUES (?,?,?,?,?,?,?,?)`);

  db.transaction(() => {
    addUser.run('FIXLY Admin', DEMO.admin.email, '03000000000', bcrypt.hashSync(DEMO.admin.password, 10), 'admin');
    addUser.run('Demo Customer', DEMO.customer.email, '03001234567', bcrypt.hashSync(DEMO.customer.password, 10), 'customer');
    const providerHash = bcrypt.hashSync(DEMO.provider.password, 10);
    for (const [name, email, service, area, exp, rating, count] of PROVIDERS) {
      const u = addUser.run(name, email, '03111234567', providerHash, 'provider');
      addProvider.run(u.lastInsertRowid, name, service, area, exp, 500, rating, count);
    }
  })();
  return true;
}

export { SERVICE_ICONS };
