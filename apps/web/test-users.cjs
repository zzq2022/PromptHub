const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-test-users.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

copyFileSync(srcPath, tmpPath);
const db = new Database(tmpPath, { fileMustExist: true });

try {
  const stmt = db.prepare('SELECT id, username, role FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?');
  const rows = stmt.all(10, 0); // using two args like in admin-routes.ts
  console.log('SUCCESS: found', rows.length, 'users');
} catch (err) {
  console.error('FAILURE:', err.message);
} finally {
  db.close();
  try { unlinkSync(tmpPath); } catch(e) {}
}
