'use strict';

const express  = require('express');
const crypto   = require('crypto');
const jwt      = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();
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
  res.json({ ok: true, orm: 'prisma', database: 'neon-postgresql', time: new Date().toISOString() });
});

router.get('/ticket-types', async (req, res) => {
  try {
    const types = await prisma.ticketType.findMany({
      where:   { isActive: true },
      orderBy: { id: 'asc' },
    });
    res.json(types);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/exhibitions', async (req, res) => {
  try {
    const list = await prisma.exhibition.findMany({
      where:   { isActive: true },
      orderBy: { id: 'asc' },
    });
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/shows', async (req, res) => {
  try {
    const list = await prisma.show.findMany({
      where:   { isActive: true },
      orderBy: { id: 'asc' },
    });
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/availability', async (req, res) => {
  try {
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const rows = await prisma.dailyCapacity.findMany({
      where:   { visitDate: { gte: new Date(from) } },
      orderBy: { visitDate: 'asc' },
      select:  { visitDate: true, capacity: true, bookedCount: true },
    });
    const result = rows.map(r => ({
      date:        r.visitDate.toISOString().slice(0, 10),
      capacity:    r.capacity,
      bookedCount: r.bookedCount,
      remaining:   r.capacity - r.bookedCount,
    }));
    res.json(result);
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
    const existing  = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing)
      return res.status(409).json({ error: 'An account with this email already exists', code: 'USER_EXISTS' });

    const user = await prisma.user.create({
      data: { name: name.trim(), email: cleanEmail, phone: phone ? String(phone).trim() : null, passwordHash: password },
    });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: 'user' }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email } });
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

    const user = await prisma.user.findUnique({ where: { email: String(email).trim().toLowerCase() } });

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
    const rows = await prisma.booking.findMany({
      where:   { userId: req.user.id },
      include: { ticketType: true, issuedTickets: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ bookings: rows.map(b => ({
      bookingCode: b.bookingCode,
      status:      b.status,
      date:        b.date,
      ticket:      b.ticketType?.name,
      quantity:    b.quantity,
      totalAmount: b.totalAmount,
      qrToken:     b.issuedTickets[0]?.qrToken ?? null,
    })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.post('/bookings', requireUser, async (req, res) => {
  try {
    const { ticketTypeId, date, quantity, target = 'entry',
            refId = null, refName = null, slotId = null, slotLabel = null } = req.body;

    if (!date)
      return res.status(422).json({ error: 'Visit date is required', code: 'INVALID_DATE' });
    if (!Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 20)
      return res.status(422).json({ error: 'Quantity must be between 1 and 20', code: 'INVALID_QUANTITY' });

    const qty       = Number(quantity);
    const visitDate = new Date(date + 'T00:00:00.000Z');
    const bookingCode = 'MX' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const booking = await prisma.$transaction(async (tx) => {

      await tx.dailyCapacity.upsert({
        where:  { visitDate },
        update: {},
        create: { visitDate, capacity: 500, bookedCount: 0 },
      });

      const [cap] = await tx.$queryRaw`
        SELECT id, capacity, "bookedCount"
        FROM   "DailyCapacity"
        WHERE  "visitDate" = ${visitDate}
        FOR UPDATE`;

      if (cap.capacity - cap.bookedCount < qty)
        throw new BookingError('SOLD_OUT', `Only ${cap.capacity - cap.bookedCount} seats left on ${date}`, 409);

      const tt = await tx.ticketType.findFirst({ where: { id: Number(ticketTypeId), isActive: true } });
      if (!tt)
        throw new BookingError('INVALID_TICKET_TYPE', 'Ticket type not found or inactive', 422);

      const created = await tx.booking.create({
        data: {
          bookingCode,
          userId:          req.user.id,
          ticketTypeId:    tt.id,
          dailyCapacityId: cap.id,
          quantity:        qty,
          unitPrice:       tt.price,
          totalAmount:     tt.price * qty,
          status:          'PENDING_PAYMENT',
          target,
          refId:    refId   ? Number(refId)  : null,
          refName:  refName ?? null,
          date,
          slotId:   slotId  ?? null,
          slotLabel: slotLabel ?? null,
          payments: { create: { amount: tt.price * qty, provider: 'RAZORPAY', status: 'PENDING' } },
        },
        include: { ticketType: true, payments: true },
      });

      await tx.dailyCapacity.update({
        where: { id: cap.id },
        data:  { bookedCount: { increment: qty } },
      });

      return created;
    });

    res.status(201).json({
      bookingCode: booking.bookingCode,
      status:      booking.status,
      date:        booking.date,
      quantity:    booking.quantity,
      totalAmount: booking.totalAmount,
      paymentId:   booking.payments[0]?.id ?? null,
    });
  } catch (err) {
    if (err instanceof BookingError)
      return res.status(err.httpStatus).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/bookings/:code', async (req, res) => {
  try {
    const booking = await prisma.booking.findFirst({
      where:   { bookingCode: { equals: req.params.code, mode: 'insensitive' } },
      include: { user: true, ticketType: true, issuedTickets: true, payments: true },
    });
    if (!booking)
      return res.status(404).json({ error: 'Booking not found', code: 'BOOKING_NOT_FOUND' });

    res.json({
      bookingCode:  booking.bookingCode,
      status:       booking.status,
      date:         booking.date,
      ticket:       booking.ticketType?.name,
      quantity:     booking.quantity,
      totalAmount:  booking.totalAmount,
      visitor:      { name: booking.user?.name, email: booking.user?.email },
      qrToken:      booking.issuedTickets[0]?.qrToken ?? null,
      paymentStatus: booking.payments[0]?.status ?? null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.post('/payments/verify', async (req, res) => {
  try {
    const { bookingCode, providerReference } = req.body;
    if (!bookingCode)
      return res.status(400).json({ error: 'bookingCode is required', code: 'MISSING_CODE' });

    const tickets = await prisma.$transaction(async (tx) => {

      const [b] = await tx.$queryRaw`
        SELECT id, quantity FROM "Booking"
        WHERE  "bookingCode" = ${bookingCode} AND status = 'PENDING_PAYMENT'
        FOR UPDATE`;
      if (!b)
        throw new BookingError('NOT_PENDING', 'Booking not found or already confirmed', 409);

      await tx.payment.updateMany({
        where: { bookingId: b.id, status: 'PENDING' },
        data:  { status: 'SUCCESS', paidAt: new Date(), providerReference },
      });
      await tx.booking.update({
        where: { id: b.id },
        data:  { status: 'CONFIRMED' },
      });

      await tx.issuedTicket.createMany({
        data: Array.from({ length: Number(b.quantity) }, (_, i) => ({
          bookingId: b.id,
          qrToken:   `QR-${bookingCode}-${i + 1}`,
          status:    'VALID',
        })),
      });

      return tx.issuedTicket.findMany({ where: { bookingId: b.id }, orderBy: { id: 'asc' } });
    });

    res.json({ confirmed: true, tickets });
  } catch (err) {
    if (err instanceof BookingError)
      return res.status(err.httpStatus).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.post('/tickets/scan', async (req, res) => {
  try {
    const { qrToken } = req.body;
    if (!qrToken)
      return res.status(400).json({ error: 'qrToken is required', code: 'MISSING_TOKEN' });

    const result = await prisma.$queryRaw`
      UPDATE "IssuedTicket"
      SET    status = 'USED', "scannedAt" = NOW()
      WHERE  "qrToken" = ${qrToken} AND status = 'VALID'
      RETURNING "qrToken", status, "scannedAt"`;

    if (result.length === 0)
      return res.status(409).json({ error: 'Ticket not found or already used', code: 'INVALID_OR_USED' });

    res.json({ scanned: true, ticket: result[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.post('/bookings/:code/cancel', requireUser, async (req, res) => {
  try {
    const bookingCode = req.params.code;

    await prisma.$transaction(async (tx) => {
      const [b] = await tx.$queryRaw`
        SELECT id, quantity, "dailyCapacityId" FROM "Booking"
        WHERE  "bookingCode" = ${bookingCode}
          AND  status IN ('PENDING_PAYMENT','CONFIRMED')
          AND  "userId" = ${req.user.id}
        FOR UPDATE`;
      if (!b)
        throw new BookingError('NOT_CANCELLABLE', 'Booking not found or already cancelled', 404);

      const usedCount = await tx.issuedTicket.count({ where: { bookingId: b.id, status: 'USED' } });
      if (usedCount > 0)
        throw new BookingError('ALREADY_USED', 'A scanned ticket cannot be cancelled', 409);

      await tx.booking.update({     where: { id: b.id }, data: { status: 'CANCELLED' } });
      await tx.issuedTicket.updateMany({ where: { bookingId: b.id }, data: { status: 'CANCELLED' } });
      await tx.payment.updateMany({  where: { bookingId: b.id, status: 'SUCCESS' }, data: { status: 'REFUNDED' } });
      await tx.dailyCapacity.update({
        where: { id: b.dailyCapacityId },
        data:  { bookedCount: { decrement: b.quantity } },
      });
    });

    res.json({ cancelled: true, bookingCode });
  } catch (err) {
    if (err instanceof BookingError)
      return res.status(err.httpStatus).json({ error: err.message, code: err.code });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/admin/bookings', requireAdmin, async (req, res) => {
  try {
    const page     = Math.max(1, Number(req.query.page)     || 1);
    const pageSize = Math.min(100, Number(req.query.pageSize) || 20);
    const { status, search } = req.query;

    const where = {};
    if (status && status !== 'ALL') where.status = String(status);
    if (search) where.OR = [
      { bookingCode: { contains: String(search), mode: 'insensitive' } },
      { user: { name:  { contains: String(search), mode: 'insensitive' } } },
      { user: { email: { contains: String(search), mode: 'insensitive' } } },
    ];

    const [total, rows] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        include: { user: true, ticketType: true, payments: true, issuedTickets: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) || 1 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

router.get('/admin/revenue', requireAdmin, async (req, res) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT   tt.name AS ticket_type,
               COUNT(*)::int        AS payments,
               SUM(p.amount)::int   AS revenue
      FROM     "Payment"    p
      JOIN     "Booking"    b  ON b.id  = p."bookingId"
      JOIN     "TicketType" tt ON tt.id = b."ticketTypeId"
      WHERE    p.status = 'SUCCESS'
      GROUP BY tt.name
      ORDER BY revenue DESC`;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong', code: 'SERVER_ERROR' });
  }
});

module.exports = router;
