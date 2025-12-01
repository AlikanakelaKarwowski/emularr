import WebTorrent from 'webtorrent';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import axios from 'axios';
import { configManager } from './configManager';
import { gameLibrary } from './gameLibrary';
import { FileExtractor } from './fileExtractor';

interface DownloadProgress {
  downloadId: string;
  gameInfo: any;
  type: 'torrent' | 'magnet' | 'direct';
  status: 'downloading' | 'paused' | 'completed' | 'error';
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  timeRemaining: number;
  peers?: number;
  seeders?: number;
  leechers?: number;
  files?: Array<{
    name: string;
    length: number;
    progress: number;
  }>;
  error?: string;
}

import type { Torrent } from 'webtorrent';

class DownloadManager {
  private downloads: Map<string, DownloadProgress> = new Map();
  private client: WebTorrent;
  private activeTorrents: Map<string, Torrent> = new Map();
  private activeDirectDownloads: Map<string, any> = new Map();

  constructor() {
    this.client = new WebTorrent();
  }

  async startDownload(
    url: string,
    type: 'torrent' | 'magnet' | 'direct',
    gameInfo: any
  ): Promise<string> {
    const downloadId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const downloadPath = configManager.getDownloadPath();

    // Ensure download directory exists
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    const progress: DownloadProgress = {
      downloadId,
      gameInfo,
      type,
      status: 'downloading',
      progress: 0,
      downloadSpeed: 0,
      uploadSpeed: 0,
      timeRemaining: 0,
    };

    this.downloads.set(downloadId, progress);

    try {
      if (type === 'torrent' || type === 'magnet') {
        await this.startTorrentDownload(downloadId, url, downloadPath, progress);
      } else {
        await this.startDirectDownload(downloadId, url, downloadPath, progress);
      }
    } catch (error: any) {
      progress.status = 'error';
      progress.error = error.message;
      this.downloads.set(downloadId, progress);
    }

    return downloadId;
  }

  private async startTorrentDownload(
    downloadId: string,
    url: string,
    downloadPath: string,
    progress: DownloadProgress
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const torrent = this.client.add(url, { path: downloadPath }, (torrent: Torrent) => {
        torrent.on('download', () => {
          progress.progress = torrent.progress;
          progress.downloadSpeed = torrent.downloadSpeed;
          progress.uploadSpeed = torrent.uploadSpeed;
          progress.timeRemaining = torrent.timeRemaining;
          progress.peers = torrent.numPeers;
          progress.seeders = torrent.numPeers;
          progress.leechers = torrent.numPeers;
          progress.files = torrent.files.map((file) => ({
            name: file.name,
            length: file.length,
            progress: file.progress,
          }));
          this.downloads.set(downloadId, progress);
        });

        torrent.on('done', async () => {
          progress.status = 'completed';
          progress.progress = 1;
          progress.downloadSpeed = 0;
          progress.timeRemaining = 0;
          this.downloads.set(downloadId, progress);
          this.activeTorrents.delete(downloadId);
          
          // Handle extraction for torrent downloads
          let finalPath = downloadPath;
          let extracted = false;
          
          if (torrent.files.length > 0) {
            const mainFile = torrent.files[0];
            const mainFilePath = path.join(downloadPath, mainFile.path);
            
            if (FileExtractor.shouldExtract(mainFilePath) && fs.existsSync(mainFilePath)) {
              try {
                const gameName = progress.gameInfo.name || path.basename(mainFilePath, path.extname(mainFilePath));
                const extractDir = path.join(downloadPath, gameName);
                await FileExtractor.extractFile(mainFilePath, extractDir);
                extracted = true;
                finalPath = extractDir;
                console.log(`Extracted torrent file to ${extractDir}`);
              } catch (error: any) {
                console.error(`Extraction failed for torrent:`, error);
              }
            } else {
              finalPath = mainFilePath;
            }
          }
          
          this.addToLibrary(downloadId, progress, finalPath, extracted);
        });

        torrent.on('error', (error: Error) => {
          progress.status = 'error';
          progress.error = error.message;
          this.downloads.set(downloadId, progress);
          this.activeTorrents.delete(downloadId);
          reject(error);
        });
      });

      this.activeTorrents.set(downloadId, torrent);
      resolve();
    });
  }

  private async startDirectDownload(
    downloadId: string,
    url: string,
    downloadPath: string,
    progress: DownloadProgress
  ): Promise<void> {
    try {
      const httpAgent = new http.Agent({
        keepAlive: true,
        maxSockets: 1,
      });

      const httpsAgent = new https.Agent({
        keepAlive: true,
        maxSockets: 1,
        rejectUnauthorized: false,
      });

      const requestConfig = {
        method: 'GET',
        url: url,
        responseType: 'stream' as const,
        timeout: 0,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        httpAgent: url.startsWith('https') ? undefined : httpAgent,
        httpsAgent: url.startsWith('https') ? httpsAgent : undefined,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Accept-Encoding': 'identity',
          'Connection': 'keep-alive',
        },
        maxRedirects: 10,
        validateStatus: () => true,
      };

      // Log the request details for browser testing
      console.log('=== DOWNLOAD REQUEST DETAILS ===');
      console.log('URL:', requestConfig.url);
      console.log('Method:', requestConfig.method);
      console.log('Headers:', JSON.stringify(requestConfig.headers, null, 2));
      console.log('\n--- Browser/curl command ---');
      console.log(`curl -L "${requestConfig.url}" \\`);
      console.log(`  -H "User-Agent: ${requestConfig.headers['User-Agent']}" \\`);
      console.log(`  -H "Accept: ${requestConfig.headers['Accept']}" \\`);
      console.log(`  -H "Accept-Encoding: ${requestConfig.headers['Accept-Encoding']}" \\`);
      console.log(`  -H "Connection: ${requestConfig.headers['Connection']}" \\`);
      console.log(`  -o "download.file"`);
      console.log('\n--- Or open in browser ---');
      console.log(`Just paste this URL in your browser: ${requestConfig.url}`);
      console.log('================================\n');

      const response = await axios(requestConfig);

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const fileName = path.basename(url) || `${downloadId}.zip`;
      const filePath = path.join(downloadPath, fileName);
      
      const writer = fs.createWriteStream(filePath, {
        highWaterMark: 32 * 1024 * 1024, // 32MB buffer
      });

      const totalLength = parseInt(response.headers['content-length'] || '0', 10);
      
      // Track progress via async file stats - completely non-blocking
      let lastUpdateTime = Date.now();
      let lastDownloadedLength = 0;
      
      const updateProgress = () => {
        fs.stat(filePath, (err, stats) => {
          if (err || !stats) {
            // Retry if file doesn't exist yet or error
            if (progress.status === 'downloading') {
              setTimeout(updateProgress, 1000);
            }
            return;
          }
          
          const downloadedLength = stats.size;
          const now = Date.now();
          const timeDiff = (now - lastUpdateTime) / 1000;
          
          if (timeDiff >= 1.0) {
            progress.progress = totalLength > 0 ? downloadedLength / totalLength : 0;
            
            const bytesDiff = downloadedLength - lastDownloadedLength;
            progress.downloadSpeed = bytesDiff / timeDiff;
            
            if (progress.downloadSpeed > 0 && totalLength > 0) {
              const remainingBytes = totalLength - downloadedLength;
              progress.timeRemaining = remainingBytes / progress.downloadSpeed;
            }
            
            lastUpdateTime = now;
            lastDownloadedLength = downloadedLength;
            this.downloads.set(downloadId, progress);
          }
          
          // Schedule next update if still downloading
          if (progress.status === 'downloading') {
            setTimeout(updateProgress, 1000);
          }
        });
      };
      
      // Start progress tracking after a short delay
      setTimeout(updateProgress, 1000);

      // Pipe directly - NO data handlers to avoid backpressure
      response.data.pipe(writer);

      response.data.on('error', (error: Error) => {
        writer.destroy();
        progress.status = 'error';
        progress.error = error.message;
        this.downloads.set(downloadId, progress);
        this.activeDirectDownloads.delete(downloadId);
      });

      writer.on('finish', async () => {
        progress.status = 'completed';
        progress.progress = 1;
        progress.downloadSpeed = 0;
        progress.timeRemaining = 0;
        this.downloads.set(downloadId, progress);
        this.activeDirectDownloads.delete(downloadId);
        
        // Check if file should be extracted
        let finalPath = filePath;
        let extracted = false;
        let extractDir: string | undefined;

        if (FileExtractor.shouldExtract(filePath)) {
          try {
            console.log(`Extracting ${filePath}...`);
            const gameName = progress.gameInfo.name || path.basename(filePath, path.extname(filePath));
            extractDir = path.join(downloadPath, gameName);
            await FileExtractor.extractFile(filePath, extractDir);
            extracted = true;
            finalPath = extractDir;
            console.log(`Extracted to ${extractDir}`);
          } catch (error: any) {
            console.error(`Extraction failed, keeping original file:`, error);
          }
        }
        
        this.addToLibrary(downloadId, progress, finalPath, extracted);
      });

      writer.on('error', (error) => {
        response.data.destroy();
        progress.status = 'error';
        progress.error = error.message;
        this.downloads.set(downloadId, progress);
        this.activeDirectDownloads.delete(downloadId);
      });

      this.activeDirectDownloads.set(downloadId, { response, writer, httpAgent, httpsAgent });
    } catch (error: any) {
      console.error('Download error:', error);
      throw new Error(`Direct download failed: ${error.message}`);
    }
  }

  getProgress(downloadId: string): DownloadProgress | null {
    return this.downloads.get(downloadId) || null;
  }

  getAllDownloads(): DownloadProgress[] {
    return Array.from(this.downloads.values());
  }

  getActiveDownloadIds(): string[] {
    return Array.from(this.downloads.keys()).filter(id => {
      const progress = this.downloads.get(id);
      return progress && (progress.status === 'downloading' || progress.status === 'paused');
    });
  }

  pauseDownload(downloadId: string): boolean {
    const torrent = this.activeTorrents.get(downloadId);
    if (torrent) {
      torrent.pause();
      const progress = this.downloads.get(downloadId);
      if (progress) {
        progress.status = 'paused';
        this.downloads.set(downloadId, progress);
      }
      return true;
    }
    return false;
  }

  resumeDownload(downloadId: string): boolean {
    const torrent = this.activeTorrents.get(downloadId);
    if (torrent) {
      torrent.resume();
      const progress = this.downloads.get(downloadId);
      if (progress) {
        progress.status = 'downloading';
        this.downloads.set(downloadId, progress);
      }
      return true;
    }
    return false;
  }

  cancelDownload(downloadId: string): boolean {
    const torrent = this.activeTorrents.get(downloadId);
    if (torrent) {
      this.client.remove(torrent);
      this.activeTorrents.delete(downloadId);
      this.downloads.delete(downloadId);
      return true;
    }

    const direct = this.activeDirectDownloads.get(downloadId);
    if (direct) {
      if (direct.response) {
        direct.response.data.destroy();
      }
      if (direct.writer) {
        direct.writer.destroy();
      }
      if (direct.httpAgent) {
        direct.httpAgent.destroy();
      }
      if (direct.httpsAgent) {
        direct.httpsAgent.destroy();
      }
      this.activeDirectDownloads.delete(downloadId);
      this.downloads.delete(downloadId);
      return true;
    }

    return false;
  }

  private addToLibrary(
    downloadId: string,
    progress: DownloadProgress,
    filePath: string,
    extracted: boolean = false
  ): void {
    try {
      const fileName = path.basename(filePath);
      gameLibrary.addGame({
        name: progress.gameInfo.name,
        platform: progress.gameInfo.platform,
        filePath: filePath,
        downloadPath: configManager.getDownloadPath(),
        metadata: {
          originalFileName: fileName,
          extracted: extracted,
        },
        tags: [],
      });
      console.log(`Added game to library: ${progress.gameInfo.name} at ${filePath}`);
    } catch (error) {
      console.error('Error adding game to library:', error);
    }
  }
}

export const downloadManager = new DownloadManager();
