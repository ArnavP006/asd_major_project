'use strict';

const express = require('express');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const pool    = require('./db');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'museumx-secret-key-2026';

class BookingError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.code       = code;
    this.httpStatus = httpStatus;
  }
}

function decodeToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try { return jwt.verify(header.slice(7).trim(), JWT_SECRET); }
  catch { return null; }
}

function requireUser(req, res, next) {
  const payload = decodeToken(req);
  if (!payload) return res.status(401).json({ error: 'Please log in to continue', code: 'UNAUTHORIZED' });
  req.user = payload;
  next();
}

function requireAdmin(req, res, next) {
  const payload = decodeToken(req);
  if (!payload || (payload.role !== 'admin' && payload.role !== 'gate'))
    return res.status(401).json({ error: 'Admin access required', code: 'FORBIDDEN' });
  req.admin = payload;
  next();
}

router.get('/health', (req, res) => {
  res.json({ ok: true, orm: 'raw-sql (pg)', database: 'neon-postgresql', time: new Date().toISOString() });
});

router.get('/ticket-types', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM "TicketType" WHERE "isActive" = true ORDER BY id`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/exhibitions', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM "Exhibition" WHERE "isActive" = true ORDER BY id`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/shows', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM "Show" WHERE "isActive" = true ORDER BY id`);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/availability', async (req, res) => {
  try {
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `SELECT "visitDate"::text AS date, capacity, "bookedCount",
              capacity - "bookedCount" AS remaining
       FROM   "DailyCapacity"
       WHERE  "visitDate" >= $1
       ORDER  BY "visitDate"`,
      [from]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.post('/user/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name   || typeof name !== 'string' || name.trim().length < 2)
      return res.status(400).json({ error: 'Full name required (min 2 chars)', code: 'INVALID_NAME' });
    if (!email  || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return res.status(400).json({ error: 'Valid email required', code: 'INVALID_EMAIL' });
    if (!password || password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters', code: 'INVALID_PASSWORD' });

    const cleanEmail = email.trim().toLowerCase();
    const existing  = (await pool.query(`SELECT id FROM "User" WHERE email = $1`, [cleanEmail])).rows[0];
    if (existing)
      return res.status(409).json({ error: 'An account with this email already exists', code: 'USER_EXISTS' });

    const { rows } = await pool.query(
      `INSERT INTO "User" (name, email, phone, "passwordHash", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id, name, email`,
      [name.trim(), cleanEmail, phone ? String(phone).trim() : null, password]
    );
    const user  = rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.post('/user/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required', code: 'INVALID_CREDENTIALS' });

    const user = (await pool.query(
      `SELECT id, name, email, "passwordHash" FROM "User" WHERE email = $1`,
      [String(email).trim().toLowerCase()]
    )).rows[0];

    if (!user || user.passwordHash !== password)
      return res.status(401).json({ error: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/user/bookings', requireUser, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b."bookingCode", tt.name AS ticket, b.quantity, b."totalAmount", b.status, b.date,
              it."qrToken"
       FROM   "Booking"      b
       JOIN   "TicketType"   tt ON tt.id = b."ticketTypeId"
       LEFT   JOIN "IssuedTicket" it ON it."bookingId" = b.id
       WHERE  b."userId" = $1
       ORDER  BY b."createdAt" DESC`,
      [req.user.id]
    );
    res.json({ bookings: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.post('/bookings', requireUser, async (req, res) => {
  const { ticketTypeId, date, quantity, target = 'entry',
          refId = null, refName = null, slotId = null, slotLabel = null } = req.body;

  if (!date)
    return res.status(422).json({ error: 'Visit date is required', code: 'INVALID_DATE' });

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1 || qty > 20)
    return res.status(422).json({ error: 'Quantity must be between 1 and 20', code: 'INVALID_QUANTITY' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO "DailyCapacity" ("visitDate", "capacity", "updatedAt")
       VALUES ($1, 500, NOW())
       ON CONFLICT ("visitDate") DO NOTHING`,
      [date]
    );

    const cap = (await client.query(
      `SELECT id, capacity, "bookedCount"
       FROM   "DailyCapacity"
       WHERE  "visitDate" = $1
       FOR UPDATE`,
      [date]
    )).rows[0];

    if (cap.capacity - cap.bookedCount < qty)
      throw new BookingError('SOLD_OUT', `Only ${cap.capacity - cap.bookedCount} seats left on ${date}`, 409);

    const tt = (await client.query(
      `SELECT id, price FROM "TicketType" WHERE id = $1 AND "isActive" = true`, [ticketTypeId]
    )).rows[0];
    if (!tt) throw new BookingError('INVALID_TICKET_TYPE', 'Ticket type not found or inactive', 422);

    const bookingCode = 'MX' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const booking = (await client.query(
      `INSERT INTO "Booking"
         ("bookingCode","userId","ticketTypeId","dailyCapacityId","quantity",
          "unitPrice","totalAmount","status","target","refId","refName",
          "date","slotId","slotLabel","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_PAYMENT',$8,$9,$10,$11,$12,$13,NOW())
       RETURNING *`,
      [bookingCode, req.user.id, tt.id, cap.id, qty,
       tt.price, tt.price * qty, target, refId, refName, date, slotId, slotLabel]
    )).rows[0];

    await client.query(
      `INSERT INTO "Payment" ("bookingId","amount","provider","status","updatedAt")
       VALUES ($1,$2,'RAZORPAY','PENDING',NOW())`,
      [booking.id, booking.totalAmount]
    );

    await client.query(
      `UPDATE "DailyCapacity"
       SET    "bookedCount" = "bookedCount" + $1, "updatedAt" = NOW()
       WHERE  id = $2`,
      [qty, cap.id]
    );

    await client.query('COMMIT');
    res.status(201).json({
      bookingCode: booking.bookingCode,
      status:      booking.status,
      date:        booking.date,
      quantity:    booking.quantity,
      totalAmount: booking.totalAmount,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof BookingError)
      return res.status(err.httpStatus).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

router.get('/bookings/:code', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b."bookingCode", b.status, b.date, b.quantity, b."totalAmount",
              tt.name AS ticket, u.name AS visitor, u.email,
              it."qrToken", p.status AS "paymentStatus"
       FROM   "Booking"      b
       JOIN   "User"         u  ON u.id  = b."userId"
       JOIN   "TicketType"   tt ON tt.id = b."ticketTypeId"
       LEFT   JOIN "IssuedTicket" it ON it."bookingId" = b.id
       LEFT   JOIN "Payment"      p  ON p."bookingId"  = b.id
       WHERE  b."bookingCode" = $1
       LIMIT  1`,
      [req.params.code]
    );
    if (!rows.length)
      return res.status(404).json({ error: 'Booking not found', code: 'BOOKING_NOT_FOUND' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.post('/payments/verify', async (req, res) => {
  const { bookingCode, providerReference } = req.body;
  if (!bookingCode)
    return res.status(400).json({ error: 'bookingCode is required', code: 'MISSING_CODE' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const b = (await client.query(
      `SELECT id, quantity FROM "Booking"
       WHERE  "bookingCode" = $1 AND status = 'PENDING_PAYMENT'
       FOR UPDATE`,
      [bookingCode]
    )).rows[0];
    if (!b) throw new BookingError('NOT_PENDING', 'Booking not found or already confirmed', 409);

    await client.query(
      `UPDATE "Payment"
       SET    status = 'SUCCESS', "paidAt" = NOW(), "providerReference" = $2, "updatedAt" = NOW()
       WHERE  "bookingId" = $1 AND status = 'PENDING'`,
      [b.id, providerReference]
    );

    await client.query(
      `UPDATE "Booking" SET status = 'CONFIRMED', "updatedAt" = NOW() WHERE id = $1`, [b.id]
    );

    await client.query(
      `INSERT INTO "IssuedTicket" ("bookingId","qrToken","status")
       SELECT $1, $2 || '-' || n, 'VALID'
       FROM   generate_series(1, $3::int) n`,
      [b.id, 'QR-' + bookingCode, b.quantity]
    );

    await client.query('COMMIT');
    const tickets = (await pool.query(
      `SELECT "qrToken", status FROM "IssuedTicket" WHERE "bookingId" = $1 ORDER BY id`, [b.id]
    )).rows;
    res.json({ confirmed: true, tickets });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof BookingError)
      return res.status(err.httpStatus).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

router.post('/tickets/scan', async (req, res) => {
  try {
    const { qrToken } = req.body;
    if (!qrToken)
      return res.status(400).json({ error: 'qrToken is required', code: 'MISSING_TOKEN' });

    const result = await pool.query(
      `UPDATE "IssuedTicket"
       SET    status = 'USED', "scannedAt" = NOW()
       WHERE  "qrToken" = $1 AND status = 'VALID'
       RETURNING "qrToken", status, "scannedAt"`,
      [qrToken]
    );

    if (result.rowCount === 0)
      return res.status(409).json({ error: 'Ticket not found or already used', code: 'INVALID_OR_USED' });

    res.json({ scanned: true, ticket: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.post('/bookings/:code/cancel', requireUser, async (req, res) => {
  const bookingCode = req.params.code;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const b = (await client.query(
      `SELECT id, quantity, "dailyCapacityId"
       FROM   "Booking"
       WHERE  "bookingCode" = $1
         AND  status IN ('PENDING_PAYMENT','CONFIRMED')
         AND  "userId" = $2
       FOR UPDATE`,
      [bookingCode, req.user.id]
    )).rows[0];
    if (!b) throw new BookingError('NOT_CANCELLABLE', 'Booking not found or already cancelled', 404);

    const used = Number((await client.query(
      `SELECT COUNT(*)::int AS n FROM "IssuedTicket" WHERE "bookingId" = $1 AND status = 'USED'`, [b.id]
    )).rows[0].n);
    if (used > 0) throw new BookingError('ALREADY_USED', 'A scanned ticket cannot be cancelled', 409);

    await client.query(`UPDATE "Booking"      SET status = 'CANCELLED', "updatedAt" = NOW() WHERE id = $1`, [b.id]);
    await client.query(`UPDATE "IssuedTicket" SET status = 'CANCELLED'  WHERE "bookingId" = $1`, [b.id]);
    await client.query(`UPDATE "Payment"      SET status = 'REFUNDED'   WHERE "bookingId" = $1 AND status = 'SUCCESS'`, [b.id]);
    await client.query(
      `UPDATE "DailyCapacity" SET "bookedCount" = "bookedCount" - $1, "updatedAt" = NOW() WHERE id = $2`,
      [b.quantity, b.dailyCapacityId]
    );

    await client.query('COMMIT');
    res.json({ cancelled: true, bookingCode });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err instanceof BookingError)
      return res.status(err.httpStatus).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  } finally {
    client.release();
  }
});

router.get('/admin/bookings', requireAdmin, async (req, res) => {
  try {
    const page      = Math.max(1, Number(req.query.page)      || 1);
    const pageSize  = Math.min(100, Number(req.query.pageSize) || 20);
    const { status, search } = req.query;
    const offset    = (page - 1) * pageSize;

    const conditions = ['1=1'];
    const params     = [];
    if (status && status !== 'ALL') { params.push(status);  conditions.push(`b.status = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      const p = params.length;
      conditions.push(`(b."bookingCode" ILIKE $${p} OR u.name ILIKE $${p} OR u.email ILIKE $${p})`);
    }
    const where = conditions.join(' AND ');

    const total = Number((await pool.query(
      `SELECT COUNT(*)::int FROM "Booking" b JOIN "User" u ON u.id = b."userId" WHERE ${where}`, params
    )).rows[0].count);

    params.push(pageSize, offset);
    const rows = (await pool.query(
      `SELECT b."bookingCode", b.status, b.date, b.quantity, b."totalAmount",
              tt.name AS ticket, u.name AS visitor, u.email
       FROM   "Booking"    b
       JOIN   "User"       u  ON u.id  = b."userId"
       JOIN   "TicketType" tt ON tt.id = b."ticketTypeId"
       WHERE  ${where}
       ORDER  BY b."createdAt" DESC
       LIMIT  $${params.length - 1} OFFSET $${params.length}`,
      params
    )).rows;

    res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/admin/revenue', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT   tt.name AS ticket_type,
                COUNT(*)::int        AS payments,
                SUM(p.amount)::int   AS revenue
       FROM     "Payment"    p
       JOIN     "Booking"    b  ON b.id  = p."bookingId"
       JOIN     "TicketType" tt ON tt.id = b."ticketTypeId"
       WHERE    p.status = 'SUCCESS'
       GROUP BY tt.name
       ORDER BY revenue DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

module.exports = router;
