import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (config: any) => ipcRenderer.invoke('set-config', config),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  searchGames: (query: string) => ipcRenderer.invoke('search-games', query),
  startDownload: (url: string, type: 'torrent' | 'magnet' | 'direct', gameInfo: any) =>
    ipcRenderer.invoke('start-download', url, type, gameInfo),
  getDownloadProgress: (downloadId: string) =>
    ipcRenderer.invoke('get-download-progress', downloadId),
  getAllDownloads: () => ipcRenderer.invoke('get-all-downloads'),
  getActiveDownloadIds: () => ipcRenderer.invoke('get-active-download-ids'),
  pauseDownload: (downloadId: string) => ipcRenderer.invoke('pause-download', downloadId),
  resumeDownload: (downloadId: string) => ipcRenderer.invoke('resume-download', downloadId),
  cancelDownload: (downloadId: string) => ipcRenderer.invoke('cancel-download', downloadId),
  getGames: () => ipcRenderer.invoke('get-games'),
  addGame: (game: any) => ipcRenderer.invoke('add-game', game),
  updateGame: (gameId: string, updates: any) => ipcRenderer.invoke('update-game', gameId, updates),
  deleteGame: (gameId: string) => ipcRenderer.invoke('delete-game', gameId),
  getBoxArt: (gameName: string, platform?: string) =>
    ipcRenderer.invoke('get-box-art', gameName, platform),
  addTag: (gameId: string, tag: string) => ipcRenderer.invoke('add-tag', gameId, tag),
  removeTag: (gameId: string, tag: string) => ipcRenderer.invoke('remove-tag', gameId, tag),
  getAllTags: () => ipcRenderer.invoke('get-all-tags'),
});
