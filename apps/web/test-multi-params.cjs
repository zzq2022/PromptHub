const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-test-multi.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

copyFileSync(srcPath, tmpPath);
const db = new Database(tmpPath, { fileMustExist: true });

function tryQuery(label, sql, params) {
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all(...params);
    console.log(`[SUCCESS] ${label}: found ${rows.length} rows`);
  } catch (err) {
    console.error(`[FAILURE] ${label}:`, err.message);
  }
}

try {
  tryQuery('Multi params string in WHERE', 'SELECT id FROM skills WHERE visibility = ? AND approval_status = ?', ['private', 'pending']);
} finally {
  db.close();
  try { unlinkSync(tmpPath); } catch(e) {}
}
