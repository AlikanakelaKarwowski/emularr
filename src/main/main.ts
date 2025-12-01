// Polyfill for browser globals needed by undici/axios in Electron
if (typeof globalThis.File === 'undefined') {
  (globalThis as any).File = class File {
    constructor(public readonly name: string, public readonly size: number, public readonly type: string) {}
  };
}

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { downloadManager } from './downloadManager';
import { configManager } from './configManager';
import { gameLibrary } from './gameLibrary';
import { searchEngines } from './searchEngines';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload path:', preloadPath);
  console.log('Preload exists:', require('fs').existsSync(preloadPath));
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false, // Don't show until ready
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow loading from localhost in dev
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });
  
  // Log errors from renderer
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (level >= 2) { // Only log errors and warnings
      console.log(`[Renderer ${level}]:`, message);
    }
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page finished loading successfully');
    mainWindow?.show();
  });

  // Determine if we're in development mode
  // In development, app.isPackaged will be false
  const isDev = !app.isPackaged;
  
  console.log('isPackaged:', app.isPackaged);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('isDev:', isDev);
  
  if (isDev) {
    console.log('Loading from dev server: http://localhost:5173');
    mainWindow.webContents.openDevTools();
    
    // Load from dev server - wait-on should ensure it's ready
    const loadDevServer = () => {
      mainWindow?.loadURL('http://localhost:5173').catch((err) => {
        console.error('Error loading dev server:', err);
        // Retry after 1 second
        setTimeout(loadDevServer, 1000);
      });
    };
    
    loadDevServer();
  } else {
    const rendererPath = path.join(__dirname, '../renderer/index.html');
    console.log('Loading from file:', rendererPath);
    mainWindow.loadFile(rendererPath);
    mainWindow.show();
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('get-config', async () => {
  return configManager.getConfig();
});

ipcMain.handle('set-config', async (_, config: any) => {
  return configManager.setConfig(config);
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('search-games', async (_, query: string) => {
  return searchEngines.searchAll(query);
});

ipcMain.handle('start-download', async (_, url: string, type: 'torrent' | 'magnet' | 'direct', gameInfo: any) => {
  return downloadManager.startDownload(url, type, gameInfo);
});

ipcMain.handle('get-download-progress', async (_, downloadId: string) => {
  return downloadManager.getProgress(downloadId);
});

ipcMain.handle('get-all-downloads', async () => {
  return downloadManager.getAllDownloads();
});

ipcMain.handle('get-active-download-ids', async () => {
  return downloadManager.getActiveDownloadIds();
});

ipcMain.handle('pause-download', async (_, downloadId: string) => {
  return downloadManager.pauseDownload(downloadId);
});

ipcMain.handle('resume-download', async (_, downloadId: string) => {
  return downloadManager.resumeDownload(downloadId);
});

ipcMain.handle('cancel-download', async (_, downloadId: string) => {
  return downloadManager.cancelDownload(downloadId);
});

ipcMain.handle('get-games', async () => {
  return gameLibrary.getGames();
});

ipcMain.handle('add-game', async (_, game: any) => {
  return gameLibrary.addGame(game);
});

ipcMain.handle('update-game', async (_, gameId: string, updates: any) => {
  return gameLibrary.updateGame(gameId, updates);
});

ipcMain.handle('delete-game', async (_, gameId: string) => {
  return gameLibrary.deleteGame(gameId);
});

ipcMain.handle('get-box-art', async (_, gameName: string, platform?: string) => {
  return gameLibrary.getBoxArt(gameName, platform);
});

ipcMain.handle('add-tag', async (_, gameId: string, tag: string) => {
  return gameLibrary.addTag(gameId, tag);
});

ipcMain.handle('remove-tag', async (_, gameId: string, tag: string) => {
  return gameLibrary.removeTag(gameId, tag);
});

ipcMain.handle('get-all-tags', async () => {
  return gameLibrary.getAllTags();
});
