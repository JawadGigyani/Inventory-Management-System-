import { app, BrowserWindow, Menu, MenuItemConstructorOptions, ipcMain } from 'electron';
import path from 'path';
import { getDB, closeDB } from './database/db';
import { registerIPCHandlers } from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'Inventory Management System',
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, '..', '..', 'src', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerWindowControls(): void {
  ipcMain.handle('win-minimize', () => { mainWindow?.minimize(); });
  ipcMain.handle('win-maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize();
    else mainWindow?.maximize();
  });
  ipcMain.handle('win-close', () => { mainWindow?.close(); });
  ipcMain.handle('win-is-maximized', () => mainWindow?.isMaximized() ?? false);
}

function buildMenu(): void {
  const send = (channel: string) => {
    mainWindow?.webContents.send(channel);
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Import Data...', accelerator: 'CmdOrCtrl+I', click: () => send('menu-import') },
        { label: 'Export Data...', accelerator: 'CmdOrCtrl+E', click: () => send('menu-export') },
        { type: 'separator' },
        { label: 'Backup Database...', click: () => send('menu-backup') },
        { label: 'Restore Database...', click: () => send('menu-restore') },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: () => send('menu-view-dashboard') },
        { label: 'Products', accelerator: 'CmdOrCtrl+2', click: () => send('menu-view-products') },
        { label: 'Categories', accelerator: 'CmdOrCtrl+3', click: () => send('menu-view-categories') },
        { type: 'separator' },
        { label: 'Toggle Theme', accelerator: 'CmdOrCtrl+T', click: () => send('menu-toggle-theme') },
        { label: 'Toggle Sidebar', accelerator: 'CmdOrCtrl+B', click: () => send('menu-toggle-sidebar') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About IMS', click: () => send('menu-about') },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  getDB();
  registerIPCHandlers();
  registerWindowControls();
  createWindow();
  buildMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  closeDB();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
