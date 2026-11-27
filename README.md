# FIXLY — Home Services in Sukkur (Full-Stack)

A full-stack version of the FIXLY prototype: customers find electricians, plumbers and AC technicians, book a time slot, and track the job. Providers accept and complete jobs. An admin manages the platform.

**Tech stack** (chosen so the whole project runs with one command and no separate database server):

| Layer    | Technology |
|----------|------------|
| Frontend | Your original HTML/CSS design + vanilla JavaScript (ES modules) |
| Backend  | Node.js + Express 5 (REST JSON API) |
| Database | SQLite (single file, via `better-sqlite3`) |
| Auth     | bcrypt password hashing, JWT in an httpOnly cookie, role-based access |
| Security | helmet (CSP), rate-limited login, input validation, XSS-safe rendering |

---

## 1. Quick start

**Requirements:** [Node.js](https://nodejs.org) **version 22 or newer** (check with `node -v`). Nothing else.

```bash
cd fixly
npm install        # installs dependencies (once)
npm start          # starts the server
```

Open **http://localhost:3000** in your browser. That's it — the database file is created and filled with demo data automatically on first run.

To stop the server press `Ctrl + C`.

### Demo accounts

| Role     | Email                 | Password       | What they can do |
|----------|-----------------------|----------------|------------------|
| Customer | `customer@fixly.pk`   | `Customer@123` | Book, cancel, rate completed jobs |
| Provider | `ahmed.ali@fixly.pk`  | `Provider@123` | Accept / decline / complete their jobs (all 6 providers use this same password, e.g. `bilal.ahmed@fixly.pk`) |
| Admin    | `admin@fixly.pk`      | `Admin@12345`  | See all bookings, stats, add or hide providers |

You can also click **Log in → Sign up** to create your own customer account.

> These are demo passwords for development. Change them (or delete the seed users) before putting the site on the internet.

### Try the full flow (2 minutes)

1. Log in as the **customer**, choose *Plumber* → pick a provider, date and time → **Confirm Booking**.
2. Log out, log in as that provider (e.g. `bilal.ahmed@fixly.pk`) → **Accept**, then later **Mark Completed**.
3. Log back in as the customer → rate the completed job. The provider's rating updates.
4. Log in as **admin** to see the stats and manage providers.

---

## 2. Useful commands

| Command | What it does |
|---------|--------------|
| `npm start` | Run the server |
| `npm run dev` | Run with auto-restart when you edit server files |
| `npm test` | Run the automated API tests (uses a temporary database) |
| `npm run reset-db` | Delete the database and recreate the demo data |

Run on another port: `PORT=4000 npm start` (Windows PowerShell: `$env:PORT=4000; npm start`).

To open the site from your phone on the same Wi-Fi, find your computer's IP address and visit `http://<that-ip>:3000`.

---

## 3. Project structure

```
fixly/
├── package.json
├── .env.example            # copy to .env to configure (optional)
├── data/                   # SQLite database lives here (auto-created, git-ignored)
├── server/
│   ├── server.js           # starts the HTTP server
│   ├── app.js              # Express setup: security headers, routes, error handler
│   ├── config.js           # settings, services, time slots
│   ├── db.js               # database schema (tables + indexes)
│   ├── seed.js             # demo users and providers
│   ├── auth.js             # sessions + role middleware
│   ├── validate.js         # input validation + date/time rules
│   └── routes/
│       ├── auth.js         # register / login / logout / me
│       ├── providers.js    # list + search providers, available slots
│       ├── bookings.js     # create, list, status changes, reviews
│       └── admin.js        # stats, manage providers
├── public/                 # the website (served as static files)
│   ├── index.html
│   ├── css/style.css       # your design + a few additions
│   └── js/
│       ├── api.js          # calls the backend
│       └── app.js          # all page behaviour
└── test/api.test.js
```

## 4. How it works

- **Database tables:** `users`, `providers`, `bookings`, `reviews`.
- **No double booking:** a unique database index stops two active bookings for the same provider, date and time. The booking form greys out taken (and already-past) time slots.
- **Booking lifecycle:** `Pending → Confirmed → Completed`, or `Cancelled` / `Rejected`. Each role may only make the changes that make sense for it (a customer cannot confirm their own booking, etc.). This is enforced on the server, not just in the UI.
- **Ratings:** each completed job can be rated once; the provider's average updates.
- **Dates and times** are validated in Pakistan time (Asia/Karachi).

### API reference

| Method & path | Who | Purpose |
|---------------|-----|---------|
| `POST /api/auth/register` | public | Create customer account |
| `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me` | public / logged in | Session |
| `GET /api/services` | public | Services and time slots |
| `GET /api/providers?service=&q=` | public | List / search active providers |
| `GET /api/providers/:id/slots?date=YYYY-MM-DD` | public | Unavailable slots |
| `GET /api/bookings` | logged in | Own bookings (customer), assigned jobs (provider), all (admin) |
| `POST /api/bookings` | customer | Create booking |
| `PATCH /api/bookings/:id/status` | owner / provider / admin | Change status |
| `POST /api/bookings/:id/review` | customer | Rate a completed job |
| `GET /api/admin/stats` · `GET/POST /api/admin/providers` · `PATCH /api/admin/providers/:id` | admin | Platform management |

---

## 5. Configuration (optional)

Copy `.env.example` to `.env`:

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `3000` | Port to listen on |
| `JWT_SECRET` | auto-generated in `data/.jwt_secret` | **Required** when `NODE_ENV=production` |
| `NODE_ENV` | `development` | Set to `production` when deploying (enables secure cookies — needs HTTPS) |
| `DB_PATH` | `data/fixly.db` | Database file location |

Generate a secret: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

## 6. Deploying (summary)

Any host that runs Node works (Render, Railway, a VPS). Set `NODE_ENV=production` and `JWT_SECRET`, serve over HTTPS, run `npm install && npm start`, and make sure `data/` is on **persistent storage** — SQLite is a file, so hosts with temporary disks will lose it. Delete or change the demo accounts first. If you later outgrow SQLite, the queries are plain SQL and can move to PostgreSQL with little change.

## 7. Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm install` fails building `better-sqlite3` | Make sure `node -v` is 22+. Update Node, delete `node_modules`, run `npm install` again. |
| `EADDRINUSE: address already in use :::3000` | Another program uses port 3000. Use another port: `PORT=4000 npm start`. |
| Can't log in after resetting | Run `npm run reset-db` and use the demo accounts above. |
| Page loads but has no data | Open the browser console; make sure you opened `http://localhost:3000` (served by the server), not the `index.html` file directly. |
| Want a clean slate | Stop the server, run `npm run reset-db`. |

## 8. Ideas for next steps

SMS/WhatsApp notifications, provider availability calendars, online payments (JazzCash/Easypaisa), image upload for problems, password reset by email, Urdu language toggle.
