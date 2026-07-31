import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { config } from './config.js';
import { pool } from './db/pool.js';
import authRoutes from './routes/auth.js';
import listingRoutes from './routes/listings.js';
import orderRoutes from './routes/orders.js';
import { notFound, errorHandler, asyncHandler } from './middleware/error.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const app = express();

app.use(cors());
app.use(express.json());

// Health check — also tells you whether the database is reachable.
app.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'connected' });
  })
);

// Public settings the frontend needs (keeps the delivery banner honest).
app.get('/api/config', (req, res) =>
  res.json({ deliveryFee: config.deliveryFee, freeDeliveryOver: config.freeDeliveryOver })
);

app.use('/api/auth', authRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/orders', orderRoutes);

// Serve the frontend.
app.use(express.static(publicDir));

// Unmatched /api routes get JSON 404; everything else falls back to the app shell.
app.use('/api', notFound);
app.get('*', (req, res) => res.sendFile(join(publicDir, 'index.html')));

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Nova Space running at http://localhost:${config.port}`);
});
