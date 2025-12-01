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
  type: 'direct';
  status: 'downloading' | 'paused' | 'completed' | 'error';
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  timeRemaining: number;
  error?: string;
}

interface ChunkInfo {
  start: number;
  end: number;
  downloaded: number;
  writer?: fs.WriteStream;
  promise?: Promise<void>;
  response?: any;
  cancelled?: boolean;
}

interface DirectDownloadInfo {
  response?: any;
  writer?: fs.WriteStream;
  httpAgent?: http.Agent;
  httpsAgent?: https.Agent;
  chunks?: ChunkInfo[];
  chunkPromises?: Promise<void>[];
  filePath?: string;
  url?: string;
  downloadPath?: string;
  totalLength?: number;
  numThreads?: number;
  cancelled?: boolean;
  paused?: boolean;
}

class DownloadManager {
  private downloads: Map<string, DownloadProgress> = new Map();
  private activeDirectDownloads: Map<string, DirectDownloadInfo> = new Map();
  private activeChunks: Map<string, ChunkInfo[]> = new Map();

  async startDownload(
    url: string,
    type: 'direct',
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

    // Start download in background - don't await it
    // This allows the IPC handler to return immediately with the downloadId
    this.startDirectDownload(downloadId, url, downloadPath, progress).catch((error: any) => {
      progress.status = 'error';
      progress.error = error.message;
      this.downloads.set(downloadId, progress);
      console.error('Direct download error:', error);
    });

    return downloadId;
  }

  private async checkRangeSupport(url: string): Promise<{ supportsRange: boolean; contentLength: number }> {
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

      const headResponse = await axios.head(url, {
        httpAgent: url.startsWith('https') ? undefined : httpAgent,
        httpsAgent: url.startsWith('https') ? httpsAgent : undefined,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
        },
        maxRedirects: 10,
        timeout: 10000,
        validateStatus: () => true,
      });

      const contentLength = parseInt(headResponse.headers['content-length'] || '0', 10);
      const acceptRanges = headResponse.headers['accept-ranges'];
      const supportsRange = acceptRanges === 'bytes' && contentLength > 0;

      return { supportsRange, contentLength };
    } catch (error) {
      console.warn('Failed to check range support, will use single-threaded download:', error);
      return { supportsRange: false, contentLength: 0 };
    }
  }

  private async downloadChunk(
    downloadId: string,
    url: string,
    chunk: ChunkInfo,
    filePath: string,
    progress: DownloadProgress,
    totalLength: number
  ): Promise<void> {
    // Check if download was cancelled
    const directDownload = this.activeDirectDownloads.get(downloadId);
    if (directDownload?.cancelled || chunk.cancelled) {
      throw new Error('Download cancelled');
    }
    const httpAgent = new http.Agent({
      keepAlive: true,
      maxSockets: 10,
    });

    const httpsAgent = new https.Agent({
      keepAlive: true,
      maxSockets: 10,
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
        'Range': `bytes=${chunk.start}-${chunk.end}`,
      },
      maxRedirects: 10,
      validateStatus: (status: number) => status >= 200 && status < 300 || status === 206,
    };

    try {
      const response = await axios(requestConfig);

      // Check again if cancelled after getting response
      const directDownload = this.activeDirectDownloads.get(downloadId);
      if (directDownload?.cancelled || chunk.cancelled) {
        response.data.destroy();
        throw new Error('Download cancelled');
      }

      if (response.status !== 206 && response.status !== 200) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Store response for cancellation
      chunk.response = response;

      // Open file descriptor for writing at the correct position
      const fd = await new Promise<number>((resolve, reject) => {
        fs.open(filePath, 'r+', (err, fileDescriptor) => {
          if (err) reject(err);
          else resolve(fileDescriptor);
        });
      });
      
      // Create write stream starting at chunk position
      const writer = fs.createWriteStream(filePath, {
        fd: fd,
        start: chunk.start,
        highWaterMark: 16 * 1024 * 1024, // 16MB buffer per chunk
        autoClose: true, // Close the fd when done
      });

      chunk.writer = writer;

      let chunkDownloaded = 0;

      response.data.on('data', (data: Buffer) => {
        // Check if cancelled during download
        if (chunk.cancelled || directDownload?.cancelled) {
          response.data.destroy();
          writer.destroy();
          return;
        }
        chunkDownloaded += data.length;
        chunk.downloaded = chunkDownloaded;
      });

      response.data.pipe(writer);

      await new Promise<void>((resolve, reject) => {
        // Check if cancelled before waiting
        if (chunk.cancelled || directDownload?.cancelled) {
          response.data.destroy();
          writer.destroy();
          reject(new Error('Download cancelled'));
          return;
        }

        writer.on('finish', () => {
          resolve();
        });

        writer.on('error', (error) => {
          response.data.destroy();
          reject(error);
        });

        response.data.on('error', (error: Error) => {
          writer.destroy();
          reject(error);
        });
      });
    } catch (error: any) {
      if (error.message === 'Download cancelled') {
        throw error;
      }
      console.error(`Chunk download error (${chunk.start}-${chunk.end}):`, error);
      throw error;
    }
  }

  private async startDirectDownload(
    downloadId: string,
    url: string,
    downloadPath: string,
    progress: DownloadProgress
  ): Promise<void> {
    try {
      // Log the request details for browser testing
      console.log('=== DOWNLOAD REQUEST DETAILS ===');
      console.log('URL:', url);
      console.log('Method: GET');
      console.log('\n--- Browser/curl command ---');
      console.log(`curl -L "${url}" \\`);
      console.log(`  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \\`);
      console.log(`  -H "Accept: */*" \\`);
      console.log(`  -H "Accept-Encoding: identity" \\`);
      console.log(`  -H "Connection: keep-alive" \\`);
      console.log(`  -o "download.file"`);
      console.log('\n--- Or open in browser ---');
      console.log(`Just paste this URL in your browser: ${url}`);
      console.log('================================\n');

      // Check if server supports range requests
      const { supportsRange, contentLength: totalLength } = await this.checkRangeSupport(url);
      const numThreads = configManager.getDownloadThreads();

      const fileName = path.basename(url) || `${downloadId}.zip`;
      const filePath = path.join(downloadPath, fileName);

      // Pre-allocate file if we know the size
      if (totalLength > 0) {
        const fd = fs.openSync(filePath, 'w');
        fs.ftruncateSync(fd, totalLength);
        fs.closeSync(fd);
      }

      // Store download info for resume capability
      const directDownload: DirectDownloadInfo = {
        url: url,
        filePath: filePath,
        downloadPath: downloadPath,
        totalLength: totalLength,
        numThreads: numThreads,
        cancelled: false,
        paused: false,
      };
      this.activeDirectDownloads.set(downloadId, directDownload);

      if (supportsRange && totalLength > 0 && numThreads > 1) {
        // Multi-threaded download
        console.log(`Starting multi-threaded download with ${numThreads} chunks (${(totalLength / 1024 / 1024).toFixed(2)} MB)`);
        await this.startMultiThreadedDownload(downloadId, url, filePath, progress, totalLength, numThreads);
      } else {
        // Single-threaded download (fallback)
        console.log('Using single-threaded download (range requests not supported or file size unknown)');
        await this.startSingleThreadedDownload(downloadId, url, filePath, progress);
      }

      // Check if file should be extracted
      let finalPath = filePath;
      let extracted = false;

      if (FileExtractor.shouldExtract(filePath)) {
        try {
          console.log(`Extracting ${filePath}...`);
          const gameName = progress.gameInfo.name || path.basename(filePath, path.extname(filePath));
          const extractDir = path.join(downloadPath, gameName);
          await FileExtractor.extractFile(filePath, extractDir);
          extracted = true;
          finalPath = extractDir;
          console.log(`Extracted to ${extractDir}`);
        } catch (error: any) {
          console.error(`Extraction failed, keeping original file:`, error);
        }
      }

      progress.status = 'completed';
      progress.progress = 1;
      progress.downloadSpeed = 0;
      progress.timeRemaining = 0;
      this.downloads.set(downloadId, progress);
      this.activeDirectDownloads.delete(downloadId);
      this.activeChunks.delete(downloadId);

      this.addToLibrary(downloadId, progress, finalPath, extracted);
    } catch (error: any) {
      console.error('Download error:', error);
      progress.status = 'error';
      progress.error = error.message;
      this.downloads.set(downloadId, progress);
      this.activeDirectDownloads.delete(downloadId);
      this.activeChunks.delete(downloadId);
      throw new Error(`Direct download failed: ${error.message}`);
    }
  }

  private async startMultiThreadedDownload(
    downloadId: string,
    url: string,
    filePath: string,
    progress: DownloadProgress,
    totalLength: number,
    numThreads: number
  ): Promise<void> {
    // Calculate chunk sizes
    const chunkSize = Math.ceil(totalLength / numThreads);
    const chunks: ChunkInfo[] = [];

    for (let i = 0; i < numThreads; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize - 1, totalLength - 1);
      chunks.push({
        start,
        end,
        downloaded: 0,
      });
    }

    this.activeChunks.set(downloadId, chunks);

    // Update download info with chunks
    const directDownload = this.activeDirectDownloads.get(downloadId);
    if (directDownload) {
      directDownload.chunks = chunks;
      directDownload.cancelled = false;
      directDownload.paused = false;
    } else {
      const newDirectDownload: DirectDownloadInfo = {
        chunks: chunks,
        filePath: filePath,
        cancelled: false,
        paused: false,
      };
      this.activeDirectDownloads.set(downloadId, newDirectDownload);
    }

    // Track progress
    let lastUpdateTime = Date.now();
    let lastDownloadedLength = 0;

    const updateProgress = () => {
      // Check if cancelled
      const downloadInfo = this.activeDirectDownloads.get(downloadId);
      if (!downloadInfo || downloadInfo.cancelled || progress.status !== 'downloading') {
        return;
      }

      const totalDownloaded = chunks.reduce((sum, chunk) => sum + chunk.downloaded, 0);
      const now = Date.now();
      const timeDiff = (now - lastUpdateTime) / 1000;

      if (timeDiff >= 0.5) {
        progress.progress = totalLength > 0 ? totalDownloaded / totalLength : 0;

        const bytesDiff = totalDownloaded - lastDownloadedLength;
        progress.downloadSpeed = bytesDiff / timeDiff;

        if (progress.downloadSpeed > 0 && totalLength > 0) {
          const remainingBytes = totalLength - totalDownloaded;
          progress.timeRemaining = remainingBytes / progress.downloadSpeed;
        }

        lastUpdateTime = now;
        lastDownloadedLength = totalDownloaded;
        this.downloads.set(downloadId, progress);
      }

      if (progress.status === 'downloading' && downloadInfo && !downloadInfo.cancelled) {
        setTimeout(updateProgress, 500);
      }
    };

    // Start progress tracking
    setTimeout(updateProgress, 500);

    // Download all chunks in parallel
    const chunkPromises = chunks.map((chunk) =>
      this.downloadChunk(downloadId, url, chunk, filePath, progress, totalLength)
    );

    const currentDownload = this.activeDirectDownloads.get(downloadId);
    if (currentDownload) {
      currentDownload.chunkPromises = chunkPromises;
    }

    try {
      await Promise.all(chunkPromises);
    } catch (error: any) {
      if (error.message === 'Download cancelled') {
        throw error;
      }
      throw error;
    }
  }

  private async startSingleThreadedDownload(
    downloadId: string,
    url: string,
    filePath: string,
    progress: DownloadProgress
  ): Promise<void> {
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

    const response = await axios(requestConfig);

    if (response.status >= 400) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const writer = fs.createWriteStream(filePath, {
      highWaterMark: 32 * 1024 * 1024, // 32MB buffer
    });

    const totalLength = parseInt(response.headers['content-length'] || '0', 10);

    // Update download info with response and writer
    const directDownload = this.activeDirectDownloads.get(downloadId);
    if (directDownload) {
      directDownload.response = response;
      directDownload.writer = writer;
      directDownload.httpAgent = httpAgent;
      directDownload.httpsAgent = httpsAgent;
      directDownload.cancelled = false;
      directDownload.paused = false;
    } else {
      const newDirectDownload: DirectDownloadInfo = {
        response: response,
        writer: writer,
        httpAgent: httpAgent,
        httpsAgent: httpsAgent,
        filePath: filePath,
        cancelled: false,
        paused: false,
      };
      this.activeDirectDownloads.set(downloadId, newDirectDownload);
    }

    // Track progress via async file stats
    let lastUpdateTime = Date.now();
    let lastDownloadedLength = 0;

    const updateProgress = () => {
      // Check if cancelled
      const currentDownload = this.activeDirectDownloads.get(downloadId);
      if (!currentDownload || currentDownload.cancelled || progress.status !== 'downloading') {
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats) {
          const currentDownload = this.activeDirectDownloads.get(downloadId);
          if (progress.status === 'downloading' && currentDownload && !currentDownload.cancelled) {
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

        const currentDownload = this.activeDirectDownloads.get(downloadId);
        if (progress.status === 'downloading' && currentDownload && !currentDownload.cancelled) {
          setTimeout(updateProgress, 1000);
        }
      });
    };

    setTimeout(updateProgress, 1000);

    response.data.pipe(writer);

    response.data.on('error', (error: Error) => {
      const currentDownload = this.activeDirectDownloads.get(downloadId);
      if (currentDownload && !currentDownload.cancelled) {
        writer.destroy();
        progress.status = 'error';
        progress.error = error.message;
        this.downloads.set(downloadId, progress);
        this.activeDirectDownloads.delete(downloadId);
      }
    });

    await new Promise<void>((resolve, reject) => {
      // Check if cancelled before waiting
      const currentDownload = this.activeDirectDownloads.get(downloadId);
      if (currentDownload && currentDownload.cancelled) {
        reject(new Error('Download cancelled'));
        return;
      }

      writer.on('finish', () => {
        const currentDownload = this.activeDirectDownloads.get(downloadId);
        if (currentDownload && !currentDownload.cancelled) {
          resolve();
        }
      });

      writer.on('error', (error) => {
        const currentDownload = this.activeDirectDownloads.get(downloadId);
        if (currentDownload && !currentDownload.cancelled) {
          response.data.destroy();
          reject(error);
        }
      });

      response.data.on('error', (error: Error) => {
        const currentDownload = this.activeDirectDownloads.get(downloadId);
        if (currentDownload && !currentDownload.cancelled) {
          writer.destroy();
          reject(error);
        }
      });
    });
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
    // For direct downloads, stop the download streams
    const direct = this.activeDirectDownloads.get(downloadId);
    if (direct) {
      const progress = this.downloads.get(downloadId);
      if (progress && progress.status === 'downloading') {
        // Mark as paused
        direct.paused = true;
        progress.status = 'paused';
        this.downloads.set(downloadId, progress);

        // Stop multi-threaded download
        if (direct.chunks) {
          direct.chunks.forEach((chunk) => {
            if (chunk.response) {
              chunk.response.data.destroy();
            }
            if (chunk.writer) {
              chunk.writer.destroy();
            }
          });
        }

        // Stop single-threaded download
        if (direct.response) {
          direct.response.data.destroy();
        }
        if (direct.writer) {
          direct.writer.destroy();
        }

        return true;
      }
    }

    return false;
  }

  resumeDownload(downloadId: string): boolean {
    // For direct downloads, restart from current position
    const direct = this.activeDirectDownloads.get(downloadId);
    if (direct && direct.paused) {
      const progress = this.downloads.get(downloadId);
      if (progress && progress.status === 'paused' && direct.url && direct.filePath) {
        // Restart the download from current position
        direct.paused = false;
        progress.status = 'downloading';
        this.downloads.set(downloadId, progress);

        // Restart the download asynchronously
        this.restartDirectDownload(
          downloadId,
          direct.url,
          direct.filePath,
          direct.downloadPath || '',
          progress,
          direct.totalLength || 0,
          direct.numThreads || 1
        ).catch((error: any) => {
          console.error('Error resuming download:', error);
          progress.status = 'error';
          progress.error = error.message;
          this.downloads.set(downloadId, progress);
        });

        return true;
      }
    }

    return false;
  }

  private async restartDirectDownload(
    downloadId: string,
    url: string,
    filePath: string,
    downloadPath: string,
    progress: DownloadProgress,
    totalLength: number,
    numThreads: number
  ): Promise<void> {
    try {
      // Get current file size to resume from
      let startPosition = 0;
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        startPosition = stats.size;
      }

      // If file is complete or we're at the end, we're done
      if (totalLength > 0 && startPosition >= totalLength) {
        progress.status = 'completed';
        progress.progress = 1;
        this.downloads.set(downloadId, progress);
        return;
      }

      // Check if server supports range requests
      const { supportsRange } = await this.checkRangeSupport(url);

      if (supportsRange && totalLength > 0 && numThreads > 1 && startPosition < totalLength) {
        // Resume multi-threaded download
        const remainingLength = totalLength - startPosition;
        await this.resumeMultiThreadedDownload(
          downloadId,
          url,
          filePath,
          progress,
          startPosition,
          totalLength,
          numThreads
        );
      } else if (supportsRange && totalLength > 0 && startPosition < totalLength) {
        // Resume single-threaded download with Range request
        await this.resumeSingleThreadedDownload(
          downloadId,
          url,
          filePath,
          progress,
          startPosition,
          totalLength
        );
      } else {
        // Can't resume, restart from beginning
        progress.status = 'error';
        progress.error = 'Cannot resume download (range requests not supported)';
        this.downloads.set(downloadId, progress);
      }
    } catch (error: any) {
      console.error('Error restarting download:', error);
      progress.status = 'error';
      progress.error = error.message;
      this.downloads.set(downloadId, progress);
      throw error;
    }
  }

  private async resumeMultiThreadedDownload(
    downloadId: string,
    url: string,
    filePath: string,
    progress: DownloadProgress,
    startPosition: number,
    totalLength: number,
    numThreads: number
  ): Promise<void> {
    const remainingLength = totalLength - startPosition;
    const chunkSize = Math.ceil(remainingLength / numThreads);
    const chunks: ChunkInfo[] = [];

    for (let i = 0; i < numThreads; i++) {
      const start = startPosition + (i * chunkSize);
      const end = Math.min(start + chunkSize - 1, totalLength - 1);
      if (start < totalLength) {
        chunks.push({
          start,
          end,
          downloaded: 0,
        });
      }
    }

    this.activeChunks.set(downloadId, chunks);

    const directDownload: DirectDownloadInfo = {
      chunks: chunks,
      filePath: filePath,
      url: url,
      totalLength: totalLength,
      numThreads: numThreads,
      cancelled: false,
      paused: false,
    };
    this.activeDirectDownloads.set(downloadId, directDownload);

    // Track progress
    let lastUpdateTime = Date.now();
    let lastDownloadedLength = startPosition;

    const updateProgress = () => {
      if (directDownload.cancelled || progress.status !== 'downloading') {
        return;
      }

      const totalDownloaded = startPosition + chunks.reduce((sum, chunk) => sum + chunk.downloaded, 0);
      const now = Date.now();
      const timeDiff = (now - lastUpdateTime) / 1000;

      if (timeDiff >= 0.5) {
        progress.progress = totalLength > 0 ? totalDownloaded / totalLength : 0;

        const bytesDiff = totalDownloaded - lastDownloadedLength;
        progress.downloadSpeed = bytesDiff / timeDiff;

        if (progress.downloadSpeed > 0 && totalLength > 0) {
          const remainingBytes = totalLength - totalDownloaded;
          progress.timeRemaining = remainingBytes / progress.downloadSpeed;
        }

        lastUpdateTime = now;
        lastDownloadedLength = totalDownloaded;
        this.downloads.set(downloadId, progress);
      }

      if (progress.status === 'downloading' && !directDownload.cancelled) {
        setTimeout(updateProgress, 500);
      }
    };

    setTimeout(updateProgress, 500);

    const chunkPromises = chunks.map((chunk) =>
      this.downloadChunk(downloadId, url, chunk, filePath, progress, totalLength)
    );

    directDownload.chunkPromises = chunkPromises;

    try {
      await Promise.all(chunkPromises);

      // Check if file should be extracted
      let finalPath = filePath;
      let extracted = false;

      if (FileExtractor.shouldExtract(filePath)) {
        try {
          console.log(`Extracting ${filePath}...`);
          const gameName = progress.gameInfo.name || path.basename(filePath, path.extname(filePath));
          const extractDir = path.join(path.dirname(filePath), gameName);
          await FileExtractor.extractFile(filePath, extractDir);
          extracted = true;
          finalPath = extractDir;
          console.log(`Extracted to ${extractDir}`);
        } catch (error: any) {
          console.error(`Extraction failed, keeping original file:`, error);
        }
      }

      progress.status = 'completed';
      progress.progress = 1;
      progress.downloadSpeed = 0;
      progress.timeRemaining = 0;
      this.downloads.set(downloadId, progress);
      this.activeDirectDownloads.delete(downloadId);
      this.activeChunks.delete(downloadId);

      this.addToLibrary(downloadId, progress, finalPath, extracted);
    } catch (error: any) {
      if (error.message !== 'Download cancelled') {
        throw error;
      }
    }
  }

  private async resumeSingleThreadedDownload(
    downloadId: string,
    url: string,
    filePath: string,
    progress: DownloadProgress,
    startPosition: number,
    totalLength: number
  ): Promise<void> {
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
        'Range': `bytes=${startPosition}-`,
      },
      maxRedirects: 10,
      validateStatus: () => true,
    };

    const response = await axios(requestConfig);

    if (response.status !== 206 && response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Open file for appending
    const writer = fs.createWriteStream(filePath, {
      flags: 'r+',
      start: startPosition,
      highWaterMark: 32 * 1024 * 1024,
    });

    const directDownload: DirectDownloadInfo = {
      response: response,
      writer: writer,
      httpAgent: httpAgent,
      httpsAgent: httpsAgent,
      filePath: filePath,
      url: url,
      totalLength: totalLength,
      cancelled: false,
      paused: false,
    };
    this.activeDirectDownloads.set(downloadId, directDownload);

    let lastUpdateTime = Date.now();
    let lastDownloadedLength = startPosition;

    const updateProgress = () => {
      if (directDownload.cancelled || progress.status !== 'downloading') {
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (err || !stats) {
          if (progress.status === 'downloading' && !directDownload.cancelled) {
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

        if (progress.status === 'downloading' && !directDownload.cancelled) {
          setTimeout(updateProgress, 1000);
        }
      });
    };

    setTimeout(updateProgress, 1000);

    response.data.pipe(writer);

    response.data.on('error', (error: Error) => {
      if (!directDownload.cancelled) {
        writer.destroy();
        progress.status = 'error';
        progress.error = error.message;
        this.downloads.set(downloadId, progress);
        this.activeDirectDownloads.delete(downloadId);
      }
    });

    await new Promise<void>((resolve, reject) => {
      if (directDownload.cancelled) {
        reject(new Error('Download cancelled'));
        return;
      }

      writer.on('finish', async () => {
        if (!directDownload.cancelled) {
          // Check if file should be extracted
          let finalPath = filePath;
          let extracted = false;

          if (FileExtractor.shouldExtract(filePath)) {
            try {
              console.log(`Extracting ${filePath}...`);
              const gameName = progress.gameInfo.name || path.basename(filePath, path.extname(filePath));
              const extractDir = path.join(path.dirname(filePath), gameName);
              await FileExtractor.extractFile(filePath, extractDir);
              extracted = true;
              finalPath = extractDir;
              console.log(`Extracted to ${extractDir}`);
            } catch (error: any) {
              console.error(`Extraction failed, keeping original file:`, error);
            }
          }

          progress.status = 'completed';
          progress.progress = 1;
          progress.downloadSpeed = 0;
          progress.timeRemaining = 0;
          this.downloads.set(downloadId, progress);
          this.activeDirectDownloads.delete(downloadId);

          this.addToLibrary(downloadId, progress, finalPath, extracted);
          resolve();
        }
      });

      writer.on('error', (error) => {
        if (!directDownload.cancelled) {
          response.data.destroy();
          reject(error);
        }
      });

      response.data.on('error', (error: Error) => {
        if (!directDownload.cancelled) {
          writer.destroy();
          reject(error);
        }
      });
    });
  }

  cancelDownload(downloadId: string): boolean {
    const direct = this.activeDirectDownloads.get(downloadId);
    if (direct) {
      // Mark as cancelled
      direct.cancelled = true;
      
      // Cancel multi-threaded download
      if (direct.chunks) {
        direct.chunks.forEach((chunk) => {
          chunk.cancelled = true;
          if (chunk.response) {
            chunk.response.data.destroy();
          }
          if (chunk.writer) {
            chunk.writer.destroy();
          }
        });
      }

      // Cancel single-threaded download
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

      // Delete the partial file
      if (direct.filePath && fs.existsSync(direct.filePath)) {
        try {
          fs.unlinkSync(direct.filePath);
          console.log(`Deleted partial file: ${direct.filePath}`);
        } catch (error: any) {
          console.error(`Failed to delete partial file: ${error.message}`);
        }
      }

      // Remove from downloads map
      this.downloads.delete(downloadId);
      this.activeDirectDownloads.delete(downloadId);
      this.activeChunks.delete(downloadId);
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
