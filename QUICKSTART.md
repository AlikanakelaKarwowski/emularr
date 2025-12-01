# Quick Start Guide

## Initial Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build Main Process**
   ```bash
   npm run build:main
   ```
   This compiles the Electron main process and preload scripts.

3. **Run in Development**
   ```bash
   npm run dev
   ```
   This will:
   - Start the Vite dev server for the React app
   - Launch Electron with hot reload

## Building for Production

```bash
npm run build
```

This will:
1. Compile the main process TypeScript files
2. Build the React renderer
3. Package the application with Electron Builder

## Project Structure

- `src/main/` - Electron main process (Node.js)
- `src/components/` - React UI components
- `src/App.tsx` - Main React component
- `dist/` - Compiled output (created after build)

## Features Overview

### Search Tab
- Search across multiple ROM/repack sources
- View results with metadata (platform, size, seeders, etc.)
- One-click download

### Downloads Tab
- View all active downloads
- Monitor progress (speed, time remaining, peers)
- Pause/resume/cancel downloads
- See individual file progress for torrents

### Library Tab
- Browse your game collection
- Filter by platform, genre, year
- Mark favorites
- Grid and list view modes
- Search your library

### Settings Tab
- Configure download location
- Set max concurrent downloads
- Auto-start downloads option

## Notes

- Downloads are automatically added to your library when completed
- The search engines may need adjustments based on website changes
- Box art fetching requires API keys for some services (can be added later)
- Make sure you have write permissions for your chosen download directory

## Troubleshooting

**Electron won't start:**
- Make sure you've run `npm run build:main` first
- Check that `dist/main.js` and `dist/preload.js` exist

**Downloads not showing:**
- Navigate to the Downloads tab after starting a download
- Check the browser console for errors

**Search not working:**
- Some websites have anti-scraping measures
- You may need to adjust the search engine implementations
- Check network requests in DevTools
