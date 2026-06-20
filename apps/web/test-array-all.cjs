const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-test-array-all.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

copyFileSync(srcPath, tmpPath);
const db = new Database(tmpPath, { fileMustExist: true });

function tryQuery(label, sql, params) {
  try {
    const stmt = db.prepare(sql);
    // Pass as a single array argument
    const rows = stmt.all(params);
    console.log(`[SUCCESS] ${label}: found ${rows.length} rows`);
  } catch (err) {
    console.error(`[FAILURE] ${label}:`, err.message);
  }
}

try {
  tryQuery('Array binding', `
    SELECT s.id, s.name, s.description, s.version, s.author, s.visibility,
           s.approval_status, s.tags, s.created_at, s.updated_at, s.owner_user_id,
           u.username as owner_username
    FROM skills s
    LEFT JOIN users u ON s.owner_user_id = u.id
    WHERE s.approval_status = ?
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `, ['pending', 10, 0]);
} finally {
  db.close();
  try { unlinkSync(tmpPath); } catch(e) {}
}
