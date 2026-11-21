# 6. Queries and Execution Outputs

15 project-specific queries, all run against PostgreSQL 16 loaded with `sql/sample_data.sql`. Source: `sql/queries.sql`. Raw output: `evidence/query_outputs.txt`.

Coverage: INSERT (Q1), UPDATE (Q2, Q3), DELETE (Q4), SELECT with filter and sort (Q5, Q6), aggregates (Q7), GROUP BY (Q8, Q9), HAVING (Q10), JOINs (Q8, Q11, Q12), subqueries (Q13, Q15), advanced CTE and window functions (Q4, Q14).

> Q1 to Q4 change data, so later queries run on the modified data (BK-015 exists, BK-012 is gone). Reload with `./run_all.sh` to reproduce exactly.

## Q1 INSERT (transaction): visitor books 3 Adult tickets for 2026-11-23, capacity is checked and locked

**Business need:** Visitor books tickets.

**How it works:** Locks that day's `DailyCapacity` row (`FOR UPDATE`), checks that enough seats remain, inserts the `Booking` (status defaults to `PENDING_PAYMENT`), creates its `Payment` and increases `bookedCount` — all inside one transaction.

```sql
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
```

**Output:**
```
BEGIN
UPDATE 1
COMMIT
 bookingCode |     status      | quantity | totalAmount | payment_status | day_booked 
-------------+-----------------+----------+-------------+----------------+------------
 BK-015      | PENDING_PAYMENT |        3 |         300 | PENDING        |          9
(1 row)
```
**Expected result:** BK-015 is created as PENDING_PAYMENT with a PENDING payment; the day's `bookedCount` rises from 6 to 9.

## Q2 UPDATE: payment succeeds -> booking CONFIRMED and QR tickets issued

**Business need:** Payment succeeds.

**How it works:** One statement chain: marks the payment `SUCCESS`, flips the booking to `CONFIRMED`, and inserts one `IssuedTicket` per visitor with `generate_series`.

```sql
WITH p AS (
  UPDATE "Payment" SET status = 'SUCCESS', "paidAt" = NOW(), "providerReference" = 'pay_015'
  WHERE "bookingId" = (SELECT id FROM "Booking" WHERE "bookingCode" = 'BK-015') AND status = 'PENDING'
  RETURNING "bookingId"),
b AS (UPDATE "Booking" SET status = 'CONFIRMED', "updatedAt" = NOW() FROM p WHERE "Booking".id = p."bookingId"
      RETURNING "Booking".id, "Booking".quantity)
INSERT INTO "IssuedTicket" ("bookingId","qrToken") SELECT b.id, 'QR-015-' || n FROM b, generate_series(1, b.quantity) n;
SELECT b."bookingCode", b.status, COUNT(t.id) AS tickets_issued
FROM "Booking" b JOIN "IssuedTicket" t ON t."bookingId" = b.id WHERE b."bookingCode" = 'BK-015' GROUP BY b."bookingCode", b.status;
```

**Output:**
```
INSERT 0 3
 bookingCode |  status   | tickets_issued 
-------------+-----------+----------------
 BK-015      | CONFIRMED |              3
(1 row)
```
**Expected result:** 3 QR tickets are issued for BK-015.

## Q3 UPDATE: gate scan - first scan accepted

**Business need:** Gate scan (accepted).

**How it works:** `UPDATE ... WHERE status = 'VALID'` is atomic: it marks the ticket USED and stores `scannedAt`.

```sql
UPDATE "IssuedTicket" SET status = 'USED', "scannedAt" = NOW()
WHERE "qrToken" = 'QR-015-1' AND status = 'VALID' RETURNING "qrToken", status;
```

**Output:**
```
qrToken  | status 
----------+--------
 QR-015-1 | USED
(1 row)

UPDATE 1
```
**Expected result:** 1 row updated: the ticket is USED.

## Q3b same QR scanned again - rejected (0 rows) = duplicate entry prevented

**Business need:** Gate scan of the same QR (rejected).

**How it works:** Same statement again. Because the ticket is no longer VALID, zero rows match, so duplicate entry is prevented at database level.

```sql
UPDATE "IssuedTicket" SET status = 'USED', "scannedAt" = NOW()
WHERE "qrToken" = 'QR-015-1' AND status = 'VALID' RETURNING "qrToken", status;
```

**Output:**
```
qrToken | status 
---------+--------
(0 rows)

UPDATE 0
```
**Expected result:** 0 rows updated.

## Q4 DELETE: purge abandoned unpaid bookings (no payment attempt, older than 2026-11-20) and release their seats

**Business need:** Purge abandoned bookings and release seats.

**How it works:** A data-modifying CTE deletes unpaid bookings older than 2026-11-20 that have no payment attempt, then subtracts their quantity from `DailyCapacity.bookedCount` in the same statement.

```sql
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
```

**Output:**
```
deleted_booking | visitDate  | new_booked_count 
-----------------+------------+------------------
 BK-012          | 2026-11-22 |                3
(1 row)
```
**Expected result:** BK-012 is deleted and 2026-11-22 drops to 3 booked seats. BK-010 is kept because it already has a pending payment.

## Q5 SELECT + filter + sort: booking history of Asha Patil, newest first

**Business need:** Booking history of one visitor.

**How it works:** Filters by email, joins `User` and `TicketType`, sorts newest first. Served by `Booking_userId_createdAt_idx`.

```sql
SELECT b."bookingCode", tt.name AS ticket, b.quantity, b."totalAmount", b.date, b.status
FROM "Booking" b JOIN "User" u ON u.id = b."userId" JOIN "TicketType" tt ON tt.id = b."ticketTypeId"
WHERE u.email = 'asha@example.com' ORDER BY b."createdAt" DESC;
```

**Output:**
```
bookingCode | ticket | quantity | totalAmount |    date    |     status      
-------------+--------+----------+-------------+------------+-----------------
 BK-010      | Child  |        2 |         100 | 2026-11-21 | PENDING_PAYMENT
 BK-004      | Adult  |        1 |         100 | 2026-11-15 | CONFIRMED
 BK-001      | Adult  |        2 |         200 | 2026-11-14 | CONFIRMED
(3 rows)
```
**Expected result:** Asha's 3 bookings, newest first.

## Q6 Real-time availability: remaining seats from 2026-11-21 onwards

**Business need:** Real-time availability.

**How it works:** Computes remaining seats and percentage full for upcoming dates. The chatbot and booking page use this before accepting a booking.

```sql
SELECT "visitDate", capacity, "bookedCount", capacity - "bookedCount" AS remaining,
       ROUND(100.0 * "bookedCount" / capacity, 1) AS pct_full
FROM "DailyCapacity" WHERE "visitDate" >= '2026-11-21' ORDER BY "visitDate";
```

**Output:**
```
visitDate  | capacity | bookedCount | remaining | pct_full 
------------+----------+-------------+-----------+----------
 2026-11-21 |      800 |           5 |       795 |      0.6
 2026-11-22 |      800 |           3 |       797 |      0.4
 2026-11-23 |      500 |           9 |       491 |      1.8
(3 rows)
```
**Expected result:** One row per upcoming date with remaining seats.

## Q7 Aggregates: overall dashboard numbers

**Business need:** Dashboard totals.

**How it works:** Conditional aggregates (`FILTER`) over confirmed bookings: count, visitors, value and average booking value.

```sql
SELECT COUNT(*) FILTER (WHERE status = 'CONFIRMED')            AS confirmed_bookings,
       COALESCE(SUM(quantity) FILTER (WHERE status = 'CONFIRMED'), 0) AS total_visitors,
       COALESCE(SUM("totalAmount") FILTER (WHERE status = 'CONFIRMED'), 0) AS booked_value,
       ROUND(AVG("totalAmount") FILTER (WHERE status = 'CONFIRMED'), 2) AS avg_booking_value
FROM "Booking";
```

**Output:**
```
confirmed_bookings | total_visitors | booked_value | avg_booking_value 
--------------------+----------------+--------------+-------------------
                 12 |             34 |         2980 |            248.33
(1 row)
```
**Expected result:** 12 confirmed bookings, 34 visitors, ₹2980 booked value.

## Q8 GROUP BY + JOIN: realised revenue per ticket type (only SUCCESS payments)

**Business need:** Realised revenue per ticket type.

**How it works:** Joins `Payment`, `Booking`, `TicketType`; counts only `SUCCESS` payments, so failed attempts and refunds are excluded.

```sql
SELECT tt.name AS ticket_type, COUNT(DISTINCT b.id) AS bookings, SUM(b.quantity) AS tickets, SUM(p.amount) AS revenue
FROM "Payment" p JOIN "Booking" b ON b.id = p."bookingId" JOIN "TicketType" tt ON tt.id = b."ticketTypeId"
WHERE p.status = 'SUCCESS' GROUP BY tt.name ORDER BY revenue DESC;
```

**Output:**
```
ticket_type | bookings | tickets | revenue 
-------------+----------+---------+---------
 Adult       |        9 |      24 |    2400
 Student     |        2 |       8 |     480
 Child       |        1 |       2 |     100
(3 rows)
```
**Expected result:** Adult earns the most; Child the least.

## Q9 GROUP BY: most popular exhibitions and shows

**Business need:** Popular exhibitions and shows.

**How it works:** Groups confirmed bookings by target and name and ranks by visitors.

```sql
SELECT target, "refName" AS name, COUNT(*) AS bookings, SUM(quantity) AS visitors
FROM "Booking" WHERE status = 'CONFIRMED' AND target IN ('exhibition','show')
GROUP BY target, "refName" ORDER BY visitors DESC, name;
```

**Output:**
```
target   |       name       | bookings | visitors 
------------+------------------+----------+----------
 exhibition | Dinosaur Gallery |        2 |        8
 show       | 3D Science Show  |        1 |        2
 exhibition | Human Body       |        1 |        2
 show       | Planetarium Show |        1 |        2
 show       | Robotics Live    |        1 |        1
 exhibition | Space Odyssey    |        1 |        1
(6 rows)
```
**Expected result:** Dinosaur Gallery leads with 8 visitors.

## Q10 HAVING: peak days - dates with 5 or more confirmed visitors

**Business need:** Peak visitor days.

**How it works:** `GROUP BY` date with `HAVING SUM(quantity) >= 5` keeps only busy days.

```sql
SELECT d."visitDate", SUM(b.quantity) AS visitors, COUNT(*) AS bookings
FROM "Booking" b JOIN "DailyCapacity" d ON d.id = b."dailyCapacityId"
WHERE b.status = 'CONFIRMED' GROUP BY d."visitDate" HAVING SUM(b.quantity) >= 5 ORDER BY visitors DESC, d."visitDate";
```

**Output:**
```
visitDate  | visitors | bookings 
------------+----------+----------
 2026-11-23 |        9 |        2
 2026-11-14 |        5 |        2
 2026-11-20 |        5 |        1
(3 rows)
```
**Expected result:** 3 peak dates, led by 2026-11-23.

## Q11 JOIN (4 tables): QR verification at the gate for token QR-005-2

**Business need:** QR verification at the gate.

**How it works:** Four-table join that returns everything the gate needs about a QR token.

```sql
SELECT t."qrToken", t.status AS ticket_status, b."bookingCode", u.name AS visitor, tt.name AS ticket_type, b.date, b."slotLabel"
FROM "IssuedTicket" t JOIN "Booking" b ON b.id = t."bookingId" JOIN "User" u ON u.id = b."userId"
JOIN "TicketType" tt ON tt.id = b."ticketTypeId" WHERE t."qrToken" = 'QR-005-2';
```

**Output:**
```
qrToken  | ticket_status | bookingCode |   visitor   | ticket_type |    date    |  slotLabel  
----------+---------------+-------------+-------------+-------------+------------+-------------
 QR-005-2 | USED          | BK-005      | Karan Singh | Adult       | 2026-11-16 | 12:00-14:00
(1 row)
```
**Expected result:** Token QR-005-2 belongs to Karan Singh, Adult, and was already used.

## Q12 LEFT JOIN: registered visitors who never booked (marketing list)

**Business need:** Visitors who never booked.

**How it works:** `LEFT JOIN` plus `IS NULL` finds users with no bookings (marketing list).

```sql
SELECT u.id, u.name, u.email FROM "User" u LEFT JOIN "Booking" b ON b."userId" = u.id WHERE b.id IS NULL;
```

**Output:**
```
id |    name    |      email       
----+------------+------------------
  8 | Neha Desai | neha@example.com
(1 row)
```
**Expected result:** Neha Desai.

## Q13 Subquery: bookings worth more than the average booking

**Business need:** Above-average bookings.

**How it works:** Scalar subquery computes the average booking amount and the outer query filters on it.

```sql
SELECT "bookingCode", "totalAmount", status FROM "Booking"
WHERE "totalAmount" > (SELECT AVG("totalAmount") FROM "Booking") ORDER BY "totalAmount" DESC;
```

**Output:**
```
bookingCode | totalAmount |  status   
-------------+-------------+-----------
 BK-014      |         600 | CONFIRMED
 BK-005      |         400 | CONFIRMED
 BK-008      |         300 | CONFIRMED
 BK-009      |         300 | CONFIRMED
 BK-015      |         300 | CONFIRMED
(5 rows)
```
**Expected result:** Bookings worth more than the average.

## Q14 Advanced (CTE + window function): daily revenue with running total

**Business need:** Daily revenue with running total.

**How it works:** CTE aggregates revenue per payment date, then a window function `SUM() OVER (ORDER BY day)` adds the cumulative total.

```sql
WITH daily AS (
  SELECT p."paidAt"::date AS day, SUM(p.amount) AS revenue FROM "Payment" p WHERE p.status = 'SUCCESS' GROUP BY 1)
SELECT day, revenue, SUM(revenue) OVER (ORDER BY day) AS running_total FROM daily WHERE day >= '2026-11-12' ORDER BY day;
```

**Output:**
```
day     | revenue | running_total 
------------+---------+---------------
 2026-11-12 |     380 |           380
 2026-11-13 |     200 |           580
 2026-11-14 |     400 |           980
 2026-11-16 |     200 |          1180
 2026-11-18 |     300 |          1480
 2026-11-19 |     300 |          1780
 2026-11-20 |     900 |          2680
 2026-11-21 |     300 |          2980
(8 rows)
```
**Expected result:** Revenue per day and cumulative total.

## Q15 Data-quality check (NOT EXISTS): confirmed bookings without a successful payment - expected 0 rows

**Business need:** Data-quality check.

**How it works:** `NOT EXISTS` looks for confirmed bookings without a successful payment, which should never happen.

```sql
SELECT b."bookingCode", b.status FROM "Booking" b
WHERE b.status = 'CONFIRMED' AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."bookingId" = b.id AND p.status = 'SUCCESS');
```

**Output:**
```
bookingCode | status 
-------------+--------
(0 rows)
```
**Expected result:** 0 rows = data is consistent.

