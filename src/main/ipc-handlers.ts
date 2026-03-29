import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import { getAllCategories, addCategory, updateCategory, deleteCategory } from './database/categories';
import { getAllProducts, addProduct, updateProduct, deleteProduct, getDashboardStats, ProductFilters, ProductInput } from './database/products';
import { stockIn, stockOut, adjustStock, getMovementsByProduct, getChartData } from './database/movements';
import { exportToExcel } from './database/export';
import { importFile } from './database/import';
import { getDBPath, reopenDB, checkpointAndClose } from './database/db';

export function registerIPCHandlers(): void {

  ipcMain.handle('get-categories', () => {
    return getAllCategories();
  });

  ipcMain.handle('add-category', (_event, name: string) => {
    return addCategory(name);
  });

  ipcMain.handle('update-category', (_event, id: number, name: string) => {
    updateCategory(id, name);
    return { success: true };
  });

  ipcMain.handle('delete-category', (_event, id: number) => {
    deleteCategory(id);
    return { success: true };
  });

  ipcMain.handle('get-products', (_event, filters?: ProductFilters) => {
    return getAllProducts(filters);
  });

  ipcMain.handle('add-product', (_event, data: ProductInput & { initial_quantity?: number }) => {
    const id = addProduct(data);
    if (data.initial_quantity && data.initial_quantity > 0) {
      stockIn(id, data.initial_quantity, 'Initial stock on product creation');
    }
    return id;
  });

  ipcMain.handle('update-product', (_event, id: number, data: ProductInput) => {
    updateProduct(id, data);
    return { success: true };
  });

  ipcMain.handle('delete-product', (_event, id: number) => {
    deleteProduct(id);
    return { success: true };
  });

  ipcMain.handle('stock-in', (_event, productId: number, quantity: number, note?: string) => {
    stockIn(productId, quantity, note);
    return { success: true };
  });

  ipcMain.handle('stock-out', (_event, productId: number, quantity: number, note?: string) => {
    stockOut(productId, quantity, note);
    return { success: true };
  });

  ipcMain.handle('adjust-stock', (_event, productId: number, newQuantity: number, note?: string) => {
    adjustStock(productId, newQuantity, note);
    return { success: true };
  });

  ipcMain.handle('get-movements', (_event, productId: number, startDate?: string, endDate?: string) => {
    return getMovementsByProduct(productId, startDate, endDate);
  });

  ipcMain.handle('get-dashboard-stats', () => {
    return getDashboardStats();
  });

  ipcMain.handle('get-chart-data', (_event, days?: number) => {
    return getChartData(days || 14);
  });

  ipcMain.handle('export-excel', async () => {
    return await exportToExcel();
  });

  ipcMain.handle('import-file', async () => {
    return await importFile();
  });

  ipcMain.handle('backup-database', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, message: 'No active window' };

    const result = await dialog.showSaveDialog(win, {
      title: 'Backup Database',
      defaultPath: `ims-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, message: 'Backup cancelled' };
    }

    try {
      checkpointAndClose();
      const srcPath = getDBPath();
      fs.copyFileSync(srcPath, result.filePath);
      reopenDB();
      return { success: true, message: `Backup saved to ${result.filePath}` };
    } catch (err: any) {
      reopenDB();
      return { success: false, message: `Backup failed: ${err.message}` };
    }
  });

  ipcMain.handle('restore-database', async () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, message: 'No active window' };

    const result = await dialog.showOpenDialog(win, {
      title: 'Restore Database',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, message: 'Restore cancelled' };
    }

    try {
      const srcFile = result.filePaths[0];
      const destPath = getDBPath();

      checkpointAndClose();

      fs.copyFileSync(srcFile, destPath);

      // Clean up any leftover WAL/SHM from the old database
      const walDest = destPath + '-wal';
      const shmDest = destPath + '-shm';
      if (fs.existsSync(walDest)) fs.unlinkSync(walDest);
      if (fs.existsSync(shmDest)) fs.unlinkSync(shmDest);

      reopenDB();
      return { success: true, message: 'Database restored successfully. Reloading...' };
    } catch (err: any) {
      reopenDB();
      return { success: false, message: `Restore failed: ${err.message}` };
    }
  });
}
