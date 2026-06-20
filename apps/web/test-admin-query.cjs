const { Database } = require('node-sqlite3-wasm');
const { existsSync, copyFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const os = require('os');

const srcPath = join(__dirname, 'data', 'prompthub.db');
const tmpPath = join(os.tmpdir(), 'prompthub-test-admin.db');

if (!existsSync(srcPath)) {
  console.error('Database not found at: ' + srcPath);
  process.exit(1);
}

copyFileSync(srcPath, tmpPath);
const db = new Database(tmpPath, { fileMustExist: true });

try {
  const approvalStatus = 'pending';
  const conditions = [];
  const params = [];

  if (approvalStatus) {
    conditions.push('s.approval_status = ?');
    params.push(approvalStatus);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const totalStmt = db.prepare(`SELECT COUNT(*) as count FROM skills s ${where}`);
  const total = totalStmt.get(...params).count;

  console.log('Total Count:', total);

  const rowsStmt = db.prepare(`
    SELECT s.id, s.name, s.description, s.version, s.author, s.visibility,
           s.approval_status, s.tags, s.created_at, s.updated_at, s.owner_user_id,
           u.username as owner_username
    FROM skills s
    LEFT JOIN users u ON s.owner_user_id = u.id
    ${where}
    ORDER BY s.created_at DESC
    LIMIT ? OFFSET ?
  `);
  
  const rows = rowsStmt.all(...params, 10, 0);
  console.log('Rows found:', rows.length);
  console.log(JSON.stringify(rows, null, 2));

} finally {
  db.close();
  try { unlinkSync(tmpPath); } catch(e) {}
}
