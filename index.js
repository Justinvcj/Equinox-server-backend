require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Server } = require("socket.io");
const http = require('http');
const basicAuth = require('express-basic-auth');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY);

// In-memory OTP storage for Phase 2
const activeOtps = new Map();

// In-memory Driver Location cache for Phase 17
const driverLocations = new Map();

// ============================================================
// --- AUTH & SECURITY MIDDLEWARE ---
// ============================================================

const adminAuth = basicAuth({
  users: { [process.env.ADMIN_USER || 'admin']: process.env.ADMIN_PASS || 'equinox2026' },
  challenge: true,
  realm: 'EquinoxGodMode'
});

async function banGuard(phone) {
  if (!phone) return false;
  try {
    const { data, error } = await supabase.from('users').select('is_banned').eq('phone', phone).single();
    return data && data.is_banned === true;
  } catch (e) { return false; }
}

// ============================================================
// --- 1. REST APIs ---
// ============================================================

app.get('/', (req, res) => res.send('Equinox Dispatch Server v2.0 — Online'));

// GOD MODE GUI
app.get('/god-mode', adminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// ADMIN PROXIES
app.get('/api/admin/drivers', adminAuth, async (req, res) => {
  const { data, error } = await supabase.from('users').select('*').eq('role', 'driver');
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, drivers: data });
});

app.post('/api/admin/ban', adminAuth, async (req, res) => {
  const { id } = req.body;
  const { error } = await supabase.from('users').update({ is_banned: true }).eq('id', id);
  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, message: "User banned" });
});

app.get('/api/admin/financials', adminAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('wallet_ledger').select('amount');
    if (error) throw error;
    const total = data.reduce((sum, entry) => sum + (parseFloat(entry.amount) || 0), 0);
    res.json({ success: true, totalRevenue: Math.floor(total) });
  } catch (e) {
    // If wallet_ledger doesn't exist yet, return 0
    res.json({ success: true, totalRevenue: 0 });
  }
});

app.post('/api/login', async (req, res) => {
  const { name, phone, role } = req.body;
  if (!phone || !role) return res.status(400).json({ error: "Missing data" });

  // BAN GUARD
  if (await banGuard(phone)) {
    return res.status(403).json({ error: "Account Suspended", banned: true });
  }

  try {
    const { data: existingUser, error: searchError } = await supabase
      .from('users')
      .select('*')
      .eq('phone', req.body.phone)
      .single();

    if (searchError && searchError.code !== 'PGRST116') {
      throw searchError;
    }

    if (existingUser) {
      return res.status(200).json({ success: true, user: existingUser });
    } else {
      const { data: newUserData, error: insertError } = await supabase
        .from('users')
        .insert([{ name, phone, role, wallet_balance: 5000 }])
        .select();

      if (insertError) throw insertError;
      return res.status(201).json({ success: true, user: newUserData[0] });
    }
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/pay-fee', async (req, res) => {
  const { phone } = req.body;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  try {
    const { error } = await supabase
      .from('users')
      .update({ subscription_expiry: tomorrow.toISOString() })
      .eq('phone', phone);

    if (error) throw error;
    res.json({ message: "Paid", expiry: tomorrow });
  } catch (error) {
    res.status(500).json({ error: "Payment Error", details: error.message });
  }
});

app.get('/api/rides/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .or(`rider_phone.eq.${phone},driver_phone.eq.${phone}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, rides: data });
  } catch (error) {
    console.error("Fetch Rides Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- PAYMENT API (Manual fallback — checkout screen) ---
app.post('/api/pay', async (req, res) => {
  const { rider_phone, driver_phone, fare, ride_id } = req.body;

  if (!rider_phone || !driver_phone || fare === undefined || !ride_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const numericFare = parseFloat(fare);
  if (isNaN(numericFare)) return res.status(400).json({ error: "Invalid fare amount" });

  try {
    const { data: riderData, error: riderError } = await supabase.from('users').select('wallet_balance').eq('phone', rider_phone).single();
    if (riderError) throw riderError;

    const { data: driverData, error: driverError } = await supabase.from('users').select('wallet_balance').eq('phone', driver_phone).single();
    if (driverError) throw driverError;

    const newRiderBalance = (parseFloat(riderData.wallet_balance) || 5000) - numericFare;
    const newDriverBalance = (parseFloat(driverData.wallet_balance) || 5000) + numericFare;

    await supabase.from('users').update({ wallet_balance: newRiderBalance }).eq('phone', rider_phone);
    await supabase.from('users').update({ wallet_balance: newDriverBalance }).eq('phone', driver_phone);
    await supabase.from('rides').update({ status: 'PAID' }).eq('id', ride_id);

    io.to(`driver_${driver_phone}`).emit('payment_successful', { fare: numericFare });

    res.json({ success: true, message: "Payment processed successfully", newBalance: newRiderBalance });
  } catch (err) {
    console.error("Payment API Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- SUBSCRIPTION STATUS ENDPOINT ---
app.get('/api/driver/subscription/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    const { data, error } = await supabase.from('users').select('subscription_expiry').eq('phone', phone).single();
    if (error && error.code !== 'PGRST116') throw error;
    res.json({ success: true, expiry: data ? data.subscription_expiry : null });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/driver/pay-subscription', async (req, res) => {
  try {
    const { phone, expiry_date } = req.body;
    if (!phone || !expiry_date) return res.status(400).json({ error: "Missing parameters" });
    
    // UPDATE users SET subscription_expiry = [expiry_date] WHERE phone = [phone]
    const { error } = await supabase.from('users').update({ subscription_expiry: expiry_date }).eq('phone', phone);
    if (error) throw error;
    
    res.json({ success: true, expiry: expiry_date });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// --- ACTIVE RIDE ENDPOINT (Lifecycle Rehydration) ---
app.get('/api/active-ride/:phone', async (req, res) => {
  const { phone } = req.params;
  try {
    const { data, error } = await supabase
      .from('rides')
      .select('*')
      .or(`rider_phone.eq.${phone},driver_phone.eq.${phone}`)
      .in('status', ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (data && data.length > 0) {
      let activeRide = data[0];
      if (activeOtps.has(activeRide.id)) {
        activeRide.otp = activeOtps.get(activeRide.id);
      }
      res.json({ success: true, activeRide: activeRide });
    } else {
      res.json({ success: true, activeRide: null });
    }
  } catch (err) {
    console.error("Active Ride Fetch Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// --- 2. REAL-TIME SOCKET SWITCHBOARD ---
// ============================================================

io.on("connection", async (socket) => {
  console.log("⚡ New Connection:", socket.id);

  // BAN GUARD (Socket handshake equivalent)
  socket.on("auth_handshake", async (data) => {
    if (await banGuard(data.phone)) {
      console.log(`🚫 Rejecting Banned User: ${data.phone}`);
      socket.emit("auth_error", { error: "Account Suspended" });
      socket.disconnect();
    }
  });

  // A. RIDER REGISTERS (joins a targetable room)
  socket.on("register_rider", (data) => {
    console.log(`👤 Rider Registered: ${data.phone} → room rider_${data.phone}`);
    socket.join(`rider_${data.phone}`);
  });

  // B. DRIVER COMES ONLINE
  socket.on("driver_online", (data) => {
    console.log(`🚕 Driver Online: ${data.phone}`);
    socket.join(`driver_${data.phone}`);
    socket.join("active_drivers");
  });

  // C. RIDER REQUESTS RIDE
  socket.on("request_ride", async (data) => {
    console.log(`🙋‍♂️ Ride Requested by ${data.riderPhone}`);
    console.log(`📍 Coordinates: ${data.pickupLat}, ${data.pickupLng} -> ${data.dropLat}, ${data.dropLng}`);

    // Phase 18: Weather Context Engine (Anti-Surge)
    try {
      if (data.pickupLat && data.pickupLng) {
         const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${data.pickupLat}&longitude=${data.pickupLng}&current_weather=true`;
         const wRes = await fetch(weatherUrl);
         const wData = await wRes.json();
         if (wData && wData.current_weather) {
            const code = wData.current_weather.weathercode;
            if (code >= 51) {
              console.log(`🌧️ Extreme Weather Detected (Code: ${code}) for ${data.riderPhone}`);
              io.to(`rider_${data.riderPhone}`).emit("weather_alert", {
                condition: "Rain",
                message: "Heavy Rain Detected. Fares remain locked by physics, but consider tipping your driver."
              });
              data.weather_condition = "Rain";
            }
         }
      }
    } catch(e) { console.error("Weather Engine Error:", e.message); }

    io.to("active_drivers").emit("new_ride_request", {
      riderId: socket.id,
      riderPhone: data.riderPhone,
      pickup: data.pickup,
      drop: data.drop,
      pickupLat: data.pickupLat,
      pickupLng: data.pickupLng,
      dropLat: data.dropLat,
      dropLng: data.dropLng,
      fare: data.fare,
      distance: data.distance,
      vehicle_type: data.vehicle_type,
      weather_condition: data.weather_condition
    });
  });

  socket.on("detach_rooms", (data) => {
    if (data.phone) {
      console.log(`🧹 Detaching rooms for driver: ${data.phone}`);
      socket.leave(`driver_${data.phone}`);
      socket.leave("active_drivers");
    }
  });

  // D. DRIVER ACCEPTS RIDE
  socket.on("accept_ride", async (data, ackCallback) => {
    console.log(`✅ Driver ${data.driverPhone} accepted ride for ${data.riderPhone}`);

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    let rideId = null;

    try {
      // Create the ride record immediately upon ACCEPT
      const numericFare = parseFloat(data.fare) || 0;
      const { data: newRide, error: insertError } = await supabase.from('rides').insert([{
        rider_phone: data.riderPhone,
        driver_phone: data.driverPhone,
        pickup: data.pickup,
        dropoff: data.drop,
        fare: numericFare,
        status: 'ACCEPTED'
      }]).select();

      if (insertError) {
        console.error("Supabase ride insert error on accept:", insertError);
      } else if (newRide && newRide.length > 0) {
        rideId = newRide[0].id;
        activeOtps.set(rideId, otp);
      }
    } catch (err) {
      console.error("Failed to insert ride on accept:", err);
    }

    const payload = {
      driverPhone: data.driverPhone,
      carNumber: data.carNumber || "KA-01-EQ-9999",
      eta: data.eta || "5 mins",
      otp: otp,
      rideId: rideId
    };

    // Notify the rider via BOTH their socket ID and their room (for rehydration)
    io.to(data.riderId).emit("ride_accepted", payload);
    io.to(`rider_${data.riderPhone}`).emit("ride_accepted", payload);

    if (typeof ackCallback === 'function') {
      ackCallback({ success: true, otp: otp, rideId: rideId });
    }
  });

  // E. DRIVER LOCATION RELAY → RIDER
  socket.on("driver_location_update", (data) => {
    // Cache for Phase 17
    if (data.driverPhone || data.phone) {
        driverLocations.set(data.driverPhone || data.phone, { lat: data.lat, lng: data.lng });
    }
    
    // Forward driver's GPS to the specific rider's room
    io.to(`rider_${data.riderPhone}`).emit("driver_location_update", {
      lat: data.lat,
      lng: data.lng,
      ride_id: data.ride_id
    });
  });

  // Phase 17.0 Dynamic Route Math Engine
  socket.on("update_route", async (data) => {
    console.log(`🗺️ Dynamic Route Recalculation for Route ${data.rideId}`);
    try {
      const driverLoc = driverLocations.get(data.driverPhone);
      if (!driverLoc) throw new Error("Driver location unknown.");

      // Calculate new distance -> Driver to Waypoint to Final Destination
      const url = `http://router.project-osrm.org/route/v1/driving/${driverLoc.lng},${driverLoc.lat};${data.waypoint.lng},${data.waypoint.lat};${data.dropLng},${data.dropLat}?geometries=geojson`;
      const response = await fetch(url);
      const osrmData = await response.json();

      if (osrmData && osrmData.routes && osrmData.routes.length > 0) {
        const route = osrmData.routes[0];
        const meters = route.distance;
        const km = meters / 1000;
        
        // Fare = distance * tierPrice
        const newFare = Math.round(km * (parseFloat(data.tierMultiplier) || 9.0));

        // Update database
        await supabase.from('rides').update({ 
          fare: newFare, 
          waypoints: JSON.stringify([{ lat: data.waypoint.lat, lng: data.waypoint.lng, address: data.waypoint.address }])
        }).eq('id', data.rideId);

        const payload = {
          newFare: newFare.toString(),
          distanceStr: `${km.toFixed(1)} km`,
          polyline: route.geometry.coordinates,
          waypoint: data.waypoint
        };

        // Broadcast
        io.to(`rider_${data.riderPhone}`).emit("route_recalculated", payload);
        io.to(`driver_${data.driverPhone}`).emit("route_recalculated", payload);
      }
    } catch (e) {
      console.error("Route Update Error:", e);
    }
  });

  // F. RIDE STATUS UPDATES (with ack callback for COMPLETED)
  socket.on("ride_status_update", async (data, ackCallback) => {
    console.log(`📢 Status Update: ${data.status} for Rider ${data.riderId}`);

    let rideId = data.rideId;

    if (["ACCEPTED", "ARRIVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(data.status)) {
      try {
        if (rideId) {
          await supabase.from('rides').update({ status: data.status }).eq('id', rideId);
          
          // Phase 16.0: The Vault Logic
          if (data.status === 'COMPLETED') {
            await supabase.from('admin_ledger').insert([{ transaction_type: 'platform_fee', amount: 10, driver_id: data.driverPhone }]);
          } else if (data.status === 'CANCELLED') {
            await supabase.from('admin_ledger').insert([{ transaction_type: 'cancellation_fee', amount: 20, driver_id: data.driverPhone }]);
            await supabase.from('rides').update({ cancelled_by: data.cancelledBy || 'unknown', cancellation_reason: data.cancellationReason || 'User Cancelled' }).eq('id', rideId);
          }
        }
      } catch (err) {
        console.error("Failed to process ride status DB update:", err);
      }
    }

    // Notify the rider via both socket ID and room
    const statusPayload = {
      status: data.status,
      message: data.message,
      rideId: rideId,
      fare: data.fare,
      driverPhone: data.driverPhone
    };

    io.to(data.riderId).emit("ride_status_change", statusPayload);
    io.to(`rider_${data.riderPhone}`).emit("ride_status_change", statusPayload);

    // Send ack back to driver (prevents End Trip freeze)
    // Send ack back to driver (prevents End Trip freeze)
    if (typeof ackCallback === 'function') {
      ackCallback({ success: true, rideId: rideId });
    }
  });

  // G. PAYMENT WORKFLOW (4-Step Strict Process)
  socket.on("request_payment", (data) => {
    console.log(`💳 Driver requested payment for Ride ${data.rideId}`);
    const payload = {
      rideId: data.rideId,
      fare: data.fare,
      driverPhone: data.driverPhone
    };
    io.to(data.riderId).emit("payment_requested", payload);
    io.to(`rider_${data.riderPhone}`).emit("payment_requested", payload);
  });

  socket.on("process_payment", async (data) => {
    console.log(`💸 Processing payment for Ride ${data.rideId}`);
    const rideId = data.rideId;
    const numericFare = parseFloat(data.fare) || 0;
    
    try {
      const { data: riderData, error: rErr } = await supabase.from('users').select('wallet_balance').eq('phone', data.riderPhone).single();
      const { data: driverData, error: dErr } = await supabase.from('users').select('wallet_balance').eq('phone', data.driverPhone).single();

      if (rErr && rErr.code !== 'PGRST116') throw rErr;
      if (dErr && dErr.code !== 'PGRST116') throw dErr;

      // Ensure fallback if not found
      const currentRiderBal = riderData ? parseFloat(riderData.wallet_balance) || 5000 : 5000;
      const currentDriverBal = driverData ? parseFloat(driverData.wallet_balance) || 5000 : 5000;

      const newRiderBalance = currentRiderBal - numericFare;
      const newDriverBalance = currentDriverBal + numericFare;

      const { error: updRiderErr } = await supabase.from('users').update({ wallet_balance: newRiderBalance }).eq('phone', data.riderPhone);
      if (updRiderErr) throw updRiderErr;
      
      const { error: updDriverErr } = await supabase.from('users').update({ wallet_balance: newDriverBalance }).eq('phone', data.driverPhone);
      if (updDriverErr) throw updDriverErr;

      if (rideId) {
        const { error: updRideErr } = await supabase.from('rides').update({ status: 'PAID' }).eq('id', rideId);
        if (updRideErr) throw updRideErr;
      }
      
      const payload = { fare: numericFare, rideId: rideId };
      io.to(`driver_${data.driverPhone}`).emit('payment_successful', payload);
      io.to(`rider_${data.riderPhone}`).emit('payment_successful', payload);
      if(data.riderId) io.to(data.riderId).emit('payment_successful', payload);
      
    } catch(err) {
       console.error("Payment Process Error", err);
       const failPayload = { error: err.message || "Payment Process Error" };
       io.to(`driver_${data.driverPhone}`).emit('payment_failed', failPayload);
       io.to(`rider_${data.riderPhone}`).emit('payment_failed', failPayload);
       if(data.riderId) io.to(data.riderId).emit('payment_failed', failPayload);
    }
  });

  // DEV: Wallet Reset Request
  socket.on("dev_reset_wallet", async (data) => {
    try {
      await supabase.from('users').update({ wallet_balance: 5000 }).eq('phone', data.phone);
      io.to(`rider_${data.phone}`).emit("wallet_updated", { balance: 5000 });
      console.log(`🔧 Dev Mode: Reset wallet for ${data.phone} to 5000`);
    } catch(err) {}
  });

  // Phase 16.0: Messaging Pipeline
  socket.on("send_message", (data) => {
    // Expected: { room_id, sender, text, timestamp }
    io.to(data.room_id).emit("receive_message", data);
  });

  // Phase 16.0: QR Handshake
  socket.on("qr_pair_request", async (data) => {
    // data: { riderPhone, driverPhone }
    const roomId = `room_qr_${data.riderPhone}_${data.driverPhone}`;
    socket.join(roomId);
    
    // Force driver into the room
    const driverSockets = await io.in(`driver_${data.driverPhone}`).fetchSockets();
    driverSockets.forEach(s => s.join(roomId));

    console.log(`🤝 QR Pair Handshake: ${data.riderPhone} <-> ${data.driverPhone}`);

    try {
      const { data: newRide, error } = await supabase.from('rides').insert([{
        rider_phone: data.riderPhone,
        driver_phone: data.driverPhone,
        pickup: 'Street Hail / QR Scanned',
        dropoff: 'TBD',
        fare: 0,
        status: 'ACCEPTED'
      }]).select();

      const rideId = newRide && newRide.length > 0 ? newRide[0].id : null;
      
      const payload = {
         roomId: roomId,
         rideId: rideId,
         driverPhone: data.driverPhone,
         riderPhone: data.riderPhone,
         status: 'ACCEPTED'
      };

      io.to(roomId).emit("qr_paired", payload);
    } catch(err) {
      console.error("QR Pair Error", err);
    }
  });

  // Phase 16.0: Driver Reporting
  socket.on("report_driver", async (data) => {
    try {
      await supabase.from('driver_reports').insert([{
        driver_id: data.driverPhone,
        rider_id: data.riderPhone,
        reason: data.reason || 'General'
      }]);

      const { count } = await supabase.from('driver_reports').select('*', { count: 'exact' }).eq('driver_id', data.driverPhone);
      
      if (count >= 3) {
        await supabase.from('users').update({ is_suspended: true, is_banned: true }).eq('phone', data.driverPhone);
        await supabase.from('admin_ledger').insert([{ transaction_type: 'fine', amount: 1500, driver_id: data.driverPhone }]);
        io.to(`driver_${data.driverPhone}`).emit("account_suspended", { message: "Account suspended due to multiple reports." });
        console.log(`⚖️ Vault Strike: Driver ${data.driverPhone} suspended & fined 1500.`);
      }
    } catch (e) {
      console.error("Report Driver Error", e);
    }
  });

  socket.on("disconnect", () => {
    console.log("❌ User Disconnected:", socket.id);
  });
});

// Start the Real-Time Server
server.listen(PORT, () => {
  console.log(`✅ EQUINOX DISPATCH v2.0 RUNNING on Cloud Port ${PORT}`);
});