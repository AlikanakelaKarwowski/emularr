import { useState, useEffect } from 'react';
import { Pause, Play, X, Loader2 } from 'lucide-react';

interface DownloadProgress {
  downloadId: string;
  gameInfo: any;
  type: 'direct';
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

// Types are now in src/electron.d.ts

export default function DownloadsView() {
  const [downloads, setDownloads] = useState<DownloadProgress[]>([]);
  const [activeDownloadIds, setActiveDownloadIds] = useState<Set<string>>(new Set());

  // Load all downloads on mount and periodically check for new ones
  useEffect(() => {
    const loadAllDownloads = async () => {
      if (!window.electronAPI) return;
      
      try {
        // Get all downloads from the download manager
        const allDownloads = await window.electronAPI.getAllDownloads();
        if (allDownloads && Array.isArray(allDownloads)) {
          setDownloads(allDownloads);
          
          // Update active download IDs
          const activeIds = allDownloads
            .filter(d => d.status === 'downloading' || d.status === 'paused')
            .map(d => d.downloadId);
          setActiveDownloadIds(new Set(activeIds));
        }
      } catch (error) {
        console.error('Error loading downloads:', error);
      }
    };

    // Load immediately
    loadAllDownloads();

    // Check for new downloads every 2 seconds
    const checkInterval = setInterval(loadAllDownloads, 2000);
    return () => clearInterval(checkInterval);
  }, []);

  useEffect(() => {
    // Poll for download progress updates
    const interval = setInterval(async () => {
      if (activeDownloadIds.size === 0) return;
      if (!window.electronAPI) return;

      const updates: DownloadProgress[] = [];
      
      for (const downloadId of activeDownloadIds) {
        try {
          const progress = await window.electronAPI.getDownloadProgress(downloadId);
          if (progress) {
            updates.push(progress);
            if (progress.status === 'completed' || progress.status === 'error') {
              setActiveDownloadIds((prev) => {
                const next = new Set(prev);
                next.delete(downloadId);
                return next;
              });
            }
          } else {
            // Download no longer exists, remove from active
            setActiveDownloadIds((prev) => {
              const next = new Set(prev);
              next.delete(downloadId);
              return next;
            });
          }
        } catch (error) {
          console.error('Error fetching progress:', error);
        }
      }

      if (updates.length > 0) {
        setDownloads((prev) => {
          const downloadMap = new Map(prev.map(d => [d.downloadId, d]));
          updates.forEach(update => downloadMap.set(update.downloadId, update));
          return Array.from(downloadMap.values());
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [activeDownloadIds]);

  const handlePause = async (downloadId: string) => {
    try {
      await window.electronAPI.pauseDownload(downloadId);
      // Refresh downloads to get updated status
      const allDownloads = await window.electronAPI.getAllDownloads();
      if (allDownloads && Array.isArray(allDownloads)) {
        setDownloads(allDownloads);
      }
    } catch (error) {
      console.error('Error pausing download:', error);
    }
  };

  const handleResume = async (downloadId: string) => {
    try {
      await window.electronAPI.resumeDownload(downloadId);
      // Refresh downloads to get updated status
      const allDownloads = await window.electronAPI.getAllDownloads();
      if (allDownloads && Array.isArray(allDownloads)) {
        setDownloads(allDownloads);
      }
    } catch (error) {
      console.error('Error resuming download:', error);
    }
  };

  const handleCancel = async (downloadId: string) => {
    try {
      await window.electronAPI.cancelDownload(downloadId);
      // Remove from active downloads immediately
      setActiveDownloadIds((prev) => {
        const next = new Set(prev);
        next.delete(downloadId);
        return next;
      });
      // Refresh downloads to get updated status
      const allDownloads = await window.electronAPI.getAllDownloads();
      if (allDownloads && Array.isArray(allDownloads)) {
        setDownloads(allDownloads);
      } else {
        // If download was removed, filter it out
        setDownloads((prev) => prev.filter(d => d.downloadId !== downloadId));
      }
    } catch (error) {
      console.error('Error cancelling download:', error);
    }
  };

  const formatSpeed = (bytes: number): string => {
    if (bytes === 0) return '0 B/s';
    const k = 1024;
    const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds) || seconds < 0) return '--:--';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const downloadArray = downloads;

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="p-6 border-b border-gray-700">
        <h2 className="text-2xl font-bold">Downloads</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {downloadArray.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>No active downloads</p>
          </div>
        ) : (
          <div className="space-y-4">
            {downloadArray.map((download) => (
              <div
                key={download.downloadId}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700"
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{download.gameInfo.name}</h3>
                    <p className="text-sm text-gray-400">
                      {download.gameInfo.source} • {download.type}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {download.status === 'downloading' && (
                      <button
                        onClick={() => handlePause(download.downloadId)}
                        className="p-2 hover:bg-gray-700 rounded"
                      >
                        <Pause className="w-5 h-5" />
                      </button>
                    )}
                    {download.status === 'paused' && (
                      <button
                        onClick={() => handleResume(download.downloadId)}
                        className="p-2 hover:bg-gray-700 rounded"
                      >
                        <Play className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleCancel(download.downloadId)}
                      className="p-2 hover:bg-gray-700 rounded"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="flex justify-between text-sm mb-1">
                    <span>
                      {download.status === 'completed'
                        ? 'Completed'
                        : download.status === 'error'
                        ? 'Error'
                        : download.status === 'paused'
                        ? 'Paused'
                        : 'Downloading'}
                    </span>
                    <span>{Math.round(download.progress * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-primary-500 h-2 rounded-full transition-all"
                      style={{ width: `${download.progress * 100}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 text-sm text-gray-400">
                  <div>
                    <span className="block">Speed</span>
                    <span className="text-white">
                      {download.status === 'downloading'
                        ? formatSpeed(download.downloadSpeed)
                        : '--'}
                    </span>
                  </div>
                  <div>
                    <span className="block">Time Remaining</span>
                    <span className="text-white">
                      {download.status === 'downloading'
                        ? formatTime(download.timeRemaining)
                        : '--'}
                    </span>
                  </div>
                </div>

                {download.files && download.files.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <p className="text-sm text-gray-400 mb-2">Files:</p>
                    <div className="space-y-1">
                      {download.files.map((file, index) => (
                        <div key={index} className="text-xs text-gray-500">
                          {file.name} ({Math.round(file.progress * 100)}%)
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {download.error && (
                  <div className="mt-3 pt-3 border-t border-gray-700">
                    <p className="text-sm text-red-400">Error: {download.error}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
