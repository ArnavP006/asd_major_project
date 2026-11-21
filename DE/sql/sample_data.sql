-- Sample data for MuseumX (passwords are placeholders, NOT real hashes)
INSERT INTO "Admin" ("email","passwordHash","name","role") VALUES
('admin@museumx.in','$2b$10$placeholderhashadmin1','Museum Admin','admin'),
('manager@museumx.in','$2b$10$placeholderhashadmin2','Ticket Manager','manager');

INSERT INTO "User" ("name","email","phone","passwordHash") VALUES
('Asha Patil','asha@example.com','9876500001','$2b$10$placeholderuser1'),
('Rohan Mehta','rohan@example.com','9876500002','$2b$10$placeholderuser2'),
('Priya Nair','priya@example.com','9876500003','$2b$10$placeholderuser3'),
('Karan Singh','karan@example.com','9876500004','$2b$10$placeholderuser4'),
('Sneha Kulkarni','sneha@example.com',NULL,'$2b$10$placeholderuser5'),
('Vikram Rao','vikram@example.com','9876500006','$2b$10$placeholderuser6'),
('Meera Joshi','meera@example.com','9876500007','$2b$10$placeholderuser7'),
('Neha Desai','neha@example.com','9876500008','$2b$10$placeholderuser8');

INSERT INTO "TicketType" ("name","nameHi","price","description") VALUES
('Adult','वयस्क',100,'Standard entry for adults'),
('Child','बच्चा',50,'Ages 5 to 12'),
('Student','छात्र',60,'Valid student ID required'),
('Senior','वरिष्ठ नागरिक',40,'Age 60 and above');

INSERT INTO "Exhibition" ("name","nameHi","description") VALUES
('Dinosaur Gallery','डायनासोर गैलरी','Fossils and life-size models'),
('Space Odyssey','स्पेस ओडिसी','Journey through the solar system'),
('Human Body','मानव शरीर','Interactive anatomy exhibits'),
('Ancient India','प्राचीन भारत','Science and technology in ancient India'),
('Energy Park','ऊर्जा पार्क','Hands-on renewable energy models');

INSERT INTO "Show" ("name","nameHi","description","venue") VALUES
('Planetarium Show','प्लैनेटेरियम शो','Dome show on stars and galaxies','Dome Theatre'),
('3D Science Show','3डी साइंस शो','Science stories in 3D','3D Hall'),
('Robotics Live','रोबोटिक्स लाइव','Live robot demonstrations','Main Auditorium');

INSERT INTO "SlotTemplate" ("type","refId","startTime","endTime","capacity") VALUES
('entry',NULL,'10:00','12:00',100),('entry',NULL,'12:00','14:00',100),
('entry',NULL,'14:00','16:00',100),('entry',NULL,'16:00','18:00',100),
('show',1,'11:00','12:00',120),('show',1,'15:00','16:00',120),
('show',2,'13:00','14:00',80),('show',3,'17:00','18:00',200),
('exhibition',1,'10:00','13:00',60),('exhibition',2,'13:00','17:00',60);

INSERT INTO "DailyCapacity" ("visitDate","capacity")
SELECT d::date, CASE WHEN extract(dow FROM d) IN (0,6) THEN 800 ELSE 500 END
FROM generate_series('2026-11-14'::date,'2026-11-23'::date,'1 day') d;

INSERT INTO "Booking" ("bookingCode","userId","ticketTypeId","dailyCapacityId","quantity","unitPrice","totalAmount",
                       "status","target","refId","refName","date","slotId","slotLabel","createdAt")
SELECT v.code, v.uid, v.tid, dc.id, v.qty, tt.price, v.qty*tt.price, v.st, v.tg, v.rid, v.rn, v.d, v.slot, v.lbl, v.created::timestamp
FROM (VALUES
 ('BK-001',1,1,'2026-11-14',2,'CONFIRMED','entry',NULL::int,NULL::text,'entry-1','10:00-12:00','2026-11-12 10:00'),
 ('BK-002',2,3,'2026-11-14',3,'CONFIRMED','exhibition',1,'Dinosaur Gallery','exh-1','10:00-13:00','2026-11-12 11:00'),
 ('BK-003',3,2,'2026-11-15',2,'CONFIRMED','show',1,'Planetarium Show','show-1','11:00-12:00','2026-11-13 09:30'),
 ('BK-004',1,1,'2026-11-15',1,'CONFIRMED','exhibition',2,'Space Odyssey','exh-2','13:00-17:00','2026-11-13 12:00'),
 ('BK-005',4,1,'2026-11-16',4,'CONFIRMED','entry',NULL,NULL,'entry-2','12:00-14:00','2026-11-14 15:00'),
 ('BK-006',5,4,'2026-11-16',2,'CANCELLED','entry',NULL,NULL,'entry-3','14:00-16:00','2026-11-14 16:00'),
 ('BK-007',2,1,'2026-11-18',2,'CONFIRMED','show',2,'3D Science Show','show-2','13:00-14:00','2026-11-16 10:00'),
 ('BK-008',3,3,'2026-11-20',5,'CONFIRMED','exhibition',1,'Dinosaur Gallery','exh-1','10:00-13:00','2026-11-18 18:00'),
 ('BK-009',6,1,'2026-11-21',3,'CONFIRMED','entry',NULL,NULL,'entry-1','10:00-12:00','2026-11-19 09:00'),
 ('BK-010',1,2,'2026-11-21',2,'PENDING_PAYMENT','show',1,'Planetarium Show','show-1','15:00-16:00','2026-11-19 20:00'),
 ('BK-011',4,1,'2026-11-22',2,'CONFIRMED','exhibition',3,'Human Body','exh-3','10:00-13:00','2026-11-20 08:00'),
 ('BK-012',2,3,'2026-11-22',2,'PENDING_PAYMENT','entry',NULL,NULL,'entry-2','12:00-14:00','2026-11-18 09:00'),
 ('BK-013',5,1,'2026-11-22',1,'CONFIRMED','show',3,'Robotics Live','show-3','17:00-18:00','2026-11-20 14:00'),
 ('BK-014',3,1,'2026-11-23',6,'CONFIRMED','entry',NULL,NULL,'entry-4','16:00-18:00','2026-11-20 19:00')
) AS v(code,uid,tid,d,qty,st,tg,rid,rn,slot,lbl,created)
JOIN "DailyCapacity" dc ON dc."visitDate" = v.d::date
JOIN "TicketType" tt ON tt.id = v.tid
ORDER BY v.code;

INSERT INTO "Payment" ("bookingId","amount","status","provider","providerReference","createdAt","paidAt")
SELECT b.id, b."totalAmount", v.st, v.pr, v.ref,
       b."createdAt" + interval '2 minutes',
       CASE WHEN v.st IN ('SUCCESS','REFUNDED') THEN b."createdAt" + interval '3 minutes' END
FROM (VALUES (1,'SUCCESS','RAZORPAY','pay_001'),(2,'SUCCESS','RAZORPAY','pay_002'),(3,'SUCCESS','RAZORPAY','pay_003'),
 (4,'SUCCESS','RAZORPAY','pay_004'),(5,'SUCCESS','RAZORPAY','pay_005'),(6,'REFUNDED','RAZORPAY','pay_006'),
 (7,'SUCCESS','RAZORPAY','pay_007'),(8,'FAILED','RAZORPAY','pay_008a'),(8,'SUCCESS','RAZORPAY','pay_008b'),
 (9,'SUCCESS','RAZORPAY','pay_009'),(10,'PENDING','MOCK',NULL::text),(11,'SUCCESS','RAZORPAY','pay_011'),
 (13,'SUCCESS','RAZORPAY','pay_013'),(14,'SUCCESS','RAZORPAY','pay_014')
) AS v(bid,st,pr,ref) JOIN "Booking" b ON b.id = v.bid;

INSERT INTO "IssuedTicket" ("bookingId","qrToken","status","issuedAt")
SELECT b.id, 'QR-'||lpad(b.id::text,3,'0')||'-'||n, 'VALID', b."createdAt" + interval '4 minutes'
FROM "Booking" b, generate_series(1, b.quantity) n WHERE b.status = 'CONFIRMED';

-- Past visits: most tickets were scanned at the gate
UPDATE "IssuedTicket" t SET status='USED', "scannedAt" = (b."date"::date + time '10:30')
FROM "Booking" b WHERE t."bookingId"=b.id AND b.id IN (1,2,3,4,5,7,9);
UPDATE "IssuedTicket" SET status='USED', "scannedAt"='2026-11-20 10:45' WHERE "qrToken" IN ('QR-008-1','QR-008-2','QR-008-3');

-- Keep per-day counters consistent (seats held by CONFIRMED or PENDING_PAYMENT bookings)
UPDATE "DailyCapacity" dc SET "bookedCount" = COALESCE((SELECT SUM(b.quantity) FROM "Booking" b
  WHERE b."dailyCapacityId"=dc.id AND b.status IN ('CONFIRMED','PENDING_PAYMENT')),0);
