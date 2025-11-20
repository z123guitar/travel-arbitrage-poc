// src/db/migrate.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb } from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const db = openDb();

  const migrationsDir = path.join(__dirname, '..', '..', 'Data', 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.error('Migrations directory not found at', migrationsDir);
    db.close();
    process.exit(1);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log('Running migrations:');
  for (const file of files) {
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    console.log('  ->', file);

    await new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) {
          console.error('Error running migration', file, err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  db.close();
  console.log('Migrations complete.');
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
