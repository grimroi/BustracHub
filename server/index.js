require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nano = require('nano');
const certificateRoutes = require('./routes/certificateRoutes');
const blotterRoutes = require('./routes/blotterRoutes');
const { sendBlotterNotification } = require('./services/emailService');
const { sendResidentSMS } = require('./services/smsService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
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

    const demoUsers = [
      { _id: 'user_mgcortero', type: 'user', username: 'mgcortero', password: 'password', role: 'staff', path: '/staff' },
      { _id: 'user_jmacabangon', type: 'user', username: 'jmacabangon', password: 'password', role: 'admin', path: '/admin' },
      {
        _id: 'user_juan_resident', type: 'user', username: 'juan2026', password: 'password', role: 'resident', path: '/',
        fullName: 'Juan Dela Cruz', firstName: 'Juan', lastName: 'Dela Cruz', residentId: 'RES-0001',
        purok: '3', age: 34, birthdate: '1990-03-12', gender: 'Male', civilStatus: 'Married',
        contact: '09171234567', household: 'HH-0012 — Dela Cruz Family', voterStatus: 'Registered Voter'
      },
      {
        _id: 'user_juanreyes', type: 'user', username: 'juanreyes', password: 'password123', role: 'resident', path: '/',
        fullName: 'Juan Reyes', firstName: 'Juan', lastName: 'Reyes', residentId: 'RES-0002', purok: '1', contact: '09181234567'
      }
    ];

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

    // CouchDB Mango Index
    try {
      await db.createIndex({ index: { fields: ['type', 'username'] }, name: 'user-type-username-index' });
      console.log('CouchDB Mango Index created/verified!');
    } catch (idxErr) {
      console.warn('Index warning:', idxErr.message);
    }
  } catch (error) {
    console.error('CouchDB Connection Failed!', error);
    throw error; // ⬅️ I-throw para hindi tumuloy ang listener kung sabog ang DB
  }
}

// API Routes
app.use('/api/certificates', certificateRoutes);
app.use('/api/blotter', blotterRoutes);

app.get('/api/status', (req, res) => {
  res.json({ status: "online", message: "BustracHub Backend Server is active!" });
});

// Login Endpoint
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Missing username or password' });
  }

  try {
    const db = req.app.get('db');
    let userDoc = null;

    try {
      userDoc = await db.get(`user_${username.toLowerCase()}`);
    } catch (e) { /* fallthrough */ }

    if (!userDoc) {
      const query = { selector: { type: 'user', username: username.trim() }, limit: 1 };
      const result = await db.find(query);
      if (result.docs && result.docs.length > 0) {
        userDoc = result.docs[0];
      }
    }

    if (!userDoc) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if (userDoc.password !== password.trim()) {
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

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

// Registration Endpoint
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
    const existing = await db.find({ selector: { type: 'user', username: cleanUsername }, limit: 1 });
    if (existing.docs && existing.docs.length > 0) {
      return res.status(400).json({ success: false, message: 'Username is already taken.' });
    }

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

// Blotter Endpoint with Email Notification
app.post('/api/blotter', async (req, res) => {
  const { respondentName, respondentEmail, caseNumber, scheduleDate, incidentType, details } = req.body;
  if (!respondentName || !caseNumber) {
    return res.status(400).json({ success: false, message: 'Respondent name and case number are required.' });
  }

  try {
    const db = req.app.get('db');
    const newBlotter = {
      _id: `blotter_${Date.now()}`,
      type: 'blotter_report',
      caseNumber,
      respondentName,
      respondentEmail: respondentEmail || '',
      scheduleDate: scheduleDate || '',
      incidentType: incidentType || 'General Incident',
      details: details || '',
      status: 'Pending / Issued Summons',
      createdAt: new Date().toISOString()
    };

    const response = await db.insert(newBlotter);

    let emailSent = false;
    if (respondentEmail && respondentEmail.trim() !== '') {
      try {
        await sendBlotterNotification(respondentEmail, respondentName, caseNumber, scheduleDate);
        emailSent = true;
        console.log(`Email notification successfully sent to ${respondentEmail}`);
      } catch (mailErr) {
        console.error('Failed to send email notification:', mailErr.message);
      }
    }

    return res.status(201).json({
      success: true,
      message: emailSent ? 'Blotter record saved and email notification sent!' : 'Blotter record saved successfully.',
      id: response.id,
      emailSent
    });
  } catch (error) {
    console.error('Error saving blotter record:', error);
    return res.status(500).json({ success: false, message: 'Internal server error while saving blotter.' });
  }
});

// Stats Endpoints
app.get('/api/stats/pending-certificates', async (req, res) => {
  try {
    const db = req.app.get('db');
    const result = await db.find({ selector: { type: 'certificate_request', status: 'Pending' } });
    res.json({ success: true, count: result.docs.length, data: result.docs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/stats/blotter-summary', async (req, res) => {
  try {
    const db = req.app.get('db');
    const result = await db.find({ selector: { type: { $in: ['blotter_report', 'blotter_record'] } } });
    const summary = { settled: 0, cfa: 0, pending: 0, total: result.docs.length };
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

app.get('/api/stats/monthly-feedback', async (req, res) => {
  try {
    const db = req.app.get('db');
    const result = await db.find({ selector: { type: 'feedback_report' } });
    const monthlyCounts = {};
    result.docs.forEach(doc => {
      if (doc.timestamp) {
        const date = new Date(doc.timestamp);
        const monthKey = date.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        monthlyCounts[monthKey] = (monthlyCounts[monthKey] || 0) + 1;
      }
    });
    res.json({ success: true, monthlyCounts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Public Portal Endpoint
app.get('/api/public', async (req, res) => {
  try {
    const db = req.app.get('db');
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not initialized.' });
    }

    const announcements = await db.find({ selector: { type: 'announcement' } }).catch(() => ({ docs: [] }));
    const activities = await db.find({ selector: { type: 'activity' } }).catch(() => ({ docs: [] }));
    const advisories = await db.find({ selector: { type: 'advisory' } }).catch(() => ({ docs: [] }));
    const hotlines = await db.find({ selector: { type: 'hotline' } }).catch(() => ({ docs: [] }));

    return res.json({
      success: true,
      announcements: announcements.docs || [],
      activities: activities.docs || [],
      advisories: advisories.docs || [],
      hotlines: hotlines.docs && hotlines.docs.length > 0 ? hotlines.docs : [
        { id: 'h1', name: 'Barangay Hotline / Emergency Unit', number: '0917-123-4567 / (054) 881-2345', service: '24/7 Response' },
        { id: 'h2', name: 'MDRRMO Nabua / Rescue', number: '0998-765-4321', service: 'Disaster & Rescue' },
        { id: 'h3', name: 'PNP Nabua Station', number: '(054) 477-1122', service: 'Police Assistance' },
        { id: 'h4', name: 'BFP Fire Station', number: '(054) 477-3344', service: 'Fire Emergency' }
      ],
      office: {
        barangay: 'Barangay Bustrac',
        municipality: 'Nabua, Camarines Sur',
        officeHours: 'Monday - Friday (8:00 AM - 5:00 PM)',
        publicUpdates: 'Open for Public Assistance & Certificate Issuance'
      }
    });
  } catch (error) {
    console.error('Error fetching public portal data:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
// ============================================================
// SERVER-SENT EVENTS (SSE) FOR PUSH NOTIFICATIONS
// ============================================================
const sseClients = new Map(); // Stores connected frontend clients

// SSE Endpoint for Frontend to listen to
app.get('/api/notifications', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Isara ang buffering
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 🟢 MAHALAGA: Magpadala agad ng 200 OK header at initial data
  res.writeHead(200);
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', message: 'SSE Connection Active' })}\n\n`);

  const clientId = Date.now().toString();
  sseClients.set(clientId, res);
  console.log(`📡 New SSE client connected: ${clientId}`);

  req.on('close', () => {
    sseClients.delete(clientId);
    console.log(`❌ SSE client disconnected: ${clientId}`);
  });
});

// Function to broadcast message to all connected clients
function sendPushNotification(data) {
  const eventData = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((res) => {
    res.write(eventData);
  });
}
// ============================================================
// CouchDB Changes Listener para sa Blotter SMS at Push Notification
// ============================================================
function startBlotterSMSListener() {
  if (!db) {
    console.warn('⚠️ startBlotterSMSListener: DB not initialized, skipping.');
    return;
  }
  console.log('📡 Starting CouchDB Changes Listener for Blotter SMS & SSE...');
  const processingCases = new Set();
  const axios = require('axios');
  const changesUrl = `${COUCHDB_URL}/${DB_NAME}/_changes?feed=continuous&since=now&include_docs=true&heartbeat=10000`;

  let streamBuffer = '';

  axios({
    method: 'GET',
    url: changesUrl,
    responseType: 'stream',
    timeout: 0 
  }).then((response) => {
    response.data.on('data', (chunk) => {
      streamBuffer += chunk.toString();
      const lines = streamBuffer.split('\n');
      streamBuffer = lines.pop(); 

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const change = JSON.parse(line);
          const doc = change.doc;
          if (!doc) continue;

          const isBlotter = doc.type === 'blotter_report' || doc.type === 'blotter_record' || doc.docType === 'blotter';
          const isSummonStatus = doc.status && (
            doc.status.includes('1st Summon') || 
            doc.status.includes('2nd Summon') || 
            doc.status.includes('3rd Summon') ||
            doc.status.includes('Summons')
          );

          if (!isBlotter || !isSummonStatus) continue;

          const caseNum = doc.caseNumber || doc.trackingNo || doc.refNumber || doc._id;
          const currentStatus = doc.status;
          
          const processingKey = `${caseNum}_${currentStatus}`;

          if (processingCases.has(processingKey)) continue;
          processingCases.add(processingKey);

          console.log(`🔔 Summons Update Detected: ${caseNum} [${currentStatus}]`);

          const phone = doc.respondentPhone || doc.contact || (typeof doc.respondent === 'object' ? doc.respondent.phone : null);
          const name = doc.respondentName || (typeof doc.respondent === 'object' ? doc.respondent.name : 'Respondent');
          const schedule = doc.scheduleDate || doc.nextHearingDate || doc.summonDate || 'TBA';

          // 🟢 FIX 3: Magpapadala lang ng SMS kapag BAGO ang Summon Status
          const needsSms = doc.lastSmsStatus !== currentStatus;

          if (needsSms && phone) {
            sendResidentSMS(phone, name, `Ang inyong blotter case ${caseNum} ay may bagong update. Status: ${currentStatus}. ${schedule ? `Patawag: ${schedule}.` : ''}`).then(success => {
              if (success) {
                console.log(`✅ SMS successfully sent to ${name} (${phone})`);
                doc.smsSent = true;
                doc.lastSmsStatus = currentStatus; // Itala ang huling naisa-text na status
                doc.smsSentAt = new Date().toISOString();
                
                db.insert(doc).catch(err => {
                  if (err.statusCode !== 409) console.error('Failed to update doc with lastSmsStatus:', err.message);
                });
              }
              processingCases.delete(processingKey);
            }).catch(err => {
              console.error(`❌ Failed to send SMS for ${caseNum}:`, err.message);
              processingCases.delete(processingKey);
            });
          } else {
            processingCases.delete(processingKey);
          }

          sendPushNotification({
            type: 'BLOTTER_UPDATE',
            caseNumber: caseNum,
            message: `Ang inyong blotter ref ${caseNum} ay may bagong update. Status: ${currentStatus}. ${schedule ? `Patawag: ${schedule}.` : ''}`
          });

        } catch (err) {
        }
      }
    });

    response.data.on('error', (err) => {
      console.error('❌ CouchDB changes stream error:', err.message);
      setTimeout(startBlotterSMSListener, 5000);
    });

    response.data.on('end', () => {
      console.log('⚠️ CouchDB changes stream ended. Reconnecting in 5 seconds...');
      setTimeout(startBlotterSMSListener, 5000);
    });
  }).catch((err) => {
    console.error('❌ Failed to connect to CouchDB changes feed:', err.message);
    setTimeout(startBlotterSMSListener, 5000);
  });
}

// ============================================================
// Bootstrap: isang initDB() lang, tapos saka simulan ang listener
// ============================================================
initDB()
  .then(() => {
    startBlotterSMSListener();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(` Server is listening live on http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error(' Failed to initialize DB. Server not started.', err);
    process.exit(1);
  });