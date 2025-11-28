require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { Server } = require("socket.io"); // The Real-Time Engine
const http = require('http'); // Required for Socket.io

const app = express();
app.use(cors());
app.use(express.json());

// Create the HTTP server and wrap it with Socket.io
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow connections from any mobile app
    methods: ["GET", "POST"]
  }
});

const port = process.env.PORT || 3000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- 1. REST APIs (For Login, History, Payments) ---

app.get('/', (req, res) => res.send('Ride Hailing Core System Online'));

app.post('/api/login', async (req, res) => {
  const { phone, role } = req.body;
  if (!phone || !role) return res.status(400).json({ error: "Missing data" });

  // Try to find user
  let { data: user, error } = await supabase.from('users').select('*').eq('phone', phone).single();

  if (!user) {
    // Create if not exists
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{ phone, role }])
      .select()
      .single();
    user = newUser;
  }
  
  res.json({ message: "Login success", user });
});

// Payment & Logic Routes (Keep your previous logic here)
app.post('/api/pay-fee', async (req, res) => {
  const { phone } = req.body;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await supabase.from('users').update({ subscription_expiry: tomorrow.toISOString() }).eq('phone', phone);
  res.json({ message: "Paid", expiry: tomorrow });
});

// --- 2. REAL-TIME SOCKET "SWITCHBOARD" ---

// This handles the "Uber" logic: Connecting Riders to Drivers
io.on("connection", (socket) => {
  console.log("⚡ New Connection:", socket.id);

  // A. DRIVER COMES ONLINE
  socket.on("driver_online", (data) => {
    console.log(`🚕 Driver Online: ${data.phone}`);
    // Save driver socket ID so we can message them later
    socket.join("active_drivers"); 
  });

  // B. RIDER REQUESTS RIDE
  socket.on("request_ride", (data) => {
    console.log(`🙋‍♂️ Ride Requested by ${data.riderPhone} at ${data.pickupLocation}`);
    
    // Broadcast this request to ALL active drivers
    io.to("active_drivers").emit("new_ride_request", {
      riderId: socket.id, // Send socket ID so driver can reply
      riderPhone: data.riderPhone,
      pickup: data.pickupLocation,
      drop: data.dropLocation,
      fare: data.fare
    });
  });

  // C. DRIVER ACCEPTS RIDE
  socket.on("accept_ride", (data) => {
    console.log(`✅ Driver ${data.driverPhone} accepted ride for ${data.riderPhone}`);
    
    // Tell the SPECIFIC Rider "Your ride is on the way"
    io.to(data.riderId).emit("ride_accepted", {
      driverPhone: data.driverPhone,
      carNumber: "KA-01-EQ-9999", // Mock data for now
      eta: "5 mins"
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ User Disconnected:", socket.id);
  });
});

// Start the Real-Time Server
server.listen(port, () => {
  console.log(`✅ REAL-TIME SERVER RUNNING on http://localhost:${port}`);
});