const express = require('express');
const cors = require('cors');
// 1. Import Nano (CouchDB Driver)
const nano = require('nano');

const app = express();
const PORT = 5000;

// Middlewares
app.use(cors());          
app.use(express.json());  

// 2. Configure CouchDB Connection String
const COUCHDB_URL = 'http://admin:capstone2026@localhost:5984';
const couch = nano(COUCHDB_URL);
const DB_NAME = 'bustrachub_db';
let db;

// 3. Connect and Initialize Database
async function initDB() {
  try {
    const dbList = await couch.db.list();
    if (!dbList.includes(DB_NAME)) {
      await couch.db.create(DB_NAME);
      console.log(`📦 Created missing database: "${DB_NAME}"`);
      
      // Inject our initial demo credentials into the database
      const targetDb = couch.use(DB_NAME);
      const demoUsers = [
        {
          _id: 'user_mgcortero',
          type: 'user',
          username: 'mgcortero',
          password: 'password', // In production, this must be hashed (e.g., bcrypt)
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
          path: '/' // Babalik sa landing o dediretso sa public pages
              }
      ];
      
      // Bulk insert demo profiles
      await targetDb.bulk({ docs: demoUsers });
      console.log('👥 Injected default Staff and Admin accounts into CouchDB.');
    } else {
      console.log(`📦 Connected to existing CouchDB database: "${DB_NAME}"`);
    }
    db = couch.use(DB_NAME);
  } catch (error) {
    console.error('❌ CouchDB Connection Failed! Make sure CouchDB is running.', error);
  }
}
initDB();

// 4. Refactored Dynamic Database Login Route
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: "Username and password are required." });
  }

  const trimmedUser = username.trim();

  try {
    // Query CouchDB using Mango Query syntax to find matching credentials
    const query = {
      selector: {
        type: 'user',
        username: trimmedUser,
        password: password
      },
      limit: 1
    };

    const result = await db.find(query);

    if (result.docs.length > 0) {
      const matchedUser = result.docs[0];
      return res.json({
        success: true,
        role: matchedUser.role,
        redirectPath: matchedUser.path,
        user: matchedUser.username
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

// Fire up the listener
app.listen(PORT, () => {
  console.log(`🚀 Server is listening live on http://localhost:${PORT}`);
});
