# 1. Database Selection and Justification

**Project:** MuseumX – Smart Museum Ticket Booking System (Electron + React + Express + Prisma)
**Chosen database:** **PostgreSQL** (hosted on Neon, accessed through Prisma ORM)

## Nature of the data MuseumX stores
| Data | Examples | Shape |
|---|---|---|
| Visitors and admins | `User`, `Admin` | Structured, unique emails, hashed passwords |
| Catalogue | `TicketType`, `Exhibition`, `Show`, `SlotTemplate` | Structured, bilingual (English/Hindi) columns |
| Capacity | `DailyCapacity` | One counter row per visit date, updated by concurrent buyers |
| Transactions | `Booking`, `Payment`, `IssuedTicket` | Money, status transitions, strict relationships |
| Analytics | revenue, popular exhibitions, peak days | Aggregations across many tables |

## Why PostgreSQL fits
1. **Highly relational data.** A booking links a visitor, a ticket type, a visit date, payments and QR tickets. These relationships are enforced with foreign keys, so orphan payments or tickets cannot exist.
2. **ACID transactions for money and seats.** Creating a booking must insert the booking, create the payment and increase `bookedCount` as one unit. If any step fails, everything rolls back.
3. **Concurrency control.** `SELECT ... FOR UPDATE` on the `DailyCapacity` row stops two visitors from taking the last seat (demonstrated in `evidence/integration_log.txt`).
4. **Constraints guard data quality.** `UNIQUE` (email, QR token, one capacity row per date), `CHECK` (quantity > 0, `bookedCount <= capacity`, total = quantity × unit price) and `NOT NULL` push validation into the database as a second line of defence behind the API.
5. **Reporting needs SQL.** The admin dashboard (bookings, revenue, peak periods, popular shows) maps directly to `JOIN`, `GROUP BY`, `HAVING` and window functions.
6. **Tooling.** Prisma has first-class PostgreSQL support (migrations, typed client, transactions), and Neon provides managed PostgreSQL with connection pooling.

## Why not MongoDB
- Most data is tabular with many cross-entity joins and aggregates; MongoDB would need `$lookup` for nearly every report.
- Multi-document transactions exist but are heavier, and relational integrity (FKs, unique constraints across collections) would have to be enforced in application code.
- The only semi-structured field in the schema is `Booking.itemsJson`, which is better modelled as a proper `BookingItem` table (see `03_normalization.md`) than a reason to change database.
