import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { PUBLIC_DIR, IS_PROD } from './config.js';
import { loadUser, HttpError } from './auth.js';
import { seedIfEmpty } from './seed.js';
import authRoutes from './routes/auth.js';
import providerRoutes from './routes/providers.js';
import bookingRoutes from './routes/bookings.js';
import adminRoutes from './routes/admin.js';

seedIfEmpty();

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    // upgrade-insecure-requests breaks plain-http access (e.g. phone on the same Wi-Fi), so only enforce it in production
    directives: { 'upgrade-insecure-requests': IS_PROD ? [] : null },
  },
}));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(loadUser);

// CSRF defence in depth: cookies are SameSite=Lax, and state-changing API calls must be JSON
app.use('/api', (req, _res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && !req.is('application/json'))
    return next(new HttpError(415, 'Content-Type must be application/json.'));
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api', providerRoutes);
app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')));

app.use(express.static(PUBLIC_DIR));

// JSON error handler
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid JSON.');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side.' : err.message });
});

export default app;
