# VIVA_COMMANDS.md — every command, in video order

Terminal A = the on-camera terminal running the server (SQL logs appear here).
Terminal B = your command terminal (this sheet). Keep both visible; editor on the left.

---

## PRE-FLIGHT (before recording starts)

### Terminal A — seed + start (this stays on screen all video)

```bash
lsof -ti :4000 | xargs kill -9
cd /Users/pallav/Desktop/asd-major/server
node prisma/seed.js
PRISMA_QUERY_LOG=1 node src/index.js
```

Wait for: `MuseumX Neon DB Server running on http://localhost:4000`

### Terminal B — tokens + demo data (run once, off camera)

```bash
cd /Users/pallav/Desktop/asd-major/server

# ---- user A = YOUR real account (the one that made real bookings) ----
export USER_TOKEN=$(curl -s -X POST http://localhost:4000/api/user/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL","password":"YOUR_PASSWORD"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")

# ---- user B (only for the Q3 ownership 403) ----
export USER_B_TOKEN=$(curl -s -X POST http://localhost:4000/api/user/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo B","email":"demob@video.dev","password":"Test1234!","phone":"9000000002"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")

# ---- admin (from seed.js) ----
export ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@museumx.in","password":"admin123"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")

# ---- a future visit date used by every booking in the video ----
export VDATE=$(date -v+3d +%F)

# ---- sanity check: all three must print 200 ----
curl -s -o /dev/null -w "user:  %{http_code}\n" http://localhost:4000/api/user/me -H "Authorization: Bearer $USER_TOKEN"
curl -s -o /dev/null -w "userB: %{http_code}\n" http://localhost:4000/api/user/me -H "Authorization: Bearer $USER_B_TOKEN"
curl -s -o /dev/null -w "admin: %{http_code}\n" http://localhost:4000/api/admin/bookings -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## INTRO (0:00–0:10)

Nothing to run. Terminal A boot log is on screen. Just talk.

---

## Q1 — Architecture (0:10–1:15)

**Editor:** `server/src/` file tree → `index.js` lines 12–38 → lines 450–598.

### RUN 1.1 — get a slot id for the demo date (do this BEFORE the booking curl)

```bash
export SLOT_ID=$(curl -s "http://localhost:4000/api/slots?date=$VDATE&type=entry" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)[0]['id'])")
echo "$SLOT_ID"
```

Expected: something like `1@2026-12-01`

### RUN 1.2 — the valid booking → 201 (leave the response on screen)

```bash
curl -s -X POST http://localhost:4000/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d "{\"target\":\"entry\",\"date\":\"$VDATE\",\"slotId\":\"$SLOT_ID\",\"counts\":{\"1\":2},\"visitor\":{\"name\":\"Pallav Demo\",\"email\":\"pallav@video.dev\"}}" \
  | python3 -m json.tool
```

Expected: `201`-style JSON — `"status": "PENDING_PAYMENT"`, `"bookingCode": "MX…"`, `"amount": …`

### RUN 1.3 — capture the booking id for later scenes (no duplicate POST!)

```bash
export BOOKING_ID=$(curl -s http://localhost:4000/api/user/bookings \
  -H "Authorization: Bearer $USER_TOKEN" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['bookings'][0]['id'])")
echo "BOOKING_ID=$BOOKING_ID"
```

(Newest booking is first — this is the one you just created.)

---

## Q2 — REST design (1:15–2:20)

**Editor:** `grep -n "app\.\(get\|post\|put\|patch\|delete\)" server/src/index.js` in Terminal B, then `index.js` lines 1451–1467.

### RUN 2.1 — the endpoint list (paste exactly this grep)

```bash
grep -n "app\.\(get\|post\|put\|patch\|delete\)" server/src/index.js
```

### RUN 2.2 — invalid request → 422 with the error shape

```bash
curl -s -X POST http://localhost:4000/api/bookings \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d '{"target":"entry"}'
```

Expected: `{"error":"Choose a visit date.","code":"INVALID_DATE"}`

### RUN 2.3 — payment sequence: order → verify (200) → verify again (409)

```bash
# order
export ORDER_ID=$(curl -s -X POST http://localhost:4000/api/payments/order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d "{\"bookingId\":$BOOKING_ID}" \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['orderId'])")
echo "$ORDER_ID"

# verify -> 200, booking becomes CONFIRMED with a qrToken
curl -s -X POST http://localhost:4000/api/payments/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d "{\"bookingId\":$BOOKING_ID,\"orderId\":\"$ORDER_ID\"}" \
  | python3 -m json.tool | head -15

# verify AGAIN -> 409 ALREADY_PAID
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/payments/verify \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -d "{\"bookingId\":$BOOKING_ID,\"orderId\":\"$ORDER_ID\"}"
```

Expected: order id `order_neon_…`, verify 200 with `"status": "CONFIRMED"`, repeat prints `409`.

---

## Q3 — Auth (2:20–3:30)

**Editor:** `auth.js` lines 1–75 → `index.js` register handler (~line 285, `bcrypt.hash(password, 10)` around line 305) → optional: `npx prisma studio` in a THIRD terminal, User table, `passwordHash` column.

### RUN 3.1 — no token → 401

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/user/bookings
```

### RUN 3.2 — user token on admin route → 403

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/admin/bookings \
  -H "Authorization: Bearer $USER_TOKEN"
```

### RUN 3.3 — user B pays user A's booking → 403 ownership

```bash
curl -s -X POST http://localhost:4000/api/payments/order \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_B_TOKEN" \
  -d "{\"bookingId\":$BOOKING_ID}"
```

Expected: `{"error":"This booking belongs to another visitor.","code":"FORBIDDEN"}` (HTTP 403)

### RUN 3.4 (optional, if time) — Prisma Studio for the hash

```bash
npx prisma studio
# opens http://localhost:5555 — User table -> passwordHash column
```

---

## Q4 — Security (3:30–4:35)

**Editor:** `index.js` lines 13–38 → `.gitignore` + `server/.env.example` (NEVER `.env` contents) → lines 1456–1466.

### RUN 4.1 — security headers with the allowed Origin

```bash
curl -s -D - -o /dev/null http://localhost:4000/api/exhibitions \
  -H "Origin: http://localhost:5173" \
  | grep -iE "access-control|x-frame|x-content-type|content-security|strict-transport"
```

Expected: CORS + helmet header lines (`access-control-allow-origin`, `x-frame-options`, `x-content-type-options`, `content-security-policy`, …)

### RUN 4.2 — the 429 loop (LAST demo — it burns the limiter budget)

```bash
for i in $(seq 1 31); do
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/payments/order \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $USER_TOKEN" \
    -d '{"bookingId":999999}'
done | uniq -c
```

Expected: a block of `404`s (unknown booking) then `429` at the end — e.g. `26 404` + `5 429`. The exact split varies with how many payment calls you already made; the 429 is the point.

---

## Q5 — Database (4:35–5:50)

**Editor:** `db.js` → `prisma/schema.prisma` → `prisma/migrations/` (empty) → `prisma/seed.js` → `index.js` lines 417–448.

### RUN 5.1 — clamped pagination + the SQL appears in Terminal A

```bash
curl -s "http://localhost:4000/api/admin/bookings?status=CONFIRMED&page=1&pageSize=500" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print('pageSize:',d['pageSize'],'| total:',d['total'],'| rows returned:',len(d['rows']))"
```

Expected: `pageSize: 100 | total: <N> | rows returned: 100`
Then point at Terminal A: the `prisma:query SELECT … "Booking" … LIMIT 100` line.

### RUN 5.2 — zero blocking calls

```bash
grep -rn "Sync(" server/src
```

Expected: **no output** (exit silently). Say: "no results — zero synchronous file calls."

---

## OUTRO (5:50–6:00)

Nothing to run.

---

## RETAKE RULES

- The 429 loop burns the payment limiter (30/15 min). **Restart the server between retakes**: in Terminal A press `Ctrl+C`, then `↑` + `Enter`.
- Registration/login limiter (10/15 min) — user B's registration counts once; retakes are fine unless you re-register repeatedly.
- Tokens survive server restarts (they're JWTs) — only regenerate if you changed `JWT_SECRET`.
