const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-debug-pending.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

copyFileSync(srcPath, tmpPath);
const db = new Database(tmpPath, { fileMustExist: true });

try {
  console.log('\n=== PENDING SKILLS DETAILS ===');
  const skills = db.all(
    "SELECT id, name, owner_user_id, visibility, approval_status, registry_slug, source_url FROM skills WHERE approval_status = 'pending'"
  );
  for (const s of skills) {
    console.log(JSON.stringify(s, null, 2));
    console.log('---------------------------------------------');
  }
} finally {
  db.close();
  try { unlinkSync(tmpPath); } catch(e) {}
}
