import { getDB } from './db';

export interface ProductRow {
  id: number;
  name: string;
  sku: string | null;
  category_id: number | null;
  category_name: string | null;
  cost_per_unit: number;
  selling_price_per_unit: number;
  min_quantity: number;
  unit: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  inventory_value: number;
  margin_per_unit: number;
  units_sold: number;
  revenue: number;
  cogs: number;
  realized_profit: number;
}

export interface ProductInput {
  name: string;
  sku?: string | null;
  category_id?: number | null;
  cost_per_unit?: number;
  selling_price_per_unit?: number;
  min_quantity?: number;
  unit?: string;
}

export interface ProductFilters {
  search?: string;
  category_id?: number | null;
  low_stock?: boolean;
}

export interface DashboardStats {
  total_products: number;
  total_inventory_value: number;
  low_stock_count: number;
  total_units_in_stock: number;
  total_revenue: number;
  total_cogs: number;
  total_realized_profit: number;
  total_units_sold: number;
  recent_movements: any[];
}

const BASE_SELECT = `
  SELECT
    p.*,
    c.name AS category_name,
    (p.quantity * p.cost_per_unit) AS inventory_value,
    (p.selling_price_per_unit - p.cost_per_unit) AS margin_per_unit,
    COALESCE(sales.units_sold, 0) AS units_sold,
    COALESCE(sales.units_sold * p.selling_price_per_unit, 0) AS revenue,
    COALESCE(sales.units_sold * p.cost_per_unit, 0) AS cogs,
    COALESCE(sales.units_sold * (p.selling_price_per_unit - p.cost_per_unit), 0) AS realized_profit
  FROM products p
  LEFT JOIN categories c ON p.category_id = c.id
  LEFT JOIN (
    SELECT product_id, SUM(quantity) AS units_sold
    FROM movements WHERE type = 'OUT'
    GROUP BY product_id
  ) sales ON sales.product_id = p.id
`;

export function getAllProducts(filters?: ProductFilters): ProductRow[] {
  const db = getDB();
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.search) {
    conditions.push('(p.name LIKE ? OR p.sku LIKE ?)');
    const term = `%${filters.search}%`;
    params.push(term, term);
  }

  if (filters?.category_id != null) {
    conditions.push('p.category_id = ?');
    params.push(filters.category_id);
  }

  if (filters?.low_stock) {
    conditions.push('p.quantity < p.min_quantity');
  }

  let sql = BASE_SELECT;
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY p.name';

  return db.prepare(sql).all(...params) as ProductRow[];
}

export function getProductById(id: number): ProductRow | undefined {
  const db = getDB();
  return db.prepare(BASE_SELECT + ' WHERE p.id = ?').get(id) as ProductRow | undefined;
}

export function addProduct(data: ProductInput): number {
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO products (name, sku, category_id, cost_per_unit, selling_price_per_unit, min_quantity, unit)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.name.trim(),
    data.sku?.trim() || null,
    data.category_id ?? null,
    data.cost_per_unit ?? 0,
    data.selling_price_per_unit ?? 0,
    data.min_quantity ?? 0,
    data.unit?.trim() || 'pcs'
  );
  return result.lastInsertRowid as number;
}

export function updateProduct(id: number, data: ProductInput): void {
  const db = getDB();
  db.prepare(`
    UPDATE products
    SET name = ?, sku = ?, category_id = ?, cost_per_unit = ?,
        selling_price_per_unit = ?, min_quantity = ?, unit = ?,
        updated_at = datetime('now','localtime')
    WHERE id = ?
  `).run(
    data.name.trim(),
    data.sku?.trim() || null,
    data.category_id ?? null,
    data.cost_per_unit ?? 0,
    data.selling_price_per_unit ?? 0,
    data.min_quantity ?? 0,
    data.unit?.trim() || 'pcs',
    id
  );
}

export function deleteProduct(id: number): void {
  const db = getDB();
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

export function getDashboardStats(): DashboardStats {
  const db = getDB();

  const counts = db.prepare(`
    SELECT
      COUNT(*) AS total_products,
      COALESCE(SUM(quantity * cost_per_unit), 0) AS total_inventory_value,
      SUM(CASE WHEN quantity < min_quantity THEN 1 ELSE 0 END) AS low_stock_count,
      COALESCE(SUM(quantity), 0) AS total_units_in_stock
    FROM products
  `).get() as any;

  const sales = db.prepare(`
    SELECT
      COALESCE(SUM(m.quantity), 0) AS total_units_sold,
      COALESCE(SUM(m.quantity * p.selling_price_per_unit), 0) AS total_revenue,
      COALESCE(SUM(m.quantity * p.cost_per_unit), 0) AS total_cogs
    FROM movements m
    JOIN products p ON m.product_id = p.id
    WHERE m.type = 'OUT'
  `).get() as any;

  const recent_movements = db.prepare(`
    SELECT m.*, p.name AS product_name
    FROM movements m
    JOIN products p ON m.product_id = p.id
    ORDER BY m.created_at DESC
    LIMIT 10
  `).all();

  return {
    total_products: counts.total_products,
    total_inventory_value: counts.total_inventory_value,
    low_stock_count: counts.low_stock_count,
    total_units_in_stock: counts.total_units_in_stock,
    total_revenue: sales.total_revenue,
    total_cogs: sales.total_cogs,
    total_realized_profit: sales.total_revenue - sales.total_cogs,
    total_units_sold: sales.total_units_sold,
    recent_movements,
  };
}
