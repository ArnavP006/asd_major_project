-- Every statement below is EXPECTED TO FAIL; this proves the constraints work.
\echo '--- duplicate user email (UNIQUE) ---'
INSERT INTO "User" ("name","email","passwordHash") VALUES ('Dup','asha@example.com','x');
\echo '--- booking for non-existent user (FOREIGN KEY) ---'
INSERT INTO "Booking" ("userId","ticketTypeId","dailyCapacityId","quantity","unitPrice","totalAmount") VALUES (999,1,1,1,100,100);
\echo '--- quantity zero (CHECK) ---'
INSERT INTO "Booking" ("userId","ticketTypeId","dailyCapacityId","quantity","unitPrice","totalAmount") VALUES (1,1,1,0,100,0);
\echo '--- total does not match quantity x unitPrice (CHECK) ---'
INSERT INTO "Booking" ("userId","ticketTypeId","dailyCapacityId","quantity","unitPrice","totalAmount") VALUES (1,1,1,2,100,999);
\echo '--- overbooking: bookedCount above capacity (CHECK) ---'
UPDATE "DailyCapacity" SET "bookedCount" = capacity + 1 WHERE id = 1;
\echo '--- invalid booking status (CHECK) ---'
UPDATE "Booking" SET status = 'MAYBE' WHERE id = 1;
\echo '--- negative ticket price (CHECK) ---'
UPDATE "TicketType" SET price = -10 WHERE id = 1;
\echo '--- duplicate QR token (UNIQUE) ---'
INSERT INTO "IssuedTicket" ("bookingId","qrToken") VALUES (1,'QR-001-1');
\echo '--- ticket marked USED without scan time (CHECK) ---'
UPDATE "IssuedTicket" SET status='USED', "scannedAt"=NULL WHERE "qrToken" = 'QR-009-2';
\echo '--- two capacity rows for the same date (UNIQUE) ---'
INSERT INTO "DailyCapacity" ("visitDate","capacity") VALUES ('2026-11-14', 100);
\echo '--- deleting a booking that has payments (FK RESTRICT) ---'
DELETE FROM "Booking" WHERE id = 1;
\echo '--- same gateway payment reference recorded twice (UNIQUE partial index) ---'
INSERT INTO "Payment" ("bookingId","amount","providerReference") VALUES (9, 300, 'pay_001');
