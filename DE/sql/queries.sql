-- MuseumX: 10 Project Queries

\echo '=== 1. INSERT: a visitor creates a booking (awaiting payment) ==='
INSERT INTO "Booking" ("bookingCode","userId","ticketTypeId","dailyCapacityId",
                       "quantity","unitPrice","totalAmount","status","target","date","updatedAt")
VALUES ('MXDEMO01', 1, 1, 1, 3, 100, 300, 'PENDING_PAYMENT', 'entry', '2026-11-25', NOW());

\echo '=== 2. UPDATE: payment succeeds, booking becomes CONFIRMED ==='
UPDATE "Booking" SET "status" = 'CONFIRMED', "updatedAt" = NOW()
WHERE "bookingCode" = 'MXDEMO01';

\echo '=== 3. UPDATE: gate scan accepts a VALID QR once (running it again changes 0 rows) ==='
UPDATE "IssuedTicket" SET "status" = 'USED', "scannedAt" = NOW()
WHERE "qrToken" = 'QR-BK-BBB7FFEE-2' AND "status" = 'VALID';

\echo '=== 4. DELETE: remove old unpaid bookings that never had a payment attempt ==='
DELETE FROM "Booking"
WHERE "status" = 'PENDING_PAYMENT'
  AND "createdAt" < NOW() - INTERVAL '1 day'
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."bookingId" = "Booking"."id");

\echo '=== 5. SELECT + filter + sort: one user''s booking history, newest first ==='
SELECT b."bookingCode", tt."name" AS ticket, b."quantity", b."totalAmount", b."status"
FROM "Booking" b
JOIN "User" u ON u."id" = b."userId"
JOIN "TicketType" tt ON tt."id" = b."ticketTypeId"
WHERE u."email" = 'akshat@email.com'
ORDER BY b."createdAt" DESC;

\echo '=== 6. Aggregates: dashboard numbers for confirmed bookings ==='
SELECT COUNT(*) AS bookings, SUM("quantity") AS visitors,
       SUM("totalAmount") AS booked_value, ROUND(AVG("totalAmount"), 2) AS avg_booking
FROM "Booking" WHERE "status" = 'CONFIRMED';

\echo '=== 7. GROUP BY + JOIN: revenue per ticket type from paid payments ==='
SELECT tt."name" AS ticket_type, COUNT(*) AS payments, SUM(p."amount") AS revenue
FROM "Payment" p
JOIN "Booking" b ON b."id" = p."bookingId"
JOIN "TicketType" tt ON tt."id" = b."ticketTypeId"
WHERE p."status" = 'PAID'
GROUP BY tt."name"
ORDER BY revenue DESC;

\echo '=== 8. HAVING: busy dates with 5 or more confirmed visitors ==='
SELECT d."visitDate", SUM(b."quantity") AS visitors
FROM "Booking" b
JOIN "DailyCapacity" d ON d."id" = b."dailyCapacityId"
WHERE b."status" = 'CONFIRMED'
GROUP BY d."visitDate"
HAVING SUM(b."quantity") >= 5
ORDER BY visitors DESC;

\echo '=== 9. Multi-table JOIN: what the gate sees when a QR code is scanned ==='
SELECT t."qrToken", t."status" AS ticket_status, b."bookingCode",
       u."name" AS visitor, tt."name" AS ticket_type, b."date"
FROM "IssuedTicket" t
JOIN "Booking" b ON b."id" = t."bookingId"
JOIN "User" u ON u."id" = b."userId"
JOIN "TicketType" tt ON tt."id" = b."ticketTypeId"
WHERE t."qrToken" = 'QR-BK-BBB7FFEE-2';

\echo '=== 10. Subquery: bookings worth more than the average booking ==='
SELECT "bookingCode", "totalAmount", "status"
FROM "Booking"
WHERE "totalAmount" > (SELECT AVG("totalAmount") FROM "Booking")
ORDER BY "totalAmount" DESC;
