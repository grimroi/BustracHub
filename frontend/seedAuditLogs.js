// Paste this into the browser console on the BUSTRAC HUB app page.
// It inserts 100 dummy audit_log records into the local PouchDB.
(async function seedAuditLogs() {
  const db = window.localDb;
  if (!db) { console.error('localDb not found'); return; }
  const actors = ['jmacabangon', 'staff_juan', 'maria_res'];
  const modules = ['Residents', 'Blotter', 'Certificates', 'BDRRMC', 'Announcements'];
  const actions = ['CREATE', 'UPDATE', 'ARCHIVE', 'RESOLVE', 'LOGIN'];
  const refIds = ['RES-0002', 'BLT-2026-90889', 'PROG-2026-002', 'CERT-001', 'EVAC-003'];
  const now = Date.now();
  const docs = [];
  for (let i = 0; i < 100; i++) {
    const ts = new Date(now - Math.floor(Math.random() * 5 * 24 * 60 * 60 * 1000)).toISOString();
    docs.push({
      _id: `audit_${Date.now()}_${i}`,
      type: 'audit_log',
      docType: 'audit_log',
      action: actions[i % actions.length],
      module: modules[i % modules.length],
      recordId: refIds[i % refIds.length],
      actor: { username: actors[i % actors.length] },
      details: `Seeded audit entry ${i + 1}`,
      timestamp: ts,
      createdAt: ts,
    });
  }
  await db.bulkDocs(docs);
  console.log('Seeded 100 audit_log records.');
})();
