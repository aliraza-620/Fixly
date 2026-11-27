import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Use an isolated temporary database
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fixly-test-'));
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const { default: app } = await import('../server/app.js');
let server, base;

before(async () => {
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

// tiny client that keeps cookies
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

const future = (days) => new Date(Date.now() + days * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

test('lists seeded providers and filters by service', async () => {
  const api = client();
  const all = await api('GET', '/api/providers');
  assert.equal(all.data.providers.length, 6);
  const plumbers = await api('GET', '/api/providers?service=Plumber');
  assert.ok(plumbers.data.providers.every(p => p.service === 'Plumber'));
});

test('register, login and session', async () => {
  const api = client();
  const bad = await api('POST', '/api/auth/register', { name: 'A', email: 'x', phone: '1', password: '1' });
  assert.equal(bad.status, 400);
  const ok = await api('POST', '/api/auth/register', { name: 'Test User', email: 'T@Example.com', phone: '03001112222', password: 'secret123' });
  assert.equal(ok.status, 201);
  assert.equal((await api('GET', '/api/auth/me')).data.user.email, 't@example.com');
  const dup = await api('POST', '/api/auth/register', { name: 'Test User', email: 't@example.com', phone: '03001112222', password: 'secret123' });
  assert.equal(dup.status, 409);
  assert.equal((await client()('POST', '/api/auth/login', { email: 't@example.com', password: 'wrong' })).status, 401);
});

test('booking requires login, prevents double booking, and enforces ownership', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/api/bookings')).status, 401);

  const a = client(); const b = client();
  await a('POST', '/api/auth/login', { email: 'customer@fixly.pk', password: 'Customer@123' });
  await b('POST', '/api/auth/register', { name: 'Other User', email: 'other@example.com', phone: '03002223333', password: 'secret123' });

  const payload = { providerId: 1, date: future(3), time: '11:00 AM', address: 'Block A, Sukkur', problem: 'Fan not working' };
  const first = await a('POST', '/api/bookings', payload);
  assert.equal(first.status, 201);
  assert.equal(first.data.booking.status, 'Pending');

  const clash = await b('POST', '/api/bookings', payload);
  assert.equal(clash.status, 409);

  const slots = await a('GET', `/api/providers/1/slots?date=${payload.date}`);
  assert.ok(slots.data.unavailable.includes('11:00 AM'));

  // other customer cannot touch it
  assert.equal((await b('PATCH', `/api/bookings/${first.data.booking.id}/status`, { status: 'Cancelled' })).status, 404);
  // customer cannot confirm own booking
  assert.equal((await a('PATCH', `/api/bookings/${first.data.booking.id}/status`, { status: 'Confirmed' })).status, 400);

  // past dates rejected
  assert.equal((await a('POST', '/api/bookings', { ...payload, date: '2020-01-01' })).status, 400);

  // cancelling frees the slot
  assert.equal((await a('PATCH', `/api/bookings/${first.data.booking.id}/status`, { status: 'Cancelled' })).status, 200);
  assert.equal((await b('POST', '/api/bookings', payload)).status, 201);
});

test('provider workflow, review and admin access', async () => {
  const cust = client(); const prov = client(); const admin = client();
  await cust('POST', '/api/auth/login', { email: 'customer@fixly.pk', password: 'Customer@123' });
  await prov('POST', '/api/auth/login', { email: 'bilal.ahmed@fixly.pk', password: 'Provider@123' }); // provider id 3
  await admin('POST', '/api/auth/login', { email: 'admin@fixly.pk', password: 'Admin@12345' });

  const made = await cust('POST', '/api/bookings', { providerId: 3, date: future(5), time: '09:00 AM', address: 'Queens Road house 5', problem: 'Leaking pipe in kitchen' });
  const id = made.data.booking.id;

  assert.equal((await prov('GET', '/api/bookings')).data.bookings.length, 1);
  assert.equal((await cust('POST', `/api/bookings/${id}/review`, { rating: 5 })).status, 400); // not completed yet
  assert.equal((await prov('PATCH', `/api/bookings/${id}/status`, { status: 'Confirmed' })).status, 200);
  assert.equal((await prov('PATCH', `/api/bookings/${id}/status`, { status: 'Completed' })).status, 200);

  const before = (await cust('GET', '/api/providers')).data.providers.find(p => p.id === 3);
  assert.equal((await cust('POST', `/api/bookings/${id}/review`, { rating: 5, comment: 'Great' })).status, 201);
  assert.equal((await cust('POST', `/api/bookings/${id}/review`, { rating: 1 })).status, 409);
  const after = (await cust('GET', '/api/providers')).data.providers.find(p => p.id === 3);
  assert.equal(after.ratingCount, before.ratingCount + 1);

  assert.equal((await cust('GET', '/api/admin/stats')).status, 403);
  const stats = await admin('GET', '/api/admin/stats');
  assert.equal(stats.status, 200);
  assert.ok(stats.data.completed >= 1);

  const created = await admin('POST', '/api/admin/providers', { name: 'New Pro', email: 'newpro@fixly.pk', phone: '03005556666', password: 'secret123', service: 'Plumber', area: 'Sukkur', experience: 2, fee: 700 });
  assert.equal(created.status, 201);
  assert.equal((await admin('PATCH', `/api/admin/providers/${created.data.provider.id}`, { active: false })).data.provider.active, false);
});

test('rejects non-JSON writes and unknown API routes', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(res.status, 415);
  assert.equal((await fetch(base + '/api/nope')).status, 404);
});
