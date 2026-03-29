import ExcelJS from 'exceljs';
import { dialog } from 'electron';
import { getAllProducts } from './products';
import { getDB } from './db';

export async function exportToExcel(): Promise<{ success: boolean; message: string }> {
  const products = getAllProducts();
  const db = getDB();

  const result = await dialog.showSaveDialog({
    title: 'Export Inventory',
    defaultPath: 'inventory-export.xlsx',
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, message: 'Export cancelled' };
  }

  const workbook = new ExcelJS.Workbook();

  // ── Products sheet ──
  const sheet = workbook.addWorksheet('Inventory');
  sheet.columns = [
    { header: 'name', key: 'name', width: 25 },
    { header: 'sku', key: 'sku', width: 15 },
    { header: 'category', key: 'category', width: 18 },
    { header: 'unit', key: 'unit', width: 10 },
    { header: 'quantity', key: 'quantity', width: 12 },
    { header: 'cost_per_unit', key: 'cost_per_unit', width: 16 },
    { header: 'selling_price_per_unit', key: 'selling_price_per_unit', width: 20 },
    { header: 'min_quantity', key: 'min_quantity', width: 14 },
    { header: 'Inventory Value', key: 'inventory_value', width: 18 },
    { header: 'Units Sold', key: 'units_sold', width: 12 },
    { header: 'Revenue', key: 'revenue', width: 16 },
    { header: 'COGS', key: 'cogs', width: 14 },
    { header: 'Realized Profit', key: 'realized_profit', width: 16 },
  ];

  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4A5568' } },
  };

  const headerRow = sheet.getRow(1);
  headerRow.eachCell(cell => { cell.style = headerStyle as ExcelJS.Style; });

  for (const p of products) {
    sheet.addRow({
      name: p.name,
      sku: p.sku || '',
      category: p.category_name || '',
      unit: p.unit,
      quantity: p.quantity,
      cost_per_unit: p.cost_per_unit,
      selling_price_per_unit: p.selling_price_per_unit,
      min_quantity: p.min_quantity,
      inventory_value: p.inventory_value,
      units_sold: p.units_sold,
      revenue: p.revenue,
      cogs: p.cogs,
      realized_profit: p.realized_profit,
    });
  }

  // ── Movements sheet (preserves full history for round-trip import) ──
  const allMovements = db.prepare(`
    SELECT m.product_id, p.name AS product_name, p.sku AS product_sku,
           m.type, m.quantity, m.note, m.created_at
    FROM movements m
    JOIN products p ON m.product_id = p.id
    ORDER BY m.created_at ASC
  `).all() as any[];

  if (allMovements.length > 0) {
    const movSheet = workbook.addWorksheet('Movements');
    movSheet.columns = [
      { header: 'product_name', key: 'product_name', width: 25 },
      { header: 'product_sku', key: 'product_sku', width: 15 },
      { header: 'type', key: 'type', width: 10 },
      { header: 'quantity', key: 'quantity', width: 12 },
      { header: 'note', key: 'note', width: 30 },
      { header: 'created_at', key: 'created_at', width: 22 },
    ];

    const movHeader = movSheet.getRow(1);
    movHeader.eachCell(cell => { cell.style = headerStyle as ExcelJS.Style; });

    for (const m of allMovements) {
      movSheet.addRow({
        product_name: m.product_name,
        product_sku: m.product_sku || '',
        type: m.type,
        quantity: m.quantity,
        note: m.note || '',
        created_at: m.created_at,
      });
    }
  }

  await workbook.xlsx.writeFile(result.filePath);
  return { success: true, message: `Exported ${products.length} products to ${result.filePath}` };
}
