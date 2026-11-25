# 🏛️ MuseumX – Smart Museum Ticket Booking System

**An intelligent, multilingual chatbot-based museum ticket booking and management platform.**

MuseumX is a desktop-based museum management and ticket booking application designed to simplify the visitor experience through a conversational chatbot, online payments, digital ticketing and centralized administration.

The platform aims to eliminate the limitations of traditional manual ticket booking systems by providing a faster, more accessible and efficient digital solution.

---

## 📌 Problem Statement

Traditional museum ticket booking systems often involve long queues, manual record management, booking errors and inefficient handling of visitors during peak hours.

These limitations negatively affect visitor satisfaction and create additional operational challenges for museum administrators.

MuseumX addresses these problems through an integrated digital ticketing platform that automates the booking process and provides better management of museum operations.

## 🎯 Project Objectives

- Eliminate long queues through online ticket booking.
- Provide an interactive multilingual chatbot.
- Automate ticket reservations and payment processing.
- Support bookings for museum entry, exhibitions and special shows.
- Generate digital tickets with QR codes.
- Reduce manual errors and duplicate bookings.
- Provide administrators with meaningful booking and revenue analytics.

---

## ✨ Key Features

### 1. Conversational Chatbot
- Rule-based intelligent chatbot.
- Interactive ticket booking through conversations.
- English and Hindi language support.
- Information about exhibitions, shows and museum timings.
- Booking assistance and cancellation support.

### 2. Ticket Booking System
- General museum entry bookings.
- Special exhibition bookings.
- Scheduled show bookings.
- Date and time-slot selection.
- Real-time availability checking.
- Booking confirmation.

### 3. Online Payment Integration
- Secure payment gateway integration.
- Online transaction verification.
- Payment status tracking.
- Automated booking confirmation after successful payment.

### 4. Digital QR Tickets
- Unique QR code generation.
- Digital ticket display.
- QR-based visitor verification.
- Prevention of duplicate ticket usage.

### 5. Admin Dashboard
- Manage ticket categories and pricing.
- Manage exhibitions and shows.
- Monitor visitor bookings.
- Track payment records.
- View booking and revenue statistics.

### 6. Analytics and Reporting
- Total bookings and visitors.
- Revenue statistics.
- Popular exhibitions and shows.
- Peak visitor periods.
- Booking trends and operational insights.

---

## 🥽 AR/VR and AI Features

### Q-learning slot recommender

After a visitor picks a time slot, MuseumX checks how full that slot is and asks a
trained Q-learning policy whether to keep it or move the visitor to a quieter
slot. When a quieter slot exists in the recommended direction, the chatbot shows
two choices — **switch to the quieter slot** or **keep my slot** — in both English
and Hindi. If the policy is unavailable, the state is unknown, or no quieter slot
exists, the original selection is kept and the normal booking flow continues.

**Occupancy.** A slot's load is `booked ÷ capacity`. Missing, negative or
zero-capacity values are treated as unknown, never as a division by zero.

**State.** `day type × occupancy bucket`:

| Component | Values |
|---|---|
| Day type | `weekday`, `weekend`, `holiday` |
| Load bucket | `low` (< 0.50), `medium` (0.50 – 0.80), `high` (> 0.80) |

**Actions.** `keep`, `earlier`, `later`.

**Reward design.**

| Situation | Reward |
|---|---|
| Keep at low load | +1 |
| Keep at medium load | +0.2 |
| Keep at high load | −1 |
| Suggest at high load, alternative has lower load | +1 |
| Suggest at medium load, alternative has lower load | +0.5 |
| Suggest at medium load, alternative is not lower | −0.5 |
| Suggest at low load | −0.5 |
| Suggested alternative is also high load | −1 |
| No alternative slot in that direction | −0.2 |

Medium-load rewards are defined explicitly so training and runtime behaviour stay
consistent. Training uses tabular Q-learning with ε-greedy exploration
(ε decays from 1.0 to 0.05), learning rate `0.1`, discount factor `0.9`,
4000 episodes and a seeded simulation of visitor arrivals peaking at midday and
on weekends/holidays.

**Files.**

| File | Purpose |
|---|---|
| `client/src/ml/train.mjs` | Trains the agent and writes `qpolicy.json` |
| `client/src/ml/qpolicy.json` | Generated policy: best action and Q-values per state |
| `client/src/ml/usePolicy.js` | Runtime lookup, occupancy math, quieter-slot search and safe fallbacks |
| `client/src/chatbot/engine/reducer.js` | Runs the recommendation step after slot selection |
| `client/src/admin/PolicyHeatmap.jsx` | Admin heatmap of the learned policy (day types × load buckets) |

**Run the training script** (from the repository root):

```bash
node client/src/ml/train.mjs
```

The script validates that all nine states were sampled, checks the exported
actions and Q-values, and rewrites `client/src/ml/qpolicy.json`. The file is
included in the repository so the packaged Electron app can load the policy
without any network or CDN dependency.

### Course concepts

| Course concept | Project application |
|---|---|
| Q-learning | Learns a slot recommendation policy from simulated visitor demand |
| Reinforcement learning | State, action, reward and policy learning |
| Epsilon-greedy strategy | Balances exploration and exploitation during training |
| Policy visualization | Admin heatmap showing the learned action per state |

### AR/VR status

This build of MuseumX does **not** include a 3D exhibit viewer or a Google
Cardboard / VR mode. Those are a separate team workstream and are not claimed
as implemented here. The chatbot booking flow, Q-learning recommender, policy
heatmap and documentation above are the features present in this repository.

---

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| Electron | Desktop application framework |
| React.js | Frontend development |
| Node.js | Backend runtime |
| Express.js | REST API development |
| PostgreSQL | Relational database |
| Prisma ORM | Database management |
| JavaScript | Application logic |
| Razorpay | Payment gateway |
| QR Code | Digital ticket generation |
| Recharts | Analytics visualization |

---

## 🏗️ System Architecture

MuseumX follows a modular architecture that separates the desktop application, frontend, backend and database.

```text
                 MUSEUMX
                    |
          Electron Desktop App
                    |
              React Frontend
                    |
          Express REST API
                    |
       +------------+------------+
       |            |            |
    Chatbot      Booking      Admin
     Logic       Services     Services
       |            |            |
       +------------+------------+
                    |
              Prisma ORM
                    |
             PostgreSQL
                    |
          External Integrations
                    |
             Razorpay Gateway
```

### Electron Architecture

Electron provides the desktop environment and secure communication between the renderer and main processes using IPC (Inter-Process Communication).

### Backend Architecture

Express handles API requests, booking operations, payment verification, authentication and database interactions.

### Database Architecture

PostgreSQL stores visitors, administrators, ticket types, exhibitions, shows, slot templates, daily capacities, bookings, payments and issued tickets.

---

## 📂 Project Structure

```text
MuseumX/
│
├── electron/
│   ├── main.cjs
│   └── preload.cjs
│
├── client/
│   ├── public/
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── chatbot/
│       ├── admin/
│       ├── ml/
│       ├── App.jsx
│       └── main.jsx
│
├── server/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   │
│   └── src/
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       ├── middleware/
│       ├── db.js
│       └── index.js
│
├── package.json
└── README.md
```

*The structure may evolve as development progresses.*

---

## ⚙️ Installation and Setup

### Prerequisites

Make sure you have installed:

- Node.js
- npm
- PostgreSQL or a Neon PostgreSQL database
- Git

### 1. Clone the repository

```bash
git clone <repository-url>
cd MuseumX
```

### 2. Install dependencies

Install the dependencies in the root, client and server directories according to their respective `package.json` files.

### 3. Configure environment variables

Create the required `.env` files.

Example server configuration:

```env
DATABASE_URL="your_database_connection_url"
DIRECT_URL="your_direct_database_connection_url"
PORT=4000

RAZORPAY_KEY_ID="your_razorpay_key"
RAZORPAY_KEY_SECRET="your_razorpay_secret"
```

Never commit actual database credentials or payment secrets to GitHub.

### 4. Configure Prisma

```bash
npx prisma generate
npx prisma migrate dev
```

Run these commands from the directory containing the relevant Prisma configuration.

### 5. Start the application

Start the Express backend and React frontend using the configured npm scripts.

Launch the Electron desktop application using the root development script.

---

## 🗄️ Database Modules

The database consists of the following 10 entities (defined in `schema.prisma`):

| Entity | Description |
|---|---|
| Admin | Administrator accounts |
| User | Museum visitors |
| TicketType | Ticket categories and pricing |
| Exhibition | Museum exhibitions |
| Show | Special museum shows |
| SlotTemplate | Scheduled entry and show timing templates |
| DailyCapacity | Daily visitor capacity tracking and limits |
| Booking | Visitor reservations |
| Payment | Transaction and payment verification records |
| IssuedTicket | Digital tickets with unique QR tokens and gate scan tracking |

---

## 🔐 Security Considerations

- Electron context isolation.
- Disabled Node.js integration in the renderer.
- Secure IPC communication through preload scripts.
- Hashed administrator passwords.
- Backend-side payment verification.
- Environment-based secret management.
- Booking validation and duplicate-entry prevention.

---

## 👥 Team Members and Responsibilities

| Member | Responsibilities |
|---|---|
| Akshat Rane | Electron development, database architecture, Prisma schema and desktop integration |
| Arnav | Backend development, APIs, booking logic and payment integration |
| Pallav | React frontend, chatbot interface and admin dashboard |



## 🚀 Future Scope

- Support for additional Indian languages.
- Advanced visitor behaviour analytics.
- Personalized exhibition recommendations.
- Integration with museum membership systems.
- Automated email and SMS notifications.
- Multi-museum support.
- Advanced reporting and operational forecasting.

---

## 📊 Project Status

**Currently under development.**

The project is being developed incrementally, with Electron architecture, database design, backend services and frontend functionality being implemented in separate modules.

---

## 🏛️ Project Context

**Domain:** Travel & Tourism  
**Category:** Software  
**Year:** 2024  
**Organization:** Ministry of Culture  
**Department:** National Council of Science Museums

---

## 📄 License

This project is developed for educational and demonstration purposes. Licensing and third-party technology terms apply to their respective components.

---

**MuseumX – Making Museum Visits Smarter, Simpler and More Accessible.**
