import { DatabaseSync } from 'node:sqlite';
const dbPath = 'D:\\Pyprojects\\PromptHub-main2\\apps\\web\\data\\prompthub.db';

const db = new DatabaseSync(dbPath);

console.log('--- Skill table row ---');
const skillRow = db.prepare('SELECT * FROM skills WHERE id = ?').get('71863753-cbed-40c3-bbaf-db4b4ab97026');
console.log(JSON.stringify(skillRow, null, 2));

console.log('--- Skill versions ---');
const versions = db.prepare('SELECT * FROM skill_versions WHERE skill_id = ?').all('71863753-cbed-40c3-bbaf-db4b4ab97026');
console.log(JSON.stringify(versions, null, 2));

console.log('--- All skills count/list ---');
const allSkills = db.prepare('SELECT id, name, visibility, approval_status, registry_slug FROM skills').all();
console.log(JSON.stringify(allSkills, null, 2));
