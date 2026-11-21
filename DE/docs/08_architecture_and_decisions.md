# 8. Database Architecture and Implementation Decisions

## Architecture overview
MuseumX uses one PostgreSQL database with ten tables in four groups:
- **Identity:** `User`, `Admin`
- **Catalogue:** `TicketType`, `Exhibition`, `Show`, `SlotTemplate`
- **Inventory:** `DailyCapacity`
- **Transactions:** `Booking`, `Payment`, `IssuedTicket`

The application reaches it only through the Express API and Prisma (see `07_database_backend_integration.md`).

## Key design decisions
| # | Decision | Reason |
|---|---|---|
| 1 | PostgreSQL over MongoDB | Relational data, ACID, constraints, SQL analytics (`01_database_selection.md`) |
| 2 | Surrogate integer keys (`SERIAL`) plus business keys (`bookingCode`, `qrToken`, `email`) as UNIQUE | Small fast joins internally, safe public identifiers externally |
| 3 | Separate `Payment` table (1:N) | A booking can have failed, retried and refunded payments |
| 4 | One `IssuedTicket` row per visitor | Each QR code is scanned and invalidated independently |
| 5 | `DailyCapacity` as a counter row, updated under a row lock | Cheap availability checks and no overbooking race |
| 6 | Price and total stored on `Booking` | Historical snapshot, price changes do not rewrite history |
| 7 | `ON DELETE RESTRICT` on all foreign keys | Money records are never deleted by cascade accident |
| 8 | CHECK constraints in addition to API validation | The database stays correct even if a bug or a second client bypasses the API |
| 9 | Bilingual columns (`nameHi`, `descriptionHi`) beside English ones | Simple chatbot language switching without a translation table (acceptable for two languages; a translation table would be needed for many) |
| 10 | Known improvement: `BookingItem` junction table | Replaces `itemsJson` and the polymorphic `refId` (`03_normalization.md`) |

## Status lifecycles
- Booking: `PENDING_PAYMENT → CONFIRMED → CANCELLED` (or `EXPIRED`)
- Payment: `PENDING → SUCCESS | FAILED`, `SUCCESS → REFUNDED`
- Ticket: `VALID → USED` or `CANCELLED`
