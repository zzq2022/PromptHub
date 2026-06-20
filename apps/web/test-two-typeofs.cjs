const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-test-typeof2.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

copyFileSync(srcPath, tmpPath);
const db = new Database(tmpPath, { fileMustExist: true });

try {
  const row1 = db.get('SELECT typeof(?) as t1, typeof(?) as t2', [10, 0]);
  console.log('Passing array [10, 0]:');
  console.log('  Param 1 Type:', row1.t1);
  console.log('  Param 2 Type:', row1.t2);

  const stmt = db.prepare('SELECT typeof(?) as t1, typeof(?) as t2');
  const row2 = stmt.get(10, 0);
  console.log('Statement.get(10, 0):');
  console.log('  Param 1 Type:', row2.t1);
  console.log('  Param 2 Type:', row2.t2);

  const row3 = stmt.get([10, 0]);
  console.log('Statement.get([10, 0]):');
  console.log('  Param 1 Type:', row3.t1);
  console.log('  Param 2 Type:', row3.t2);
} finally {
  db.close();
  try { unlinkSync(tmpPath); } catch(e) {}
}
