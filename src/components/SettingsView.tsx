import { useState, useEffect } from 'react';
import { FolderOpen, Save } from 'lucide-react';

interface Config {
  downloadPath: string;
  defaultPlatform?: string;
  autoStartDownloads?: boolean;
  maxConcurrentDownloads?: number;
}

// Types are now in src/electron.d.ts

export default function SettingsView() {
  const [config, setConfig] = useState<Config>({
    downloadPath: '',
    autoStartDownloads: true,
    maxConcurrentDownloads: 3,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }
    try {
      const currentConfig = await window.electronAPI.getConfig();
      setConfig(currentConfig);
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const handleSelectDirectory = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }
    try {
      const path = await window.electronAPI.selectDirectory();
      if (path) {
        setConfig({ ...config, downloadPath: path });
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
    }
  };

  const handleSave = async () => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      return;
    }
    try {
      await window.electronAPI.setConfig(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error('Error saving config:', error);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="p-6 border-b border-gray-700">
        <h2 className="text-2xl font-bold">Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-semibold mb-4">Download Settings</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Download Path
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={config.downloadPath}
                    readOnly
                    className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  />
                  <button
                    onClick={handleSelectDirectory}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center gap-2"
                  >
                    <FolderOpen className="w-5 h-5" />
                    Browse
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Max Concurrent Downloads
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={config.maxConcurrentDownloads || 3}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      maxConcurrentDownloads: parseInt(e.target.value) || 3,
                    })
                  }
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoStart"
                  checked={config.autoStartDownloads || false}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      autoStartDownloads: e.target.checked,
                    })
                  }
                  className="w-4 h-4 text-primary-600 bg-gray-700 border-gray-600 rounded focus:ring-primary-500"
                />
                <label htmlFor="autoStart" className="text-sm">
                  Auto-start downloads when added
                </label>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              className="px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              {saved ? 'Saved!' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
