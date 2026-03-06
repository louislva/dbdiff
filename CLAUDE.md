# dbdiff — Claude Instructions

## Development

```bash
npm install
npm run dev
```

This runs Vite (port 4089) and the backend (port 4088) concurrently. Vite proxies `/api` requests to the backend.

## Formatting

```bash
npm run format
```

Always run this after making changes to ensure consistent code formatting.

## Type Checking

```bash
npm run typecheck
```

Always run this after making changes to verify there are no type errors.

## Versioning

The version number is stored in **two places** — always update both:

1. `package.json` → `"version"`
2. `src/constants.ts` → `APP_VERSION`

## Testing the CLI locally (without publishing)

```bash
npm run build        # Build frontend + server
npm link             # Create global symlink
dbdiff-app           # Run it from anywhere
```

To unlink when done:

```bash
npm rm -g dbdiff-app
```

## Production build

```bash
npm run build        # Build frontend + server
npm start            # Run Electron app
# Or: node bin/cli.js
```

## Styling Conventions

Always use semantic text color classes instead of hardcoded colors:

- `text-primary` - Primary text
- `text-secondary` - Secondary text
- `text-tertiary` - Tertiary/muted text

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS (via @tailwindcss/vite plugin)
- **Backend**: Express.js (minimal — essentially just a "run SQL" endpoint)
- **Database client**: `pg` (PostgreSQL only for now)
- **State management**: Zustand
- **SQL editor**: CodeMirror 6
- **Icons**: Lucide React
- **Desktop**: Electron (thin wrapper)

## Runtime Environments

The app must work in all of these contexts — code defensively:

1. **Electron on macOS** (primary target) — `npx dbdiff-app` or `npm start`
2. **Browser on localhost** — `npm run dev` (Vite + Express)
3. **Browser on a domain** — future cloud-hosted deployment
4. **Electron on Linux/Windows** — not a priority yet, but don't do anything that would make it impossible

Detect Electron via `navigator.userAgent.includes("Electron")`. Detect macOS via `navigator.userAgent.includes("Macintosh")`. The combo `isElectronMac` gates macOS-specific behavior (native menus, traffic light padding).

## Electron Shell

Thin Electron wrapper — the Express server still does all the work, Electron just opens a BrowserWindow pointing at `http://localhost:4088`.

### Key files

| File                   | Purpose                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `electron/main.js`     | Electron main process — starts server, creates window, builds native menu |
| `electron/preload.cjs` | contextBridge exposing `window.electronAPI` (IPC for menu actions)        |
| `src/electron.d.ts`    | TypeScript types for `window.electronAPI`                                 |
| `bin/cli.js`           | CLI entry — spawns Electron with `main.js`                                |

### How the native menu works (macOS)

On macOS, the "dbdiff" and "Database" dropdown menus from the web UI are hidden (`hideMenus` prop on TabBar) and instead live in the native macOS menu bar. IPC flow:

- **Main → Renderer**: `win.webContents.send("menu-action", actionName)` when a native menu item is clicked
- **Renderer → Main**: `ipcRenderer.send("set-database-menu-enabled", bool)` to gray out Database export items when no DB is connected
- **Renderer side**: `App.tsx` subscribes via `window.electronAPI.onMenuAction()` and dispatches to the same handlers the web menus use

On non-macOS Electron and in browsers, the web dropdown menus show as normal.

### Dev workflow

- `npm run dev` — Vite HMR + Express, opens in browser (no Electron)
- `npm run dev:electron` — Vite HMR + Express (tsx watch) + Electron concurrently
- `npm run build && node bin/cli.js` — full production test

## Architecture

### Data Model Overview

```
App (root state)
├── connectionTabs[] ─────────────────────────────────────────┐
│   └── ConnectionTab                                         │
│       ├── id, name, databaseConfigId                        │
│       ├── innerTabs[] ──────────────────────────────────┐   │
│       │   └── InnerTab { id, type, name }               │   │
│       └── activeInnerTabId                              │   │
├── activeTabId                                           │   │
└── databaseConfigs[] ────────────────────────────────────┼───┘
    └── DatabaseConfig                                    │
        ├── display: { name, color }                      │
        ├── connection: { host, port, database, ... }     │
        └── cache: { schemas[] }  ────────────────────────┘
```

### DatabaseConfig

Represents a saved database connection configuration.

```typescript
interface DatabaseConfig {
  id: string;
  display: { name: string; color: string };
  connection: { type; host; port; database; username; password };
  cache: { schemas?: SchemaMetadata[] };
  source: "local" | "cloud";
}
```

### ConnectionTab

Represents an open connection tab (top tab bar).

```typescript
interface ConnectionTab {
  id: string;
  name: string;
  databaseConfigId: string | null; // null = not connected yet
  innerTabs: InnerTab[];
  activeInnerTabId: string | null;
}
```

### InnerTab

Represents a tab within a connection (second tab bar).

```typescript
interface InnerTab {
  id: string;
  type: "table" | "console" | "query";
  name: string;
}
```

- `table`: View/edit data from a table (opened from sidebar)
- `console`: SQL console window
- `query`: Saved query results

### Key Files

| File                                  | Purpose                                       |
| ------------------------------------- | --------------------------------------------- |
| `src/types.ts`                        | Type definitions                              |
| `src/App.tsx`                         | Root state & logic                            |
| `src/stores/store.ts`                 | Zustand store, default shortcuts, persistence |
| `src/stores/hooks.ts`                 | Custom hooks, hotkey system                   |
| `src/stores/useCloudSync.ts`          | Cloud synchronization                         |
| `src/stores/useSyncDatabase.ts`       | Schema caching                                |
| `src/components/TabBar.tsx`           | Connection tabs UI                            |
| `src/components/InnerTabBar.tsx`      | Inner tabs UI                                 |
| `src/components/Sidebar.tsx`          | Table list                                    |
| `src/components/ConnectionPicker.tsx` | Config selector                               |
| `src/components/ConnectedView.tsx`    | Main content area                             |

## Keyboard Shortcuts

### Shortcut System Architecture

| File                                 | Purpose                                                    |
| ------------------------------------ | ---------------------------------------------------------- |
| `src/types.ts`                       | `ShortcutAction` type definition                           |
| `src/stores/hooks.ts`                | `useHotkey()` hook, `parseShortcut()`, `matchesShortcut()` |
| `src/stores/store.ts`                | Default shortcuts, override persistence                    |
| `src/components/GlobalShortcuts.tsx` | Global shortcut registration                               |

### Default Shortcuts

| Action          | Default Key      | Description                        |
| --------------- | ---------------- | ---------------------------------- |
| `newConsole`    | `ctrl+n`         | Create new console tab             |
| `closeInnerTab` | `ctrl+w`         | Close current inner tab            |
| `nextInnerTab`  | `ctrl+tab`       | Switch to next inner tab           |
| `prevInnerTab`  | `ctrl+shift+tab` | Switch to previous inner tab       |
| `runQuery`      | `ctrl+enter`     | Execute query in console           |
| `closeModal`    | `escape`         | Close open modal                   |
| `deleteRows`    | `delete`         | Delete selected rows in table view |

### Adding a New Shortcut

1. Add the action name to `ShortcutAction` type in `types.ts`
2. Add the default key binding in both `hooks.ts` and `store.ts` `DEFAULT_SHORTCUTS`
3. If the shortcut should work while in input fields, add it to the `allowInInput` check in `useHotkey()`
4. Use `useHotkey(action, handler)` in your component

### Shortcut Syntax

- `ctrl+key` - Ctrl key (use for cross-platform)
- `mod+key` - Cmd on Mac, Ctrl on Windows/Linux
- `alt+key` - Alt/Option key
- `shift+key` - Shift key
- Combine modifiers: `ctrl+shift+tab`
- Special keys: `enter`, `escape`, `tab`, `[`, `]`
