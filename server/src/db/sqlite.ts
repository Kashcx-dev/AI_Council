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

  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      token_burn INTEGER DEFAULT 0,
      confidence_score INTEGER DEFAULT 0,
      status TEXT,
      task_prompt TEXT,
      rounds_taken INTEGER DEFAULT 1
    )
  `);

  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deliberation_id INTEGER,
      round INTEGER,
      agent_name TEXT,
      vote TEXT,
      confidence INTEGER,
      tokens_used INTEGER,
      latency_ms INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (deliberation_id) REFERENCES telemetry_logs(id)
    )
  `);

  try {
    // Add columns if they don't exist (SQLite doesn't have ADD COLUMN IF NOT EXISTS in all versions)
    await dbInstance.exec(`ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0;`);
    await dbInstance.exec(`ALTER TABLE users ADD COLUMN two_factor_code TEXT;`);
  } catch (e) {
    // Columns likely already exist
  }

  try {
    await dbInstance.exec(`ALTER TABLE telemetry_logs ADD COLUMN rounds_taken INTEGER DEFAULT 1;`);
  } catch (e) {}

  return dbInstance;
}
