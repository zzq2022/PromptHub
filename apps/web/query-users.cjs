const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-query.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

// Copy to temp to avoid lock
copyFileSync(srcPath, tmpPath);

const db = new Database(tmpPath, { fileMustExist: true });

try {
  const rows = db.all('SELECT id, username, role, created_at FROM users ORDER BY created_at');
  console.log('\n=== All Users ===');
  console.log('Total: ' + rows.length + ' user(s)\n');
  for (const row of rows) {
    console.log('  ID:       ' + row.id);
    console.log('  Username: ' + row.username);
    console.log('  Role:     ' + row.role);
    console.log('  Created:  ' + row.created_at);
    console.log('');
  }

  const admins = rows.filter(function(r) { return r.role === 'admin'; });
  console.log('=== Admin Users: ' + admins.length + ' ===');
  for (const a of admins) {
    console.log('  - ' + a.username + ' (id: ' + a.id + ')');
  }
} finally {
  db.close();
  try { require('fs').unlinkSync(tmpPath); } catch(e) {}
}
