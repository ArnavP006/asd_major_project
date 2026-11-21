# 9. Data Integrity and Performance

## A. Constraints and validation (proved in `evidence/integrity_test_outputs.txt`)
| Rule | Mechanism | Test that must fail |
|---|---|---|
| Unique visitor email | UNIQUE index | duplicate email |
| Valid references | FOREIGN KEY | booking for user 999 |
| Quantity at least 1 | CHECK | quantity = 0 |
| Total equals quantity × unit price | CHECK | wrong total |
| No overbooking | CHECK `bookedCount <= capacity` | bookedCount above capacity |
| Valid status values | CHECK | status = 'MAYBE' |
| No negative prices | CHECK | price = -10 |
| QR token unique | UNIQUE | duplicate QR |
| Scanned ⇔ USED | CHECK | USED without scannedAt |
| One capacity row per date | UNIQUE | second row for same date |
| Payments protected | FK RESTRICT | delete a booking that has payments |
| Gateway reference recorded once | partial UNIQUE | same `providerReference` twice |

12 of 12 bad statements are rejected by PostgreSQL.

## B. Duplicate, missing and invalid data
- **Duplicates:** UNIQUE constraints; the API maps error code `23505` to a friendly "already exists" message; `INSERT ... ON CONFLICT DO NOTHING` is used when creating the day's `DailyCapacity` row.
- **Missing data:** `NOT NULL` on mandatory columns; optional values (`phone`, `refId`) are nullable by design. The sample data includes a visitor without a phone number.
- **Invalid data:** API checks the quantity range (1 to 20) before the query; CHECK constraints catch anything that slips through (`23514`); foreign keys catch bad IDs (`23503`).
- **Idempotency:** confirming the same booking twice is rejected (`NOT_PENDING`), and the same gateway reference cannot be stored twice.
- **Data-quality query:** Q15 finds confirmed bookings without a successful payment (expected 0).

## C. Indexing
Indexes are listed in `04_final_schema.md`. Measured effect (`evidence/index_demo_output.txt`, 200,000 bookings, "my bookings" query):

| | Plan | Execution time |
|---|---|---|
| Without index | Sequential scan of all rows, then sort | about 13 ms |
| With `(userId, createdAt)` | Bitmap index scan | about 0.15 ms |

On the 14-row sample data the planner correctly ignores indexes (a table scan is cheaper); the benefit appears with volume. Indexes cost extra write time and storage, so only columns used in `WHERE`, `JOIN` and `ORDER BY` are indexed.

## D. Scaling with more data and users
| Concern | Approach |
|---|---|
| Many simultaneous buyers | Short transactions; row lock only on one `DailyCapacity` row; connection pooling (Neon pooler / PgBouncer; `DIRECT_URL` only for migrations) |
| Growing `Booking`, `Payment`, `IssuedTicket` | Indexes on FK and filter columns; keyset pagination (`WHERE createdAt < $last ORDER BY createdAt DESC LIMIT n`) instead of `OFFSET`; partition `Booking` by month or year; archive old years |
| Heavy dashboards | Run reports on a read replica; precompute daily totals in a materialized view or summary table refreshed hourly |
| Availability checks | Counter column (O(1)) with optional short-lived cache; correctness still enforced in the transaction |
| Multiple museums (future scope) | Add `museumId` to catalogue, capacity and bookings and index it first in composite indexes |
| Backups and safety | Point-in-time recovery on Neon; migrations through Prisma only |
