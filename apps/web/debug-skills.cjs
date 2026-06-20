const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-debug.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

copyFileSync(srcPath, tmpPath);
const db = new Database(tmpPath, { fileMustExist: true });

try {
  // 1. List all skills with approval_status and visibility
  console.log('\n=== ALL SKILLS (id, name, visibility, approval_status, owner_user_id) ===');
  const skills = db.all(
    "SELECT id, name, visibility, approval_status, owner_user_id, created_at, updated_at FROM skills ORDER BY updated_at DESC"
  );
  console.log('Total: ' + skills.length + ' skill(s)\n');
  for (const s of skills) {
    console.log('  ID:        ' + s.id);
    console.log('  Name:      ' + s.name);
    console.log('  Visibility:' + (s.visibility || 'null'));
    console.log('  Approval:  ' + (s.approval_status || 'null'));
    console.log('  Owner:     ' + (s.owner_user_id || 'null'));
    console.log('  Created:   ' + s.created_at);
    console.log('  Updated:   ' + s.updated_at);
    console.log('');
  }

  // 2. List all users
  console.log('\n=== ALL USERS (id, username, role) ===');
  const users = db.all('SELECT id, username, role FROM users ORDER BY created_at');
  for (const u of users) {
    console.log('  ' + u.username + ' (id: ' + u.id + ', role: ' + u.role + ')');
  }

  // 3. Count pending specifically
  const pendingCount = db.get("SELECT COUNT(*) as c FROM skills WHERE approval_status = 'pending'");
  console.log('\n=== PENDING COUNT: ' + (pendingCount?.c ?? 0) + ' ===');

} finally {
  db.close();
  try { unlinkSync(tmpPath); } catch(e) {}
}
