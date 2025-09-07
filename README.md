# Novel Reader

A desktop / mobile offline-first WebNovel manager & reader app. Import novels through TXT or EPUB, you can read them, edit the chapters and record your reading progress.

The whole app works offline (for now) since its for my own use, but have had ideas of integrating a public server where you could search and download novels from within the app, without relying on manual input. I may do it, but would become a much more ambitious undertaking, without sufficient incentive, I'll probably not do it. But feel free to prove me wrong :)



## Features

- **Library management**: add, delete, edit your webnovels.
- **Tags & Genres**: categorize and filter your collection
- **Import**: TXT & EPUB 
- **Reading History**: History page that marks all of your read novels 
- **Novel Finder**: advanced local search with many parameters (kinda useless for now)
- **Cover search helper**: (To be developed)
- **Import/Export**: Import and Export your library across devices (only works within the app)


## Planned Features

- Optional account + encrypted sync between devices
- Smarter recommendations (by tags/embedding)
- OPDS/Calibre and additional importers
- More keyboard shortcuts & accessibility polish
- More language implementation
- Unique and good looking UI and UX


## Architecture

### Desktop (Tauri)
- **UI**: React + TypeScript (Vite) running in Tauri’s WebView.
- **Shell**: Tauri (Rust) for native windowing, filesystem, dialogs.
- **Database**: SQLite (bundled). 
- **IPC**: Thin Tauri commands for DB, file I/O, and import/export (ZIP).
- **Import/Export**: JSZip in the UI; save/open via Tauri dialogs (or File System Access API in web).

### Mobile (React Native)
- **UI**: React Native + Expo
- **Database**: SQLite on-device (expo-sqlite) 
- **Import/Export**: ZIP/json using RN-compatible libs (e.g., `react-native-zip-archive`) with the same `data.json` schema.

## Install
See **[Downloads (Latest)](./docs/INSTALL.md)** • **[All Versions](./docs/VERSIONS.md)**


## Development Instructions

**Prereqs**
- Node 18+
- Rust & Cargo (for desktop)
- Android Studio Virtual device manager (Recommended for mobile)

**Setup & Run**

Clone or download the repo.

The project is divided into two parts, the desktop and mobile versions, you will have to do the following on each:

```bash
# go to folder
cd desktop
cd mobile

# install all dependencies
npm install

# run desktop version
npm run tauri:dev

#run mobile version
npm start
```

## Future of the app

As mentioned at the start, this app is very barebones and is offline only, for now, I do not plan on making an online version, but can see the vision. Having a database to connect to, where you can download webnovels easily would be a great feature. But doing this is just too much work for my use. If somehow this app gets popular and such a feature is asked for, maybe I'll do it, cus I kinda also want something like that.

Anyways, thanks for reading my rant. Hope you like the app ❤︎
