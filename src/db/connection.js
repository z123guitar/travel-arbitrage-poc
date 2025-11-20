// src/db/connection.js
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Returns a sqlite3.Database instance pointing to Data/first_run.db
 * You can later generalize this or change the DB name.
 */
export function openDb() {
  const dbPath = path.join(__dirname, '..', '..', 'Data', 'first_run.db');
  const db = new sqlite3.Database(dbPath);
  return db;
}
