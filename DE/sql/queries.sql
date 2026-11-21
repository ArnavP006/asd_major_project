-- MuseumX: 15 project-specific queries. Run: psql -d museumx -f sql/queries.sql

\echo '=== Q1 INSERT (transaction): visitor books 3 Adult tickets for 2026-11-23, capacity is checked and locked ==='
BEGIN;
WITH cap AS (
  SELECT id, capacity - "bookedCount" AS remaining FROM "DailyCapacity" WHERE "visitDate" = '2026-11-23' FOR UPDATE),
tt AS (SELECT id, price FROM "TicketType" WHERE name = 'Adult'),
nb AS (
  INSERT INTO "Booking" ("bookingCode","userId","ticketTypeId","dailyCapacityId","quantity","unitPrice","totalAmount",
                         "target","date","slotId","slotLabel")
  SELECT 'BK-015', 7, tt.id, cap.id, 3, tt.price, 3*tt.price, 'entry', '2026-11-23', 'entry-1', '10:00-12:00'
  FROM cap, tt WHERE cap.remaining >= 3
  RETURNING id, "dailyCapacityId", quantity, "totalAmount"),
np AS (INSERT INTO "Payment" ("bookingId","amount","provider") SELECT id, "totalAmount", 'RAZORPAY' FROM nb RETURNING "bookingId")
UPDATE "DailyCapacity" d SET "bookedCount" = d."bookedCount" + nb.quantity FROM nb WHERE d.id = nb."dailyCapacityId";
COMMIT;
SELECT b."bookingCode", b.status, b.quantity, b."totalAmount", p.status AS payment_status, d."bookedCount" AS day_booked
FROM "Booking" b JOIN "Payment" p ON p."bookingId" = b.id JOIN "DailyCapacity" d ON d.id = b."dailyCapacityId"
WHERE b."bookingCode" = 'BK-015';

\echo '=== Q2 UPDATE: payment succeeds -> booking CONFIRMED and QR tickets issued ==='
WITH p AS (
  UPDATE "Payment" SET status = 'SUCCESS', "paidAt" = NOW(), "providerReference" = 'pay_015'
  WHERE "bookingId" = (SELECT id FROM "Booking" WHERE "bookingCode" = 'BK-015') AND status = 'PENDING'
  RETURNING "bookingId"),
b AS (UPDATE "Booking" SET status = 'CONFIRMED', "updatedAt" = NOW() FROM p WHERE "Booking".id = p."bookingId"
      RETURNING "Booking".id, "Booking".quantity)
INSERT INTO "IssuedTicket" ("bookingId","qrToken") SELECT b.id, 'QR-015-' || n FROM b, generate_series(1, b.quantity) n;
SELECT b."bookingCode", b.status, COUNT(t.id) AS tickets_issued
FROM "Booking" b JOIN "IssuedTicket" t ON t."bookingId" = b.id WHERE b."bookingCode" = 'BK-015' GROUP BY b."bookingCode", b.status;

\echo '=== Q3 UPDATE: gate scan - first scan accepted ==='
UPDATE "IssuedTicket" SET status = 'USED', "scannedAt" = NOW()
WHERE "qrToken" = 'QR-015-1' AND status = 'VALID' RETURNING "qrToken", status;
\echo '=== Q3b same QR scanned again - rejected (0 rows) = duplicate entry prevented ==='
UPDATE "IssuedTicket" SET status = 'USED', "scannedAt" = NOW()
WHERE "qrToken" = 'QR-015-1' AND status = 'VALID' RETURNING "qrToken", status;

\echo '=== Q4 DELETE: purge abandoned unpaid bookings (no payment attempt, older than 2026-11-20) and release their seats ==='
WITH del AS (
  DELETE FROM "Booking"
  WHERE status = 'PENDING_PAYMENT' AND "createdAt" < '2026-11-20'
    AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."bookingId" = "Booking".id)
  RETURNING "bookingCode", "dailyCapacityId", quantity),
rel AS (
  UPDATE "DailyCapacity" d SET "bookedCount" = d."bookedCount" - s.q
  FROM (SELECT "dailyCapacityId", SUM(quantity) AS q FROM del GROUP BY 1) s WHERE d.id = s."dailyCapacityId"
  RETURNING d."visitDate", d."bookedCount")
SELECT del."bookingCode" AS deleted_booking, rel."visitDate", rel."bookedCount" AS new_booked_count
FROM del JOIN "DailyCapacity" d ON d.id = del."dailyCapacityId" JOIN rel ON rel."visitDate" = d."visitDate";

\echo '=== Q5 SELECT + filter + sort: booking history of Asha Patil, newest first ==='
SELECT b."bookingCode", tt.name AS ticket, b.quantity, b."totalAmount", b.date, b.status
FROM "Booking" b JOIN "User" u ON u.id = b."userId" JOIN "TicketType" tt ON tt.id = b."ticketTypeId"
WHERE u.email = 'asha@example.com' ORDER BY b."createdAt" DESC;

\echo '=== Q6 Real-time availability: remaining seats from 2026-11-21 onwards ==='
SELECT "visitDate", capacity, "bookedCount", capacity - "bookedCount" AS remaining,
       ROUND(100.0 * "bookedCount" / capacity, 1) AS pct_full
FROM "DailyCapacity" WHERE "visitDate" >= '2026-11-21' ORDER BY "visitDate";

\echo '=== Q7 Aggregates: overall dashboard numbers ==='
SELECT COUNT(*) FILTER (WHERE status = 'CONFIRMED')            AS confirmed_bookings,
       COALESCE(SUM(quantity) FILTER (WHERE status = 'CONFIRMED'), 0) AS total_visitors,
       COALESCE(SUM("totalAmount") FILTER (WHERE status = 'CONFIRMED'), 0) AS booked_value,
       ROUND(AVG("totalAmount") FILTER (WHERE status = 'CONFIRMED'), 2) AS avg_booking_value
FROM "Booking";

\echo '=== Q8 GROUP BY + JOIN: realised revenue per ticket type (only SUCCESS payments) ==='
SELECT tt.name AS ticket_type, COUNT(DISTINCT b.id) AS bookings, SUM(b.quantity) AS tickets, SUM(p.amount) AS revenue
FROM "Payment" p JOIN "Booking" b ON b.id = p."bookingId" JOIN "TicketType" tt ON tt.id = b."ticketTypeId"
WHERE p.status = 'SUCCESS' GROUP BY tt.name ORDER BY revenue DESC;

\echo '=== Q9 GROUP BY: most popular exhibitions and shows ==='
SELECT target, "refName" AS name, COUNT(*) AS bookings, SUM(quantity) AS visitors
FROM "Booking" WHERE status = 'CONFIRMED' AND target IN ('exhibition','show')
GROUP BY target, "refName" ORDER BY visitors DESC, name;

\echo '=== Q10 HAVING: peak days - dates with 5 or more confirmed visitors ==='
SELECT d."visitDate", SUM(b.quantity) AS visitors, COUNT(*) AS bookings
FROM "Booking" b JOIN "DailyCapacity" d ON d.id = b."dailyCapacityId"
WHERE b.status = 'CONFIRMED' GROUP BY d."visitDate" HAVING SUM(b.quantity) >= 5 ORDER BY visitors DESC, d."visitDate";

\echo '=== Q11 JOIN (4 tables): QR verification at the gate for token QR-005-2 ==='
SELECT t."qrToken", t.status AS ticket_status, b."bookingCode", u.name AS visitor, tt.name AS ticket_type, b.date, b."slotLabel"
FROM "IssuedTicket" t JOIN "Booking" b ON b.id = t."bookingId" JOIN "User" u ON u.id = b."userId"
JOIN "TicketType" tt ON tt.id = b."ticketTypeId" WHERE t."qrToken" = 'QR-005-2';

\echo '=== Q12 LEFT JOIN: registered visitors who never booked (marketing list) ==='
SELECT u.id, u.name, u.email FROM "User" u LEFT JOIN "Booking" b ON b."userId" = u.id WHERE b.id IS NULL;

\echo '=== Q13 Subquery: bookings worth more than the average booking ==='
SELECT "bookingCode", "totalAmount", status FROM "Booking"
WHERE "totalAmount" > (SELECT AVG("totalAmount") FROM "Booking") ORDER BY "totalAmount" DESC;

\echo '=== Q14 Advanced (CTE + window function): daily revenue with running total ==='
WITH daily AS (
  SELECT p."paidAt"::date AS day, SUM(p.amount) AS revenue FROM "Payment" p WHERE p.status = 'SUCCESS' GROUP BY 1)
SELECT day, revenue, SUM(revenue) OVER (ORDER BY day) AS running_total FROM daily WHERE day >= '2026-11-12' ORDER BY day;

\echo '=== Q15 Data-quality check (NOT EXISTS): confirmed bookings without a successful payment - expected 0 rows ==='
SELECT b."bookingCode", b.status FROM "Booking" b
WHERE b.status = 'CONFIRMED' AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."bookingId" = b.id AND p.status = 'SUCCESS');
