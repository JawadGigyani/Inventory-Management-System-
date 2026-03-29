import { getDB } from './db';

export interface Movement {
  id: number;
  product_id: number;
  type: 'IN' | 'OUT' | 'ADJUST';
  quantity: number;
  note: string | null;
  created_at: string;
}

export function stockIn(productId: number, quantity: number, note?: string): void {
  if (quantity <= 0) throw new Error('Quantity must be a positive integer');
  const db = getDB();
  const txn = db.transaction(() => {
    db.prepare(
      'INSERT INTO movements (product_id, type, quantity, note) VALUES (?, ?, ?, ?)'
    ).run(productId, 'IN', quantity, note || null);
    db.prepare(
      "UPDATE products SET quantity = quantity + ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(quantity, productId);
  });
  txn();
}

export function stockOut(productId: number, quantity: number, note?: string): void {
  if (quantity <= 0) throw new Error('Quantity must be a positive integer');
  const db = getDB();
  const txn = db.transaction(() => {
    const product = db.prepare('SELECT quantity FROM products WHERE id = ?').get(productId) as { quantity: number } | undefined;
    if (!product) throw new Error('Product not found');
    if (product.quantity < quantity) throw new Error(`Insufficient stock. Available: ${product.quantity}, Requested: ${quantity}`);
    db.prepare(
      'INSERT INTO movements (product_id, type, quantity, note) VALUES (?, ?, ?, ?)'
    ).run(productId, 'OUT', quantity, note || null);
    db.prepare(
      "UPDATE products SET quantity = quantity - ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(quantity, productId);
  });
  txn();
}

export function adjustStock(productId: number, newQuantity: number, note?: string): void {
  if (newQuantity < 0) throw new Error('Quantity cannot be negative');
  const db = getDB();
  const txn = db.transaction(() => {
    const product = db.prepare('SELECT quantity FROM products WHERE id = ?').get(productId) as { quantity: number } | undefined;
    if (!product) throw new Error('Product not found');
    const delta = newQuantity - product.quantity;
    if (delta === 0) return;
    db.prepare(
      'INSERT INTO movements (product_id, type, quantity, note) VALUES (?, ?, ?, ?)'
    ).run(productId, 'ADJUST', Math.abs(delta), note || `Adjusted from ${product.quantity} to ${newQuantity}`);
    db.prepare(
      "UPDATE products SET quantity = ?, updated_at = datetime('now','localtime') WHERE id = ?"
    ).run(newQuantity, productId);
  });
  txn();
}

export function getMovementsByProduct(productId: number, startDate?: string, endDate?: string): Movement[] {
  const db = getDB();
  let sql = 'SELECT * FROM movements WHERE product_id = ?';
  const params: any[] = [productId];

  if (startDate) {
    sql += ' AND created_at >= ?';
    params.push(startDate);
  }
  if (endDate) {
    sql += ' AND created_at <= ?';
    params.push(endDate + ' 23:59:59');
  }

  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(...params) as Movement[];
}

export interface ChartDataPoint {
  day: string;
  stock_in: number;
  stock_out: number;
}

export function getChartData(days: number = 14): ChartDataPoint[] {
  const db = getDB();
  return db.prepare(`
    WITH RECURSIVE dates(d) AS (
      SELECT date('now', 'localtime', '-' || ? || ' days')
      UNION ALL
      SELECT date(d, '+1 day') FROM dates WHERE d < date('now', 'localtime')
    )
    SELECT
      dates.d AS day,
      COALESCE(SUM(CASE WHEN m.type = 'IN' THEN m.quantity ELSE 0 END), 0) AS stock_in,
      COALESCE(SUM(CASE WHEN m.type = 'OUT' THEN m.quantity ELSE 0 END), 0) AS stock_out
    FROM dates
    LEFT JOIN movements m ON date(m.created_at) = dates.d
    GROUP BY dates.d
    ORDER BY dates.d ASC
  `).all(days - 1) as ChartDataPoint[];
}
