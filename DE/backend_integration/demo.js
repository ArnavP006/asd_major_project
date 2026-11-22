const pool = require('./db');
const svc = require('./bookingService.pg');

const show = (t, v) => console.log(`\n>>> ${t}\n${JSON.stringify(v, null, 2)}`);
const check = async (sql, params = []) => {
  const r = await pool.query(sql, params);
  console.log(`   [DB check] ${sql.replace(/\s+/g, ' ').trim()}  params=${JSON.stringify(params)}\n   ${JSON.stringify(r.rows)}`);
};
const attempt = async (title, fn) => {
  try { show(title, await fn()); } catch (e) { console.log(`\n>>> ${title}\nREJECTED [${e.code || e.constraint || 'ERROR'}]: ${e.message}`); }
};

(async () => {
  show('READ: availability from 2026-11-22', await svc.getAvailability('2026-11-22'));

  const b = await svc.createBooking({ userId: 8, ticketTypeId: 3, date: '2026-11-22', quantity: 4, target: 'show',
                                      refId: 3, refName: 'Robotics Live', slotId: 'show-3', slotLabel: '17:00-18:00' });
  show('CREATE: Neha (user 8) books 4 Student tickets for Robotics Live', b);
  await check(`SELECT "bookingCode", status, quantity, "totalAmount" FROM "Booking" WHERE "bookingCode" = $1`, [b.bookingCode]);
  await check(`SELECT "bookedCount" FROM "DailyCapacity" WHERE "visitDate" = '2026-11-22'`);

  await attempt('VALIDATION: quantity 0', () => svc.createBooking({ userId: 8, ticketTypeId: 1, date: '2026-11-22', quantity: 0 }));
  await attempt('VALIDATION: 5000 tickets exceeds the per-booking limit', () => svc.createBooking({ userId: 8, ticketTypeId: 1, date: '2026-11-22', quantity: 5000 }));
  await attempt('FK: user 999 does not exist', () => svc.createBooking({ userId: 999, ticketTypeId: 1, date: '2026-11-22', quantity: 1 }));
  await check(`SELECT COUNT(*)::int AS bookings_for_user_8 FROM "Booking" WHERE "userId" = 8`);

  show('UPDATE: payment verified -> booking confirmed, QR tickets issued', await svc.confirmPayment(b.bookingCode, 'pay_demo_001'));
  await check(`SELECT status FROM "Booking" WHERE "bookingCode" = $1`, [b.bookingCode]);
  await check(`SELECT status, "providerReference" FROM "Payment" WHERE "bookingId" = $1`, [b.id]);
  await attempt('Confirm same booking twice', () => svc.confirmPayment(b.bookingCode, 'pay_demo_001'));

  const qr = 'QR-' + b.bookingCode + '-1';
  await attempt('UPDATE: gate scan #1', () => svc.scanTicket(qr));
  await attempt('UPDATE: gate scan #2 (same QR)', () => svc.scanTicket(qr));
  await check(`SELECT "qrToken", status, "scannedAt" IS NOT NULL AS scanned FROM "IssuedTicket" WHERE "bookingId" = $1 ORDER BY id`, [b.id]);

  const user = (await pool.query('SELECT name, email FROM "User" WHERE id = $1', [b.userId])).rows[0];
  const targetEmail = user ? user.email : 'neha@example.com';
  show(`READ: ${user ? user.name : 'Neha'} bookings`, await svc.getUserBookings(targetEmail));

  await attempt('DELETE/CANCEL: booking with a scanned ticket', () => svc.cancelBooking(b.bookingCode));
  const b2 = await svc.createBooking({ userId: 8, ticketTypeId: 1, date: '2026-11-22', quantity: 2 });
  await svc.confirmPayment(b2.bookingCode, 'pay_demo_002');
  await check(`SELECT "bookedCount" FROM "DailyCapacity" WHERE "visitDate" = '2026-11-22'`);
  await attempt('CANCEL: second booking (refund + release seats)', () => svc.cancelBooking(b2.bookingCode));
  await check(`SELECT "bookedCount" FROM "DailyCapacity" WHERE "visitDate" = '2026-11-22'`);
  await check(`SELECT status FROM "Payment" WHERE "bookingId" = $1`, [b2.id]);

  await pool.query(`
    DELETE FROM "IssuedTicket" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE date = '2026-12-25');
    DELETE FROM "Payment" WHERE "bookingId" IN (SELECT id FROM "Booking" WHERE date = '2026-12-25');
    DELETE FROM "Booking" WHERE date = '2026-12-25';
    DELETE FROM "DailyCapacity" WHERE "visitDate" = '2026-12-25';
  `);
  const results = await Promise.allSettled([1, 2].map(() =>
    svc.createBooking({ userId: 8, ticketTypeId: 1, date: '2026-12-25', quantity: 1, defaultCapacity: 1 })));
  console.log('\n>>> CONCURRENCY: two simultaneous buyers, 1 seat left');
  results.forEach((r, i) => console.log(`   buyer ${i + 1}: ${r.status === 'fulfilled' ? 'GOT THE SEAT (' + r.value.bookingCode + ')' : 'REJECTED [' + r.reason.code + '] ' + r.reason.message}`));
  await check(`SELECT capacity, "bookedCount" FROM "DailyCapacity" WHERE "visitDate" = '2026-12-25'`);

  show('REPORT: revenue by ticket type', await svc.revenueReport());
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
