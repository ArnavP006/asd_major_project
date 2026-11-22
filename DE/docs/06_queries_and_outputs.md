# 6. Queries and Execution Outputs

10 project-specific queries run against PostgreSQL (Neon DB). Source: `sql/queries.sql`. Raw output: `evidence/query_outputs.txt`.

Coverage:
- INSERT (Q1)
- UPDATE (Q2, Q3)
- DELETE (Q4)
- SELECT with filter and sort (Q5)
- Aggregates (Q6)
- GROUP BY + JOIN (Q7)
- HAVING (Q8)
- Multi-table JOIN (Q9)
- Subquery (Q10)

---

## 1. INSERT: A visitor creates a booking (awaiting payment)

**Business need:** A visitor selects tickets and initiates a booking.

```sql
INSERT INTO "Booking" ("bookingCode","userId","ticketTypeId","dailyCapacityId",
                       "quantity","unitPrice","totalAmount","status","target","date","updatedAt")
VALUES ('MXDEMO01', 1, 1, 1, 3, 100, 300, 'PENDING_PAYMENT', 'entry', '2026-11-25', NOW());
```

**Output:**
```
INSERT 0 1
```

---

## 2. UPDATE: Payment succeeds, booking becomes CONFIRMED

**Business need:** When payment is verified, the booking status transitions to CONFIRMED.

```sql
UPDATE "Booking" SET "status" = 'CONFIRMED', "updatedAt" = NOW()
WHERE "bookingCode" = 'MXDEMO01';
```

**Output:**
```
UPDATE 1
```

---

## 3. UPDATE: Gate scan accepts a VALID QR once

**Business need:** At the entry gate, scanning a valid ticket marks it as USED with a scan timestamp. Running it again prevents duplicate entry (0 rows modified).

```sql
UPDATE "IssuedTicket" SET "status" = 'USED', "scannedAt" = NOW()
WHERE "qrToken" = 'QR-BK-BBB7FFEE-2' AND "status" = 'VALID';
```

**Output:**
```
UPDATE 1
```

---

## 4. DELETE: Remove old unpaid bookings that never had a payment attempt

**Business need:** Purge stale bookings that were abandoned before payment was initiated.

```sql
DELETE FROM "Booking"
WHERE "status" = 'PENDING_PAYMENT'
  AND "createdAt" < NOW() - INTERVAL '1 day'
  AND NOT EXISTS (SELECT 1 FROM "Payment" p WHERE p."bookingId" = "Booking"."id");
```

**Output:**
```
DELETE 1
```

---

## 5. SELECT + filter + sort: One user's booking history, newest first

**Business need:** Display a visitor's booking history in chronological order.

```sql
SELECT b."bookingCode", tt."name" AS ticket, b."quantity", b."totalAmount", b."status"
FROM "Booking" b
JOIN "User" u ON u."id" = b."userId"
JOIN "TicketType" tt ON tt."id" = b."ticketTypeId"
WHERE u."email" = 'akshat@email.com'
ORDER BY b."createdAt" DESC;
```

**Output:**
```
 bookingCode |    ticket     | quantity | totalAmount |     status      
-------------+---------------+----------+-------------+-----------------
 BK-8FFACD73 | General Entry |        1 |       10000 | PENDING_PAYMENT
 BK-0FFEBE3F | General Entry |        2 |       20000 | CANCELLED
 BK-35259044 | Child         |        4 |       16000 | CONFIRMED
 BK-5EA5F474 | General Entry |        2 |       20000 | CANCELLED
 BK-7ABC8A3A | Child         |        4 |       16000 | CONFIRMED
 BK-E41B95EC | General Entry |        2 |       20000 | CANCELLED
 BK-7BD20FDE | Child         |        4 |       16000 | CONFIRMED
 BK-EDA5E917 | General Entry |        2 |       20000 | CANCELLED
 BK-68B41150 | Child         |        4 |       16000 | CONFIRMED
 BK-65910ED9 | General Entry |        2 |       20000 | CANCELLED
 BK-4C51020C | Child         |        4 |       16000 | CONFIRMED
 BK-9913D1DC | General Entry |        1 |       10000 | PENDING_PAYMENT
 BK-2EA3C215 | General Entry |        1 |       10000 | PENDING_PAYMENT
 BK-46E26384 | General Entry |        2 |       20000 | CANCELLED
 BK-BBB7FFEE | Child         |        4 |       16000 | CONFIRMED
 MX88C67E7B  | Student       |        1 |        5000 | CONFIRMED
(16 rows)
```

---

## 6. Aggregates: Dashboard numbers for confirmed bookings

**Business need:** Management overview of confirmed bookings, total visitor headcount, revenue, and average booking value.

```sql
SELECT COUNT(*) AS bookings, SUM("quantity") AS visitors,
       SUM("totalAmount") AS booked_value, ROUND(AVG("totalAmount"), 2) AS avg_booking
FROM "Booking" WHERE "status" = 'CONFIRMED';
```

**Output:**
```
 bookings | visitors | booked_value | avg_booking 
----------+----------+--------------+-------------
       13 |       37 |       182300 |    14023.08
(1 row)
```

---

## 7. GROUP BY + JOIN: Revenue per ticket type from paid payments

**Business need:** Breakdown of realized revenue and payment counts across all ticket categories.

```sql
SELECT tt."name" AS ticket_type, COUNT(*) AS payments, SUM(p."amount") AS revenue
FROM "Payment" p
JOIN "Booking" b ON b."id" = p."bookingId"
JOIN "TicketType" tt ON tt."id" = b."ticketTypeId"
WHERE p."status" = 'PAID'
GROUP BY tt."name"
ORDER BY revenue DESC;
```

**Output:**
```
  ticket_type  | payments | revenue 
---------------+----------+---------
 Child         |        6 |   96000
 General Entry |        3 |   60000
 Adult         |        1 |   16000
 Student       |        2 |   10000
(4 rows)
```

---

## 8. HAVING: Busy dates with 5 or more confirmed visitors

**Business need:** Identify high-volume visitation dates for crowd management and capacity planning.

```sql
SELECT d."visitDate", SUM(b."quantity") AS visitors
FROM "Booking" b
JOIN "DailyCapacity" d ON d."id" = b."dailyCapacityId"
WHERE b."status" = 'CONFIRMED'
GROUP BY d."visitDate"
HAVING SUM(b."quantity") >= 5
ORDER BY visitors DESC;
```

**Output:**
```
 visitDate  | visitors 
------------+----------
 2026-11-22 |       24
 2026-12-11 |        7
(2 rows)
```

---

## 9. Multi-table JOIN: What the gate sees when a QR code is scanned

**Business need:** Gate scanner verification pulling ticket status, booking code, visitor name, ticket tier, and visit date in a single joined query.

```sql
SELECT t."qrToken", t."status" AS ticket_status, b."bookingCode",
       u."name" AS visitor, tt."name" AS ticket_type, b."date"
FROM "IssuedTicket" t
JOIN "Booking" b ON b."id" = t."bookingId"
JOIN "User" u ON u."id" = b."userId"
JOIN "TicketType" tt ON tt."id" = b."ticketTypeId"
WHERE t."qrToken" = 'QR-BK-BBB7FFEE-2';
```

**Output:**
```
     qrToken      | ticket_status | bookingCode | visitor | ticket_type |    date    
------------------+---------------+-------------+---------+-------------+------------
 QR-BK-BBB7FFEE-2 | USED          | BK-BBB7FFEE | akshat  | Child       | 2026-11-22
(1 row)
```

---

## 10. Subquery: Bookings worth more than the average booking

**Business need:** High-value booking identification comparing individual booking totals against overall booking average.

```sql
SELECT "bookingCode", "totalAmount", "status"
FROM "Booking"
WHERE "totalAmount" > (SELECT AVG("totalAmount") FROM "Booking")
ORDER BY "totalAmount" DESC;
```

**Output:**
```
        bookingCode        | totalAmount |  status   
---------------------------+-------------+-----------
 cmwc5skcn0001it1ofyg77gn0 |       20000 | CONFIRMED
 cmwc5u3ik0001it56ohjy7vhg |       20000 | CONFIRMED
 cmwc5xsnl0001itl4ivk4p8s2 |       20000 | CONFIRMED
 BK-46E26384               |       20000 | CANCELLED
 BK-65910ED9               |       20000 | CANCELLED
 BK-EDA5E917               |       20000 | CANCELLED
 BK-E41B95EC               |       20000 | CANCELLED
 BK-0FFEBE3F               |       20000 | CANCELLED
 BK-5EA5F474               |       20000 | CANCELLED
 BK-7ABC8A3A               |       16000 | CONFIRMED
 MX4167F2F4                |       16000 | CONFIRMED
 BK-BBB7FFEE               |       16000 | CONFIRMED
 BK-7BD20FDE               |       16000 | CONFIRMED
 BK-4C51020C               |       16000 | CONFIRMED
 BK-35259044               |       16000 | CONFIRMED
 BK-68B41150               |       16000 | CONFIRMED
(16 rows)
```
