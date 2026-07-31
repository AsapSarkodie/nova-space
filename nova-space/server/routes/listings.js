import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, httpError } from '../middleware/error.js';
import { handleUpload } from '../middleware/upload.js';

const router = Router();

const LISTING_TYPES = ['resale', 'store', 'essential'];

// Shared SELECT that joins seller info for display.
const LISTING_SELECT = `
  SELECT l.*,
         u.name AS seller_name,
         u.hostel AS seller_hostel,
         u.is_student_verified AS seller_verified
  FROM listings l
  JOIN users u ON u.id = l.seller_id
`;

// GET /api/listings  — public browse with filters.
// Query params: type, category, q (search), min, max, sort (new|price_asc|price_desc)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { type, category, q, min, max, sort } = req.query;
    const where = [`l.status = 'available'`];
    const params = [];

    if (type && LISTING_TYPES.includes(type)) {
      params.push(type);
      where.push(`l.listing_type = $${params.length}`);
    }
    if (category) {
      params.push(category);
      where.push(`l.category = $${params.length}`);
    }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(l.title ILIKE $${params.length} OR l.description ILIKE $${params.length})`);
    }
    if (min) {
      params.push(Number(min));
      where.push(`l.price >= $${params.length}`);
    }
    if (max) {
      params.push(Number(max));
      where.push(`l.price <= $${params.length}`);
    }

    const orderBy =
      sort === 'price_asc'
        ? 'l.price ASC'
        : sort === 'price_desc'
        ? 'l.price DESC'
        : 'l.created_at DESC';

    const { rows } = await query(
      `${LISTING_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${orderBy}`,
      params
    );
    res.json({ listings: rows });
  })
);

// GET /api/listings/mine — the signed-in user's own listings (any status).
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `${LISTING_SELECT} WHERE l.seller_id = $1 ORDER BY l.created_at DESC`,
      [req.user.id]
    );
    res.json({ listings: rows });
  })
);

// GET /api/listings/:id — single listing.
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`${LISTING_SELECT} WHERE l.id = $1`, [req.params.id]);
    if (!rows[0]) throw httpError(404, 'Listing not found.');
    res.json({ listing: rows[0] });
  })
);

// POST /api/listings — create a listing (auth). Accepts multipart with optional `image`.
router.post(
  '/',
  requireAuth,
  handleUpload,
  asyncHandler(async (req, res) => {
    const { title, description, listingType, category, condition, price } = req.body || {};

    if (!title || !category || price == null || price === '') {
      throw httpError(400, 'Title, category and price are required.');
    }
    const type = LISTING_TYPES.includes(listingType) ? listingType : 'resale';
    if (Number(price) < 0 || Number.isNaN(Number(price))) {
      throw httpError(400, 'Enter a valid price.');
    }

    // An uploaded file wins; otherwise accept a pasted URL.
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : req.body.imageUrl || null;

    const { rows } = await query(
      `INSERT INTO listings (seller_id, title, description, listing_type, category, condition, price, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.id,
        title.trim(),
        description || null,
        type,
        category.trim(),
        condition || null,
        Number(price),
        imageUrl,
      ]
    );
    res.status(201).json({ listing: rows[0] });
  })
);

// PATCH /api/listings/:id — update own listing (auth, owner).
router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows: existing } = await query('SELECT * FROM listings WHERE id = $1', [req.params.id]);
    const listing = existing[0];
    if (!listing) throw httpError(404, 'Listing not found.');
    if (listing.seller_id !== req.user.id) throw httpError(403, 'That is not your listing.');

    const fields = ['title', 'description', 'category', 'condition', 'price', 'image_url', 'status'];
    const map = {
      title: req.body.title,
      description: req.body.description,
      category: req.body.category,
      condition: req.body.condition,
      price: req.body.price,
      image_url: req.body.imageUrl,
      status: req.body.status,
    };

    const sets = [];
    const params = [];
    for (const field of fields) {
      if (map[field] !== undefined) {
        params.push(map[field]);
        sets.push(`${field} = $${params.length}`);
      }
    }
    if (!sets.length) throw httpError(400, 'Nothing to update.');

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE listings SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json({ listing: rows[0] });
  })
);

// DELETE /api/listings/:id — remove own listing (auth, owner).
router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query('SELECT seller_id FROM listings WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw httpError(404, 'Listing not found.');
    if (rows[0].seller_id !== req.user.id) throw httpError(403, 'That is not your listing.');

    await query('DELETE FROM listings WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  })
);

export default router;
