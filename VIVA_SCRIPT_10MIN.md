# MuseumX Backend Viva — 10-Minute Extended Script

Line numbers verified against `main`. Commands referenced by number from `VIVA_COMMANDS.md`.
Terminal A = server with `PRISMA_QUERY_LOG=1` (SQL visible). Terminal B = commands. Editor left.

---

## INTRO (0:00–0:20)

**SHOW:** Terminal A boot line + a few `prisma:query` lines already scrolling.

**SAY:** "Hi, I'm Pallav. This is the backend viva for MuseumX, our smart museum ticket booking system — an Electron desktop app with a React client, an Express and Prisma backend, and PostgreSQL hosted on Neon. Everything I claim today I'll show you live: my actual code on the left, my running server on the right, and real requests with real status codes."

---

## Q1. Architecture and the life of one request (0:20–2:10)

**SHOW (in this order):**

| What | Where | Point at |
|---|---|---|
| File tree | `server/src/` | `index.js`, `auth.js`, `db.js`, and `prisma/schema.prisma` |
| The whole of db.js | `server/src/db.js` lines 1–7 | one shared PrismaClient, env-gated query logging |
| auth.js | `server/src/auth.js` lines 1–78 | token signing + the three middlewares |
| Middleware stack | `index.js` lines 13–38 | helmet → cors → json → limiters, in order |
| Traced endpoint | `index.js` lines 450–598 | `POST /api/bookings` |

**RUN:** VIVA_COMMANDS Q1 (SLOT_ID → booking POST → capture BOOKING_ID). Leave the 201 JSON on screen.

**SAY:**

"The backend is Express on Node, written in ES modules. I chose Express for three reasons: it's minimal, so nothing hides from an examiner; the whole team already knew JavaScript, so one language spans client, server and tooling; and it pairs naturally with Prisma, which gives me type-safe database access generated straight from my schema.

One honest note on structure before you ask: I did not use a full MVC split. There are no separate routes, controllers and services folders. All twenty-seven endpoints live in one banded file, index.js — banded by comment headers like 'user stuff', 'booking stuff', 'payment stuff', 'admin stuff'. What I did extract is everything cross-cutting: auth.js holds the JWT signing and the three auth middlewares, and db.js holds the single Prisma client. For twenty-seven endpoints in a two-person team, one file kept review simple; the auth and db modules show the extraction pattern I'd continue with if the API grew. There is no Express Router and no version prefix — routes are flat under /api, like /api/bookings, /api/payments/verify, /api/admin/login. With one consumer, our own client, versioning would have been ceremony without value.

Now the life of one request — booking creation, the endpoint that matters most. The request enters at the top of index.js: helmet sets security headers first, then CORS checks the origin, then the JSON body parser with a one-megabyte cap, then two rate limiters — ten attempts per fifteen minutes on the auth routes, thirty on payments. Then the route itself: the requireUser middleware verifies the JWT and rejects with 401 if it's missing or expired. Inside the handler, manual validation checks the date format, the slot, the visitor contact and the ticket counts, rejecting bad input with 422 and a machine code. Then the database work: Prisma upserts a daily-capacity row for that date, so the day's capacity exists before anyone books it; the booking code is generated from crypto random bytes; and one Prisma create with an include brings the booking back together with its user and ticket type. The response is 201 with the public booking shape.

Order matters, and I can be specific. If the body parser ran after the routes, req.body would be undefined for every POST and booking creation would fail its own validation. If the rate limiters ran after the routes, they would never execute — brute-forcing login would be unthrottled. If the central error handler weren't registered last, Express would return its default HTML error page, which leaks stack details in development. The one swap that's harmless is helmet and CORS — both only decorate responses — and I'd say that honestly rather than invent a failure."

---

## Q2. REST API design (2:10–3:50)

**SHOW:**

| What | Where | Point at |
|---|---|---|
| All endpoints | Terminal B: `grep -n "app\.\(get\|post\|put\|patch\|delete\)" server/src/index.js` | the resource grouping |
| Soft delete | `index.js` lines ~1320–1325 | DELETE exhibition → `isActive: false`, 204 |
| Status codes | `index.js` line 468 | 422 with `{error, code}` |
| Central handler | `index.js` lines 1451–1467 | 404 catch-all + error middleware |

**RUN:** VIVA_COMMANDS Q2 (invalid POST → 422; order → verify 200 → verify again 409).

**SAY:**

"The resources are ticket types, exhibitions, shows, slot templates, bookings, payments, users and admins. I used GET to read, POST to create, PUT to update, and DELETE only to soft-delete — it flips isActive to false and returns 204, so we never lose history and analytics stay meaningful.

Status codes are deliberate. Success is 200, 201 for creation, 204 for deletes. Validation failures are 422 with a code like INVALID_DATE or INVALID_SLOT. Authentication failures are 401, wrong role 403, missing resources 404, conflicts 409, failed payments 402, and the rate limiter speaks 429.

Idempotency: every GET is idempotent, DELETE is — repeating it keeps returning 204 — and cancellation is idempotent by design: cancelling an already-cancelled booking returns the booking with an alreadyCancelled flag instead of erroring. Booking POST is not idempotent, and I'll say that openly: two identical POSTs create two pending bookings, because there's no unique constraint on user, date and slot. What protects the money path is that payment verification is guarded — a second call on a confirmed booking returns 409 ALREADY_PAID and never issues a second ticket. So the worst case is a duplicate pending row, not a duplicate ticket.

Validation is hand-written per route — no zod or Joi. The register route, for example, checks name length, an email regex and password length; booking creation checks the date against a strict YYYY-MM-DD pattern, because before I added that, a garbage date sailed past the check and crashed the capacity upsert with a 500 — a real bug this validation now prevents. Every error, whether thrown by a route or by the central handler, comes back in one shape: an error message plus a machine-readable code. The central middleware also maps malformed JSON to a 400 and everything unexpected to a generic 500 — never a stack trace."

---

## Q3. Authentication and authorization (3:50–5:30)

**SHOW:**

| What | Where | Point at |
|---|---|---|
| Token signing | `auth.js` lines 3–28 | admin 12h, user 30d, role in payload |
| Middleware | `auth.js` lines 30–75 | requireAdmin role check → 403; requireUser |
| Hashing | `index.js` line 308 | `bcrypt.hash(password, 10)` |
| Hash in DB | Terminal C: `npx prisma studio` → User table | passwordHash column, bcrypt prefix `$2a$` |
| Ownership | `index.js` lines 417–425 | query filtered by `req.user.id` |
| Ownership 403 | `index.js` lines 610–613 | payments: `booking.userId !== req.user.id` |

**RUN:** VIVA_COMMANDS Q3 (401 → 403 → ownership 403 with the FORBIDDEN body).

**SAY:**

"Authentication is stateless JWT in the Authorization header. I chose tokens over sessions because MuseumX is a desktop client: cookies would add CSRF surface for no benefit, and a bearer token works identically in the browser, in Electron and in curl — which is what I'm demoing with. The client stores the token in localStorage and the API client attaches it to every request; the server itself is storage-agnostic, it just reads the header.

Passwords are hashed with bcryptjs at ten salt rounds — the async variant, so hashing never blocks the event loop. I can show the hash in the database: it starts with the dollar-two-a bcrypt prefix, salt included, and no plaintext anywhere. Admin tokens are signed for twelve hours, visitor tokens for thirty days. I'll be honest about the gaps: there is no refresh-token flow and no server-side logout. Logout means the client discards the token, and a stolen token is valid until expiry — token rotation and a revocation list would be my first additions.

Authorization has three roles carried in the JWT payload: admin, gate, and user. Every admin route, including gate validation, passes through requireAdmin, which verifies the token and checks the role claim — a valid user token gets 403, not just 401. And the ownership check: users can only read their own bookings because the query filters by the user ID from inside the verified token, never an ID from the client. The payment endpoints go further — they compare the booking's owner to the caller and reject mismatches with 403, which is the demo you're seeing now: user B trying to pay user A's booking gets FORBIDDEN. One design decision worth flagging: booking lookup by code is deliberately contact-gated rather than JWT-gated, so a visitor can retrieve their ticket from any device — the contact must match the booking's account."

---

## Q4. Security (5:30–7:00)

**SHOW:**

| What | Where | Point at |
|---|---|---|
| helmet + CORS | `index.js` lines 13–14 | allow-list origins |
| Limiters | `index.js` lines 17–38 | auth 10/15min, payments 30/15min |
| Secrets | `.gitignore` line 2 + `server/.env.example` | `.env` ignored; placeholders only |
| Error handler | `index.js` lines 1456–1466 | generic JSON, no stack |
| Simulated payment | `index.js` line ~665 | `provider: 'SIMULATED'` |

**RUN:** VIVA_COMMANDS Q4 (headers with Origin → 429 loop with uniq -c).

**SAY:**

"Helmet sets the security headers on every response — content security policy, X-Frame-Options, X-Content-Type-Options, all visible in this response. CORS is an explicit allow-list: the Vite dev origin on 5173, plus the string null, which is what Electron's file:// renderer sends as its origin. That null entry is a deliberate trade-off I can defend: it exists for the packaged desktop app, and in a web deployment I'd drop it and serve the client over HTTPS.

Rate limiting sits on the abuse targets. Login, registration and admin login share a limiter at ten attempts per fifteen minutes per IP, because credential stuffing is the obvious attack. The payment endpoints have their own limiter at thirty per fifteen minutes — added after I noticed they were the only unauthenticated write path — and both return 429 with our standard error shape and standard RateLimit headers. You're seeing the loop now: a block of 404s for the unknown booking, then the limiter takes over with 429.

XSS is handled mostly at the client: React escapes output by default and the API emits only JSON, never HTML built from user input; on the server, user input is length- and regex-validated before it reaches the database. CSRF doesn't apply here — authentication travels in the Authorization header, never cookies, so there's no ambient credential for a forged request to ride on.

Secrets: the database URLs and the JWT secret live in server/.env, which is gitignored — I'll show the gitignore line, not the file. The repo ships a placeholder-only .env.example, and the server refuses to boot if JWT_SECRET is missing, so a misconfigured deploy fails loudly instead of running with a default secret. When the API crashes, every catch logs server-side and returns a generic message with a machine code; the central handler never forwards stack traces.

And one full honesty item: the payment gateway is simulated — provider SIMULATED, order IDs generated locally, no Razorpay SDK and no signature verification yet. What is real is the trust boundary: the client reports an outcome, but only the server decides paid versus failed, flips the booking, and issues the ticket. The order-then-verify split is exactly the shape a real Razorpay integration needs."

---

## Q5. Database and non-blocking behaviour (7:00–9:10)

**SHOW:**

| What | Where | Point at |
|---|---|---|
| Single client | `server/src/db.js` lines 1–7 | one PrismaClient, env-gated logging |
| Schema | `prisma/schema.prisma` lines 94–130 | Booking model: relations, `@@index([userId, createdAt])` |
| Migrations | `prisma/migrations/` | empty — `db push` workflow, say it plainly |
| Seed | `prisma/seed.js` lines 2–17 | admin upsert with bcrypt hash |
| include | `index.js` lines 417–448 | one query, five relations |
| Clamp | `index.js` lines 949–954 | pageSize clamped 1–100 |

**RUN:** VIVA_COMMANDS Q5 (clamped pagination → point at SQL in Terminal A; `grep -rn "Sync(" server/src` → empty).

**SAY:**

"The database is PostgreSQL hosted on Neon, accessed through Prisma. I chose Prisma over a raw driver or Sequelize for three reasons: the schema file is the single source of truth, the generated client is type-safe so wrong field names fail at development time, and its include mechanism handles related reads cleanly. There is exactly one PrismaClient, created in db.js and imported everywhere — creating one per request would exhaust the connection pool, because each client holds its own pool of sockets. Connection-wise, DATABASE_URL points at Neon's pooler endpoint, which multiplexes many client connections, and DIRECT_URL points at the direct endpoint for migrations and Studio, which need a real session.

One honest caveat on schema management: the migrations folder is empty. During development we managed the schema with prisma db push, which syncs the schema file directly to the database. It was fast for a two-person team, but it leaves no review trail, so before production I'd switch to migrate dev and baseline the current schema. The seed script, by contrast, is fully idempotent — it upserts the admin account with a bcrypt-hashed password, ticket types, exhibitions, shows and slot templates, so rerunning it is always safe.

For related data I use Prisma's include. A booking fetch brings its user, ticket type, daily capacity, payments and issued tickets in one query — Prisma generates the joins, and there is no query inside a loop anywhere in the file. The slot availability endpoint runs exactly two queries and aggregates occupancy in memory.

The admin list endpoint shows filtering, sorting and pagination: it filters by status and by case-insensitive search across booking code, visitor name and email, sorts newest first, and paginates with skip and take. The page size is clamped server-side between one and one hundred — you asked for five hundred, the response says pageSize 100, and in the server terminal you can see the actual SQL Prisma ran, ending in LIMIT 100. That clamp matters: without it, one request could pull the whole table into memory.

Finally, non-blocking. Every I/O point in this backend is async: Prisma queries are promises, password hashing uses bcrypt's async hash and compare, and there are zero synchronous file calls — the grep for Sync returns nothing. Node runs my JavaScript on one thread; if any handler blocked on disk or network, every concurrent visitor would queue behind it. Because everything awaits, the event loop stays free and one slow request never holds up anyone else's booking."

---

## OUTRO (9:10–9:30)

**SAY:** "That's MuseumX's backend: Express and Prisma over Postgres on Neon, JWT auth with role-based authorization, rate-limited and helmet-hardened, with honest gaps I can name — no refresh tokens, simulated payments, and db push instead of migrations. Thank you — happy to go deeper on any part."

---

## If-asked one-liners

| Question | Answer |
|---|---|
| Why no controllers/services folders? | "27 endpoints in one banded file kept review simple; auth.js and db.js show the extraction pattern I'd continue." |
| Why 422 not 400? | "Semantic validation errors; the shape `{error, code}` is uniform either way." |
| Refresh tokens / revocation? | "Not implemented — 30-day tokens trade strictness for demo simplicity; rotation first." |
| Real Razorpay? | "Simulated (`provider: 'SIMULATED'`); order/verify split is shaped for signature verification." |
| Duplicate booking POST? | "Creates two pending rows — flagged; verify is guarded so no double tickets; a pending-duplicate guard is future work." |
| Public lookup security? | "Contact-gated, not JWT-gated, so tickets work from any device; rate limiting there is my next step." |
| Empty migrations? | "db push during dev; migrate dev + baseline before production." |
| Why bcryptjs not native bcrypt? | "Pure JS — no native compilation issues inside Electron packaging; same algorithm, async API." |
| What's `chatbot.js`? | "An empty placeholder — not imported; honest answer if the file tree is questioned." |
| What's `null` in CORS? | "Electron's file:// origin; dropped in a web deployment." |

## Timing checkpoints

| By | You should be |
|---|---|
| 2:10 | finished the Q1 booking 201 |
| 3:50 | finished the 409 re-verify |
| 5:30 | finished the ownership 403 |
| 7:00 | finished the 429 loop |
| 9:10 | finished the SQL + Sync grep |

If behind: trim the Q1 middleware walk-through and the Q2 grep narration — never cut a RUN demo.
