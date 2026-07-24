import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

let dbInstance: any = null;

export async function getDb() {
  if (dbInstance) return dbInstance;
  
  dbInstance = await open({
    filename: path.join(__dirname, '..', '..', 'users.db'),
    driver: sqlite3.Database
  });

  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      is_verified INTEGER DEFAULT 0,
      two_factor_code TEXT
    )
  `);

  try {
    // Add columns if they don't exist (SQLite doesn't have ADD COLUMN IF NOT EXISTS in all versions)
    await dbInstance.exec(`ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0;`);
    await dbInstance.exec(`ALTER TABLE users ADD COLUMN two_factor_code TEXT;`);
  } catch (e) {
    // Columns likely already exist
  }

  return dbInstance;
}
