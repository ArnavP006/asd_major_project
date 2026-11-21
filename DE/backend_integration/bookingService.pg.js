// MuseumX booking service using raw SQL (node-postgres).
// Same business operations the Express controllers call through Prisma - see bookingService.prisma.js.
const crypto = require('crypto');
const pool = require('./db');

class BookingError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/** Create booking: lock the day's capacity row, check seats, insert Booking + Payment, bump counter (one transaction). */
async function createBooking({ userId, ticketTypeId, date, quantity, target = 'entry', refId = null,
                               refName = null, slotId = null, slotLabel = null, defaultCapacity = 500 }) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20)
    throw new BookingError('INVALID_QUANTITY', 'quantity must be an integer between 1 and 20');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO "DailyCapacity" ("visitDate","capacity","updatedAt") VALUES ($1,$2,NOW()) ON CONFLICT ("visitDate") DO NOTHING`,
      [date, defaultCapacity]);
    const cap = (await client.query(
      `SELECT id, capacity, "bookedCount" FROM "DailyCapacity" WHERE "visitDate" = $1 FOR UPDATE`, [date])).rows[0];
    if (cap.capacity - cap.bookedCount < quantity)
      throw new BookingError('SOLD_OUT', `only ${cap.capacity - cap.bookedCount} seats left on ${date}`);
    const tt = (await client.query(`SELECT price FROM "TicketType" WHERE id = $1 AND "isActive"`, [ticketTypeId])).rows[0];
    if (!tt) throw new BookingError('INVALID_TICKET_TYPE', 'ticket type not found or inactive');
    const booking = (await client.query(
      `INSERT INTO "Booking" ("bookingCode","userId","ticketTypeId","dailyCapacityId","quantity","unitPrice","totalAmount",
                              "target","refId","refName","date","slotId","slotLabel","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()) RETURNING *`,
      ['BK-' + crypto.randomBytes(4).toString('hex').toUpperCase(), userId, ticketTypeId, cap.id, quantity, tt.price,
       quantity * tt.price, target, refId, refName, date, slotId, slotLabel])).rows[0];
    await client.query(`INSERT INTO "Payment" ("bookingId","amount","provider") VALUES ($1,$2,'RAZORPAY')`,
                       [booking.id, booking.totalAmount]);
    await client.query(`UPDATE "DailyCapacity" SET "bookedCount" = "bookedCount" + $1, "updatedAt" = NOW() WHERE id = $2`,
                       [quantity, cap.id]);
    await client.query('COMMIT');
    return booking;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

/** Payment verified (after Razorpay signature check): mark SUCCESS, confirm booking, issue one QR ticket per visitor. */
async function confirmPayment(bookingCode, providerReference) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = (await client.query(`SELECT id, quantity FROM "Booking" WHERE "bookingCode" = $1 AND status = 'PENDING_PAYMENT' FOR UPDATE`, [bookingCode])).rows[0];
    if (!b) throw new BookingError('NOT_PENDING', 'booking not found or not awaiting payment');
    await client.query(`UPDATE "Payment" SET status='SUCCESS', "paidAt"=NOW(), "providerReference"=$2 WHERE "bookingId"=$1 AND status='PENDING'`, [b.id, providerReference]);
    await client.query(`UPDATE "Booking" SET status='CONFIRMED', "updatedAt"=NOW() WHERE id=$1`, [b.id]);
    await client.query(
      `INSERT INTO "IssuedTicket" ("bookingId","qrToken") SELECT $1, $2 || '-' || n FROM generate_series(1,$3::int) n`,
      [b.id, 'QR-' + bookingCode, b.quantity]);
    await client.query('COMMIT');
    return (await pool.query(`SELECT "qrToken", status FROM "IssuedTicket" WHERE "bookingId"=$1 ORDER BY id`, [b.id])).rows;
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

/** Gate scan. The WHERE status='VALID' makes the update atomic, so a QR code can never be used twice. */
async function scanTicket(qrToken) {
  const r = await pool.query(
    `UPDATE "IssuedTicket" SET status='USED', "scannedAt"=NOW() WHERE "qrToken"=$1 AND status='VALID' RETURNING "qrToken", status`, [qrToken]);
  if (r.rowCount === 0) throw new BookingError('INVALID_OR_USED', 'ticket not found or already used');
  return r.rows[0];
}

/** Cancel: booking CANCELLED, tickets CANCELLED, payment REFUNDED, seats released. */
async function cancelBooking(bookingCode) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const b = (await client.query(`SELECT id, quantity, "dailyCapacityId" FROM "Booking" WHERE "bookingCode"=$1 AND status IN ('PENDING_PAYMENT','CONFIRMED') FOR UPDATE`, [bookingCode])).rows[0];
    if (!b) throw new BookingError('NOT_CANCELLABLE', 'booking not found or already cancelled');
    const used = (await client.query(`SELECT COUNT(*)::int AS n FROM "IssuedTicket" WHERE "bookingId"=$1 AND status='USED'`, [b.id])).rows[0].n;
    if (used > 0) throw new BookingError('ALREADY_USED', 'tickets already used; cannot cancel');
    await client.query(`UPDATE "Booking" SET status='CANCELLED', "updatedAt"=NOW() WHERE id=$1`, [b.id]);
    await client.query(`UPDATE "IssuedTicket" SET status='CANCELLED' WHERE "bookingId"=$1`, [b.id]);
    await client.query(`UPDATE "Payment" SET status='REFUNDED' WHERE "bookingId"=$1 AND status='SUCCESS'`, [b.id]);
    await client.query(`UPDATE "DailyCapacity" SET "bookedCount"="bookedCount"-$1, "updatedAt"=NOW() WHERE id=$2`, [b.quantity, b.dailyCapacityId]);
    await client.query('COMMIT');
    return { bookingCode, status: 'CANCELLED' };
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
}

async function getAvailability(fromDate) {
  return (await pool.query(
    `SELECT "visitDate"::text AS date, capacity, "bookedCount", capacity - "bookedCount" AS remaining
     FROM "DailyCapacity" WHERE "visitDate" >= $1 ORDER BY "visitDate"`, [fromDate])).rows;
}
async function getUserBookings(email) {
  return (await pool.query(
    `SELECT b."bookingCode", tt.name AS ticket, b.quantity, b."totalAmount", b.status
     FROM "Booking" b JOIN "User" u ON u.id=b."userId" JOIN "TicketType" tt ON tt.id=b."ticketTypeId"
     WHERE u.email=$1 ORDER BY b."createdAt" DESC`, [email])).rows;
}
async function revenueReport() {
  return (await pool.query(
    `SELECT tt.name AS ticket_type, SUM(p.amount)::int AS revenue FROM "Payment" p
     JOIN "Booking" b ON b.id=p."bookingId" JOIN "TicketType" tt ON tt.id=b."ticketTypeId"
     WHERE p.status='SUCCESS' GROUP BY tt.name ORDER BY revenue DESC`)).rows;
}
module.exports = { createBooking, confirmPayment, scanTicket, cancelBooking, getAvailability, getUserBookings, revenueReport, BookingError };
