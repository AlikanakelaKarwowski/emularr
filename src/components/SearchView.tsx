import { useState } from 'react';
import { Search as SearchIcon, Download, Loader2 } from 'lucide-react';
import { SearchResult } from '../types';

// Types are now in src/electron.d.ts

export default function SearchView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      setLoading(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    setLoading(true);
    try {
      const searchResults = await window.electronAPI.searchGames(query);
      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  };

  const handleDownload = async (result: SearchResult) => {
    if (!window.electronAPI) {
      console.error('electronAPI not available');
      alert('Electron API not available. Please restart the application.');
      return;
    }
    
    try {
      const downloadId = await window.electronAPI.startDownload(
        result.downloadUrl,
        result.type,
        {
          name: result.title,
          platform: result.platform,
          source: result.source,
        }
      );
      console.log('Download started:', downloadId);
      // Show success message
      alert(`Download started for ${result.title}`);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to start download. Please check the console for details.');
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="p-6 border-b border-gray-700">
        <h2 className="text-2xl font-bold mb-4">Search Games</h2>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for games..."
              className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <SearchIcon className="w-5 h-5" />
                Search
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {searching && results.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : results.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <SearchIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>Enter a search query to find games</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {results.map((result, index) => (
              <div
                key={index}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-primary-500 transition-colors"
              >
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-semibold text-lg flex-1">{result.title}</h3>
                  <span className="text-xs bg-gray-700 px-2 py-1 rounded">
                    {result.source}
                  </span>
                </div>
                {result.platform && (
                  <p className="text-sm text-gray-400 mb-2">Platform: {result.platform}</p>
                )}
                {result.size && (
                  <p className="text-sm text-gray-400 mb-2">Size: {result.size}</p>
                )}
                {result.seeders !== undefined && (
                  <div className="flex gap-4 text-sm text-gray-400 mb-3">
                    <span>Seeders: {result.seeders}</span>
                    {result.leechers !== undefined && (
                      <span>Leechers: {result.leechers}</span>
                    )}
                  </div>
                )}
                <button
                  onClick={() => handleDownload(result)}
                  className="w-full mt-3 px-4 py-2 bg-primary-600 hover:bg-primary-700 rounded-lg font-medium flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
