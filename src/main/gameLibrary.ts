import Store from 'electron-store';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

interface Game {
  id: string;
  name: string;
  platform?: string;
  genre?: string;
  releaseYear?: number;
  filePath?: string; // Path to the actual game file/folder
  downloadPath?: string; // Original download path (deprecated, use filePath)
  boxArtUrl?: string;
  boxArtPath?: string;
  isFavorite?: boolean;
  playlists?: string[];
  tags?: string[]; // Custom tags for organization
  dateAdded: number;
  metadata?: {
    description?: string;
    developer?: string;
    publisher?: string;
    size?: number;
    originalFileName?: string;
    extracted?: boolean; // Whether the file was extracted
  };
}

const store = new Store<{ games: Game[] }>({
  name: 'games',
  defaults: { games: [] },
});

const boxArtCachePath = path.join(app.getPath('userData'), 'boxart');

// Ensure box art cache directory exists
if (!fs.existsSync(boxArtCachePath)) {
  fs.mkdirSync(boxArtCachePath, { recursive: true });
}

export const gameLibrary = {
  getGames(): Game[] {
    return store.get('games', []);
  },

  addGame(game: Omit<Game, 'id' | 'dateAdded'>): Game {
    const games = this.getGames();
    const newGame: Game = {
      ...game,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      dateAdded: Date.now(),
      tags: game.tags || [], // Ensure tags array exists
    };
    games.push(newGame);
    store.set('games', games);
    return newGame;
  },

  addTag(gameId: string, tag: string): boolean {
    const games = this.getGames();
    const index = games.findIndex((g) => g.id === gameId);
    if (index === -1) return false;

    const game = games[index];
    if (!game.tags) {
      game.tags = [];
    }
    if (!game.tags.includes(tag)) {
      game.tags.push(tag);
      games[index] = game;
      store.set('games', games);
    }
    return true;
  },

  removeTag(gameId: string, tag: string): boolean {
    const games = this.getGames();
    const index = games.findIndex((g) => g.id === gameId);
    if (index === -1) return false;

    const game = games[index];
    if (game.tags) {
      game.tags = game.tags.filter(t => t !== tag);
      games[index] = game;
      store.set('games', games);
    }
    return true;
  },

  getAllTags(): string[] {
    const games = this.getGames();
    const tagSet = new Set<string>();
    games.forEach(game => {
      if (game.tags) {
        game.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  },

  updateGame(gameId: string, updates: Partial<Game>): Game | null {
    const games = this.getGames();
    const index = games.findIndex((g) => g.id === gameId);
    if (index === -1) return null;

    games[index] = { ...games[index], ...updates };
    store.set('games', games);
    return games[index];
  },

  deleteGame(gameId: string): boolean {
    const games = this.getGames();
    const index = games.findIndex((g) => g.id === gameId);
    if (index === -1) return false;

    const game = games[index];
    
    // Delete the game file/folder from the system
    if (game.filePath) {
      try {
        const filePath = game.filePath;
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.isDirectory()) {
            // Delete directory recursively
            fs.rmSync(filePath, { recursive: true, force: true });
          } else {
            // Delete file
            fs.unlinkSync(filePath);
          }
          console.log(`Deleted game file: ${filePath}`);
        }
      } catch (error) {
        console.error(`Error deleting game file for ${game.name}:`, error);
        // Continue with deletion even if file deletion fails
      }
    }

    // Delete box art file
    if (game.boxArtPath && fs.existsSync(game.boxArtPath)) {
      try {
        fs.unlinkSync(game.boxArtPath);
      } catch (error) {
        console.error(`Error deleting box art:`, error);
      }
    }

    games.splice(index, 1);
    store.set('games', games);
    return true;
  },

  async getBoxArt(gameName: string, platform?: string): Promise<string | null> {
    try {
      // Try IGDB API (requires API key - user would need to set this up)
      // For now, we'll use a placeholder service or local cache
      
      // Check cache first
      const cacheFileName = `${gameName.replace(/[^a-z0-9]/gi, '_')}_${platform || 'unknown'}.jpg`;
      const cachePath = path.join(boxArtCachePath, cacheFileName);
      
      if (fs.existsSync(cachePath)) {
        return cachePath;
      }

      // Try to fetch from IGDB or other services
      // This is a placeholder - in production, you'd use actual APIs
      // For now, return null and let the UI handle it
      return null;
    } catch (error) {
      console.error('Error fetching box art:', error);
      return null;
    }
  },
};
