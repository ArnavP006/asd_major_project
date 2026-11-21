-- Index effect demo on a scratch copy with 200,000 bookings (temp table, nothing persists).
CREATE TEMP TABLE booking_big AS SELECT * FROM "Booking" WITH NO DATA;
INSERT INTO booking_big ("id","bookingCode","userId","ticketTypeId","dailyCapacityId","quantity","unitPrice","totalAmount","status","createdAt")
SELECT g, 'B'||g, 1 + (g % 5000), 1 + (g % 4), 1 + (g % 365), 2, 100, 200,
       CASE WHEN g % 10 = 0 THEN 'CANCELLED' ELSE 'CONFIRMED' END,
       TIMESTAMP '2026-01-01' + (g % 300 || ' hours')::interval
FROM generate_series(1,200000) g;
ANALYZE booking_big;
\echo '--- "My bookings" query WITHOUT index ---'
EXPLAIN ANALYZE SELECT * FROM booking_big WHERE "userId" = 1234 ORDER BY "createdAt" DESC;
CREATE INDEX idx_big_user_created ON booking_big("userId","createdAt");
ANALYZE booking_big;
\echo '--- same query WITH index (userId, createdAt) - same as Booking_userId_createdAt_idx ---'
EXPLAIN ANALYZE SELECT * FROM booking_big WHERE "userId" = 1234 ORDER BY "createdAt" DESC;
