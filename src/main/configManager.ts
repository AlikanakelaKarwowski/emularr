import Store from 'electron-store';
import * as path from 'path';
import { app } from 'electron';

interface Config {
  downloadPath: string;
  defaultPlatform?: string;
  autoStartDownloads?: boolean;
  maxConcurrentDownloads?: number;
  downloadThreads?: number; // Number of parallel chunks for multi-threaded downloads
}

const defaultConfig: Config = {
  downloadPath: path.join(app.getPath('documents'), 'Emularr', 'Games'),
  autoStartDownloads: true,
  maxConcurrentDownloads: 3,
  downloadThreads: 8, // Default to 8 parallel chunks
};

const store = new Store<Config>({
  name: 'config',
  defaults: defaultConfig,
});

export const configManager = {
  getConfig(): Config {
    return store.store;
  },

  setConfig(config: Partial<Config>): void {
    store.set(config);
  },

  getDownloadPath(): string {
    return store.get('downloadPath', defaultConfig.downloadPath);
  },

  setDownloadPath(path: string): void {
    store.set('downloadPath', path);
  },

  getDownloadThreads(): number {
    return store.get('downloadThreads', defaultConfig.downloadThreads || 8);
  },

  setDownloadThreads(threads: number): void {
    store.set('downloadThreads', threads);
  },
};
