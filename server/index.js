const express = require('express');
const cors = require('cors');
const nano = require('nano');

// ── 1. IMPORT CERTIFICATE ROUTES ──
const certificateRoutes = require('./routes/certificateRoutes');

const app = express();
const PORT = 5000;

// Middlewares
app.use(cors());
app.use(express.json());

// 1. Configure CouchDB Connection String
const COUCHDB_URL = 'http://admin:capstone2026@localhost:5984';
const couch = nano(COUCHDB_URL);
const DB_NAME = 'bustrachub_db';
let db;

// 2. Connect, Initialize Database, and Create Mango Indexes
async function initDB() {
  try {
    const dbList = await couch.db.list();
    if (!dbList.includes(DB_NAME)) {
      await couch.db.create(DB_NAME);
      console.log(`📦 Created missing database: "${DB_NAME}"`);
      // Inject default users
      const targetDb = couch.use(DB_NAME);
      const demoUsers = [
        {
          _id: 'user_mgcortero',
          type: 'user',
          username: 'mgcortero',
          password: 'password', // Note: Hash in production
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
        }
      ];
      await targetDb.bulk({ docs: demoUsers });
      console.log('👥 Injected default Staff and Admin accounts into CouchDB.');
    } else {
      console.log(`📦 Connected to existing CouchDB database: "${DB_NAME}"`);
    }

    db = couch.use(DB_NAME);

    // 💡 IPA-SURE NA MAA-ACCESS NG CONTROLLERS ANG COUCHDB INSTANCE
    app.set('db', db);

    // 💡 CREATE MANGO INDEX FOR USER LOGIN
    try {
      await db.createIndex({
        index: { fields: ['type', 'username', 'password'] },
        name: 'user-login-index'
      });
      console.log('🔍 CouchDB Mango Index ("user-login-index") created/verified successfully!');
    } catch (idxErr) {
      console.warn('⚠️ Index creation warning (safe to ignore if existing):', idxErr.message);
    }
  } catch (error) {
    console.error('❌ CouchDB Connection Failed! Make sure CouchDB is running.', error);
  }
}

initDB();

// ── 2. REGISTER CERTIFICATE ROUTES ──
app.use('/api/certificates', certificateRoutes);

// --- REST OF YOUR CODE (Login Route, Public Route, app.listen) ---
app.post('/api/login', async (req, res) => {
  // ... existing login logic ...
});

app.get('/api/status', (req, res) => {
  res.json({ status: "online", message: "BustracHub Backend Server is active!" });
});

app.get(['/api/public', '/api/public/landing'], async (req, res) => {
  // ... existing public landing logic ...
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is listening live on http://localhost:${PORT}`);
});