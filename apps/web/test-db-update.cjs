const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-test-run.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

copyFileSync(srcPath, tmpPath);
const db = new Database(tmpPath, { fileMustExist: true });

try {
  // Find a private skill
  const skill = db.get("SELECT id, name, visibility FROM skills WHERE visibility = 'private' LIMIT 1");
  if (!skill) {
    console.log('No private skills found');
    process.exit(0);
  }

  console.log('Found private skill:', skill.id, skill.name, skill.visibility);

  // Attempt 1: run with separate args
  console.log('Attempting UPDATE with run(visibility, Date.now(), id)...');
  const result1 = db.prepare("UPDATE skills SET visibility = ?, updated_at = ? WHERE id = ?").run('shared', Date.now(), skill.id);
  console.log('Changes:', result1.changes);

  // Check visibility again
  const after1 = db.get("SELECT visibility FROM skills WHERE id = ?", skill.id);
  console.log('Visibility after Attempt 1:', after1.visibility);

  // Attempt 2: run with array parameter
  console.log('Attempting UPDATE with run([visibility, Date.now(), id])...');
  const result2 = db.prepare("UPDATE skills SET visibility = ?, updated_at = ? WHERE id = ?").run(['shared', Date.now(), skill.id]);
  console.log('Changes:', result2.changes);

  // Check visibility again
  const after2 = db.get("SELECT visibility FROM skills WHERE id = ?", skill.id);
  console.log('Visibility after Attempt 2:', after2.visibility);

} finally {
  db.close();
  try { unlinkSync(tmpPath); } catch(e) {}
}
