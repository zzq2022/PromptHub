import { Database } from 'node-sqlite3-wasm';
import { existsSync, copyFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { SkillDB } from '../../packages/db/src/skill.js'; // wait, it's ts files or compiled js?

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-test-packages.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

copyFileSync(srcPath, tmpPath);
const db = new Database(tmpPath, { fileMustExist: true });

try {
  const skillDb = new SkillDB(db);
  console.log('Calling listPendingApproval...');
  const rows = skillDb.listPendingApproval(10, 0);
  console.log('SUCCESS:', rows.length, 'rows');
} catch (err) {
  console.error('FAILURE:', err.message);
} finally {
  db.close();
  try { unlinkSync(tmpPath); } catch(e) {}
}
