import { getServerDatabase } from './src/database.js';

try {
  const db = getServerDatabase();
  console.log('Testing db.prepare(...).all(10, 0)...');
  const rows = db.prepare('SELECT id FROM skills LIMIT ? OFFSET ?').all(10, 0);
  console.log('SUCCESS: found', rows.length, 'rows');
} catch (err: any) {
  console.error('FAILURE:', err.message);
}
