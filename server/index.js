const express = require('express');
const cors = require('cors');
const nano = require('nano');
const certificateRoutes = require('./routes/certificateRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json());

const COUCHDB_URL = process.env.COUCHDB_URL || 'http://admin:capstone2026@127.0.0.1:5984';
const couch = nano(COUCHDB_URL);
const DB_NAME = 'bustrachub_db';

let db;

async function initDB() {
  try {
    const dbList = await couch.db.list();
    if (!dbList.includes(DB_NAME)) {
      await couch.db.create(DB_NAME);
      console.log(`Created missing database: "${DB_NAME}"`);
    } else {
      console.log(`Connected to existing CouchDB database: "${DB_NAME}"`);
    }

    db = couch.use(DB_NAME);
    app.set('db', db);

    // Default accounts na kailangang siguraduhing naroroon
    const demoUsers = [
      {
        _id: 'user_mgcortero',
        type: 'user',
        username: 'mgcortero',
        password: 'password',
        role: 'staff',
        path: '/staff'
      },
      {
        _id: 'user_jmacabangon',
        type: 'user',
        username: 'jmacabangon',
        password: 'password',
        role: 'admin',
        path: '/admin'
      },
      {
        _id: 'user_juan_resident',
        type: 'user',
        username: 'juan2026',
        password: 'password',
        role: 'resident',
        path: '/',
        fullName: 'Juan Dela Cruz',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        residentId: 'RES-0001',
        purok: '3',
        age: 34,
        birthdate: '1990-03-12',
        gender: 'Male',
        civilStatus: 'Married',
        contact: '09171234567',
        household: 'HH-0012 — Dela Cruz Family',
        voterStatus: 'Registered Voter'
      },
      {
        _id: 'user_juanreyes',
        type: 'user',
        username: 'juanreyes',
        password: 'password123',
        role: 'resident',
        path: '/',
        fullName: 'Juan Reyes',
        firstName: 'Juan',
        lastName: 'Reyes',
        residentId: 'RES-0002',
        purok: '1',
        contact: '09181234567'
      }
    ];

    // Isa-isahing i-check kung umiiral na ang document. Kung wala pa (404), i-insert ito.
    for (const u of demoUsers) {
      try {
        await db.get(u._id);
        console.log(`User existing: ${u.username}`);
      } catch (err) {
        if (err.statusCode === 404 || err.status === 404) {
          await db.insert(u);
          console.log(`Successfully injected account: ${u.username}`);
        } else {
          console.error(`Error checking user ${u.username}:`, err.message);
        }
      }
    }

    // Lumikha ng Mango Index para sa type at username
    try {
      await db.createIndex({
        index: { fields: ['type', 'username'] },
        name: 'user-type-username-index'
      });
      console.log('CouchDB Mango Index created/verified!');
    } catch (idxErr) {
      console.warn('Index warning:', idxErr.message);
    }

  } catch (error) {
    console.error('CouchDB Connection Failed!', error);
  }
}

initDB();

app.use('/api/certificates', certificateRoutes);

app.get('/api/status', (req, res) => {
  res.json({ status: "online", message: "BustracHub Backend Server is active!" });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Missing username or password' });
  }

  try {
    const db = req.app.get('db');
    let userDoc = null;

    // 1. Subukang kuhanin nang direkta gamit ang _id kung nasa format na user_<username>
    try {
      userDoc = await db.get(`user_${username.toLowerCase()}`);
    } catch (e) {
      // Kung wala gamit ang Direct ID, gagamit tayo ng Mango Query (db.find)
    }

    // 2. Fallback: Gamitin ang db.find kung hindi nahanap sa db.get()
    if (!userDoc) {
      const query = {
        selector: {
          type: 'user',
          username: username.trim()
        },
        limit: 1
      };
      const result = await db.find(query);
      if (result.docs && result.docs.length > 0) {
        userDoc = result.docs[0];
      }
    }

    // 3. Veripikasyon kung nahanap ang user
    if (!userDoc) {
      console.log(`Login failed: Username "${username}" not found in database.`);
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // 4. Veripikasyon ng Password
    if (userDoc.password !== password.trim()) {
      console.log(`Login failed: Incorrect password for user "${username}".`);
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    // Success login response
    console.log(`Login successful for user: ${username}`);
    return res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: userDoc._id,
        username: userDoc.username,
        role: userDoc.role,
        fullName: userDoc.fullName || `${userDoc.firstName || ''} ${userDoc.lastName || ''}`.trim(),
        residentId: userDoc.residentId || null,
        purok: userDoc.purok || null,
        contact: userDoc.contact || null
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during login' });
  }
});

// ── REGISTER ENDPOINT ──
app.post('/api/register', async (req, res) => {
  const { username, password, fullName, firstName, lastName, purok, contact } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database connection not initialized.' });
    }

    const cleanUsername = String(username).trim();

    // Check kung existing na ang username
    const existing = await db.find({ selector: { type: 'user', username: cleanUsername }, limit: 1 });

    if (existing.docs && existing.docs.length > 0) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

    // Gumawa ng bagong resident account
    const newUser = {
      _id: `user_res_${Date.now()}`,
      type: 'user',
      role: 'resident',
      username: cleanUsername,
      password: String(password).trim(),
      fullName: fullName || `${firstName || ''} ${lastName || ''}`.trim(),
      firstName: firstName || '',
      lastName: lastName || '',
      residentId: `RES-${Math.floor(1000 + Math.random() * 9000)}`,
      purok: purok || '',
      contact: contact || '',
      createdAt: new Date().toISOString()
    };

    const response = await db.insert(newUser);
    return res.status(201).json({ success: true, message: 'Registration successful!', id: response.id });
  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
});

// 1. Pending Certificates
app.get('/api/stats/pending-certificates', async (req, res) => {
  try {
    const db = req.app.get('db');
    const result = await db.find({
      selector: {
        type: 'certificate_request',
        status: 'Pending'
      }
    });
    res.json({ success: true, count: result.docs.length, data: result.docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Settled vs CFA vs Pending Blotter Cases
app.get('/api/stats/blotter-summary', async (req, res) => {
  try {
    const db = req.app.get('db');
    const result = await db.find({
      selector: {
        type: { $in: ['blotter_report', 'blotter_record'] }
      }
    });

    const summary = {
      settled: 0,
      cfa: 0,
      pending: 0,
      total: result.docs.length
    };

    result.docs.forEach(doc => {
      if (doc.status === 'Settled / Resolved' || doc.status === 'Settled') {
        summary.settled++;
      } else if (doc.cfaIssued || doc.status === 'Referred to PNP (CFA Issued)') {
        summary.cfa++;
      } else {
        summary.pending++;
      }
    });

    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Monthly Feedback Reports Grouped by Month
app.get('/api/stats/monthly-feedback', async (req, res) => {
  try {
    const db = req.app.get('db');
    const result = await db.find({
      selector: { type: 'feedback_report' }
    });

    const monthlyCounts = {};

    result.docs.forEach(doc => {
      if (doc.timestamp) {
        const date = new Date(doc.timestamp);
        // Format: "Jan 2026", "Feb 2026"
        const monthKey = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
      }
    });

    res.json({ success: true, monthlyCounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(` Server is listening live on http://0.0.0.0:${PORT} (Accessible via http://192.168.1.3:5000)`);
});