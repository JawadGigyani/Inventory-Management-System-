import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('inventoryAPI', {
  getProducts: (filters?: { search?: string; category_id?: number | null; low_stock?: boolean }) =>
    ipcRenderer.invoke('get-products', filters),

  addProduct: (data: {
    name: string;
    sku?: string | null;
    category_id?: number | null;
    cost_per_unit?: number;
    selling_price_per_unit?: number;
    min_quantity?: number;
    unit?: string;
    initial_quantity?: number;
  }) => ipcRenderer.invoke('add-product', data),

  updateProduct: (id: number, data: {
    name: string;
    sku?: string | null;
    category_id?: number | null;
    cost_per_unit?: number;
    selling_price_per_unit?: number;
    min_quantity?: number;
    unit?: string;
  }) => ipcRenderer.invoke('update-product', id, data),

  deleteProduct: (id: number) => ipcRenderer.invoke('delete-product', id),

  stockIn: (productId: number, quantity: number, note?: string) =>
    ipcRenderer.invoke('stock-in', productId, quantity, note),

  stockOut: (productId: number, quantity: number, note?: string) =>
    ipcRenderer.invoke('stock-out', productId, quantity, note),

  adjustStock: (productId: number, newQuantity: number, note?: string) =>
    ipcRenderer.invoke('adjust-stock', productId, newQuantity, note),

  getMovements: (productId: number, startDate?: string, endDate?: string) =>
    ipcRenderer.invoke('get-movements', productId, startDate, endDate),

  getCategories: () => ipcRenderer.invoke('get-categories'),

  addCategory: (name: string) => ipcRenderer.invoke('add-category', name),

  updateCategory: (id: number, name: string) =>
    ipcRenderer.invoke('update-category', id, name),

  deleteCategory: (id: number) => ipcRenderer.invoke('delete-category', id),

  getDashboardStats: () => ipcRenderer.invoke('get-dashboard-stats'),

  getChartData: (days?: number) => ipcRenderer.invoke('get-chart-data', days),

  exportExcel: () => ipcRenderer.invoke('export-excel'),

  importFile: () => ipcRenderer.invoke('import-file'),

  backupDatabase: () => ipcRenderer.invoke('backup-database'),

  restoreDatabase: () => ipcRenderer.invoke('restore-database'),
});
