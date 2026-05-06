const dns = require("dns");

// ✅ DNS FIX
dns.setServers(["1.1.1.1", "8.8.8.8"]);
dns.setDefaultResultOrder("ipv4first");

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();

// ✅ CONNECT DATABASE
connectDB();

// ✅ CORS FIX (VERY IMPORTANT)
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://ticket-frontend-alpha.vercel.app'
  ],
  credentials: true
}));

// ✅ BODY PARSER (VERY IMPORTANT)
app.use(express.json());

// ✅ ROUTES
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/assets', require('./routes/assets'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));

// ✅ TEST ROUTE
app.get('/', (req, res) => {
  res.send("API Running");
});

// ✅ START SERVER
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));