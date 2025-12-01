import { useState, useEffect } from 'react';
import { Search, Download, Library, Settings, Gamepad2 } from 'lucide-react';
import SearchView from './components/SearchView';
import DownloadsView from './components/DownloadsView';
import LibraryView from './components/LibraryView';
import SettingsView from './components/SettingsView';

type View = 'search' | 'downloads' | 'library' | 'settings';

function App() {
  const [currentView, setCurrentView] = useState<View>('search');
  const [electronReady, setElectronReady] = useState(false);
  const [electronError, setElectronError] = useState<string | null>(null);

  useEffect(() => {
    console.log('App: Component mounted');
    console.log('App: window.electronAPI exists:', !!(window as any).electronAPI);
    
    // Always render immediately, check for electronAPI in background
    setElectronReady(true);
    
    // Check if electronAPI is available
    if ((window as any).electronAPI) {
      console.log('App: electronAPI is available');
    } else {
      console.log('App: electronAPI not available, checking periodically...');
      // In Electron, wait a bit for preload script to load
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds at 100ms intervals
      
      const checkInterval = setInterval(() => {
        attempts++;
        if ((window as any).electronAPI) {
          console.log('App: electronAPI became available');
          clearInterval(checkInterval);
        } else if (attempts >= maxAttempts) {
          console.warn('App: electronAPI not available after timeout');
          setElectronError('Electron API not available. Some features may not work.');
          clearInterval(checkInterval);
        }
      }, 100);
      
      return () => clearInterval(checkInterval);
    }
  }, []);

  // Always render the app, even if electronAPI isn't ready
  // We'll show a warning banner if needed

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {electronError && (
        <div className="absolute top-0 left-0 right-0 bg-yellow-600 text-white p-2 text-center text-sm z-50">
          {electronError}
        </div>
      )}
      {/* Sidebar */}
      <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-8 h-8 text-primary-500" />
            <h1 className="text-2xl font-bold">Emularr</h1>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setCurrentView('search')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentView === 'search'
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Search className="w-5 h-5" />
            <span>Search</span>
          </button>
          <button
            onClick={() => setCurrentView('downloads')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentView === 'downloads'
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Download className="w-5 h-5" />
            <span>Downloads</span>
          </button>
          <button
            onClick={() => setCurrentView('library')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentView === 'library'
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Library className="w-5 h-5" />
            <span>Library</span>
          </button>
          <button
            onClick={() => setCurrentView('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              currentView === 'settings'
                ? 'bg-primary-600 text-white'
                : 'text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>Settings</span>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {currentView === 'search' && <SearchView />}
        {currentView === 'downloads' && <DownloadsView />}
        {currentView === 'library' && <LibraryView />}
        {currentView === 'settings' && <SettingsView />}
      </div>
    </div>
  );
}

export default App;
