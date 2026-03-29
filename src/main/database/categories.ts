import { getDB } from './db';

export interface Category {
  id: number;
  name: string;
  created_at: string;
}

export function getAllCategories(): Category[] {
  const db = getDB();
  return db.prepare('SELECT * FROM categories ORDER BY name').all() as Category[];
}

export function addCategory(name: string): number {
  const db = getDB();
  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name.trim());
  return result.lastInsertRowid as number;
}

export function updateCategory(id: number, name: string): void {
  const db = getDB();
  db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), id);
}

export function deleteCategory(id: number): void {
  const db = getDB();
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
}
