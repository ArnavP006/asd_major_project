# 3. Database Normalization (1NF, 2NF, 3NF)

## Step 0: unnormalized starting point
Imagine the manual ticket register the museum used before MuseumX, one wide row per booking:

| booking_code | visitor_name | visitor_email | visitor_phone | ticket_type | ticket_price | visit_date | day_capacity | qty | attraction | payment_refs | payment_statuses | qr_tokens |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| BK-008 | Priya Nair | priya@example.com | 9876500003 | Student | 60 | 2026-11-20 | 500 | 5 | Dinosaur Gallery | pay_008a, pay_008b | FAILED, SUCCESS | QR-008-1, QR-008-2, QR-008-3, QR-008-4, QR-008-5 |

### Redundancy and anomalies
| Anomaly | Example |
|---|---|
| **Update** | The Student price changes from 60 to 70. Every old row repeating `60` needs editing, and missing one gives inconsistent data. |
| **Insertion** | A new ticket type or a new visit date with its capacity cannot be stored until somebody books it. |
| **Deletion** | Deleting a visitor's only booking also deletes their name, email and phone. |
| **Inconsistency** | The same email can appear with different spellings of the name. |

### Functional dependencies
- `booking_code → visitor_email, ticket_type, visit_date, quantity, status, attraction`
- `visitor_email → visitor_name, visitor_phone`
- `ticket_type → ticket_price`
- `visit_date → day_capacity`
- `payment_ref → booking_code, amount, payment_status`
- `qr_token → booking_code, ticket_status`

## 1NF – atomic values, no repeating groups
**Problem:** `payment_refs`, `payment_statuses` and `qr_tokens` hold lists in one cell.
**Transformation:** move each multi-valued group into its own relation, one row per value:
- `Booking(booking_code, visitor..., ticket..., visit_date..., qty, ...)`
- `Payment(payment_id, booking_code, amount, status, provider_ref)`
- `IssuedTicket(ticket_id, booking_code, qr_token, status)`

Every cell is now a single value and every row is identified by a key.

## 2NF – no partial dependency on part of a composite key
**Problem:** if the three groups are kept in one table, its key would be the composite `(booking_code, payment_ref, qr_token)`. Booking details depend only on `booking_code`, payment details only on `payment_ref`, ticket details only on `qr_token` (partial dependencies).
**Transformation:** the three relations above each use a single-column key (`booking`, `payment_id`, `ticket_id`), so no non-key attribute depends on only part of a key. Each relation is now in 2NF.

## 3NF – no transitive dependency
**Problem:** inside `Booking`, non-key attributes depend on other non-key attributes:
- `booking → visitor_email → visitor_name, visitor_phone`
- `booking → ticket_type → ticket_price`
- `booking → visit_date → day_capacity`
- `booking → attraction_id → attraction_name`

**Transformation:**
| New relation | Holds | Becomes table |
|---|---|---|
| visitor | email, name, phone, password | `User` |
| ticket type | name, price, active flag | `TicketType` |
| visit date | date, capacity, booked count | `DailyCapacity` |
| attraction | name, description | `Exhibition`, `Show` |

`Booking` keeps only foreign keys (`userId`, `ticketTypeId`, `dailyCapacityId`) plus facts about the booking itself.

## BCNF check
Every determinant is a candidate key: `User` (id, email), `TicketType` (id, name), `DailyCapacity` (id, visitDate), `Booking` (id, bookingCode), `IssuedTicket` (id, qrToken). No further decomposition is required.

## Final normalized schema
`Admin, User, TicketType, Exhibition, Show, SlotTemplate, DailyCapacity, Booking, Payment, IssuedTicket` – see `04_final_schema.md` and `sql/schema.sql`.

## Honest audit: where the current Prisma schema is intentionally not 3NF
Be ready to explain these in the viva; each one is a deliberate trade-off or a known improvement.

| Column(s) | Normal-form issue | Verdict |
|---|---|---|
| `Booking.unitPrice` | Copies `TicketType.price` | **Keep.** A price snapshot: later price changes must not rewrite old bookings. |
| `Booking.totalAmount` | Derived (`quantity × unitPrice`) | **Keep**, fast reporting. Protected by `CHECK chk_booking_total`. |
| `DailyCapacity.bookedCount` | Derived (sum of active booking quantities) | **Keep**, O(1) availability check. Updated inside the booking transaction and guarded by `CHECK bookedCount <= capacity`. |
| `Booking.refName`, `refNameHi`, `slotLabel` | Transitive: `refId → name`, `slotId → label` | **Acceptable** as a display snapshot (names can change later), but never use them as keys or for joins. |
| `Booking.date` (text) | Duplicates `DailyCapacity.visitDate` reached through `dailyCapacityId` | **Improve:** drop it or keep it strictly in sync, otherwise an update anomaly is possible. |
| `Booking.itemsJson` | Multi-valued JSON text, violates 1NF | **Improve:** replace with the `BookingItem` junction table. |
| `Booking.target` + `refId`, `SlotTemplate.type` + `refId` | Polymorphic reference; the database cannot enforce a foreign key | **Improve:** `BookingItem` has real FKs to `Exhibition` and `Show` with `CHECK num_nonnulls(exhibitionId, showId) = 1`. |

The improvement is implemented and tested in `sql/extension_booking_item.sql` (output in `evidence/extension_output.txt`).
