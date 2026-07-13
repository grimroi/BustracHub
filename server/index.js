const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 5000; // Running on port 5000 so it doesn't fight React (5173)

// Middlewares
app.use(cors());          // Allows your frontend to securely fetch data from this server
app.use(express.json());  // Lets your server read JSON form data sent by the user

// Mock Credentials database matching your exact stack specifications
const VALID_CREDENTIALS = {
  staff: { username: 'mgcortero', password: 'password', role: 'staff', path: '/staff' },
  admin: { username: 'jmacabangon', password: 'password', role: 'admin', path: '/admin' }
};

// 1. Basic Health Check Route
app.get('/api/status', (req, res) => {
  res.json({ status: "online", message: "BustracHub Backend Server is active!" });
});

// 2. Secure Login Verification Route
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username and password are required." });
  }

  const trimmedUser = username.trim();
  let matchedUser = null;

  // Search accounts array for a match
  for (const account of Object.values(VALID_CREDENTIALS)) {
    if (account.username === trimmedUser && account.password === password) {
      matchedUser = account;
      break;
    }
  }

  if (matchedUser) {
    return res.json({
      success: true,
      role: matchedUser.role,
      redirectPath: matchedUser.path,
      user: matchedUser.username
    });
  } else {
    return res.status(401).json({ success: false, message: "Invalid username or password." });
  }
});

// Fire up the listener
app.listen(PORT, () => {
  console.log(`🚀 Server is listening live on http://localhost:${PORT}`);
});
