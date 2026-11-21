-- OPTIONAL EXTENSION (recommended 3NF fix): BookingItem = junction table giving a real many-to-many between
-- Booking and Exhibition/Show, replacing Booking.itemsJson and the un-enforced (target, refId) pair.
-- README lists "BookingItem" as a planned entity; add it to schema.prisma before using it in the app.
CREATE TABLE "BookingItem" (
    "id"           SERIAL PRIMARY KEY,
    "bookingId"    INTEGER NOT NULL REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "exhibitionId" INTEGER REFERENCES "Exhibition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "showId"       INTEGER REFERENCES "Show"("id")       ON DELETE RESTRICT ON UPDATE CASCADE,
    "quantity"     INTEGER NOT NULL CHECK ("quantity" > 0),
    CONSTRAINT chk_item_one_target CHECK (num_nonnulls("exhibitionId","showId") = 1)
);
CREATE INDEX "BookingItem_bookingId_idx" ON "BookingItem"("bookingId");
CREATE UNIQUE INDEX "BookingItem_exh_key"  ON "BookingItem"("bookingId","exhibitionId") WHERE "exhibitionId" IS NOT NULL;
CREATE UNIQUE INDEX "BookingItem_show_key" ON "BookingItem"("bookingId","showId")       WHERE "showId" IS NOT NULL;

-- Back-fill from the existing (target, refId) columns
INSERT INTO "BookingItem" ("bookingId","exhibitionId","showId","quantity")
SELECT b.id, CASE WHEN b.target = 'exhibition' THEN b."refId" END, CASE WHEN b.target = 'show' THEN b."refId" END, b.quantity
FROM "Booking" b WHERE b.target IN ('exhibition','show') AND b."refId" IS NOT NULL;

\echo '=== Ext-Q: visitors per exhibition/show using real foreign keys (no string matching) ==='
SELECT COALESCE(e.name, s.name) AS attraction, CASE WHEN e.id IS NOT NULL THEN 'exhibition' ELSE 'show' END AS kind,
       SUM(bi.quantity) AS visitors
FROM "BookingItem" bi JOIN "Booking" b ON b.id = bi."bookingId"
LEFT JOIN "Exhibition" e ON e.id = bi."exhibitionId" LEFT JOIN "Show" s ON s.id = bi."showId"
WHERE b.status = 'CONFIRMED' GROUP BY 1, 2 ORDER BY visitors DESC, attraction;

\echo '=== Ext-test: an item pointing to BOTH an exhibition and a show must fail ==='
INSERT INTO "BookingItem" ("bookingId","exhibitionId","showId","quantity") VALUES (1,1,1,1);
