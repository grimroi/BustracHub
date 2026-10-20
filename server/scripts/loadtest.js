// server/scripts/loadtest.js
// ──────────────────────────────────────────────────────────────
// Measured load-test baseline for the BUSTRAC HUB CouchDB layer.
//
// Usage:   node scripts/loadtest.js [--docs=N] [--keep]
// Example: node scripts/loadtest.js --docs=10000
//
// PURPOSE
//   Produces a REPEATABLE, MEASURED baseline for the central database at
//   the scale of ONE barangay. It is a capacity baseline, NOT a
//   municipality-scale load test — see docs/SCALABILITY_ASSESSMENT.md.
//
// SAFETY
//   - Writes ONLY to a dedicated, timestamped test database
//     (bustrachub_loadtest_<timestamp>). It NEVER touches the production
//     database 'bustrachub_db'; the name is checked before any call.
//   - The test database is dropped in a `finally` block, so it is removed
//     even if a measurement throws. `--keep` skips the drop for manual
//     inspection.
//   - Requires no new dependencies: only 'nano' (already in package.json).
// ──────────────────────────────────────────────────────────────

require('dotenv').config();
const nano = require('nano');

const PRODUCTION_DB = 'bustrachub_db';
const TEST_DB_PREFIX = 'bustrachub_loadtest_';
const BATCH_SIZE = 500;
const MEASURE_RUNS = 10;
const RESIDENT_POOL = 1000;

const args = process.argv.slice(2);
const docsArg = args.find((a) => a.startsWith('--docs='));
const KEEP = args.includes('--keep');

const parsedDocs = docsArg ? Number.parseInt(docsArg.split('=')[1], 10) : 10000;
const DOC_COUNT = Number.isFinite(parsedDocs) && parsedDocs > 0 ? parsedDocs : 10000;

// A timestamp keeps every run isolated from the last one.
const DB_NAME = `${TEST_DB_PREFIX}${Date.now()}`;

const COUCHDB_URL = process.env.COUCHDB_URL;

if (!COUCHDB_URL) {
  console.error('❌ COUCHDB_URL is not set in server/.env');
  process.exit(1);
}

// ── SAFETY GUARD ───────────────────────────────────────────────────────────
// Refuse to run if the derived database name could ever point at the
// production database. This runs BEFORE any database call.
if (DB_NAME.startsWith(PRODUCTION_DB)) {
  console.error(
    `❌ Refusing to run: the test database name "${DB_NAME}" starts with the ` +
    `production database name "${PRODUCTION_DB}".`
  );
  process.exit(1);
}
if (!DB_NAME.includes('loadtest')) {
  console.error(`❌ Refusing to run: "${DB_NAME}" is not a recognisable load-test database name.`);
  process.exit(1);
}

// Mask credentials so the log never prints them.
const safeUrl = String(COUCHDB_URL).replace(/\/\/[^@]+@/, '//***:***@');

const ms = (value) => `${value} ms`;
const round1 = (value) => Math.round(value * 10) / 10;

const timeRepeated = async (fn, runs) => {
  const samples = [];
  let lastResult = null;
  for (let i = 0; i < runs; i += 1) {
    const started = Date.now();
    lastResult = await fn();
    samples.push(Date.now() - started);
  }
  const total = samples.reduce((a, b) => a + b, 0);
  return { average: total / runs, min: Math.min(...samples), max: Math.max(...samples), samples, lastResult };
};

const main = async () => {
  const couch = nano(COUCHDB_URL);

  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  BUSTRAC HUB — CouchDB load-test baseline                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  target        : ${safeUrl}`);
  console.log(`  test database : ${DB_NAME}`);
  console.log(`  documents     : ${DOC_COUNT}`);
  console.log(`  batch size    : ${BATCH_SIZE}`);
  console.log(`  measurement   : average of ${MEASURE_RUNS} runs`);
  console.log(`  cleanup       : ${KEEP ? 'SKIPPED (--keep)' : 'database will be dropped'}`);
  console.log('');

  let created = false;
  let failure = null;

  try {
    await couch.db.create(DB_NAME);
    created = true;
    console.log(`  ✔ created ${DB_NAME}`);

    const db = couch.use(DB_NAME);

    // ── Mango indexes ─────────────────────────────────────────────────────
    const indexStarted = Date.now();
    await db.createIndex({ index: { fields: ['type', 'status'] } });
    await db.createIndex({ index: { fields: ['type', 'residentId'] } });
    const indexMs = Date.now() - indexStarted;
    console.log(`  ✔ created Mango indexes [type,status] and [type,residentId] (${indexMs} ms)`);
    console.log('');

    // ── Bulk insert ───────────────────────────────────────────────────────
    console.log(`  inserting ${DOC_COUNT} documents in batches of ${BATCH_SIZE}…`);
    const insertStarted = Date.now();
    let written = 0;
    for (let start = 0; start < DOC_COUNT; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE, DOC_COUNT);
      const docs = [];
      for (let i = start; i < end; i += 1) {
        docs.push({
          _id: `lt_${i}`,
          type: 'certificate_request',
          status: 'Pending',
          residentId: `RES-${i % RESIDENT_POOL}`,
          createdAt: new Date().toISOString(),
        });
      }
      const result = await db.bulk({ docs });
      const failures = (Array.isArray(result) ? result : []).filter((r) => r && r.error);
      if (failures.length > 0) {
        throw new Error(
          `Bulk insert failed for ${failures.length} document(s): ${failures[0].reason || failures[0].error}`
        );
      }
      written += docs.length;
    }
    const insertMs = Date.now() - insertStarted;
    const docsPerSec = (written / (insertMs / 1000));
    console.log(`  ✔ inserted ${written} documents in ${insertMs} ms (${round1(docsPerSec)} docs/s)`);
    console.log('');

    // ── Measurements ──────────────────────────────────────────────────────
    const findTypeStatus = await timeRepeated(
      () => db.find({ selector: { type: 'certificate_request', status: 'Pending' } }),
      MEASURE_RUNS
    );

    const findTypeResident = await timeRepeated(
      () => db.find({ selector: { type: 'certificate_request', residentId: 'RES-42' } }),
      MEASURE_RUNS
    );

    const allDocs = await timeRepeated(
      () => db.list({ include_docs: true, limit: 100 }),
      MEASURE_RUNS
    );

    const info = await db.info();
    const docCount = info?.doc_count ?? null;

    // ── Table ──────────────────────────────────────────────────────────────
    const LABEL_W = 34;
    const VALUE_W = 34;
    const row = (label, value) =>
      `  │ ${String(label).padEnd(LABEL_W)} │ ${String(value).padEnd(VALUE_W)} │`;

    console.log(`  ┌${'─'.repeat(LABEL_W + VALUE_W + 4)}┐`);
    console.log(row('MEASUREMENT', 'RESULT'));
    console.log(`  ├${'─'.repeat(LABEL_W + VALUE_W + 4)}┤`);
    console.log(
      row(
        `bulk insert (${DOC_COUNT} docs)`,
        `${insertMs} ms, ${round1(docsPerSec)} docs/s`
      )
    );
    console.log(
      row('Mango find (type,status)', `avg ${round1(findTypeStatus.average)} ms / ${MEASURE_RUNS} runs`)
    );
    console.log(
      row('Mango find (type,residentId)', `avg ${round1(findTypeResident.average)} ms / ${MEASURE_RUNS} runs`)
    );
    console.log(
      row('allDocs (include_docs, limit 100)', `avg ${round1(allDocs.average)} ms / ${MEASURE_RUNS} runs`)
    );
    console.log(row('db.info() doc_count', `${docCount} (inserted ${written})`));
    console.log(`  └${'─'.repeat(LABEL_W + VALUE_W + 4)}┘`);
    console.log('');
    console.log(`  detail — find(type,status)         : ${findTypeStatus.samples.join(', ')} ms`);
    console.log(`  detail — find(type,residentId)     : ${findTypeResident.samples.join(', ')} ms`);
    console.log(`  detail — allDocs(100)              : ${allDocs.samples.join(', ')} ms`);
    console.log(`  rows returned by find(type,status)    : ${findTypeStatus.lastResult?.docs?.length ?? 'n/a'}`);
    console.log(`  rows returned by find(type,residentId): ${findTypeResident.lastResult?.docs?.length ?? 'n/a'}`);
    console.log(`  rows returned by allDocs(limit 100)   : ${allDocs.lastResult?.rows?.length ?? 'n/a'}`);
    console.log('');

    // ── One-line summary for a defense slide ──────────────────────────────
    console.log('  ┌────────────────────────────────────────────────────────────────┐');
    console.log(
      `  │ N=${DOC_COUNT} | insert ${round1(insertMs / 1000)}s (${Math.round(docsPerSec)} docs/s) | ` +
      `find(type,status) ${Math.round(findTypeStatus.average)}ms |`
    );
    console.log(
      `  │ find(type,residentId) ${Math.round(findTypeResident.average)}ms | ` +
      `allDocs(100) ${Math.round(allDocs.average)}ms |`
    );
    console.log('  └────────────────────────────────────────────────────────────────┘');
  } catch (err) {
    failure = err;
  } finally {
    // ── Cleanup: always drop the test database ───────────────────────────
    if (created && !KEEP) {
      try {
        await couch.db.destroy(DB_NAME);
        console.log(`  ✔ dropped ${DB_NAME}`);
      } catch (err) {
        console.error(`  ✖ FAILED to drop ${DB_NAME}: ${err.message}`);
        if (!failure) failure = err;
      }
    } else if (created && KEEP) {
      console.log(`  ⚠ --keep: ${DB_NAME} was NOT dropped. Drop it manually.`);
    }
  }

  if (failure) {
    console.error('');
    console.error(`❌ ${failure.message}`);
    process.exit(1);
  }
};

main().catch((err) => {
  console.error(`❌ ${err && err.message ? err.message : err}`);
  process.exit(1);
});
