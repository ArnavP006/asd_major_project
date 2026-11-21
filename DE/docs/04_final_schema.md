# 4. Final Schema

Complete DDL: `sql/schema.sql` (Prisma-equivalent), `sql/constraints_and_indexes.sql` (extra rules), `sql/schema_dump.sql` (pg_dump of the final database).
All table and column names are quoted CamelCase, exactly as Prisma creates them.

## Tables
| Table | Columns (type) | Constraints |
|---|---|---|
| **Admin** | id SERIAL, email TEXT, passwordHash TEXT, name TEXT, role TEXT, createdAt, updatedAt | PK(id), UNIQUE(email) |
| **User** | id, name TEXT, email TEXT, phone TEXT NULL, passwordHash TEXT, createdAt, updatedAt | PK(id), UNIQUE(email) |
| **TicketType** | id, name, nameHi, price INT, description, descriptionHi, isActive BOOL | PK, UNIQUE(name), CHECK(price >= 0) |
| **Exhibition** | id, name, nameHi, description, descriptionHi, isActive | PK |
| **Show** | id, name, nameHi, description, descriptionHi, venue, venueHi, isActive | PK |
| **SlotTemplate** | id, type, refId, startTime, endTime, capacity INT, isActive | PK, CHECK(capacity > 0), CHECK(type IN entry/exhibition/show), CHECK(startTime < endTime) |
| **DailyCapacity** | id, visitDate DATE, capacity INT, bookedCount INT | PK, UNIQUE(visitDate), CHECK(0 <= bookedCount <= capacity) |
| **Booking** | id, bookingCode, userId, ticketTypeId, dailyCapacityId, quantity, unitPrice, totalAmount, status, target, refId, refName, refNameHi, date, slotId, slotLabel, itemsJson, createdAt, updatedAt | PK, UNIQUE(bookingCode), 3 FKs (RESTRICT), CHECK(quantity > 0), CHECK(totalAmount = quantity × unitPrice), CHECK(status IN ...), CHECK(target IN ...) |
| **Payment** | id, bookingId, amount INT, status, provider, providerReference, createdAt, paidAt | PK, FK(bookingId), CHECK(amount >= 0), CHECK(status IN ...), UNIQUE(providerReference) where not null |
| **IssuedTicket** | id, bookingId, qrToken, status, issuedAt, scannedAt | PK, FK(bookingId), UNIQUE(qrToken), CHECK(status IN ...), CHECK(status = 'USED' ⇔ scannedAt NOT NULL) |

> The `status` value lists are the conventions used in this demo (`PENDING_PAYMENT`, `CONFIRMED`, `CANCELLED`, `EXPIRED`; payment `PENDING`, `SUCCESS`, `FAILED`, `REFUNDED`; ticket `VALID`, `USED`, `CANCELLED`). Align them with the strings your Express code writes before running the CHECK migration on your real database.

## Foreign keys (all `ON DELETE RESTRICT ON UPDATE CASCADE`)
`Booking.userId → User.id`, `Booking.ticketTypeId → TicketType.id`, `Booking.dailyCapacityId → DailyCapacity.id`, `Payment.bookingId → Booking.id`, `IssuedTicket.bookingId → Booking.id`.
RESTRICT means financial records cannot be deleted by accident (proved in `evidence/integrity_test_outputs.txt`).

## Indexes
| Index | Columns | Serves |
|---|---|---|
| Booking_userId_createdAt_idx (Prisma) | userId, createdAt | "My bookings" newest first |
| Booking_dailyCapacityId_status_idx (Prisma) | dailyCapacityId, status | Seats used per day |
| Payment_bookingId_idx (Prisma) | bookingId | Payments of a booking |
| IssuedTicket_bookingId_idx (Prisma) | bookingId | Tickets of a booking |
| Booking_ticketTypeId_idx | ticketTypeId | Revenue per ticket type (FK is not auto-indexed in PostgreSQL) |
| Booking_status_idx | status | Dashboard filters |
| Booking_target_refId_idx | target, refId | Popular exhibitions and shows |
| Payment_status_idx | status | Revenue (`status = 'SUCCESS'`) |
| IssuedTicket_status_idx | status | VALID / USED counts |
| SlotTemplate_type_refId_idx | type, refId | Slots of one show or exhibition |
| Payment_providerReference_key (partial UNIQUE) | providerReference | Idempotent payment webhooks |
