import Store from 'electron-store';
import * as path from 'path';
import { app } from 'electron';

interface Config {
  downloadPath: string;
  defaultPlatform?: string;
  autoStartDownloads?: boolean;
  maxConcurrentDownloads?: number;
}

const defaultConfig: Config = {
  downloadPath: path.join(app.getPath('documents'), 'Emularr', 'Games'),
  autoStartDownloads: true,
  maxConcurrentDownloads: 3,
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
};
