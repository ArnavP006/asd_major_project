# 10. Viva Preparation: questions you should be able to answer

Every team member should be able to explain these without notes.

1. **Why PostgreSQL?** Relational data, ACID transactions for payments and seats, constraints, SQL analytics. MongoDB would need `$lookup` for most reports.
2. **Show me the ER diagram.** `evidence/er_diagram.png`: User, TicketType and DailyCapacity each 1:N to Booking; Booking 1:N to Payment and IssuedTicket.
3. **Is there a many-to-many?** Conceptually Booking ↔ Exhibition/Show; currently stored loosely, so we proposed the `BookingItem` junction table (`extension_booking_item.sql`).
4. **Why is Payment 1:N, not 1:1?** Payments can fail and be retried, and a successful one can be refunded (booking 8 has a FAILED and a SUCCESS payment).
5. **Explain 1NF, 2NF, 3NF using our tables.** See `03_normalization.md`: lists in cells → separate tables; partial dependencies → single-column keys; transitive dependencies → User, TicketType, DailyCapacity, Exhibition/Show.
6. **Is your schema fully 3NF?** Almost. Deliberate denormalizations: `unitPrice` (price snapshot), `totalAmount`, `bookedCount` (derived, for speed). Real weaknesses: `itemsJson`, text `date`, polymorphic `refId`. We know the fix.
7. **How do you stop overbooking?** `SELECT ... FOR UPDATE` on the day's capacity row inside a transaction, plus `CHECK bookedCount <= capacity`. Show the CONCURRENCY section in `integration_log.txt`.
8. **How do you stop a QR ticket being used twice?** `UPDATE ... WHERE status = 'VALID'` is atomic; the second scan updates 0 rows (Q3b).
9. **What does ON DELETE RESTRICT do?** Blocks deleting a booking that still has payments or tickets. Shown in the integrity tests.
10. **Which indexes did you add and why?** Composite `(userId, createdAt)` for "my bookings"; FK indexes; partial unique on `providerReference`. 13 ms → 0.15 ms on 200k rows.
11. **What is a transaction? Where do you use one?** A group of statements that commit or roll back together: create booking, confirm payment, cancel booking.
12. **How does the backend talk to the database?** Express → services → Prisma Client → PostgreSQL over `DATABASE_URL`; parameterised queries.
13. **Write a query live:** revenue per ticket type (Q8), peak days (Q10), or the LEFT JOIN of users without bookings (Q12). Know why each uses `JOIN`, `GROUP BY` or `HAVING`.
14. **Difference between WHERE and HAVING?** `WHERE` filters rows before grouping; `HAVING` filters groups after aggregation.
15. **How would it scale?** Pooling, indexes, keyset pagination, partitioning, read replica for reports (`09_integrity_and_performance.md`).
