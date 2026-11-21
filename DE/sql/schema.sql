-- MuseumX : PostgreSQL schema equivalent to server/prisma/schema.prisma
-- (Prisma-style DDL: quoted CamelCase names, FK ON DELETE RESTRICT ON UPDATE CASCADE).
-- NOTE: Prisma sets updatedAt / cuid() values in the client. DEFAULTs are added here only so plain SQL inserts work.
DROP TABLE IF EXISTS "BookingItem","IssuedTicket","Payment","Booking","DailyCapacity","SlotTemplate",
                     "Show","Exhibition","TicketType","User","Admin" CASCADE;

CREATE TABLE "Admin" (
    "id"           SERIAL NOT NULL,
    "email"        TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name"         TEXT DEFAULT 'Admin',
    "role"         TEXT DEFAULT 'admin',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id"           SERIAL NOT NULL,
    "name"         TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "phone"        TEXT,
    "passwordHash" TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketType" (
    "id"            SERIAL NOT NULL,
    "name"          TEXT NOT NULL,
    "nameHi"        TEXT,
    "price"         INTEGER NOT NULL,
    "description"   TEXT,
    "descriptionHi" TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Exhibition" (
    "id"            SERIAL NOT NULL,
    "name"          TEXT NOT NULL,
    "nameHi"        TEXT,
    "description"   TEXT NOT NULL,
    "descriptionHi" TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Exhibition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Show" (
    "id"            SERIAL NOT NULL,
    "name"          TEXT NOT NULL,
    "nameHi"        TEXT,
    "description"   TEXT NOT NULL,
    "descriptionHi" TEXT,
    "venue"         TEXT,
    "venueHi"       TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Show_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlotTemplate" (
    "id"        SERIAL NOT NULL,
    "type"      TEXT NOT NULL DEFAULT 'entry',
    "refId"     INTEGER,
    "startTime" TEXT NOT NULL,
    "endTime"   TEXT NOT NULL,
    "capacity"  INTEGER NOT NULL DEFAULT 100,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SlotTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DailyCapacity" (
    "id"          SERIAL NOT NULL,
    "visitDate"   DATE NOT NULL,
    "capacity"    INTEGER NOT NULL,
    "bookedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyCapacity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Booking" (
    "id"              SERIAL NOT NULL,
    "bookingCode"     TEXT NOT NULL DEFAULT md5(random()::text),
    "userId"          INTEGER NOT NULL,
    "ticketTypeId"    INTEGER NOT NULL,
    "dailyCapacityId" INTEGER NOT NULL,
    "quantity"        INTEGER NOT NULL,
    "unitPrice"       INTEGER NOT NULL,
    "totalAmount"     INTEGER NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
    "target"          TEXT DEFAULT 'entry',
    "refId"           INTEGER,
    "refName"         TEXT,
    "refNameHi"       TEXT,
    "date"            TEXT,
    "slotId"          TEXT,
    "slotLabel"       TEXT,
    "itemsJson"       TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id"                SERIAL NOT NULL,
    "bookingId"         INTEGER NOT NULL,
    "amount"            INTEGER NOT NULL,
    "status"            TEXT NOT NULL DEFAULT 'PENDING',
    "provider"          TEXT NOT NULL DEFAULT 'MOCK',
    "providerReference" TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt"            TIMESTAMP(3),
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IssuedTicket" (
    "id"        SERIAL NOT NULL,
    "bookingId" INTEGER NOT NULL,
    "qrToken"   TEXT NOT NULL DEFAULT md5(random()::text),
    "status"    TEXT NOT NULL DEFAULT 'VALID',
    "issuedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scannedAt" TIMESTAMP(3),
    CONSTRAINT "IssuedTicket_pkey" PRIMARY KEY ("id")
);

-- Unique indexes
CREATE UNIQUE INDEX "Admin_email_key"             ON "Admin"("email");
CREATE UNIQUE INDEX "User_email_key"              ON "User"("email");
CREATE UNIQUE INDEX "TicketType_name_key"         ON "TicketType"("name");
CREATE UNIQUE INDEX "DailyCapacity_visitDate_key" ON "DailyCapacity"("visitDate");
CREATE UNIQUE INDEX "Booking_bookingCode_key"     ON "Booking"("bookingCode");
CREATE UNIQUE INDEX "IssuedTicket_qrToken_key"    ON "IssuedTicket"("qrToken");

-- Indexes declared in schema.prisma (@@index)
CREATE INDEX "Booking_userId_createdAt_idx"       ON "Booking"("userId","createdAt");
CREATE INDEX "Booking_dailyCapacityId_status_idx" ON "Booking"("dailyCapacityId","status");
CREATE INDEX "Payment_bookingId_idx"              ON "Payment"("bookingId");
CREATE INDEX "IssuedTicket_bookingId_idx"         ON "IssuedTicket"("bookingId");

-- Foreign keys
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_userId_fkey"          FOREIGN KEY ("userId")          REFERENCES "User"("id")          ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_ticketTypeId_fkey"    FOREIGN KEY ("ticketTypeId")    REFERENCES "TicketType"("id")    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_dailyCapacityId_fkey" FOREIGN KEY ("dailyCapacityId") REFERENCES "DailyCapacity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_bookingId_fkey"       FOREIGN KEY ("bookingId")       REFERENCES "Booking"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "IssuedTicket" ADD CONSTRAINT "IssuedTicket_bookingId_fkey" FOREIGN KEY ("bookingId")   REFERENCES "Booking"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;
