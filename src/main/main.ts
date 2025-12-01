// Polyfill for browser globals needed by undici/axios in Electron
if (typeof globalThis.File === 'undefined') {
  (globalThis as any).File = class File {
    constructor(public readonly name: string, public readonly size: number, public readonly type: string) {}
  };
}

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import { downloadManager } from './downloadManager';
import { configManager } from './configManager';
import { gameLibrary } from './gameLibrary';
import { searchEngines } from './searchEngines';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  // Preload path - should be in same directory as main.js
  let preloadPath = path.join(__dirname, 'preload.js');
  
  // If not found, try app.getAppPath()
  if (!require('fs').existsSync(preloadPath)) {
    const appPath = app.getAppPath();
    preloadPath = path.join(appPath, 'dist', 'preload.js');
    
    if (!require('fs').existsSync(preloadPath) && process.resourcesPath) {
      preloadPath = path.join(process.resourcesPath, 'app', 'dist', 'preload.js');
    }
  }
  
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
      webSecurity: false, // Disable web security to allow local file loading
      allowRunningInsecureContent: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });
  
  // Log all console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer ${level}]:`, message);
  });
  
  // Log page errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Page failed to load:', errorCode, errorDescription, validatedURL);
  });
  
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Render process gone:', details);
  });
  
  mainWindow.webContents.on('unresponsive', () => {
    console.error('Page became unresponsive');
  });
  
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page finished loading successfully');
    // Inject error handler to catch JS errors
    mainWindow?.webContents.executeJavaScript(`
      window.addEventListener('error', (e) => {
        console.error('Global error:', e.message, e.filename, e.lineno, e.colno, e.error);
      });
      window.addEventListener('unhandledrejection', (e) => {
        console.error('Unhandled promise rejection:', e.reason);
      });
    `).catch(err => console.error('Failed to inject error handler:', err));
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
    // In production, the renderer is in dist/renderer
    // When packaged with electron-packager:
    // - __dirname is app.asar/dist (where main.js is)
    // - app.getAppPath() returns the path to app.asar
    // So the renderer is at app.asar/dist/renderer/index.html
    const fs = require('fs');
    const appPath = app.getAppPath();
    
    // __dirname is app.asar/dist in packaged app, so renderer is at __dirname/renderer/index.html
    // loadFile handles asar paths correctly, so we can use it directly
    const rendererPath = path.join(__dirname, 'renderer', 'index.html');
    
    console.log('Production mode - Loading renderer');
    console.log('app.getAppPath():', appPath);
    console.log('__dirname:', __dirname);
    console.log('Renderer path:', rendererPath);
    
    // Try loading the file - loadFile handles asar archives correctly
    mainWindow?.loadFile(rendererPath).catch((error: any) => {
      console.error('Error loading renderer file:', error);
      // Try alternative path
      const altPath = path.join(appPath, 'dist', 'renderer', 'index.html');
      console.log('Trying alternative path:', altPath);
      mainWindow?.loadFile(altPath).catch((altError: any) => {
        console.error('Alternative path also failed:', altError);
        // Show error page with debugging info
        const fs = require('fs');
        let debugInfo = `<p>app.getAppPath(): ${appPath}</p><p>__dirname: ${__dirname}</p><p>Tried: ${rendererPath}</p><p>Alternative: ${altPath}</p>`;
        try {
          // Try to list directories (this might fail with asar, but worth trying)
          const dirContents = fs.readdirSync(__dirname);
          debugInfo += `<p>Contents of __dirname: ${dirContents.join(', ')}</p>`;
          // Check if renderer directory exists
          const rendererDir = path.join(__dirname, 'renderer');
          if (fs.existsSync(rendererDir)) {
            const rendererContents = fs.readdirSync(rendererDir);
            debugInfo += `<p>Contents of renderer dir: ${rendererContents.join(', ')}</p>`;
          }
        } catch (e) {
          debugInfo += `<p>Could not list __dirname contents: ${e}</p>`;
        }
        mainWindow?.loadURL('data:text/html,<html><body style="font-family: Arial; padding: 20px;"><h1>Error: Could not load renderer</h1><p>Renderer file not found.</p>' + debugInfo + '</body></html>');
      });
    });
    
    // Always open dev tools temporarily to debug
    mainWindow?.webContents.openDevTools();
    
    mainWindow?.show();
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

ipcMain.handle('start-download', async (_, url: string, type: 'direct', gameInfo: any) => {
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

ipcMain.handle('open-file-location', async (_, filePath: string) => {
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Check if path exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File or folder does not exist: ${filePath}`);
    }
    
    // Get file stats
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      // If it's a directory, open it directly
      const error = await shell.openPath(filePath);
      if (error) {
        throw new Error(`Failed to open directory: ${error}`);
      }
    } else {
      // If it's a file, show the folder containing the file and highlight the file
      shell.showItemInFolder(filePath);
    }
    
    return true;
  } catch (error: any) {
    console.error('Error opening file location:', error);
    throw error;
  }
});
