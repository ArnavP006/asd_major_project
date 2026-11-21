// Prisma version of the same operations - this is the style used in server/src (Express + Prisma ORM).
// NOTE: written to mirror bookingService.pg.js; it could NOT be executed in the sandbox used to prepare this folder
// (Prisma engine binaries cannot be downloaded there). Run it in your project after `npx prisma generate`,
// and adjust the status strings to the ones your controllers use.
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function createBooking({ userId, ticketTypeId, date, quantity, target = 'entry', refId, refName, slotId, slotLabel }) {
  return prisma.$transaction(async (tx) => {
    const visitDate = new Date(date);
    await tx.dailyCapacity.upsert({ where: { visitDate }, update: {}, create: { visitDate, capacity: 500 } });
    // Row lock so two buyers cannot take the last seat (Prisma has no FOR UPDATE helper -> raw query)
    const [cap] = await tx.$queryRaw`SELECT id, capacity, "bookedCount" FROM "DailyCapacity" WHERE "visitDate" = ${visitDate} FOR UPDATE`;
    if (cap.capacity - cap.bookedCount < quantity) throw new Error('SOLD_OUT');
    const tt = await tx.ticketType.findFirstOrThrow({ where: { id: ticketTypeId, isActive: true } });
    const booking = await tx.booking.create({ data: {
      userId, ticketTypeId, dailyCapacityId: cap.id, quantity, unitPrice: tt.price, totalAmount: tt.price * quantity,
      target, refId, refName, date, slotId, slotLabel,
      payments: { create: { amount: tt.price * quantity, provider: 'RAZORPAY' } } } });
    await tx.dailyCapacity.update({ where: { id: cap.id }, data: { bookedCount: { increment: quantity } } });
    return booking;
  });
}

async function confirmPayment(bookingCode, providerReference) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findFirstOrThrow({ where: { bookingCode, status: 'PENDING_PAYMENT' } });
    await tx.payment.updateMany({ where: { bookingId: b.id, status: 'PENDING' },
                                  data: { status: 'SUCCESS', paidAt: new Date(), providerReference } });
    await tx.booking.update({ where: { id: b.id }, data: { status: 'CONFIRMED' } });
    await tx.issuedTicket.createMany({ data: Array.from({ length: b.quantity }, () => ({ bookingId: b.id })) }); // qrToken = cuid()
    return tx.issuedTicket.findMany({ where: { bookingId: b.id } });
  });
}

async function scanTicket(qrToken) {
  const r = await prisma.issuedTicket.updateMany({ where: { qrToken, status: 'VALID' },
                                                   data: { status: 'USED', scannedAt: new Date() } });
  if (r.count === 0) throw new Error('INVALID_OR_USED');
}

async function revenueByTicketType() {
  return prisma.$queryRaw`SELECT tt.name, SUM(p.amount)::int AS revenue FROM "Payment" p
    JOIN "Booking" b ON b.id = p."bookingId" JOIN "TicketType" tt ON tt.id = b."ticketTypeId"
    WHERE p.status = 'SUCCESS' GROUP BY tt.name ORDER BY revenue DESC`;
}
module.exports = { createBooking, confirmPayment, scanTicket, revenueByTicketType };
