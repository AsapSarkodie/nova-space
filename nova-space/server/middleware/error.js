// 404 for unmatched API routes.
export const notFound = (req, res) => {
  res.status(404).json({ error: 'Not found.' });
};

// Central error handler. Turns a thrown { status, message } into JSON,
// and maps a couple of common PostgreSQL errors to friendly messages.
export const errorHandler = (err, req, res, _next) => {
  // Unique violation (e.g. duplicate email).
  if (err.code === '23505') {
    return res.status(409).json({ error: 'That email is already registered.' });
  }
  // Table missing — the schema was never applied.
  if (err.code === '42P01') {
    return res
      .status(503)
      .json({ error: 'The database tables are missing. Run "npm run db:setup" first.' });
  }
  // Database does not exist.
  if (err.code === '3D000') {
    return res
      .status(503)
      .json({ error: 'That database does not exist. Create it, then run "npm run db:setup".' });
  }
  // Connection refused / DB unreachable.
  if (err.code === 'ECONNREFUSED' || err.code === '57P03') {
    return res
      .status(503)
      .json({ error: 'The database is unavailable. Start PostgreSQL and run the seed script.' });
  }

  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.publicMessage || err.message || 'Something went wrong.' });
};

// Wraps an async route so rejected promises reach the error handler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Small helper to throw HTTP-shaped errors from route handlers.
export const httpError = (status, message) => {
  const e = new Error(message);
  e.status = status;
  e.publicMessage = message;
  return e;
};
