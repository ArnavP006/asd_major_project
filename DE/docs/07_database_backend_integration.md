# 7. Database–Backend Integration (Evidence)

## How the backend talks to the database
```
Electron window (React UI)
   │  HTTP (fetch/axios)
Express REST API  ── routes → controllers → services
   │  Prisma Client (typed queries, $transaction, $queryRaw)
Prisma query engine
   │  PostgreSQL wire protocol (DATABASE_URL pooled / DIRECT_URL for migrations)
PostgreSQL (Neon)
```
- `server/prisma/schema.prisma` defines the models; `npx prisma migrate dev` turns them into the tables in `sql/schema.sql`.
- Controllers never build SQL strings from user input. Prisma and the `pg` driver both send **parameterised** queries, which prevents SQL injection.
- Multi-step operations (booking, payment confirmation, cancellation) run inside a **transaction**.

## What was executed for this evidence
| File | Purpose | Verified? |
|---|---|---|
| `backend_integration/bookingService.pg.js` | The booking operations written with raw SQL via node-postgres | **Executed** against PostgreSQL 16 by `demo.js` |
| `backend_integration/bookingService.prisma.js` | The same operations written with Prisma, in the style of `server/src` | **Not executed** here (Prisma engine binaries could not be downloaded in the sandbox). Run it in your project after `npx prisma generate` |
| `backend_integration/demo.js` | Calls each operation and checks the table with a direct SQL query | Output saved in `evidence/integration_log.txt` |

> **Action for the team:** replace the "Feature → route" column below with the real route and controller names from your `server/src`. They could not be inspected while preparing this folder.

## Feature → database operation
| MuseumX feature | Route (fill in) | Operation | Evidence in `integration_log.txt` |
|---|---|---|---|
| Check availability | `GET /…` | `SELECT` on `DailyCapacity` | "READ: availability" |
| Create booking | `POST /…` | Transaction: lock capacity row, `INSERT Booking`, `INSERT Payment`, `UPDATE DailyCapacity` | "CREATE: Neha books 4 Student tickets" + DB check |
| Reject invalid input | `POST /…` | Validation + CHECK/FK errors | "VALIDATION", "FK" |
| Confirm payment | `POST /…` | `UPDATE Payment`, `UPDATE Booking`, `INSERT IssuedTicket` ×N | "UPDATE: payment verified" + DB check |
| Gate QR scan | `POST /…` | Atomic `UPDATE ... WHERE status = 'VALID'` | "gate scan #1 / #2" |
| My bookings | `GET /…` | `SELECT` with joins | "READ: Neha bookings" |
| Cancel booking | `DELETE`/`PUT /…` | Transaction: cancel booking and tickets, refund payment, release seats | "CANCEL: second booking" |
| Last-seat race | – | Row lock `FOR UPDATE` | "CONCURRENCY": one buyer wins, the other gets SOLD_OUT |
| Admin revenue | `GET /…` | `JOIN` + `GROUP BY` | "REPORT: revenue by ticket type" |

## Evidence that app data reaches the database
Each step in `evidence/integration_log.txt` is followed by a `[DB check]` line, a direct SQL `SELECT` on the table. Example from the log: after the app creates a booking, the check shows the same `bookingCode`, quantity and amount stored in `Booking`, and `DailyCapacity.bookedCount` has increased.

**Add screenshots for the evaluator** to `evidence/`: the UI booking flow, then the same row in Prisma Studio (`npx prisma studio`) or pgAdmin/Neon console.

## Running it yourself
```bash
cd backend_integration && npm install
export DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/museumx"
node demo.js
```
