export interface SearchResult {
  title: string;
  source: string;
  downloadUrl: string;
  type: 'torrent' | 'magnet' | 'direct';
  size?: string;
  seeders?: number;
  leechers?: number;
  platform?: string;
  metadata?: {
    description?: string;
    releaseDate?: string;
  };
}

export interface Game {
  id: string;
  name: string;
  platform?: string;
  genre?: string;
  releaseYear?: number;
  filePath?: string; // Path to the actual game file/folder
  downloadPath?: string; // Original download path (deprecated)
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
