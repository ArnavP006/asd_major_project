# MuseumX Backend Viva — Demo Kit

Everything below is verified against the code on branch `viva-fixes`.
Line numbers refer to `server/src/index.js` unless another file is named.

---

## Q1. Architecture and the life of a request

### a) Files to open on screen, in order

1. `server/src/db.js` — lines 1–2 (whole file: single shared PrismaClient)
2. `server/src/auth.js` — lines 1–75 (JWT signing + the three middlewares)
3. `server/src/index.js` — lines 12–38 (middleware stack, in order)
4. `server/src/index.js` — lines 450–598 (`POST /api/bookings`, the traced endpoint)
5. `server/src/index.js` — lines 1451–1467 (404 handler, central error handler, listen)

### Key facts (all verified)

- **Express on Node, ESM.** Entry point is `server/src/index.js`; `app.listen` at line 1469, `PORT = process.env.PORT || 4000` (line 1468).
- **There are NO routes/controllers/services/middleware folders.** All 27 endpoints live in one file, organised by comment banners (`// ---------- USER STUFF ----------` etc.). `auth.js` holds the JWT middlewares, `db.js` the Prisma client, `chatbot.js` is an **empty placeholder file (0 bytes)**. Say this honestly if the structure is questioned.
- **No Express Router, no versioning.** Paths are flat `/api/<resource>` — no `/api/v1`.
- **Middleware order (lines 13–38):**
  1. `helmet({ crossOriginResourcePolicy: false })` — line 13
  2. `cors({ origin: ['http://localhost:5173', 'null'] })` — line 14
  3. `express.json({ limit: '1mb' })` — line 15
  4. `authLimiter` (10 req / 15 min) mounted on the three login/register routes — lines 17–26
  5. `paymentLimiter` (30 req / 15 min) mounted on the two payment routes — lines 30–38
  6. Route handlers (each with `requireUser`/`requireAdmin` where needed)
  7. 404 catch-all — line 1451
  8. Central error handler (4-arg) — line 1456, **last**
- **Best endpoint to trace: `POST /api/bookings`** (line 450): `requireUser` → manual validation → `ticketType.findMany` → `dailyCapacity.upsert` → booking code from `crypto.randomBytes(4)` → `booking.create` with `include` → `201 publicBooking(booking)`.

### What breaks if two middlewares are swapped

- `express.json` **after** the routes → `req.body` is `undefined` for every POST; booking creation fails its own validation with 422.
- Rate limiters **after** the routes → the limiter never runs; brute-forcing login is unthrottled.
- Error handler **not last** → Express's default HTML error page (with stack trace in dev) is returned instead of the uniform JSON.
- `helmet` ↔ `cors` swapped → **nothing visibly breaks** (both only set response headers); say so honestly — the hard ordering constraints are body-parser-before-routes and error-handler-last.

### b) Curl — trace of the request

```bash
# valid booking creation (expects 201)
curl -i -X POST http://localhost:4000/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"target":"entry","date":"2026-12-01","slotId":"1@2026-12-01","counts":{"1":2},"visitor":{"name":"Viva Demo","email":"viva@test.dev"}}'
# -> 201 {"id":..,"bookingCode":"MX..","status":"PENDING_PAYMENT",...}

# same request without the date (expects 422)
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/bookings \
  -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"target":"entry"}'
# -> 422 {"error":"Choose a visit date.","code":"INVALID_DATE"}
```

### c) Terminal

```bash
cd server && DEBUG="prisma:query" node src/index.js
```

### d) Speaking script (~150 words)

> MuseumX's backend is Express on Node, written in ES modules. I chose Express because it is minimal, the whole team already knew JavaScript, and it pairs directly with Prisma and our React client. I'll be honest about the structure: instead of separate route, controller and service folders, the whole API lives in one well-banded file, `index.js`, with `auth.js` for JWT middleware and `db.js` for the single shared Prisma client. Routes are flat under `/api` — no version prefix. The middleware order is helmet, CORS, the one-megabyte JSON body parser, then two rate limiters — login and payments — and the error handler is registered last. I'll trace booking creation: the request passes the parser, `requireUser` verifies the JWT, manual validation rejects bad input with 422, then Prisma upserts daily capacity and creates the booking, returning 201 as JSON. Order matters: body parser after routes would leave `req.body` undefined, and an error handler that isn't last would leak Express's HTML error page.

### e) If asked

- "Why no controllers/services folders?" → "For a 27-endpoint API one banded file kept the demo simple; the split is a refactor I'd do next, and `auth.js`/`db.js` already show the pattern."

---

## Q2. REST design

### a) Files to open on screen, in order

1. `server/src/index.js` — lines 155–160 (health), 450 (POST /bookings), 603 (POST /payments/order), 632 (POST /payments/verify)
2. `server/src/index.js` — lines 748–788 (GET booking by code + contact ownership check)
3. `server/src/index.js` — lines 945–955 (admin bookings list: filter, pagination clamp)
4. `server/src/index.js` — lines 1451–1467 (404 + central error handler)

### b) Endpoint table

| Method | URL | Purpose | Success | Errors |
|---|---|---|---|---|
| GET | `/api/health` | liveness probe | 200 | — |
| GET | `/api/ticket-types` | active ticket categories | 200 | 500 |
| GET | `/api/exhibitions` | active exhibitions | 200 | 500 |
| GET | `/api/shows` | active shows | 200 | 500 |
| GET | `/api/slots?date&type&refId` | slot availability for a date | 200 | 422 `DATE_REQUIRED` |
| POST | `/api/user/register` | create account (upgrades guest) | 201 | 400, 409 `USER_EXISTS` |
| POST | `/api/user/login` | visitor sign in | 200 | 400, 401 |
| GET | `/api/user/me` | own profile | 200 | 401, 404 |
| GET | `/api/user/bookings` | own bookings | 200 | 401 |
| POST | `/api/bookings` | create pending booking | 201 | 401, 422 (`INVALID_DATE/SLOT/VISITOR/COUNTS/TICKET_TYPE`) |
| POST | `/api/payments/order` | create payment order | 200 | 401, 403, 404, 409 `ALREADY_PAID`, 429 |
| POST | `/api/payments/verify` | verify + issue ticket | 200 | 401, 402 `PAYMENT_FAILED`, 403, 404, 409 `ALREADY_PAID`, 429 |
| GET | `/api/bookings/:idOrCode?contact=` | lookup by code (contact-gated) | 200 | 400 `CONTACT_REQUIRED`, 404 |
| POST | `/api/bookings/:idOrCode/cancel` | cancel (contact-gated) | 200 | 400, 404, 409 `BOOKING_USED` |
| POST | `/api/tickets/validate` | gate scan of QR | 200 (`status: valid/used/invalid`) | 401, 403 |
| POST | `/api/admin/login` | admin sign in | 200 | 400, 401, 429 |
| GET | `/api/admin/bookings` | paged bookings | 200 | 401, 403 |
| GET | `/api/admin/payments` | paged payments | 200 | 401, 403 |
| GET | `/api/admin/analytics/{summary,bookings-by-day,peak-hours,popular}` | dashboards | 200 | 401, 403 |
| GET/POST/PUT/DELETE | `/api/admin/{exhibitions,shows,slots,ticket-types}` | CRUD (DELETE = soft-hide) | 200/201/204 | 401, 403, 500 |

- **Idempotent:** all GETs; DELETE (soft-hide, repeat = still 204); cancel (repeat returns `alreadyCancelled: true`); **verify** (repeat → 409 `ALREADY_PAID`, no double ticket).
- **Not idempotent:** `POST /api/bookings` — duplicate POSTs create two PENDING bookings (no unique constraint on user+date+slot). Honest answer: only the CONFIRMED one can be paid, and verify is guarded, so no double ticket — but a duplicate-pending guard is future work.
- **Validation:** hand-written per route (no zod/Joi). Example: register checks name ≥ 2 chars, email regex, password ≥ 6 (lines 293–301).
- **Error shape (uniform everywhere):** `{ "error": "<message>", "code": "MACHINE_CODE" }`. Not `{success, message}` — use the real shape in the viva.

### b) Curl set

```bash
# valid -> 201
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/bookings \
  -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"target":"entry","date":"2026-12-01","slotId":"1@2026-12-01","counts":{"1":1},"visitor":{"name":"V","email":"v@t.dev"}}'

# invalid -> 422
curl -X POST http://localhost:4000/api/bookings -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" -d '{"target":"entry"}' ; echo

# no token -> 401
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/bookings \
  -H "Content-Type: application/json" -d '{"target":"entry"}'

# wrong role: user token on admin route -> 403
curl -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/admin/bookings \
  -H "Authorization: Bearer $USER_TOKEN"

# duplicate payment verify -> 409
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/payments/verify \
  -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"bookingId":'"$BOOKING_ID"',"orderId":"order_x"}'

# 429: loop the payment endpoint 31 times
for i in $(seq 1 31); do code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  http://localhost:4000/api/payments/order -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" -d '{"bookingId":999999}'); done; echo "last: $code"

# list endpoint with filter + pagination (clamped)
curl -s "http://localhost:4000/api/admin/bookings?status=CONFIRMED&page=1&pageSize=500" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | head -c 120; echo
# -> pageSize is clamped to 100 in the response

# malformed JSON -> 400 from the central handler
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/bookings \
  -H "Content-Type: application/json" -H "Authorization: Bearer $USER_TOKEN" -d '{bad'
```

### d) Speaking script (~150 words)

> The resources are ticket types, exhibitions, shows, slots, bookings, payments, users and admins. I use GET to read, POST to create, PUT to update, and DELETE only soft-hides by flipping `isActive`, so history is never lost. Success is 200 or 201, validation failures are 422 with a machine-readable code, auth failures 401 and 403, conflicts 409, and the payment failure path uses 402. GETs and DELETE are idempotent; booking POST is not — two identical POSTs create two pending bookings, and I say that openly. The dangerous one is protected: payment verify is idempotent in effect, because a second call on a confirmed booking returns 409 ALREADY_PAID and never issues a second ticket. Validation is hand-written per route — no zod — and every error, from the central handler or a route, comes back as one JSON shape: error message plus a machine code, never a stack trace.

### e) If asked

- "Why 422 and not 400?" → "Express convention for semantic validation errors; the shape and codes are still uniform."
- "Why no zod?" → "Validation is manual per route today; a schema layer is the next refactor."

---

## Q3. Authentication and authorization

### a) Files to open on screen, in order

1. `server/src/auth.js` — lines 3–28 (secret check, `signAdminToken` 12 h, `signUserToken` 30 d)
2. `server/src/auth.js` — lines 30–75 (`requireAdmin` role check, `requireUser`, `optionalUser`)
3. `server/src/index.js` — lines 285–359 (register: `bcrypt.hash(password, 10)`, guest-upgrade path)
4. `server/src/index.js` — lines 417–448 (`/api/user/bookings` scoped by token identity)
5. `server/src/index.js` — lines 603–629 + 632–660 (payment routes: `requireUser` + ownership 403)
6. `prisma/seed.js` — lines 2–17 (admin seeded with bcrypt hash, rounds 10)

### Key facts (all verified)

- **JWT Bearer tokens**, stateless; no sessions, no cookies.
- **Token storage is client-side** (`localStorage['museumx.user']`, `client/src/user/UserAuthContext.jsx` line 5) and sent as `Authorization: Bearer`. Server is storage-agnostic.
- **bcryptjs, salt rounds 10** — register line 305 (`await bcrypt.hash(password, 10)`), login compare line 376, admin login line 936, seed line 8.
- **Access tokens only** — admin 12 h, user 30 d. **No refresh tokens, no server-side logout** (logout = client discards the token). Say this honestly.
- **Roles:** `admin`, `gate`, `user` in the JWT payload. `requireAdmin` accepts only `admin`/`gate` (auth.js lines 31–33) and guards every `/api/admin/*` and `/api/tickets/validate`.
- **Ownership:** `/api/user/bookings` filters `userId = req.user.id` (or email match) — line 419–425; payment routes compare `booking.userId !== req.user.id → 403` (lines 610–613, 643–646). Lookup/cancel are public-by-design but gated by matching the booking's account contact (`contactMatches`, lines 730–746).

### b) Curl set

```bash
# no token on protected route -> 401
curl -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/user/bookings

# user token on admin route -> 403
curl -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/admin/bookings \
  -H "Authorization: Bearer $USER_TOKEN"

# user B paying user A's booking -> 403 (ownership)
curl -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/payments/order \
  -H "Content-Type: application/json" -H "Authorization: Bearer $USER_B_TOKEN" \
  -d '{"bookingId":'"$BOOKING_OF_A"'}'

# garbage token -> 401
curl -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/user/me \
  -H "Authorization: Bearer not-a-jwt"

# admin token on admin route -> 200
curl -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/admin/bookings \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

### d) Speaking script (~150 words)

> Authentication is stateless JWT in the Authorization header — it fits a desktop client where cookies add CSRF surface for no benefit. Tokens are signed with a secret that must exist or the server refuses to boot. Passwords are hashed with bcryptjs at ten salt rounds, and I can show the hash column in the database — never plaintext. Admin tokens last twelve hours, visitor tokens thirty days; there is no refresh-token flow and no server-side logout — logout is the client discarding the token, and I say that openly. Authorization has three roles: admin, gate and user. Every admin route passes through `requireAdmin`, which checks the role claim and returns 403 for a valid user token. Users see only their own bookings because the query filters by the ID inside the verified token, never an ID from the client, and the payment endpoints now reject another visitor's booking with 403. The demo shows 401 with no token, 403 with the wrong role, and 403 on someone else's booking.

### e) If asked

- "Refresh tokens?" → "Not implemented; the 30-day visitor token trades strictness for demo simplicity. Rotation would be my first addition."
- "Token revocation?" → "None — a JWT is valid until expiry; a real deployment would add a denylist."

---

## Q4. Security

### a) Files to open on screen, in order

1. `server/src/index.js` — lines 13–38 (helmet, CORS, JSON limit, both limiters)
2. `server/src/index.js` — lines 1456–1466 (central error handler: generic JSON, no stacks)
3. `server/src/index.js` — lines 632–660 (verify: server decides PAID/FAILED, client can't)
4. `server/.env.example` (placeholders only) + root `.gitignore` (`.env` ignored)
5. `client/src/api/client.js` — lines 17–19 (token attached via `setAuthToken`)

### Key facts (all verified)

- **helmet** line 13 (`crossOriginResourcePolicy: false` so the Electron `file://` renderer can fetch).
- **CORS allow-list:** `http://localhost:5173` plus the string `'null'` — the second one is deliberate: Electron's `file://` pages send `Origin: null`. Flag it as a conscious trade-off, tightened in a real deployment.
- **Rate limiting:** login/register/admin-login 10 per 15 min (lines 17–26); payments 30 per 15 min (lines 30–38) — **added on `viva-fixes`**; both return 429 with `{error, code:'RATE_LIMITED'}` and standard `RateLimit-*` headers.
- **XSS:** API returns JSON only; React escapes output by default; no server-side HTML sanitisation needed. Inputs are length/regex-validated by hand.
- **CSRF: not applicable** — auth is a Bearer header, never cookies, so there is no ambient credential to forge.
- **Secrets:** `server/.env` is gitignored (root `.gitignore` line 2); `.env.example` contains placeholders only (`DATABASE_URL`, `DIRECT_URL`, `PORT`, `JWT_SECRET`).
- **Crash behaviour:** every route catches, logs server-side, and returns `{error:'Something went wrong', code:'SERVER_ERROR'}`; the central handler maps malformed JSON to 400 and everything else to 500 — **no stack traces in any response**.
- **Payments:** honest wording — the gateway is **simulated** (`provider: 'SIMULATED'`, order ids `order_neon_…`). There is no Razorpay SDK and no signature verification; the security-relevant part that IS real: the server decides payment outcome and issues the ticket, the client cannot mark a booking paid.

### b) Curl set

```bash
# 429 from the payment limiter
for i in $(seq 1 31); do code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  http://localhost:4000/api/payments/order -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" -d '{"bookingId":999999}'); done; echo "last: $code"
# -> 429 {"error":"Too many payment attempts, try again later","code":"RATE_LIMITED"}

# 429 from the login limiter (11 bad logins)
for i in $(seq 1 11); do code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  http://localhost:4000/api/user/login -H "Content-Type: application/json" \
  -d '{"email":"nobody@test.dev","password":"wrong"}'); done; echo "last: $code"

# CORS header visible on a simple GET
curl -s -D - -o /dev/null http://localhost:4000/api/health | grep -i "access-control\|x-content-type\|x-frame"

# security headers from helmet
curl -s -D - -o /dev/null http://localhost:4000/api/health | grep -iE "x-dns|x-frame|x-content-type|strict-transport"
```

### d) Speaking script (~150 words)

> Helmet sets the security headers on every response. CORS is an explicit allow-list: the Vite dev origin and the string null, which is what Electron's file:// renderer sends — a deliberate trade-off I can explain. Rate limiting sits on the brute-force targets: ten attempts per fifteen minutes on login and registration, thirty on the payment endpoints, both answering 429 with our standard JSON shape. CSRF doesn't apply because authentication travels in the Authorization header, never cookies, so there's no ambient credential to forge. XSS is handled mostly by React's escaping, and the API only emits JSON. Secrets — database URLs and the JWT secret — live in .env, which is gitignored, with a placeholder-only .env.example in the repo. Every error is caught centrally and returns a generic message with no stack trace. And payments are decided server-side: the client reports an outcome, but only the server flips the booking to confirmed and issues the ticket.

### e) If asked

- "Is Razorpay real?" → "No — it's a clearly-labelled simulation (`provider: 'SIMULATED'`). The real integration would add server-side signature verification of the webhook; the order/verify endpoint split is already shaped for it."
- "Why allow Origin: null?" → "Electron's file:// renderer sends null; a production build would serve the client over https and drop it."

---

## Q5. Database and non-blocking behaviour

### a) Files to open on screen, in order

1. `server/src/db.js` — lines 1–2 (single PrismaClient, exported once)
2. `server/prisma/schema.prisma` — models at lines 11 (Admin), 21 (User), 94 (Booking, `@@index([userId, createdAt])` line 127), 131 (Payment), 149 (IssuedTicket)
3. `server/prisma/seed.js` — lines 2–17 (admin), ~40–70 (ticket types, exhibitions, shows, slots)
4. `server/src/index.js` — lines 417–448 (`/api/user/bookings`: one query with `include`, no N+1)
5. `server/src/index.js` — lines 945–990 (admin list: filter + `skip/take`, clamp 1–100)
6. `server/src/index.js` — line 305 (async bcrypt), 568–575 (async Prisma writes)

### Key facts (all verified)

- **Single PrismaClient** created once in `db.js` and imported everywhere — no client-per-request.
- **Migrations folder is empty** (only `.gitkeep`) — the project uses `prisma db push`, not `migrate dev`. Say this honestly; the schema itself is in `schema.prisma`.
- **Seed** (`prisma/seed.js`): admin (`admin@museumx.in` / bcrypt of `admin123`), ticket types, exhibitions, shows, slot templates — all via `upsert`, idempotent.
- **Related data:** booking queries use `include: { user, ticketType, dailyCapacity, payments, issuedTickets }` — Prisma generates the joins; **no queries inside loops**. `/api/slots` runs exactly two queries (templates + active bookings) and aggregates in memory.
- **List endpoint:** `/api/admin/bookings` supports `status` filter + `search` (case-insensitive contains on code/name/email), `orderBy createdAt desc`, `skip/take` pagination, **pageSize clamped to 1–100** (lines 949–952) — a `pageSize=500` request comes back with `pageSize: 100`.
- **Non-blocking:** all I/O is `async/await` — Prisma queries, `bcrypt.hash/compare` (async variants), `fetch`. **Zero `fs.*Sync` calls** (grepped). No request handler blocks the event loop.
- **Query logging:** not on by default; enable with `DEBUG="prisma:query"` (no code change needed).

### b) Curl set

```bash
# list with filter + pagination, huge page size clamped
curl -s "http://localhost:4000/api/admin/bookings?status=CONFIRMED&search=MX&page=1&pageSize=500" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  python3 -c "import json,sys; d=json.load(sys.stdin); print('pageSize:', d['pageSize'], '| total:', d['total'])"
# -> pageSize: 100

# prove the clamp is server-side (line 951), not client-side
curl -s "http://localhost:4000/api/admin/bookings?pageSize=0" -H "Authorization: Bearer $ADMIN_TOKEN" | \
  python3 -c "import json,sys; print(json.load(sys.stdin)['pageSize'])"
# -> 1

# user A cannot see user B's bookings (ownership filter)
curl -s http://localhost:4000/api/user/bookings -H "Authorization: Bearer $USER_B_TOKEN" | \
  python3 -c "import json,sys; print([b['bookingCode'] for b in json.load(sys.stdin)['bookings']])"
```

### c) Terminal — Prisma query logging

```bash
cd server
DEBUG="prisma:query" node src/index.js
# in a second terminal, fire one request:
curl -s "http://localhost:4000/api/user/bookings" -H "Authorization: Bearer $USER_TOKEN" > /dev/null
# terminal shows: prisma:query SELECT ... FROM "Booking" LEFT JOIN ... WHERE ...
```

### d) Speaking script (~150 words)

> The database is PostgreSQL on Neon, accessed through Prisma. There is exactly one PrismaClient, created in db.js and imported everywhere — one per request would exhaust the connection pool. One honest caveat: the migrations folder is empty because we manage the schema with prisma db push during development; the schema itself lives in schema.prisma, and the seed script idempotently upserts the admin account, ticket types, exhibitions, shows and slot templates. For related data I use Prisma's include — a booking fetch brings its user, ticket type, capacity, payments and tickets in one query, never a query per row in a loop. The admin list endpoint filters by status and search text, sorts by creation date, and paginates with skip and take, clamped to a hundred per page server-side, so a request for five hundred gets a hundred. Every I/O call is async — Prisma, bcrypt, fetch — with no synchronous file access anywhere, and I can show the actual SQL with query logging.

### e) If asked

- "Why empty migrations?" → "We used `prisma db push` for speed in a two-person team; before production I'd switch to `migrate dev` so schema changes are reviewable."
- "Why bcryptjs and not bcrypt native?" → "Pure-JS build, zero native compilation headaches in Electron packaging; same algorithm, async API."

---

## 5-minute recording runbook

| Time | On screen | Say |
|---|---|---|
| 0:00–0:20 | Terminal: server booting with `DEBUG="prisma:query"` | one-line intro of the stack |
| 0:20–1:20 | `index.js` lines 12–38, then 450–598 | Q1: middleware order + booking trace |
| 1:20–2:20 | Fire the curl set (201 → 422 → 401 → 409 → 429) | Q2: REST design + error shape |
| 2:20–3:20 | `auth.js` 1–75; curl 401/403/ownership | Q3: JWT, bcrypt, roles, ownership |
| 3:20–4:10 | lines 13–38 again + 429 demo + `.env.example` + `.gitignore` | Q4: helmet, CORS, rate limits, secrets |
| 4:10–5:00 | `db.js`, schema, seed; SQL scrolling in the server terminal; clamped pageSize | Q5: Prisma, includes, pagination, async |

### Pre-flight checklist

- [ ] `server/.env` has real `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET` — and **the terminal never shows a `cat .env`**
- [ ] DB seeded: `cd server && node prisma/seed.js` (idempotent)
- [ ] Fresh tokens generated right before recording (user 30 d, admin 12 h — both long-lived, but regenerate anyway)
- [ ] Server running with `DEBUG="prisma:query" node src/index.js` in a **dedicated** terminal (SQL visible)
- [ ] Terminal font ≥ 18 px; editor at the exact line numbers; only one terminal shows output
- [ ] `rateLimit` counters reset — if you demoed 429 earlier, wait 15 min or restart the server first
- [ ] Browser tab with the running app open in case they ask "does the client actually work with this?"
- [ ] Close any window showing `.env`, tokens beyond what you paste, or the admin password

### Token generation (run before recording, paste into the recording terminal as `$USER_TOKEN` etc.)

```bash
export USER_TOKEN=$(curl -s -X POST http://localhost:4000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")

export ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@museumx.in","password":"admin123"}' | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
```

## Things I could not verify / honest gaps (say these if asked)

1. **Razorpay is simulated** — no SDK, no webhook signature verification. The order/verify split is shaped for it.
2. **No refresh tokens, no logout endpoint, no token revocation.**
3. **`POST /api/bookings` is not idempotent** — duplicate POSTs create two pending bookings (verify is guarded, so no double tickets).
4. **`prisma/migrations` is empty** — schema managed with `db push`.
5. **`server/src/chatbot.js` is an empty file** (0 bytes) — dead placeholder, not imported.
6. **CORS allows the `null` origin** — needed for Electron `file://`; tighten for a web deployment.
7. **Validation is hand-written**, not schema-based (zod/Joi).
