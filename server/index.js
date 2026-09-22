const express = require('express');
const cors = require('cors');
const nano = require('nano');

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

// 3. Fallback-Safe Login Route
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username and password are required." });
  }

  const trimmedUser = username.trim();

  try {
    let matchedUser = null;

    // TRY MANGO QUERY FIRST
    try {
      const result = await db.find({
        selector: {
          type: 'user',
          username: trimmedUser,
          password: password
        },
        limit: 1
      });

      if (result.docs && result.docs.length > 0) {
        matchedUser = result.docs[0];
      }
    } catch (findErr) {
      console.warn('⚠️ db.find failed, executing db.list fallback scan...', findErr.message);
      
      // FALLBACK SCAN: Kapag nag-fail ang CouchDB Mango Query engine (500 undef)
      const allDocs = await db.list({ include_docs: true });
      const found = allDocs.rows.find(row => {
        const d = row.doc;
        return d && d.type === 'user' && d.username === trimmedUser && d.password === password;
      });

      if (found) {
        matchedUser = found.doc;
      }
    }

    if (matchedUser) {
      const { password: _pw, ...safeUserData } = matchedUser;
      return res.json({
        success: true,
        role: matchedUser.role,
        redirectPath: matchedUser.path,
        user: safeUserData
      });
    } else {
      return res.status(401).json({ success: false, message: "Invalid username or password." });
    }

  } catch (error) {
    console.error('Database query error:', error);
    return res.status(500).json({ success: false, message: "Internal server database error." });
  }
});

// Basic Health Check Route
app.get('/api/status', (req, res) => {
  res.json({ status: "online", message: "BustracHub Backend Server is active!" });
});

// PUBLIC LANDING PAGE API
app.get(['/api/public', '/api/public/landing'], async (req, res) => {
  try {
    if (!db) {
      return res.status(503).json({ success: false, message: 'Database is not ready.' });
    }

    let docs = [];
    try {
      const result = await db.list({ include_docs: true });
      docs = result.rows.map(r => r.doc).filter(Boolean);
    } catch (e) {
      console.error('Fetch docs error:', e);
    }

    const isPublic = (doc) => {
      if (doc.status === 'Archived' || doc.status === 'Draft') return false;
      return doc.publicVisible === true || doc.status === 'Published' || doc.type === 'announcement';
    };

    const publicDocs = docs.filter(isPublic);

    // 1. ANNOUNCEMENTS
    const announcements = publicDocs
      .filter((doc) => {
        const cat = (doc.category || '').toLowerCase();
        const isReliefOrDisaster = cat.includes('relief') || cat.includes('disaster') || doc.publicType === 'advisory';
        const isActivityOrEvent = cat.includes('event') || cat.includes('activit') || doc.publicType === 'activity';

        return !isReliefOrDisaster && !isActivityOrEvent && (doc.publicType === 'announcement' || doc.type === 'announcement');
      })
      .map((doc) => ({
        id: doc._id,
        title: doc.title || 'Announcement',
        description: doc.content || doc.description || doc.body || '',
        date: doc.date || doc.createdAt || doc.timestamp || null,
        category: doc.category || 'General',
        pinned: doc.pinned || false
      }));

    // 2. ADVISORIES (Relief & Aid, Disaster Response)
    const advisories = publicDocs
      .filter((doc) => {
        const cat = (doc.category || '').toLowerCase();
        return doc.publicType === 'advisory' || cat.includes('relief') || cat.includes('disaster');
      })
      .map((doc) => ({
        id: doc._id,
        title: doc.title || 'Relief Advisory',
        description: doc.content || doc.description || doc.body || '',
        date: doc.date || doc.createdAt || doc.timestamp || null,
        category: doc.category || 'Relief & Aid'
      }));

    // 3. ACTIVITIES & EVENTS (Events, Activities)
    const activities = publicDocs
      .filter((doc) => {
        const cat = (doc.category || '').toLowerCase();
        return doc.publicType === 'activity' || cat.includes('event') || cat.includes('activit');
      })
      .map((doc) => ({
        id: doc._id,
        title: doc.title || 'Barangay Activity',
        description: doc.content || doc.description || doc.body || '',
        date: doc.date || doc.startDate || doc.createdAt || doc.timestamp || null,
        category: doc.category || 'Events'
      }));

    const dbHotlines = publicDocs
      .filter((doc) => doc.publicType === 'hotline')
      .map((doc) => ({
        id: doc._id,
        name: doc.name || 'Emergency Hotline',
        number: doc.number || 'N/A'
      }));

    const hotlines = dbHotlines.length > 0 ? dbHotlines : [
      { id: 'h1', name: 'Barangay Emergency Command Center', number: '(054) 123-4567' },
      { id: 'h2', name: 'MDRRMO Nabua / Rescue', number: '0912-345-6789' },
      { id: 'h3', name: 'Bustrac Health Station', number: '0998-765-4321' }
    ];

    const officeDoc = publicDocs.find((doc) => doc.publicType === 'office');
    const office = officeDoc ? {
      barangay: officeDoc.barangay || 'Barangay Bustrac',
      municipality: officeDoc.municipality || 'Nabua, Camarines Sur',
      officeHours: officeDoc.officeHours || 'Monday - Friday (8:00 AM - 5:00 PM)',
      publicUpdates: officeDoc.publicUpdates || 'Active Services'
    } : {
      barangay: 'Barangay Bustrac',
      municipality: 'Nabua, Camarines Sur',
      officeHours: 'Monday - Friday (8:00 AM - 5:00 PM)',
      publicUpdates: 'Active Services'
    };

    return res.json({
      success: true,
      announcements,
      advisories,
      activities,
      hotlines,
      office
    });

  } catch (error) {
    console.error('Public landing API error:', error);
    return res.status(500).json({ success: false, message: 'Unable to load public information.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Server is listening live on http://localhost:${PORT}`);
});