import { useState, useEffect } from 'react';
import { Heart, Filter, Grid, List, Star, Trash2 } from 'lucide-react';
import { Game } from '../types';

// Types are now in src/electron.d.ts

type ViewMode = 'grid' | 'list';
type SortBy = 'name' | 'platform' | 'genre' | 'releaseYear' | 'dateAdded';
type FilterBy = 'all' | 'favorites' | string;

export default function LibraryView() {
  const [games, setGames] = useState<Game[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    const gameList = await window.electronAPI.getGames();
    setGames(gameList);
  };

  const toggleFavorite = async (gameId: string, currentValue: boolean) => {
    await window.electronAPI.updateGame(gameId, { isFavorite: !currentValue });
    loadGames();
  };

  const handleDelete = async (gameId: string) => {
    const game = games.find(g => g.id === gameId);
    const gameName = game?.name || 'this game';
    
    if (confirm(`Are you sure you want to delete "${gameName}" from your library?`)) {
      try {
        if (!window.electronAPI) {
          console.error('electronAPI not available');
          return;
        }
        await window.electronAPI.deleteGame(gameId);
        loadGames();
      } catch (error) {
        console.error('Error deleting game:', error);
        alert('Failed to delete game. Please check the console for details.');
      }
    }
  };

  const filteredAndSortedGames = games
    .filter((game) => {
      if (filterBy === 'favorites' && !game.isFavorite) return false;
      if (filterBy !== 'all' && filterBy !== 'favorites' && game.platform !== filterBy)
        return false;
      if (searchQuery && !game.name.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'platform':
          return (a.platform || '').localeCompare(b.platform || '');
        case 'genre':
          return (a.genre || '').localeCompare(b.genre || '');
        case 'releaseYear':
          return (b.releaseYear || 0) - (a.releaseYear || 0);
        case 'dateAdded':
          return b.dateAdded - a.dateAdded;
        default:
          return 0;
      }
    });

  const platforms = Array.from(new Set(games.map((g) => g.platform).filter(Boolean)));

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <div className="p-6 border-b border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Game Library</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded ${viewMode === 'grid' ? 'bg-primary-600' : 'bg-gray-800'}`}
            >
              <Grid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded ${viewMode === 'list' ? 'bg-primary-600' : 'bg-gray-800'}`}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search library..."
            className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="name">Sort by Name</option>
            <option value="platform">Sort by Platform</option>
            <option value="genre">Sort by Genre</option>
            <option value="releaseYear">Sort by Year</option>
            <option value="dateAdded">Sort by Date Added</option>
          </select>
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as FilterBy)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">All Games</option>
            <option value="favorites">Favorites</option>
            {platforms.map((platform) => (
              <option key={platform} value={platform}>
                {platform}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filteredAndSortedGames.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>No games found</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filteredAndSortedGames.map((game) => (
              <div
                key={game.id}
                className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700 hover:border-primary-500 transition-colors group relative"
              >
                <div className="aspect-square bg-gray-700 relative">
                  {game.boxArtPath ? (
                    <img
                      src={`file://${game.boxArtPath}`}
                      alt={game.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500">
                      <Star className="w-12 h-12" />
                    </div>
                  )}
                  <div className="absolute top-2 right-2 flex gap-2">
                    <button
                      onClick={() => toggleFavorite(game.id, game.isFavorite || false)}
                      className={`p-2 rounded-full transition-colors ${
                        game.isFavorite
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-900/50 text-gray-400 hover:bg-gray-900/70'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${game.isFavorite ? 'fill-current' : ''}`}
                      />
                    </button>
                    <button
                      onClick={() => handleDelete(game.id)}
                      className="p-2 rounded-full bg-gray-900/50 text-gray-400 hover:bg-red-500 hover:text-white transition-colors"
                      title="Delete game"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="font-semibold truncate">{game.name}</h3>
                  {game.platform && (
                    <p className="text-sm text-gray-400">{game.platform}</p>
                  )}
                  {game.releaseYear && (
                    <p className="text-xs text-gray-500">{game.releaseYear}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredAndSortedGames.map((game) => (
              <div
                key={game.id}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-primary-500 transition-colors flex items-center gap-4"
              >
                <div className="w-16 h-16 bg-gray-700 rounded flex-shrink-0">
                  {game.boxArtPath ? (
                    <img
                      src={`file://${game.boxArtPath}`}
                      alt={game.name}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : null}
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">{game.name}</h3>
                  <div className="flex gap-4 text-sm text-gray-400">
                    {game.platform && <span>{game.platform}</span>}
                    {game.genre && <span>{game.genre}</span>}
                    {game.releaseYear && <span>{game.releaseYear}</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleFavorite(game.id, game.isFavorite || false)}
                    className={`p-2 rounded ${
                      game.isFavorite
                        ? 'text-red-500'
                        : 'text-gray-400 hover:text-red-500'
                    }`}
                  >
                    <Heart
                      className={`w-5 h-5 ${game.isFavorite ? 'fill-current' : ''}`}
                    />
                  </button>
                  <button
                    onClick={() => handleDelete(game.id)}
                    className="p-2 rounded text-gray-400 hover:text-red-500"
                  >
                    <span className="text-sm">Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
