-- Extra integrity rules + indexes on top of the Prisma schema (Prisma cannot express CHECKs;
-- add this file as a raw-SQL migration:  npx prisma migrate dev --create-only  then paste).
-- !! Status lists below are the conventions used in this DE demo. Align them with the exact
-- !! strings your Express code writes before applying to your real database.

ALTER TABLE "TicketType"    ADD CONSTRAINT chk_ticket_price   CHECK ("price" >= 0);
ALTER TABLE "SlotTemplate"  ADD CONSTRAINT chk_slot_capacity  CHECK ("capacity" > 0);
ALTER TABLE "SlotTemplate"  ADD CONSTRAINT chk_slot_type      CHECK ("type" IN ('entry','exhibition','show'));
ALTER TABLE "SlotTemplate"  ADD CONSTRAINT chk_slot_time      CHECK ("startTime" < "endTime");
ALTER TABLE "DailyCapacity" ADD CONSTRAINT chk_capacity_range CHECK ("capacity" >= 0 AND "bookedCount" >= 0 AND "bookedCount" <= "capacity");
ALTER TABLE "Booking"       ADD CONSTRAINT chk_booking_qty    CHECK ("quantity" > 0);
ALTER TABLE "Booking"       ADD CONSTRAINT chk_booking_price  CHECK ("unitPrice" >= 0);
ALTER TABLE "Booking"       ADD CONSTRAINT chk_booking_total  CHECK ("totalAmount" = "quantity" * "unitPrice");
ALTER TABLE "Booking"       ADD CONSTRAINT chk_booking_status CHECK ("status" IN ('PENDING_PAYMENT','CONFIRMED','CANCELLED','EXPIRED'));
ALTER TABLE "Booking"       ADD CONSTRAINT chk_booking_target CHECK ("target" IN ('entry','exhibition','show'));
ALTER TABLE "Payment"       ADD CONSTRAINT chk_payment_amount CHECK ("amount" >= 0);
ALTER TABLE "Payment"       ADD CONSTRAINT chk_payment_status CHECK ("status" IN ('PENDING','SUCCESS','FAILED','REFUNDED'));
ALTER TABLE "IssuedTicket"  ADD CONSTRAINT chk_ticket_status  CHECK ("status" IN ('VALID','USED','CANCELLED'));
ALTER TABLE "IssuedTicket"  ADD CONSTRAINT chk_ticket_scan    CHECK (("status" = 'USED') = ("scannedAt" IS NOT NULL));

-- Indexes for FK columns and frequent filters (Postgres does NOT auto-index FKs)
CREATE INDEX "Booking_ticketTypeId_idx"    ON "Booking"("ticketTypeId");
CREATE INDEX "Booking_status_idx"          ON "Booking"("status");
CREATE INDEX "Booking_target_refId_idx"    ON "Booking"("target","refId");
CREATE INDEX "Payment_status_idx"          ON "Payment"("status");
CREATE INDEX "IssuedTicket_status_idx"     ON "IssuedTicket"("status");
CREATE INDEX "SlotTemplate_type_refId_idx" ON "SlotTemplate"("type","refId");

-- A payment gateway reference must never be recorded twice (idempotent webhook handling)
CREATE UNIQUE INDEX "Payment_providerReference_key" ON "Payment"("providerReference") WHERE "providerReference" IS NOT NULL;
