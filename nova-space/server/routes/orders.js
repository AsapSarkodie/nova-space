import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { pool, query } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, httpError } from '../middleware/error.js';
import { config } from '../config.js';

const router = Router();

const ORDER_STATUSES = ['placed', 'confirmed', 'out_for_delivery', 'completed', 'cancelled'];

// POST /api/orders — buy a listing (auth).
// Uses a transaction: only one buyer can claim an available listing.
router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { listingId, fulfilment, hostel, address, paymentMethod } = req.body || {};
    if (!listingId) throw httpError(400, 'A listing is required.');

    const mode = fulfilment === 'pickup' ? 'pickup' : 'delivery';
    const payment = paymentMethod === 'cash' ? 'cash' : 'momo';
    const deliveryFee = mode === 'delivery' ? config.deliveryFee : 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row so two buyers cannot claim it at once.
      const { rows } = await client.query(
        'SELECT * FROM listings WHERE id = $1 FOR UPDATE',
        [listingId]
      );
      const listing = rows[0];
      if (!listing) throw httpError(404, 'Listing not found.');
      if (listing.status !== 'available') throw httpError(409, 'This item is no longer available.');
      if (listing.seller_id === req.user.id) throw httpError(400, 'You cannot buy your own listing.');

      const total = Number(listing.price) + Number(deliveryFee);

      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (buyer_id, listing_id, fulfilment, hostel, address, payment_method, delivery_fee, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [req.user.id, listing.id, mode, hostel || null, address || null, payment, deliveryFee, total]
      );

      // Resale and store items are single-unit: mark them sold.
      // Essentials are treated as restockable and stay available.
      if (listing.listing_type !== 'essential') {
        await client.query('UPDATE listings SET status = $1 WHERE id = $2', ['sold', listing.id]);
      }

      await client.query('COMMIT');
      res.status(201).json({ order: orderRows[0] });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// POST /api/orders/checkout — buy everything in the cart at once (auth).
// One transaction: every item is locked and validated, or nothing is ordered.
// The delivery fee is charged once per checkout, not per item.
router.post(
  '/checkout',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { items, fulfilment, hostel, address, paymentMethod } = req.body || {};
    if (!Array.isArray(items) || !items.length) throw httpError(400, 'Your cart is empty.');
    if (items.length > 50) throw httpError(400, 'That is too many items for one order.');

    const mode = fulfilment === 'pickup' ? 'pickup' : 'delivery';
    const payment = paymentMethod === 'cash' ? 'cash' : 'momo';
    if (mode === 'delivery' && !hostel) throw httpError(400, 'Add the hostel to deliver to.');

    const groupId = randomUUID();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock every listing up front, in a stable order, to avoid deadlocks.
      const ids = [...new Set(items.map((i) => Number(i.listingId)))].sort((a, b) => a - b);
      const { rows: listings } = await client.query(
        'SELECT * FROM listings WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE',
        [ids]
      );
      const byId = new Map(listings.map((l) => [l.id, l]));

      let subtotal = 0;
      const prepared = [];

      for (const item of items) {
        const listing = byId.get(Number(item.listingId));
        if (!listing) throw httpError(404, 'An item in your cart no longer exists.');
        if (listing.status !== 'available') {
          throw httpError(409, `"${listing.title}" has just been sold. Remove it to continue.`);
        }
        if (listing.seller_id === req.user.id) {
          throw httpError(400, `"${listing.title}" is your own listing.`);
        }
        // Only restockable essentials can have a quantity above one.
        const qty =
          listing.listing_type === 'essential'
            ? Math.max(1, Math.min(20, Number(item.quantity) || 1))
            : 1;

        subtotal += Number(listing.price) * qty;
        prepared.push({ listing, qty });
      }

      const fee =
        mode === 'delivery' && subtotal < config.freeDeliveryOver ? config.deliveryFee : 0;

      const created = [];
      for (const [index, { listing, qty }] of prepared.entries()) {
        // The whole delivery fee sits on the first line so the group total is exact.
        const lineFee = index === 0 ? fee : 0;
        const lineTotal = Number(listing.price) * qty + lineFee;

        const { rows } = await client.query(
          `INSERT INTO orders (buyer_id, listing_id, fulfilment, hostel, address, payment_method, delivery_fee, total, quantity, group_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           RETURNING *`,
          [req.user.id, listing.id, mode, hostel || null, address || null, payment, lineFee, lineTotal, qty, groupId]
        );
        created.push(rows[0]);

        if (listing.listing_type !== 'essential') {
          await client.query('UPDATE listings SET status = $1 WHERE id = $2', ['sold', listing.id]);
        }
      }

      await client.query('COMMIT');
      res.status(201).json({
        groupId,
        orders: created,
        subtotal: Number(subtotal.toFixed(2)),
        deliveryFee: fee,
        total: Number((subtotal + fee).toFixed(2)),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// GET /api/orders/mine — things the user has bought.
router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT o.*, l.title, l.image_url, l.listing_type, u.name AS seller_name, u.phone AS seller_phone
       FROM orders o
       JOIN listings l ON l.id = o.listing_id
       JOIN users u ON u.id = l.seller_id
       WHERE o.buyer_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json({ orders: rows });
  })
);

// GET /api/orders/sales — orders for the user's own listings.
router.get(
  '/sales',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT o.*, l.title, l.image_url, b.name AS buyer_name, b.phone AS buyer_phone
       FROM orders o
       JOIN listings l ON l.id = o.listing_id
       JOIN users b ON b.id = o.buyer_id
       WHERE l.seller_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.id]
    );
    res.json({ orders: rows });
  })
);

// PATCH /api/orders/:id/status — seller (or buyer cancelling) moves an order along.
router.patch(
  '/:id/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { status } = req.body || {};
    if (!ORDER_STATUSES.includes(status)) throw httpError(400, 'Unknown status.');

    const { rows } = await query(
      `SELECT o.*, l.seller_id
       FROM orders o JOIN listings l ON l.id = o.listing_id
       WHERE o.id = $1`,
      [req.params.id]
    );
    const order = rows[0];
    if (!order) throw httpError(404, 'Order not found.');

    const isSeller = order.seller_id === req.user.id;
    const isBuyer = order.buyer_id === req.user.id;
    if (!isSeller && !isBuyer) throw httpError(403, 'You cannot change this order.');
    // Buyers may only cancel; sellers may set any status.
    if (isBuyer && !isSeller && status !== 'cancelled') {
      throw httpError(403, 'You can only cancel this order.');
    }

    const { rows: updated } = await query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    res.json({ order: updated[0] });
  })
);

export default router;
