# 5. Sample Records

Loaded by `sql/sample_data.sql` into PostgreSQL 16. Row counts: 2 Admin, 8 User, 4 TicketType, 5 Exhibition, 3 Show, 10 SlotTemplate, 10 DailyCapacity, 14 Booking, 14 Payment, 31 IssuedTicket.
Tables below were read from the live database (password hashes and audit timestamps omitted for readability).

## User

| id | name | email | phone |
|---|---|---|---|
| 1 | Asha Patil | asha@example.com | 9876500001 |
| 2 | Rohan Mehta | rohan@example.com | 9876500002 |
| 3 | Priya Nair | priya@example.com | 9876500003 |
| 4 | Karan Singh | karan@example.com | 9876500004 |
| 5 | Sneha Kulkarni | sneha@example.com |  |
| 6 | Vikram Rao | vikram@example.com | 9876500006 |
| 7 | Meera Joshi | meera@example.com | 9876500007 |
| 8 | Neha Desai | neha@example.com | 9876500008 |

## TicketType

| id | name | price | isActive |
|---|---|---|---|
| 1 | Adult | 100 | t |
| 2 | Child | 50 | t |
| 3 | Student | 60 | t |
| 4 | Senior | 40 | t |

## Exhibition

| id | name | nameHi | isActive |
|---|---|---|---|
| 1 | Dinosaur Gallery | डायनासोर गैलरी | t |
| 2 | Space Odyssey | स्पेस ओडिसी | t |
| 3 | Human Body | मानव शरीर | t |
| 4 | Ancient India | प्राचीन भारत | t |
| 5 | Energy Park | ऊर्जा पार्क | t |

## Show

| id | name | venue |
|---|---|---|
| 1 | Planetarium Show | Dome Theatre |
| 2 | 3D Science Show | 3D Hall |
| 3 | Robotics Live | Main Auditorium |

## SlotTemplate

| id | type | refId | startTime | endTime | capacity |
|---|---|---|---|---|---|
| 1 | entry |  | 10:00 | 12:00 | 100 |
| 2 | entry |  | 12:00 | 14:00 | 100 |
| 3 | entry |  | 14:00 | 16:00 | 100 |
| 4 | entry |  | 16:00 | 18:00 | 100 |
| 5 | show | 1 | 11:00 | 12:00 | 120 |
| 6 | show | 1 | 15:00 | 16:00 | 120 |
| 7 | show | 2 | 13:00 | 14:00 | 80 |
| 8 | show | 3 | 17:00 | 18:00 | 200 |
| 9 | exhibition | 1 | 10:00 | 13:00 | 60 |
| 10 | exhibition | 2 | 13:00 | 17:00 | 60 |

## DailyCapacity

| id | visitDate | capacity | bookedCount |
|---|---|---|---|
| 1 | 2026-11-14 | 800 | 5 |
| 2 | 2026-11-15 | 800 | 3 |
| 3 | 2026-11-16 | 500 | 4 |
| 4 | 2026-11-17 | 500 | 0 |
| 5 | 2026-11-18 | 500 | 2 |
| 6 | 2026-11-19 | 500 | 0 |
| 7 | 2026-11-20 | 500 | 5 |
| 8 | 2026-11-21 | 800 | 5 |
| 9 | 2026-11-22 | 800 | 5 |
| 10 | 2026-11-23 | 500 | 6 |

## Booking

| id | bookingCode | userId | ticketTypeId | dailyCapacityId | quantity | unitPrice | totalAmount | status | target | refId | refName | date | slotLabel |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | BK-001 | 1 | 1 | 1 | 2 | 100 | 200 | CONFIRMED | entry |  |  | 2026-11-14 | 10:00-12:00 |
| 2 | BK-002 | 2 | 3 | 1 | 3 | 60 | 180 | CONFIRMED | exhibition | 1 | Dinosaur Gallery | 2026-11-14 | 10:00-13:00 |
| 3 | BK-003 | 3 | 2 | 2 | 2 | 50 | 100 | CONFIRMED | show | 1 | Planetarium Show | 2026-11-15 | 11:00-12:00 |
| 4 | BK-004 | 1 | 1 | 2 | 1 | 100 | 100 | CONFIRMED | exhibition | 2 | Space Odyssey | 2026-11-15 | 13:00-17:00 |
| 5 | BK-005 | 4 | 1 | 3 | 4 | 100 | 400 | CONFIRMED | entry |  |  | 2026-11-16 | 12:00-14:00 |
| 6 | BK-006 | 5 | 4 | 3 | 2 | 40 | 80 | CANCELLED | entry |  |  | 2026-11-16 | 14:00-16:00 |
| 7 | BK-007 | 2 | 1 | 5 | 2 | 100 | 200 | CONFIRMED | show | 2 | 3D Science Show | 2026-11-18 | 13:00-14:00 |
| 8 | BK-008 | 3 | 3 | 7 | 5 | 60 | 300 | CONFIRMED | exhibition | 1 | Dinosaur Gallery | 2026-11-20 | 10:00-13:00 |
| 9 | BK-009 | 6 | 1 | 8 | 3 | 100 | 300 | CONFIRMED | entry |  |  | 2026-11-21 | 10:00-12:00 |
| 10 | BK-010 | 1 | 2 | 8 | 2 | 50 | 100 | PENDING_PAYMENT | show | 1 | Planetarium Show | 2026-11-21 | 15:00-16:00 |
| 11 | BK-011 | 4 | 1 | 9 | 2 | 100 | 200 | CONFIRMED | exhibition | 3 | Human Body | 2026-11-22 | 10:00-13:00 |
| 12 | BK-012 | 2 | 3 | 9 | 2 | 60 | 120 | PENDING_PAYMENT | entry |  |  | 2026-11-22 | 12:00-14:00 |
| 13 | BK-013 | 5 | 1 | 9 | 1 | 100 | 100 | CONFIRMED | show | 3 | Robotics Live | 2026-11-22 | 17:00-18:00 |
| 14 | BK-014 | 3 | 1 | 10 | 6 | 100 | 600 | CONFIRMED | entry |  |  | 2026-11-23 | 16:00-18:00 |

## Payment

| id | bookingId | amount | status | provider | providerReference |
|---|---|---|---|---|---|
| 1 | 1 | 200 | SUCCESS | RAZORPAY | pay_001 |
| 2 | 2 | 180 | SUCCESS | RAZORPAY | pay_002 |
| 3 | 3 | 100 | SUCCESS | RAZORPAY | pay_003 |
| 4 | 4 | 100 | SUCCESS | RAZORPAY | pay_004 |
| 5 | 5 | 400 | SUCCESS | RAZORPAY | pay_005 |
| 6 | 6 | 80 | REFUNDED | RAZORPAY | pay_006 |
| 7 | 7 | 200 | SUCCESS | RAZORPAY | pay_007 |
| 8 | 8 | 300 | SUCCESS | RAZORPAY | pay_008b |
| 9 | 8 | 300 | FAILED | RAZORPAY | pay_008a |
| 10 | 9 | 300 | SUCCESS | RAZORPAY | pay_009 |
| 11 | 10 | 100 | PENDING | MOCK |  |
| 12 | 11 | 200 | SUCCESS | RAZORPAY | pay_011 |
| 13 | 13 | 100 | SUCCESS | RAZORPAY | pay_013 |
| 14 | 14 | 600 | SUCCESS | RAZORPAY | pay_014 |

## IssuedTicket (first 10 of 31)

| id | bookingId | qrToken | status | scannedAt |
|---|---|---|---|---|
| 1 | 1 | QR-001-1 | USED | 2026-11-14 10:30:00 |
| 2 | 1 | QR-001-2 | USED | 2026-11-14 10:30:00 |
| 3 | 2 | QR-002-1 | USED | 2026-11-14 10:30:00 |
| 4 | 2 | QR-002-2 | USED | 2026-11-14 10:30:00 |
| 5 | 2 | QR-002-3 | USED | 2026-11-14 10:30:00 |
| 6 | 3 | QR-003-1 | USED | 2026-11-15 10:30:00 |
| 7 | 3 | QR-003-2 | USED | 2026-11-15 10:30:00 |
| 8 | 4 | QR-004-1 | USED | 2026-11-15 10:30:00 |
| 9 | 5 | QR-005-1 | USED | 2026-11-16 10:30:00 |
| 10 | 5 | QR-005-2 | USED | 2026-11-16 10:30:00 |

