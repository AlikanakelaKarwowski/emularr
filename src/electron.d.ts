export interface ElectronAPI {
  getConfig: () => Promise<any>;
  setConfig: (config: any) => Promise<void>;
  selectDirectory: () => Promise<string | null>;
  searchGames: (query: string) => Promise<any[]>;
  startDownload: (url: string, type: 'torrent' | 'magnet' | 'direct', gameInfo: any) => Promise<string>;
  getDownloadProgress: (downloadId: string) => Promise<any>;
  getAllDownloads: () => Promise<any[]>;
  getActiveDownloadIds: () => Promise<string[]>;
  pauseDownload: (downloadId: string) => Promise<boolean>;
  resumeDownload: (downloadId: string) => Promise<boolean>;
  cancelDownload: (downloadId: string) => Promise<boolean>;
  getGames: () => Promise<any[]>;
  addGame: (game: any) => Promise<any>;
  updateGame: (gameId: string, updates: any) => Promise<any>;
  deleteGame: (gameId: string) => Promise<boolean>;
  getBoxArt: (gameName: string, platform?: string) => Promise<string | null>;
  addTag: (gameId: string, tag: string) => Promise<boolean>;
  removeTag: (gameId: string, tag: string) => Promise<boolean>;
  getAllTags: () => Promise<string[]>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
