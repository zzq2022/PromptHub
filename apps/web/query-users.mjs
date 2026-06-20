import { existsSync } from 'fs';

const pkg = await import('node-sqlite3-wasm');
const Database = pkg.default?.Database ?? pkg.Database;

const dbPath = 'data/prompthub.db';

if (!existsSync(dbPath)) {
  console.error(`Database not found at: ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath, { fileMustExist: true });

try {
  const rows = db.all('SELECT id, username, role, created_at FROM users ORDER BY created_at');
  console.log('\n=== All Users ===');
  console.log(`Total: ${rows.length} user(s)\n`);
  for (const row of rows) {
    const r = row;
    console.log(`  ID: ${r.id}`);
    console.log(`  Username: ${r.username}`);
    console.log(`  Role: ${r.role}`);
    console.log(`  Created: ${r.created_at}`);
    console.log('');
  }

  const admins = rows.filter((r) => r.role === 'admin');
  console.log(`=== Admin Users: ${admins.length} ===`);
  for (const a of admins) {
    console.log(`  - ${a.username} (id: ${a.id})`);
  }
} finally {
  db.close();
}
