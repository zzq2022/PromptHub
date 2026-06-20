const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-test-pieces.db');

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
  // Test 1: plain select with string param
  tryQuery('Plain select with status', 'SELECT id FROM skills WHERE approval_status = ?', ['pending']);

  // Test 2: plain select with limit/offset params
  tryQuery('Plain select with limit/offset', 'SELECT id FROM skills LIMIT ? OFFSET ?', [10, 0]);

  // Test 3: plain select with string and limit/offset params
  tryQuery('Plain select with status and limit/offset', 'SELECT id FROM skills WHERE approval_status = ? LIMIT ? OFFSET ?', ['pending', 10, 0]);

  // Test 4: join query without limit/offset
  tryQuery('Join query without limit/offset', `
    SELECT s.id, u.username as owner_username
    FROM skills s
    LEFT JOIN users u ON s.owner_user_id = u.id
    WHERE s.approval_status = ?
  `, ['pending']);

  // Test 5: full query with positional binding
  tryQuery('Full query with positional binding', `
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
