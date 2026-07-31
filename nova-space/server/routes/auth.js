import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { asyncHandler, httpError } from '../middleware/error.js';
import { isVerifiedStudentEmail } from '../config.js';

const router = Router();

// Never send the password hash to the client.
const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  hostel: u.hostel,
  isStudentVerified: u.is_student_verified,
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { name, email, password, phone, hostel } = req.body || {};

    if (!name || !email || !password) {
      throw httpError(400, 'Name, email and password are required.');
    }
    if (String(password).length < 6) {
      throw httpError(400, 'Password must be at least 6 characters.');
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    const verified = isVerifiedStudentEmail(email);

    const { rows } = await query(
      `INSERT INTO users (name, email, password_hash, phone, hostel, is_student_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [name.trim(), email.trim().toLowerCase(), passwordHash, phone || null, hostel || null, verified]
    );

    const user = rows[0];
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) throw httpError(400, 'Email and password are required.');

    const { rows } = await query('SELECT * FROM users WHERE email = $1', [
      email.trim().toLowerCase(),
    ]);
    const user = rows[0];

    const ok = user && (await bcrypt.compare(String(password), user.password_hash));
    if (!ok) throw httpError(401, 'Incorrect email or password.');

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows[0]) throw httpError(404, 'Account not found.');
    res.json({ user: publicUser(rows[0]) });
  })
);

export default router;
