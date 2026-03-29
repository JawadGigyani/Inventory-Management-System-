import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

let db: Database.Database;

export function getDB(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'inventory.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      cost_per_unit REAL DEFAULT 0,
      selling_price_per_unit REAL DEFAULT 0,
      min_quantity INTEGER DEFAULT 0,
      unit TEXT DEFAULT 'pcs',
      quantity INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      updated_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('IN','OUT','ADJUST')),
      quantity INTEGER NOT NULL,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
  `);
}

export function getDBPath(): string {
  return path.join(app.getPath('userData'), 'inventory.db');
}

export function closeDB(): void {
  if (db) {
    db.close();
  }
}

export function checkpointAndClose(): void {
  if (db) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
    } catch (_) { /* ignore if already in error state */ }
    try {
      db.close();
    } catch (_) { /* ignore */ }
  }
}

export function reopenDB(): void {
  if (db) {
    try { db.close(); } catch (_) { /* already closed */ }
  }
  const dbPath = getDBPath();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
}
