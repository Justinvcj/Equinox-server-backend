# Equinox Server Backend ⚙️

![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-black?style=for-the-badge&logo=socket.io&badgeColor=010101)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)

Welcome to the **Equinox Dispatch Server v2.0**. This is the high-performance, event-driven Node.js backend that powers the Equinox ride-hailing ecosystem (Orbit-Mobility).

## 🚀 Overview

The Equinox backend is designed as a highly scalable "switchboard" that handles live dispatching, driver-rider matching, and real-time location telemetry. It bridges the gap between the Flutter mobile clients and the Supabase PostgreSQL Vault.

### Key Features
* **Real-Time Telemetry**: Powered by `Socket.io` for instantaneous driver GPS updates and ride state synchronization.
* **Dynamic Route Math Engine**: Integrates with OSRM (Open Source Routing Machine) to dynamically recalculate fares and routes mid-ride based on waypoints.
* **Weather Context Engine**: Automatically fetches live weather data (via Open-Meteo) to warn drivers of extreme conditions and adjust ride parameters.
* **God Mode GUI**: A protected administrative interface for monitoring system health, managing driver bans, and viewing financial ledgers.
* **The Vault Logic**: Automated ledger tracking for platform fees, cancellation penalties, and driver wallet balances.

## 🏗️ Architecture

* **Framework**: Node.js with Express
* **WebSockets**: Socket.io v4
* **Database / Auth**: Supabase (PostgreSQL)
* **Routing Engine**: OSRM (Project-OSRM)

## 📡 Core WebSocket Events

The system relies heavily on a room-based socket architecture to ensure messages only go where they are needed:

* `request_ride`: Emits a broadcast to the `active_drivers` room.
* `accept_ride`: Triggers a 4-digit OTP generation and securely notifies the specific rider's room (`rider_<phone>`).
* `driver_location_update`: Relays high-frequency GPS coordinates directly to the matched rider's active room.
* `update_route`: Triggers the OSRM engine to recalculate polyline, distance, and fare.
* `qr_pair_request`: Bypasses the standard matching pool for direct street-hails via QR code.

## 💻 Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Justinvcj/Equinox-server-backend.git
   cd Equinox-server-backend
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_service_role_key
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ADMIN_USER=admin
   ADMIN_PASS=equinox2026
   ```

4. **Run the Server**
   ```bash
   # Development mode (with Nodemon)
   npm run dev

   # Production mode
   npm start
   ```

## 🔒 Security

* **Ban Guard**: Middleware that checks Supabase on every handshake to immediately disconnect banned users.
* **Basic Auth**: The God Mode GUI (`/god-mode`) and Admin REST proxies are protected via `express-basic-auth`.
* **Wallet Integrity**: All fare deductions and ledger entries are executed entirely server-side to prevent client tampering.
