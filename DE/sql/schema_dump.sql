--
-- PostgreSQL database dump
--

\restrict hoFAUQhLMqgjTnnipxGeMGhcitWpCEADU9Y0BvzGzd1esXbSTAtrN4R76qZCRS1

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Admin" (
    id integer NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    name text DEFAULT 'Admin'::text,
    role text DEFAULT 'admin'::text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Admin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Admin_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Admin_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Admin_id_seq" OWNED BY public."Admin".id;


--
-- Name: Booking; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Booking" (
    id integer NOT NULL,
    "bookingCode" text DEFAULT md5((random())::text) NOT NULL,
    "userId" integer NOT NULL,
    "ticketTypeId" integer NOT NULL,
    "dailyCapacityId" integer NOT NULL,
    quantity integer NOT NULL,
    "unitPrice" integer NOT NULL,
    "totalAmount" integer NOT NULL,
    status text DEFAULT 'PENDING_PAYMENT'::text NOT NULL,
    target text DEFAULT 'entry'::text,
    "refId" integer,
    "refName" text,
    "refNameHi" text,
    date text,
    "slotId" text,
    "slotLabel" text,
    "itemsJson" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_booking_price CHECK (("unitPrice" >= 0)),
    CONSTRAINT chk_booking_qty CHECK ((quantity > 0)),
    CONSTRAINT chk_booking_status CHECK ((status = ANY (ARRAY['PENDING_PAYMENT'::text, 'CONFIRMED'::text, 'CANCELLED'::text, 'EXPIRED'::text]))),
    CONSTRAINT chk_booking_target CHECK ((target = ANY (ARRAY['entry'::text, 'exhibition'::text, 'show'::text]))),
    CONSTRAINT chk_booking_total CHECK (("totalAmount" = (quantity * "unitPrice")))
);


--
-- Name: Booking_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Booking_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Booking_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Booking_id_seq" OWNED BY public."Booking".id;


--
-- Name: DailyCapacity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DailyCapacity" (
    id integer NOT NULL,
    "visitDate" date NOT NULL,
    capacity integer NOT NULL,
    "bookedCount" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_capacity_range CHECK (((capacity >= 0) AND ("bookedCount" >= 0) AND ("bookedCount" <= capacity)))
);


--
-- Name: DailyCapacity_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."DailyCapacity_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: DailyCapacity_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."DailyCapacity_id_seq" OWNED BY public."DailyCapacity".id;


--
-- Name: Exhibition; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Exhibition" (
    id integer NOT NULL,
    name text NOT NULL,
    "nameHi" text,
    description text NOT NULL,
    "descriptionHi" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Exhibition_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Exhibition_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Exhibition_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Exhibition_id_seq" OWNED BY public."Exhibition".id;


--
-- Name: IssuedTicket; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."IssuedTicket" (
    id integer NOT NULL,
    "bookingId" integer NOT NULL,
    "qrToken" text DEFAULT md5((random())::text) NOT NULL,
    status text DEFAULT 'VALID'::text NOT NULL,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "scannedAt" timestamp(3) without time zone,
    CONSTRAINT chk_ticket_scan CHECK (((status = 'USED'::text) = ("scannedAt" IS NOT NULL))),
    CONSTRAINT chk_ticket_status CHECK ((status = ANY (ARRAY['VALID'::text, 'USED'::text, 'CANCELLED'::text])))
);


--
-- Name: IssuedTicket_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."IssuedTicket_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: IssuedTicket_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."IssuedTicket_id_seq" OWNED BY public."IssuedTicket".id;


--
-- Name: Payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Payment" (
    id integer NOT NULL,
    "bookingId" integer NOT NULL,
    amount integer NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    provider text DEFAULT 'MOCK'::text NOT NULL,
    "providerReference" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "paidAt" timestamp(3) without time zone,
    CONSTRAINT chk_payment_amount CHECK ((amount >= 0)),
    CONSTRAINT chk_payment_status CHECK ((status = ANY (ARRAY['PENDING'::text, 'SUCCESS'::text, 'FAILED'::text, 'REFUNDED'::text])))
);


--
-- Name: Payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Payment_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Payment_id_seq" OWNED BY public."Payment".id;


--
-- Name: Show; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Show" (
    id integer NOT NULL,
    name text NOT NULL,
    "nameHi" text,
    description text NOT NULL,
    "descriptionHi" text,
    venue text,
    "venueHi" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Show_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Show_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Show_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Show_id_seq" OWNED BY public."Show".id;


--
-- Name: SlotTemplate; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SlotTemplate" (
    id integer NOT NULL,
    type text DEFAULT 'entry'::text NOT NULL,
    "refId" integer,
    "startTime" text NOT NULL,
    "endTime" text NOT NULL,
    capacity integer DEFAULT 100 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_slot_capacity CHECK ((capacity > 0)),
    CONSTRAINT chk_slot_time CHECK (("startTime" < "endTime")),
    CONSTRAINT chk_slot_type CHECK ((type = ANY (ARRAY['entry'::text, 'exhibition'::text, 'show'::text])))
);


--
-- Name: SlotTemplate_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."SlotTemplate_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: SlotTemplate_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."SlotTemplate_id_seq" OWNED BY public."SlotTemplate".id;


--
-- Name: TicketType; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TicketType" (
    id integer NOT NULL,
    name text NOT NULL,
    "nameHi" text,
    price integer NOT NULL,
    description text,
    "descriptionHi" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_ticket_price CHECK ((price >= 0))
);


--
-- Name: TicketType_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."TicketType_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: TicketType_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."TicketType_id_seq" OWNED BY public."TicketType".id;


--
-- Name: User; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."User" (
    id integer NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    phone text,
    "passwordHash" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: User_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."User_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: User_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."User_id_seq" OWNED BY public."User".id;


--
-- Name: Admin id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Admin" ALTER COLUMN id SET DEFAULT nextval('public."Admin_id_seq"'::regclass);


--
-- Name: Booking id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking" ALTER COLUMN id SET DEFAULT nextval('public."Booking_id_seq"'::regclass);


--
-- Name: DailyCapacity id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DailyCapacity" ALTER COLUMN id SET DEFAULT nextval('public."DailyCapacity_id_seq"'::regclass);


--
-- Name: Exhibition id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Exhibition" ALTER COLUMN id SET DEFAULT nextval('public."Exhibition_id_seq"'::regclass);


--
-- Name: IssuedTicket id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IssuedTicket" ALTER COLUMN id SET DEFAULT nextval('public."IssuedTicket_id_seq"'::regclass);


--
-- Name: Payment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment" ALTER COLUMN id SET DEFAULT nextval('public."Payment_id_seq"'::regclass);


--
-- Name: Show id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Show" ALTER COLUMN id SET DEFAULT nextval('public."Show_id_seq"'::regclass);


--
-- Name: SlotTemplate id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SlotTemplate" ALTER COLUMN id SET DEFAULT nextval('public."SlotTemplate_id_seq"'::regclass);


--
-- Name: TicketType id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketType" ALTER COLUMN id SET DEFAULT nextval('public."TicketType_id_seq"'::regclass);


--
-- Name: User id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User" ALTER COLUMN id SET DEFAULT nextval('public."User_id_seq"'::regclass);


--
-- Name: Admin Admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Admin"
    ADD CONSTRAINT "Admin_pkey" PRIMARY KEY (id);


--
-- Name: Booking Booking_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_pkey" PRIMARY KEY (id);


--
-- Name: DailyCapacity DailyCapacity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DailyCapacity"
    ADD CONSTRAINT "DailyCapacity_pkey" PRIMARY KEY (id);


--
-- Name: Exhibition Exhibition_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Exhibition"
    ADD CONSTRAINT "Exhibition_pkey" PRIMARY KEY (id);


--
-- Name: IssuedTicket IssuedTicket_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IssuedTicket"
    ADD CONSTRAINT "IssuedTicket_pkey" PRIMARY KEY (id);


--
-- Name: Payment Payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);


--
-- Name: Show Show_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Show"
    ADD CONSTRAINT "Show_pkey" PRIMARY KEY (id);


--
-- Name: SlotTemplate SlotTemplate_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SlotTemplate"
    ADD CONSTRAINT "SlotTemplate_pkey" PRIMARY KEY (id);


--
-- Name: TicketType TicketType_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketType"
    ADD CONSTRAINT "TicketType_pkey" PRIMARY KEY (id);


--
-- Name: User User_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);


--
-- Name: Admin_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Admin_email_key" ON public."Admin" USING btree (email);


--
-- Name: Booking_bookingCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Booking_bookingCode_key" ON public."Booking" USING btree ("bookingCode");


--
-- Name: Booking_dailyCapacityId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Booking_dailyCapacityId_status_idx" ON public."Booking" USING btree ("dailyCapacityId", status);


--
-- Name: Booking_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Booking_status_idx" ON public."Booking" USING btree (status);


--
-- Name: Booking_target_refId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Booking_target_refId_idx" ON public."Booking" USING btree (target, "refId");


--
-- Name: Booking_ticketTypeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Booking_ticketTypeId_idx" ON public."Booking" USING btree ("ticketTypeId");


--
-- Name: Booking_userId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Booking_userId_createdAt_idx" ON public."Booking" USING btree ("userId", "createdAt");


--
-- Name: DailyCapacity_visitDate_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "DailyCapacity_visitDate_key" ON public."DailyCapacity" USING btree ("visitDate");


--
-- Name: IssuedTicket_bookingId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IssuedTicket_bookingId_idx" ON public."IssuedTicket" USING btree ("bookingId");


--
-- Name: IssuedTicket_qrToken_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IssuedTicket_qrToken_key" ON public."IssuedTicket" USING btree ("qrToken");


--
-- Name: IssuedTicket_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IssuedTicket_status_idx" ON public."IssuedTicket" USING btree (status);


--
-- Name: Payment_bookingId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payment_bookingId_idx" ON public."Payment" USING btree ("bookingId");


--
-- Name: Payment_providerReference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Payment_providerReference_key" ON public."Payment" USING btree ("providerReference") WHERE ("providerReference" IS NOT NULL);


--
-- Name: Payment_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Payment_status_idx" ON public."Payment" USING btree (status);


--
-- Name: SlotTemplate_type_refId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "SlotTemplate_type_refId_idx" ON public."SlotTemplate" USING btree (type, "refId");


--
-- Name: TicketType_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "TicketType_name_key" ON public."TicketType" USING btree (name);


--
-- Name: User_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);


--
-- Name: Booking Booking_dailyCapacityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_dailyCapacityId_fkey" FOREIGN KEY ("dailyCapacityId") REFERENCES public."DailyCapacity"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Booking Booking_ticketTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_ticketTypeId_fkey" FOREIGN KEY ("ticketTypeId") REFERENCES public."TicketType"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Booking Booking_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Booking"
    ADD CONSTRAINT "Booking_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: IssuedTicket IssuedTicket_bookingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."IssuedTicket"
    ADD CONSTRAINT "IssuedTicket_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES public."Booking"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Payment Payment_bookingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES public."Booking"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict hoFAUQhLMqgjTnnipxGeMGhcitWpCEADU9Y0BvzGzd1esXbSTAtrN4R76qZCRS1

