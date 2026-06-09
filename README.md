<div align="center">
  <h1>🚕 Equinox Ride-Hailing Backend</h1>
  <p>A production-grade, event-driven backend ecosystem for real-time ride dispatching, dynamic fare calculation, and geospatial tracking.</p>

  <!-- TECH STACK BADGES -->
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js"></a>
  <a href="https://socket.io/"><img src="https://img.shields.io/badge/WebSockets-010101?style=for-the-badge&logo=socketdotio&logoColor=white" alt="WebSockets"></a>
  <a href="https://supabase.com/"><img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase"></a>
  <a href="https://postgresql.org/"><img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"></a>
  <a href="http://project-osrm.org/"><img src="https://img.shields.io/badge/OSRM-000000?style=for-the-badge&logo=openstreetmap&logoColor=white" alt="OSRM"></a>
</div>

<br/>

## 📖 Overview
The Equinox Backend is the core engine powering a distributed ride-hailing platform. Built to handle high-frequency concurrent connections, it utilizes WebSocket infrastructure to instantly bridge the gap between rider and driver applications. 

By integrating the open-source OSRM routing engine, the system entirely bypasses expensive third-party APIs (like Google Maps), allowing for hyper-scalable, cost-effective dynamic routing.

## ✨ Key Features
- **⚡ Real-Time Dispatch System:** Bidirectional WebSocket communication ensuring sub-second latency for ride requests, acceptances, and status updates.
- **🗺️ Dynamic Fare Engine:** Integrates OSRM to calculate precise route distances and dynamically adjusts pricing based on vehicle tiers and simulated demand.
- **📍 Live Geospatial Tracking:** Processes high-frequency location pinging to provide smooth map interpolation for active rides.
- **🔒 Secure Ledger:** Supabase and PostgreSQL architecture managing user authentication, driver profiles, and a robust digital wallet history.

## 🏗️ Architecture
```text
[ Rider App ] <--- WebSockets ---> [ Node.js Server ] <--- WebSockets ---> [ Driver App ]
                                          |
                                          |---> [ OSRM Engine (Routing) ]
                                          |---> [ Supabase / PostgreSQL ]
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v16+)
- PostgreSQL Database (via Supabase)
- OSRM Server Instance

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Justinvcj/Equinox-server-backend.git
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure Environment Variables (`.env`):
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_anon_key
   PORT=3000
   ```
4. Start the server:
   ```bash
   npm run start
   ```

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
