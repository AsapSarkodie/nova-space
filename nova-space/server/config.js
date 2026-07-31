import 'dotenv/config';

const parseList = (value, fallback = []) =>
  value
    ? value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : fallback;

export const config = {
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-insecure-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  studentEmailDomains: parseList(process.env.STUDENT_EMAIL_DOMAINS, [
    'st.knust.edu.gh',
    'knust.edu.gh',
  ]),
  deliveryFee: Number(process.env.DELIVERY_FEE) || 20,
  freeDeliveryOver: Number(process.env.FREE_DELIVERY_OVER) || 300,
  db: {
    // A full connection string wins if provided.
    connectionString: process.env.DATABASE_URL || undefined,
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT) || 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'nova_space',
  },
};

export const isVerifiedStudentEmail = (email = '') => {
  const domain = email.toLowerCase().split('@')[1] || '';
  return config.studentEmailDomains.some(
    (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
  );
};
