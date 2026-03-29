import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { dialog } from 'electron';
import { getDB } from './db';

interface ImportRow {
  name?: string;
  sku?: string;
  category?: string;
  unit?: string;
  quantity?: number;
  cost_per_unit?: number;
  selling_price_per_unit?: number;
  min_quantity?: number;
}

interface MovementRow {
  product_name?: string;
  product_sku?: string;
  type?: string;
  quantity?: number;
  note?: string;
  created_at?: string;
}

interface ImportResult {
  success: boolean;
  message: string;
  created: number;
  updated: number;
  errors: string[];
}

const FIELD_ALIASES: Record<string, string> = {
  'name': 'name',
  'product': 'name',
  'product_name': 'name',
  'sku': 'sku',
  'category': 'category',
  'category_name': 'category',
  'quantity': 'quantity',
  'qty': 'quantity',
  'in_stock': 'quantity',
  'stock': 'quantity',
  'cost_per_unit': 'cost_per_unit',
  'cost/unit': 'cost_per_unit',
  'cost': 'cost_per_unit',
  'unit_cost': 'cost_per_unit',
  'selling_price_per_unit': 'selling_price_per_unit',
  'sell_price/unit': 'selling_price_per_unit',
  'selling_price': 'selling_price_per_unit',
  'sell_price': 'selling_price_per_unit',
  'price': 'selling_price_per_unit',
  'unit_price': 'selling_price_per_unit',
  'min_quantity': 'min_quantity',
  'min_qty': 'min_quantity',
  'min_stock': 'min_quantity',
  'minimum_quantity': 'min_quantity',
  'unit': 'unit',
};

export async function importFile(): Promise<ImportResult> {
  const result = await dialog.showOpenDialog({
    title: 'Import Inventory',
    filters: [
      { name: 'Spreadsheets', extensions: ['csv', 'xlsx'] },
    ],
    properties: ['openFile'],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: 'Import cancelled', created: 0, updated: 0, errors: [] };
  }

  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();

  let rows: ImportRow[];
  let movements: MovementRow[] = [];

  if (ext === '.csv') {
    rows = await parseCSV(filePath);
  } else if (ext === '.xlsx') {
    const parsed = await parseXLSX(filePath);
    rows = parsed.products;
    movements = parsed.movements;
  } else {
    return { success: false, message: 'Unsupported file type', created: 0, updated: 0, errors: [] };
  }

  return applyImport(rows, movements);
}

function canonicalizeHeader(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '_');
  return FIELD_ALIASES[key] || key;
}

async function parseCSV(filePath: string): Promise<ImportRow[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => canonicalizeHeader(h),
  });
  return parsed.data.map(normalizeRow);
}

async function parseXLSX(filePath: string): Promise<{ products: ImportRow[]; movements: MovementRow[] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  // Parse first sheet as products
  const productSheet = workbook.worksheets[0];
  const products: ImportRow[] = [];

  if (productSheet) {
    const headers: string[] = [];
    productSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell, colNumber) => {
          headers[colNumber] = canonicalizeHeader(String(cell.value || ''));
        });
        return;
      }
      const obj: Record<string, string> = {};
      row.eachCell((cell, colNumber) => {
        const key = headers[colNumber];
        if (key) obj[key] = String(cell.value ?? '');
      });
      products.push(normalizeRow(obj));
    });
  }

  // Parse "Movements" sheet if it exists
  const movements: MovementRow[] = [];
  const movSheet = workbook.worksheets.find(
    ws => ws.name.toLowerCase() === 'movements'
  );

  if (movSheet) {
    const movHeaders: string[] = [];
    movSheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell, colNumber) => {
          movHeaders[colNumber] = String(cell.value || '').trim().toLowerCase().replace(/\s+/g, '_');
        });
        return;
      }
      const obj: Record<string, string> = {};
      row.eachCell((cell, colNumber) => {
        const key = movHeaders[colNumber];
        if (key) obj[key] = String(cell.value ?? '');
      });
      movements.push({
        product_name: obj.product_name?.trim() || undefined,
        product_sku: obj.product_sku?.trim() || undefined,
        type: obj.type?.trim().toUpperCase() || undefined,
        quantity: parseNumeric(obj.quantity),
        note: obj.note?.trim() || undefined,
        created_at: obj.created_at?.trim() || undefined,
      });
    });
  }

  return { products, movements };
}

function normalizeRow(raw: Record<string, string>): ImportRow {
  return {
    name: raw.name?.trim() || undefined,
    sku: raw.sku?.trim() || undefined,
    category: raw.category?.trim() || undefined,
    unit: raw.unit?.trim() || undefined,
    quantity: parseNumeric(raw.quantity),
    cost_per_unit: parseDecimal(raw.cost_per_unit),
    selling_price_per_unit: parseDecimal(raw.selling_price_per_unit),
    min_quantity: parseNumeric(raw.min_quantity),
  };
}

function parseNumeric(val: string | undefined): number | undefined {
  if (val == null || val.trim() === '') return undefined;
  const num = parseInt(val, 10);
  return isNaN(num) ? undefined : num;
}

function parseDecimal(val: string | undefined): number | undefined {
  if (val == null || val.trim() === '') return undefined;
  const num = parseFloat(val);
  return isNaN(num) ? undefined : num;
}

function applyImport(rows: ImportRow[], movements: MovementRow[]): ImportResult {
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const line = i + 2;
    if (!row.name) {
      errors.push(`Row ${line}: "name" is required`);
    }
    if (row.quantity != null && row.quantity < 0) {
      errors.push(`Row ${line}: quantity cannot be negative`);
    }
    if (row.cost_per_unit != null && row.cost_per_unit < 0) {
      errors.push(`Row ${line}: cost_per_unit cannot be negative`);
    }
    if (row.selling_price_per_unit != null && row.selling_price_per_unit < 0) {
      errors.push(`Row ${line}: selling_price_per_unit cannot be negative`);
    }
  }

  if (errors.length > 0) {
    return { success: false, message: 'Validation failed', created: 0, updated: 0, errors };
  }

  const db = getDB();
  let created = 0;
  let updated = 0;

  const txn = db.transaction(() => {
    // Mapping from product name/sku to new product id (for movement import)
    const productIdMap = new Map<string, number>();

    for (const row of rows) {
      let categoryId: number | null = null;
      if (row.category) {
        const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(row.category) as { id: number } | undefined;
        if (existing) {
          categoryId = existing.id;
        } else {
          const res = db.prepare('INSERT INTO categories (name) VALUES (?)').run(row.category);
          categoryId = res.lastInsertRowid as number;
        }
      }

      let product: { id: number; quantity: number } | undefined;

      if (row.sku) {
        product = db.prepare('SELECT id, quantity FROM products WHERE sku = ?').get(row.sku) as typeof product;
      }
      if (!product && row.name) {
        product = db.prepare('SELECT id, quantity FROM products WHERE name = ?').get(row.name) as typeof product;
      }

      if (product) {
        db.prepare(`
          UPDATE products SET
            name = COALESCE(?, name),
            sku = COALESCE(?, sku),
            category_id = COALESCE(?, category_id),
            cost_per_unit = COALESCE(?, cost_per_unit),
            selling_price_per_unit = COALESCE(?, selling_price_per_unit),
            min_quantity = COALESCE(?, min_quantity),
            unit = COALESCE(?, unit),
            updated_at = datetime('now','localtime')
          WHERE id = ?
        `).run(
          row.name || null,
          row.sku || null,
          categoryId,
          row.cost_per_unit ?? null,
          row.selling_price_per_unit ?? null,
          row.min_quantity ?? null,
          row.unit || null,
          product.id
        );

        // If we have movements to import, skip the quantity adjustment here;
        // movements will set the final quantity. Otherwise, adjust as before.
        if (movements.length === 0 && row.quantity != null && row.quantity !== product.quantity) {
          const delta = row.quantity - product.quantity;
          db.prepare(
            'INSERT INTO movements (product_id, type, quantity, note) VALUES (?, ?, ?, ?)'
          ).run(product.id, 'ADJUST', Math.abs(delta), `Import: adjusted from ${product.quantity} to ${row.quantity}`);
          db.prepare(
            "UPDATE products SET quantity = ?, updated_at = datetime('now','localtime') WHERE id = ?"
          ).run(row.quantity, product.id);
        }

        if (row.name) productIdMap.set(row.name.toLowerCase(), product.id);
        if (row.sku) productIdMap.set('sku:' + row.sku.toLowerCase(), product.id);
        updated++;
      } else {
        const initQty = (movements.length > 0) ? 0 : (row.quantity ?? 0);
        const res = db.prepare(`
          INSERT INTO products (name, sku, category_id, cost_per_unit, selling_price_per_unit, min_quantity, unit, quantity)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `).run(
          row.name!,
          row.sku || null,
          categoryId,
          row.cost_per_unit ?? 0,
          row.selling_price_per_unit ?? 0,
          row.min_quantity ?? 0,
          row.unit || 'pcs'
        );
        const newId = res.lastInsertRowid as number;

        if (movements.length === 0 && row.quantity != null && row.quantity > 0) {
          db.prepare(
            'INSERT INTO movements (product_id, type, quantity, note) VALUES (?, ?, ?, ?)'
          ).run(newId, 'IN', row.quantity, 'Import: initial stock');
          db.prepare(
            "UPDATE products SET quantity = ?, updated_at = datetime('now','localtime') WHERE id = ?"
          ).run(row.quantity, newId);
        }

        if (row.name) productIdMap.set(row.name.toLowerCase(), newId);
        if (row.sku) productIdMap.set('sku:' + row.sku.toLowerCase(), newId);
        created++;
      }
    }

    // ── Import movements if the Movements sheet was present ──
    if (movements.length > 0) {
      for (const m of movements) {
        if (!m.type || !m.quantity || m.quantity <= 0) continue;
        if (!['IN', 'OUT', 'ADJUST'].includes(m.type)) continue;

        let productId: number | undefined;
        if (m.product_sku) {
          productId = productIdMap.get('sku:' + m.product_sku.toLowerCase());
        }
        if (!productId && m.product_name) {
          productId = productIdMap.get(m.product_name.toLowerCase());
        }
        if (!productId) continue;

        if (m.created_at) {
          db.prepare(
            'INSERT INTO movements (product_id, type, quantity, note, created_at) VALUES (?, ?, ?, ?, ?)'
          ).run(productId, m.type, m.quantity, m.note || null, m.created_at);
        } else {
          db.prepare(
            'INSERT INTO movements (product_id, type, quantity, note) VALUES (?, ?, ?, ?)'
          ).run(productId, m.type, m.quantity, m.note || null);
        }
      }

      // Recalculate product quantities from movements
      const productIds = [...new Set(productIdMap.values())];
      for (const pid of productIds) {
        const result = db.prepare(`
          SELECT
            COALESCE(SUM(CASE WHEN type = 'IN' THEN quantity ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN type = 'OUT' THEN quantity ELSE 0 END), 0) +
            COALESCE(SUM(CASE WHEN type = 'ADJUST' THEN
              CASE WHEN note LIKE 'Import: adjusted from%' THEN 0 ELSE quantity END
            ELSE 0 END), 0) AS calc_qty
          FROM movements WHERE product_id = ?
        `).get(pid) as any;

        // Simpler: just sum IN, subtract OUT, handle ADJUST by replaying
        const allMov = db.prepare(
          'SELECT type, quantity, note FROM movements WHERE product_id = ? ORDER BY created_at ASC'
        ).all(pid) as any[];

        let qty = 0;
        for (const mv of allMov) {
          if (mv.type === 'IN') qty += mv.quantity;
          else if (mv.type === 'OUT') qty -= mv.quantity;
          else if (mv.type === 'ADJUST') {
            // Parse "adjusted from X to Y" notes
            const match = (mv.note || '').match(/from (\d+) to (\d+)/);
            if (match) {
              qty = parseInt(match[2], 10);
            } else {
              qty += mv.quantity;
            }
          }
        }
        if (qty < 0) qty = 0;

        db.prepare(
          "UPDATE products SET quantity = ?, updated_at = datetime('now','localtime') WHERE id = ?"
        ).run(qty, pid);
      }
    }
  });

  txn();

  return {
    success: true,
    message: `Import complete. Created: ${created}, Updated: ${updated}${movements.length > 0 ? `, ${movements.length} movements restored` : ''}`,
    created,
    updated,
    errors: [],
  };
}
