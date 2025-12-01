# Emularr - Game ROM and Repack Manager

A modern desktop application for searching, downloading, and managing game ROMs and repacks from various sources.

## Features

- **Multi-Source Search**: Search across multiple sources including:
  - Vimm's Lair
  - Myrient
  - FitGirl Repacks
  - CrocDB
  - And more...

- **Download Management**:
  - Support for torrent/magnet links and direct downloads
  - Real-time download progress tracking
  - Pause/resume/cancel downloads
  - Shows seeders, leechers, and connection info for torrents

- **Game Library**:
  - Organize your downloaded games
  - Filter by platform, genre, release year
  - Favorites and playlists support
  - Box art fetching (when available)

- **Settings**:
  - Configurable download location
  - Max concurrent downloads
  - Auto-start downloads option

## Tech Stack

- **Electron** - Desktop application framework
- **React** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **WebTorrent** - Torrent downloading
- **Axios** - HTTP requests
- **Cheerio** - Web scraping

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Emularr
```

2. Install dependencies:
```bash
npm install
```

3. Build the main process:
```bash
npm run build:main
```

4. Run in development mode:
```bash
npm run dev
```

## Building for Production

```bash
npm run build
```

This will create distributable packages for your platform.

## Project Structure

```
Emularr/
├── src/
│   ├── main/           # Electron main process
│   │   ├── main.ts     # Main entry point
│   │   ├── preload.ts  # Preload script
│   │   ├── configManager.ts
│   │   ├── downloadManager.ts
│   │   ├── gameLibrary.ts
│   │   └── searchEngines.ts
│   ├── components/     # React components
│   │   ├── SearchView.tsx
│   │   ├── DownloadsView.tsx
│   │   ├── LibraryView.tsx
│   │   └── SettingsView.tsx
│   ├── App.tsx         # Main React component
│   ├── main.tsx        # React entry point
│   └── types.ts        # TypeScript types
├── dist/               # Build output
└── package.json
```

## Usage

1. **Search for Games**: Use the Search tab to find games across multiple sources
2. **Download**: Click the download button on any search result
3. **Monitor Downloads**: Check the Downloads tab for progress
4. **Manage Library**: View and organize your games in the Library tab
5. **Configure Settings**: Set your download path and preferences in Settings

## Notes

- Some websites may have anti-scraping measures that require adjustments to the search engines
- Box art fetching may require API keys for certain services (IGDB, etc.)
- Make sure you have proper permissions to download and store files in your chosen directory

## License

MIT
