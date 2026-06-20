import { getServerDatabase } from './src/database.js';

async function testQuery() {
  const db = getServerDatabase();
  console.log('Database instance obtained.');

  const approvalStatus = 'pending';
  const pageSize = 10;
  const offset = 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  conditions.push('s.approval_status = ?');
  params.push(approvalStatus);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    console.log('Running query with params:', [...params, pageSize, offset]);
    const stmt = db.prepare(`
      SELECT s.id, s.name, s.approval_status
      FROM skills s
      ${where}
      LIMIT ? OFFSET ?
    `);

    // Call it exactly as done in admin-routes.ts
    const rows = stmt.all(...params, pageSize, offset);
    console.log('Query succeeded! Rows found:', rows.length);
    console.log('Rows:', JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error('Query failed with error:', err);
  }
}

testQuery().catch(console.error);
