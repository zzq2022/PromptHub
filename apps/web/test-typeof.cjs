const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-test-typeof.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

copyFileSync(srcPath, tmpPath);
const db = new Database(tmpPath, { fileMustExist: true });

function checkType(value) {
  try {
    const row = db.get('SELECT typeof(?) as t', value);
    console.log(`Value: ${JSON.stringify(value)} (${typeof value}) -> SQLite Type: ${row.t}`);
  } catch (err) {
    console.error(`Value: ${JSON.stringify(value)} failed:`, err.message);
  }
}

try {
  checkType('hello');
  checkType(10);
  checkType(10.5);
  checkType(true);
  checkType(10n);
  checkType(null);
} finally {
  db.close();
  try { unlinkSync(tmpPath); } catch(e) {}
}
