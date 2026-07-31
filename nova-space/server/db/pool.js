import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

// If a connection string is supplied use it; otherwise use discrete fields.
export const pool = new Pool(
  config.db.connectionString
    ? { connectionString: config.db.connectionString }
    : {
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
      }
);

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

// Thin helper so route code stays tidy: query('SELECT ...', [params]).
export const query = (text, params) => pool.query(text, params);
