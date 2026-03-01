import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CellChange,
  CellPosition,
  CellRange,
  CloudConnectionInfo,
  ConfigSyncState,
  ConnectionTab,
  ConsoleTabState,
  DatabaseConfig,
  DatabaseConfigCache,
  InnerTab,
  PendingNewRow,
  ShortcutAction,
  ShortcutConfig,
  SortColumn,
  TableCellEditState,
  TableTabState,
} from "../types";

// Environment detection (evaluated once at module load)
const isElectronMac =
  typeof navigator !== "undefined" &&
  navigator.userAgent.includes("Electron") &&
  navigator.userAgent.includes("Macintosh");

// Browser/generic defaults
const BROWSER_SHORTCUTS: ShortcutConfig = {
  newConsole: "alt+t",
  closeInnerTab: "alt+w",
  nextInnerTab: "alt+tab",
  prevInnerTab: "alt+shift+tab",
  newConnectionTab: "mod+alt+n",
  closeConnectionTab: "mod+alt+w",
  prevConnectionTab: "mod+alt+j",
  nextConnectionTab: "mod+alt+k",
  runQuery: "ctrl+enter",
  closeModal: "escape",
  openTableSwitcher: "mod+o",
  openDatabaseSwitcher: "mod+p",
  deleteRows: "delete",
  selectAll: "mod+a",
  refreshTable: "mod+r",
};

// Electron on macOS: use native-feeling Cmd shortcuts since we control the menu
const ELECTRON_MAC_SHORTCUTS: ShortcutConfig = {
  ...BROWSER_SHORTCUTS,
  newConsole: "mod+t",
  closeInnerTab: "mod+w",
  nextInnerTab: "ctrl+tab",
  prevInnerTab: "ctrl+shift+tab",
  newConnectionTab: "mod+shift+n",
  closeConnectionTab: "mod+shift+w",
};

// Default keyboard shortcuts
export const DEFAULT_SHORTCUTS: ShortcutConfig = isElectronMac
  ? ELECTRON_MAC_SHORTCUTS
  : BROWSER_SHORTCUTS;

// Default database configs (seeded on first load; empty so auto-scan discovers local databases)
const DEFAULT_DATABASE_CONFIGS: DatabaseConfig[] = [];

const DEFAULT_CONNECTION_TAB: ConnectionTab = {
  id: "1",
  name: "New Connection",
  databaseConfigId: null,
  innerTabs: [],
  activeInnerTabId: null,
};

const DEFAULT_CELL_EDIT_STATE: TableCellEditState = {
  selectedCell: null,
  selectedRange: null,
  isDragging: false,
  editingCell: null,
  editValue: "",
  pendingChanges: {},
  pendingNewRows: [],
  pendingDeletions: [],
};

/** Apply the current edit value to pendingChanges/pendingNewRows without clearing editingCell */
function applyPendingEdit(
  cellEditState: TableCellEditState,
  rows: Record<string, unknown>[] | undefined,
): TableCellEditState {
  const { editingCell, editValue, pendingChanges, pendingNewRows } =
    cellEditState;
  if (!editingCell) return cellEditState;
  const { rowIndex, columnName } = editingCell;

  if (rowIndex < 0) {
    const newRowIndex = Math.abs(rowIndex) - 1;
    const newRow = pendingNewRows[newRowIndex];
    if (!newRow) return cellEditState;
    const updatedNewRows = pendingNewRows.map((row, idx) => {
      if (idx !== newRowIndex) return row;
      const newExplicitlySet = new Set(row.explicitlySetColumns);
      newExplicitlySet.add(columnName);
      return {
        ...row,
        explicitlySetColumns: newExplicitlySet,
        values: {
          ...row.values,
          [columnName]: editValue,
        },
      };
    });
    return { ...cellEditState, pendingNewRows: updatedNewRows };
  }

  const key = `${rowIndex}:${columnName}`;
  const existingChange = pendingChanges[key];
  const originalValue =
    existingChange?.originalValue ?? rows?.[rowIndex]?.[columnName];
  const originalStr =
    originalValue === null ? null : String(originalValue ?? "");
  const newChanges = { ...pendingChanges };

  if (editValue === originalStr) {
    delete newChanges[key];
  } else {
    newChanges[key] = {
      rowIndex,
      columnName,
      originalValue,
      newValue: editValue,
    } as CellChange;
  }
  return { ...cellEditState, pendingChanges: newChanges };
}

export interface CloudSyncState {
  status: "idle" | "syncing" | "completed" | "error";
  lastSyncedAt: number | null;
  error: string | null;
}

export interface CloudConnection {
  id: string;
  name: string;
  config: {
    display: { name: string; color: string };
    connection: {
      type: "postgres";
      host: string;
      port: number;
      database: string;
      username: string;
      password: string;
      params?: Record<string, string>;
    };
  };
  role: "owner" | "member";
  access?: Record<string, "write" | "read" | "none">;
  ownerId: string;
  ownerEmail: string;
  updatedAt: string;
}

interface AppState {
  // Persisted state
  databaseConfigs: DatabaseConfig[];
  darkMode: boolean;
  shortcutOverrides: Partial<ShortcutConfig>;
  cloudApiKey: string | null;
  csvExportPrefs: { includeHeaders: boolean; scope: "current" | "all" };

  // Session-only state
  connectionTabs: ConnectionTab[];
  activeTabId: string;
  draggedTabId: string | null;
  draggedInnerTabId: string | null;
  consoleStates: Record<string, ConsoleTabState>;
  tableStates: Record<string, TableTabState>;
  configSyncStates: Record<string, ConfigSyncState>;
  cloudSyncState: CloudSyncState;

  // Config actions
  addConfig: (config: DatabaseConfig) => void;
  updateConfig: (id: string, updates: Partial<DatabaseConfig>) => void;
  deleteConfig: (id: string) => void;
  updateConfigCache: (id: string, cache: Partial<DatabaseConfigCache>) => void;

  // Connection tab actions
  createConnectionTab: () => void;
  closeConnectionTab: (tabId: string) => void;
  selectConnectionTab: (tabId: string) => void;
  connectToDatabase: (databaseConfigId: string) => void;
  reorderConnectionTabs: (fromIndex: number, toIndex: number) => void;

  // Inner tab actions
  addInnerTab: (innerTab: InnerTab) => void;
  selectInnerTab: (innerTabId: string) => void;
  closeInnerTab: (innerTabId: string) => void;
  reorderInnerTabs: (fromIndex: number, toIndex: number) => void;

  // Drag actions
  setDraggedTabId: (tabId: string | null) => void;
  setDraggedInnerTabId: (tabId: string | null) => void;

  // Console state actions
  initConsoleState: (tabId: string) => void;
  updateConsoleState: (
    tabId: string,
    updates: Partial<ConsoleTabState>,
  ) => void;
  setConsoleQueryText: (tabId: string, text: string) => void;

  // Table state actions
  initTableState: (
    tabId: string,
    tableName: string,
    initialWhereClause?: string,
  ) => void;
  updateTableState: (tabId: string, updates: Partial<TableTabState>) => void;
  setTableWhereClause: (tabId: string, whereClause: string) => void;
  setTablePage: (tabId: string, page: number) => void;
  toggleTableSort: (
    tabId: string,
    column: string,
    addToExisting: boolean,
  ) => void;
  setTableSortColumns: (tabId: string, sortColumns: SortColumn[]) => void;

  // Cell editing actions
  selectCell: (tabId: string, cell: CellPosition | null) => void;
  selectCellRange: (tabId: string, range: CellRange | null) => void;
  setCellDragging: (tabId: string, isDragging: boolean) => void;
  startEditingCell: (
    tabId: string,
    cell: CellPosition,
    initialValue: string | null,
  ) => void;
  updateEditValue: (tabId: string, value: string | null) => void;
  commitCellEdit: (tabId: string) => void;
  cancelCellEdit: (tabId: string) => void;
  clearPendingChanges: (tabId: string) => void;
  revertCellChange: (tabId: string, cell: CellPosition) => void;
  setCellToNull: (tabId: string, cell: CellPosition) => void;

  // Batch paste action
  pasteCellRange: (
    tabId: string,
    cells: Array<{
      rowIndex: number;
      columnName: string;
      value: string | null;
    }>,
  ) => void;

  // New row actions
  addNewRow: (tabId: string) => void;
  removeNewRow: (tabId: string, tempId: string) => void;
  setNewRowValue: (
    tabId: string,
    tempId: string,
    columnName: string,
    value: string | null,
    isExplicit: boolean,
  ) => void;
  setNewRowToDefault: (
    tabId: string,
    tempId: string,
    columnName: string,
  ) => void;

  // Deletion actions
  markRowsForDeletion: (tabId: string, rowIndices: number[]) => void;

  // Config sync state actions
  updateConfigSyncState: (
    configId: string,
    updates: Partial<ConfigSyncState>,
  ) => void;

  // Theme actions
  setDarkMode: (dark: boolean) => void;
  toggleDarkMode: () => void;

  // CSV export prefs
  setCsvExportPrefs: (prefs: {
    includeHeaders: boolean;
    scope: "current" | "all";
  }) => void;

  // Shortcut actions
  setShortcut: (action: ShortcutAction, keys: string) => void;
  resetShortcut: (action: ShortcutAction) => void;
  resetAllShortcuts: () => void;
  getShortcut: (action: ShortcutAction) => string;
  getAllShortcuts: () => ShortcutConfig;

  // Reset UI state (preserves configs/darkMode/shortcuts/cloudApiKey)
  resetUIState: () => void;

  // Cloud actions
  setCloudApiKey: (key: string) => void;
  clearCloudApiKey: () => void;
  setCloudSyncState: (updates: Partial<CloudSyncState>) => void;
  syncCloudConfigs: (cloudConnections: CloudConnection[]) => void;
  convertToCloudConfig: (
    localId: string,
    cloudInfo: CloudConnectionInfo,
  ) => void;

  // Getters
  getActiveTab: () => ConnectionTab | undefined;
  getActiveInnerTab: () => InnerTab | undefined;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial state
      databaseConfigs: DEFAULT_DATABASE_CONFIGS,
      darkMode:
        typeof window !== "undefined"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
          : true,
      shortcutOverrides: {},
      cloudApiKey: null,
      csvExportPrefs: { includeHeaders: true, scope: "current" },
      connectionTabs: [DEFAULT_CONNECTION_TAB],
      activeTabId: "1",
      draggedTabId: null,
      draggedInnerTabId: null,
      consoleStates: {},
      tableStates: {},
      configSyncStates: {},
      cloudSyncState: {
        status: "idle",
        lastSyncedAt: null,
        error: null,
      },

      // Config actions
      addConfig: (config) =>
        set((state) => ({
          databaseConfigs: [...state.databaseConfigs, config],
        })),

      updateConfig: (id, updates) =>
        set((state) => ({
          databaseConfigs: state.databaseConfigs.map((c) =>
            c.id === id ? { ...c, ...updates } : c,
          ),
        })),

      deleteConfig: (id) =>
        set((state) => ({
          databaseConfigs: state.databaseConfigs.filter((c) => c.id !== id),
        })),

      updateConfigCache: (id, cacheUpdates) =>
        set((state) => ({
          databaseConfigs: state.databaseConfigs.map((c) =>
            c.id === id ? { ...c, cache: { ...c.cache, ...cacheUpdates } } : c,
          ),
        })),

      // Connection tab actions
      createConnectionTab: () => {
        const newId = Date.now().toString();
        set((state) => ({
          connectionTabs: [
            ...state.connectionTabs,
            {
              id: newId,
              name: "New Connection",
              databaseConfigId: null,
              innerTabs: [],
              activeInnerTabId: null,
            },
          ],
          activeTabId: newId,
        }));
      },

      closeConnectionTab: (tabId) =>
        set((state) => {
          const newTabs = state.connectionTabs.filter((t) => t.id !== tabId);
          if (newTabs.length === 0) {
            // Closing the last tab — immediately open a fresh one
            const newId = Date.now().toString();
            return {
              connectionTabs: [
                {
                  id: newId,
                  name: "New Connection",
                  databaseConfigId: null,
                  innerTabs: [],
                  activeInnerTabId: null,
                },
              ],
              activeTabId: newId,
            };
          }
          return {
            connectionTabs: newTabs,
            activeTabId:
              state.activeTabId === tabId
                ? newTabs[newTabs.length - 1].id
                : state.activeTabId,
          };
        }),

      selectConnectionTab: (tabId) => set({ activeTabId: tabId }),

      connectToDatabase: (databaseConfigId) => {
        const config = get().databaseConfigs.find(
          (c) => c.id === databaseConfigId,
        );
        if (!config) return;

        // If another tab is already connected to this database, switch to it
        const existingTab = get().connectionTabs.find(
          (t) =>
            t.databaseConfigId === databaseConfigId &&
            t.id !== get().activeTabId,
        );
        if (existingTab) {
          // Switch to the existing tab and close the current unconnected tab
          const activeTabId = get().activeTabId;
          set((state) => ({
            connectionTabs: state.connectionTabs.filter(
              (t) => t.id !== activeTabId || t.databaseConfigId !== null,
            ),
            activeTabId: existingTab.id,
          }));
          return;
        }

        set((state) => ({
          connectionTabs: state.connectionTabs.map((t) =>
            t.id === state.activeTabId
              ? {
                  ...t,
                  name: config.display.name,
                  databaseConfigId,
                  innerTabs: [],
                  activeInnerTabId: null,
                }
              : t,
          ),
        }));
      },

      reorderConnectionTabs: (fromIndex, toIndex) =>
        set((state) => {
          const newTabs = [...state.connectionTabs];
          const [draggedTab] = newTabs.splice(fromIndex, 1);
          newTabs.splice(toIndex, 0, draggedTab);
          return { connectionTabs: newTabs };
        }),

      // Inner tab actions
      addInnerTab: (innerTab) =>
        set((state) => ({
          connectionTabs: state.connectionTabs.map((t) =>
            t.id === state.activeTabId
              ? {
                  ...t,
                  innerTabs: [...t.innerTabs, innerTab],
                  activeInnerTabId: innerTab.id,
                }
              : t,
          ),
        })),

      selectInnerTab: (innerTabId) =>
        set((state) => ({
          connectionTabs: state.connectionTabs.map((t) =>
            t.id === state.activeTabId
              ? { ...t, activeInnerTabId: innerTabId }
              : t,
          ),
        })),

      closeInnerTab: (innerTabId) =>
        set((state) => {
          // Clean up console/table state if closing a console/table tab
          const { [innerTabId]: _console, ...remainingConsoleStates } =
            state.consoleStates;
          const { [innerTabId]: _table, ...remainingTableStates } =
            state.tableStates;
          return {
            consoleStates: remainingConsoleStates,
            tableStates: remainingTableStates,
            connectionTabs: state.connectionTabs.map((t) => {
              if (t.id !== state.activeTabId) return t;
              const newInnerTabs = t.innerTabs.filter(
                (it) => it.id !== innerTabId,
              );
              return {
                ...t,
                innerTabs: newInnerTabs,
                activeInnerTabId:
                  t.activeInnerTabId === innerTabId
                    ? newInnerTabs.length > 0
                      ? newInnerTabs[newInnerTabs.length - 1].id
                      : null
                    : t.activeInnerTabId,
              };
            }),
          };
        }),

      reorderInnerTabs: (fromIndex, toIndex) =>
        set((state) => ({
          connectionTabs: state.connectionTabs.map((t) => {
            if (t.id !== state.activeTabId) return t;
            const newInnerTabs = [...t.innerTabs];
            const [draggedTab] = newInnerTabs.splice(fromIndex, 1);
            newInnerTabs.splice(toIndex, 0, draggedTab);
            return { ...t, innerTabs: newInnerTabs };
          }),
        })),

      // Drag actions
      setDraggedTabId: (tabId) => set({ draggedTabId: tabId }),
      setDraggedInnerTabId: (tabId) => set({ draggedInnerTabId: tabId }),

      // Console state actions
      initConsoleState: (tabId) =>
        set((state) => {
          if (state.consoleStates[tabId]) return state;
          return {
            consoleStates: {
              ...state.consoleStates,
              [tabId]: {
                queryText: "",
                status: "idle",
                executionId: null,
                startedAt: null,
                completedAt: null,
                result: null,
                error: null,
                diffResult: null,
                lastAction: null,
              },
            },
          };
        }),

      updateConsoleState: (tabId, updates) =>
        set((state) => {
          const existing = state.consoleStates[tabId];
          if (!existing) return state;
          return {
            consoleStates: {
              ...state.consoleStates,
              [tabId]: { ...existing, ...updates },
            },
          };
        }),

      setConsoleQueryText: (tabId, text) =>
        set((state) => {
          const existing = state.consoleStates[tabId];
          if (!existing) return state;
          return {
            consoleStates: {
              ...state.consoleStates,
              [tabId]: { ...existing, queryText: text },
            },
          };
        }),

      // Table state actions
      initTableState: (tabId, tableName, initialWhereClause) =>
        set((state) => {
          if (state.tableStates[tabId]) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                tableName,
                whereClause: initialWhereClause ?? "",
                sortColumns: [],
                currentPage: 0,
                totalRowCount: null,
                status: "idle",
                executionId: null,
                startedAt: null,
                completedAt: null,
                result: null,
                error: null,
                cellEditState: { ...DEFAULT_CELL_EDIT_STATE },
              },
            },
          };
        }),

      updateTableState: (tabId, updates) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: { ...existing, ...updates },
            },
          };
        }),

      setTableWhereClause: (tabId, whereClause) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: { ...existing, whereClause, currentPage: 0 },
            },
          };
        }),

      setTablePage: (tabId, page) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                currentPage: page,
                cellEditState: { ...DEFAULT_CELL_EDIT_STATE },
              },
            },
          };
        }),

      toggleTableSort: (tabId, column, addToExisting) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;

          const currentSort = existing.sortColumns.find(
            (s) => s.column === column,
          );
          let newSortColumns: SortColumn[];

          if (addToExisting) {
            // Ctrl+click: add to existing sort or cycle through
            if (!currentSort) {
              // Add new column with ASC
              newSortColumns = [
                ...existing.sortColumns,
                { column, direction: "ASC" },
              ];
            } else if (currentSort.direction === "ASC") {
              // Change to DESC
              newSortColumns = existing.sortColumns.map((s) =>
                s.column === column ? { ...s, direction: "DESC" as const } : s,
              );
            } else {
              // Remove from sort
              newSortColumns = existing.sortColumns.filter(
                (s) => s.column !== column,
              );
            }
          } else {
            // Regular click: replace all sorts
            if (!currentSort) {
              // Set as only sort with ASC
              newSortColumns = [{ column, direction: "ASC" }];
            } else if (currentSort.direction === "ASC") {
              // Change to DESC
              newSortColumns = [{ column, direction: "DESC" }];
            } else {
              // Remove sort entirely
              newSortColumns = [];
            }
          }

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                sortColumns: newSortColumns,
                currentPage: 0,
              },
            },
          };
        }),

      setTableSortColumns: (tabId, sortColumns) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: { ...existing, sortColumns, currentPage: 0 },
            },
          };
        }),

      // Cell editing actions
      selectCell: (tabId, cell) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;

          // If there's an active edit, commit it before selecting the new cell
          const committed = applyPendingEdit(
            existing.cellEditState,
            existing.result?.rows,
          );

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...committed,
                  selectedCell: cell,
                  selectedRange: null,
                  editingCell: null,
                  editValue: "",
                },
              },
            },
          };
        }),

      selectCellRange: (tabId, range) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  selectedRange: range,
                },
              },
            },
          };
        }),

      setCellDragging: (tabId, isDragging) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  isDragging,
                },
              },
            },
          };
        }),

      startEditingCell: (tabId, cell, initialValue) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  editingCell: cell,
                  editValue: initialValue,
                  selectedCell: cell,
                  selectedRange: null,
                },
              },
            },
          };
        }),

      updateEditValue: (tabId, value) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  editValue: value,
                },
              },
            },
          };
        }),

      commitCellEdit: (tabId) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing?.cellEditState.editingCell) return state;

          const committed = applyPendingEdit(
            existing.cellEditState,
            existing.result?.rows,
          );

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...committed,
                  editingCell: null,
                  editValue: "",
                },
              },
            },
          };
        }),

      cancelCellEdit: (tabId) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  editingCell: null,
                  editValue: "",
                },
              },
            },
          };
        }),

      clearPendingChanges: (tabId) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;
          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  pendingChanges: {},
                  pendingNewRows: [],
                  pendingDeletions: [],
                },
              },
            },
          };
        }),

      revertCellChange: (tabId, cell) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;

          const { rowIndex, columnName } = cell;
          const key = `${rowIndex}:${columnName}`;
          const { pendingChanges } = existing.cellEditState;

          if (!(key in pendingChanges)) return state;

          const newChanges = { ...pendingChanges };
          delete newChanges[key];

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  pendingChanges: newChanges,
                  // Clear editing state if we were editing this cell
                  editingCell:
                    existing.cellEditState.editingCell?.rowIndex === rowIndex &&
                    existing.cellEditState.editingCell?.columnName ===
                      columnName
                      ? null
                      : existing.cellEditState.editingCell,
                  editValue:
                    existing.cellEditState.editingCell?.rowIndex === rowIndex &&
                    existing.cellEditState.editingCell?.columnName ===
                      columnName
                      ? ""
                      : existing.cellEditState.editValue,
                },
              },
            },
          };
        }),

      setCellToNull: (tabId, cell) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;

          const { rowIndex, columnName } = cell;

          // Handle new rows (negative indices)
          if (rowIndex < 0) {
            const newRowIndex = Math.abs(rowIndex) - 1;
            const { pendingNewRows } = existing.cellEditState;
            const newRow = pendingNewRows[newRowIndex];
            if (!newRow) return state;

            const updatedNewRows = pendingNewRows.map((row, idx) => {
              if (idx !== newRowIndex) return row;
              const newExplicitlySet = new Set(row.explicitlySetColumns);
              newExplicitlySet.add(columnName);
              return {
                ...row,
                explicitlySetColumns: newExplicitlySet,
                values: { ...row.values, [columnName]: null },
              };
            });

            return {
              tableStates: {
                ...state.tableStates,
                [tabId]: {
                  ...existing,
                  cellEditState: {
                    ...existing.cellEditState,
                    pendingNewRows: updatedNewRows,
                    editingCell:
                      existing.cellEditState.editingCell?.rowIndex ===
                        rowIndex &&
                      existing.cellEditState.editingCell?.columnName ===
                        columnName
                        ? null
                        : existing.cellEditState.editingCell,
                    editValue:
                      existing.cellEditState.editingCell?.rowIndex ===
                        rowIndex &&
                      existing.cellEditState.editingCell?.columnName ===
                        columnName
                        ? ""
                        : existing.cellEditState.editValue,
                  },
                },
              },
            };
          }

          const key = `${rowIndex}:${columnName}`;
          const { pendingChanges } = existing.cellEditState;

          // Get the original value
          const existingChange = pendingChanges[key];
          const originalValue =
            existingChange?.originalValue ??
            existing.result?.rows[rowIndex]?.[columnName];

          // If original was already null, remove the change
          const newChanges = { ...pendingChanges };
          if (originalValue === null) {
            delete newChanges[key];
          } else {
            newChanges[key] = {
              rowIndex,
              columnName,
              originalValue,
              newValue: null,
            } as CellChange;
          }

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  pendingChanges: newChanges,
                  // Clear editing state if we were editing this cell
                  editingCell:
                    existing.cellEditState.editingCell?.rowIndex === rowIndex &&
                    existing.cellEditState.editingCell?.columnName ===
                      columnName
                      ? null
                      : existing.cellEditState.editingCell,
                  editValue:
                    existing.cellEditState.editingCell?.rowIndex === rowIndex &&
                    existing.cellEditState.editingCell?.columnName ===
                      columnName
                      ? ""
                      : existing.cellEditState.editValue,
                },
              },
            },
          };
        }),

      // Batch paste action
      pasteCellRange: (tabId, cells) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;

          let { pendingChanges, pendingNewRows } = existing.cellEditState;
          pendingChanges = { ...pendingChanges };
          pendingNewRows = pendingNewRows.map((row) => ({ ...row }));

          for (const cell of cells) {
            const { rowIndex, columnName, value } = cell;

            if (rowIndex < 0) {
              // New row
              const newRowIndex = Math.abs(rowIndex) - 1;
              const newRow = pendingNewRows[newRowIndex];
              if (!newRow) continue;
              const newExplicitlySet = new Set(newRow.explicitlySetColumns);
              newExplicitlySet.add(columnName);
              pendingNewRows[newRowIndex] = {
                ...newRow,
                explicitlySetColumns: newExplicitlySet,
                values: { ...newRow.values, [columnName]: value },
              };
            } else {
              // Existing row
              const key = `${rowIndex}:${columnName}`;
              const existingChange = pendingChanges[key];
              const originalValue =
                existingChange?.originalValue ??
                existing.result?.rows[rowIndex]?.[columnName];
              const originalStr =
                originalValue === null ? null : String(originalValue ?? "");

              if (value === originalStr) {
                delete pendingChanges[key];
              } else {
                pendingChanges[key] = {
                  rowIndex,
                  columnName,
                  originalValue,
                  newValue: value,
                } as CellChange;
              }
            }
          }

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  pendingChanges,
                  pendingNewRows,
                  editingCell: null,
                  editValue: "",
                },
              },
            },
          };
        }),

      // New row actions
      addNewRow: (tabId) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;

          const newRow: PendingNewRow = {
            tempId: Date.now().toString(),
            explicitlySetColumns: new Set<string>(),
            values: {},
          };

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  pendingNewRows: [
                    ...existing.cellEditState.pendingNewRows,
                    newRow,
                  ],
                },
              },
            },
          };
        }),

      removeNewRow: (tabId, tempId) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  pendingNewRows: existing.cellEditState.pendingNewRows.filter(
                    (row) => row.tempId !== tempId,
                  ),
                },
              },
            },
          };
        }),

      setNewRowValue: (tabId, tempId, columnName, value, isExplicit) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;

          const updatedNewRows = existing.cellEditState.pendingNewRows.map(
            (row) => {
              if (row.tempId !== tempId) return row;
              const newExplicitlySet = new Set(row.explicitlySetColumns);
              if (isExplicit) {
                newExplicitlySet.add(columnName);
              }
              return {
                ...row,
                explicitlySetColumns: newExplicitlySet,
                values: { ...row.values, [columnName]: value },
              };
            },
          );

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  pendingNewRows: updatedNewRows,
                },
              },
            },
          };
        }),

      setNewRowToDefault: (tabId, tempId, columnName) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;

          const updatedNewRows = existing.cellEditState.pendingNewRows.map(
            (row) => {
              if (row.tempId !== tempId) return row;
              const newExplicitlySet = new Set(row.explicitlySetColumns);
              newExplicitlySet.delete(columnName);
              const newValues = { ...row.values };
              delete newValues[columnName];
              return {
                ...row,
                explicitlySetColumns: newExplicitlySet,
                values: newValues,
              };
            },
          );

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  pendingNewRows: updatedNewRows,
                },
              },
            },
          };
        }),

      // Deletion actions
      markRowsForDeletion: (tabId, rowIndices) =>
        set((state) => {
          const existing = state.tableStates[tabId];
          if (!existing) return state;

          // Separate new rows (negative indices) from existing rows (positive)
          const newRowIndicesToRemove: number[] = [];
          const existingRowsToMark: number[] = [];

          for (const idx of rowIndices) {
            if (idx < 0) {
              // New row: get the array index (e.g., -1 → 0, -2 → 1)
              newRowIndicesToRemove.push(Math.abs(idx) - 1);
            } else {
              existingRowsToMark.push(idx);
            }
          }

          // Remove new rows immediately
          const updatedNewRows = existing.cellEditState.pendingNewRows.filter(
            (_, idx) => !newRowIndicesToRemove.includes(idx),
          );

          // Add existing rows to pendingDeletions (deduplicated)
          const existingDeletions = new Set(
            existing.cellEditState.pendingDeletions,
          );
          for (const idx of existingRowsToMark) {
            existingDeletions.add(idx);
          }

          return {
            tableStates: {
              ...state.tableStates,
              [tabId]: {
                ...existing,
                cellEditState: {
                  ...existing.cellEditState,
                  pendingNewRows: updatedNewRows,
                  pendingDeletions: Array.from(existingDeletions),
                  // Clear selection after marking
                  selectedCell: null,
                  selectedRange: null,
                },
              },
            },
          };
        }),

      // Config sync state actions
      updateConfigSyncState: (configId, updates) =>
        set((state) => ({
          configSyncStates: {
            ...state.configSyncStates,
            [configId]: {
              ...(state.configSyncStates[configId] ?? {
                status: "idle",
                executionId: null,
                startedAt: null,
                completedAt: null,
                error: null,
              }),
              ...updates,
            },
          },
        })),

      // Theme actions
      setDarkMode: (dark) => set({ darkMode: dark }),
      toggleDarkMode: () => set((state) => ({ darkMode: !state.darkMode })),

      // CSV export prefs
      setCsvExportPrefs: (prefs) => set({ csvExportPrefs: prefs }),

      // Shortcut actions
      setShortcut: (action, keys) =>
        set((state) => ({
          shortcutOverrides: { ...state.shortcutOverrides, [action]: keys },
        })),
      resetShortcut: (action) =>
        set((state) => {
          const { [action]: _, ...rest } = state.shortcutOverrides;
          return { shortcutOverrides: rest };
        }),
      resetAllShortcuts: () => set({ shortcutOverrides: {} }),
      getShortcut: (action) =>
        get().shortcutOverrides[action] ?? DEFAULT_SHORTCUTS[action],
      getAllShortcuts: () => ({
        ...DEFAULT_SHORTCUTS,
        ...get().shortcutOverrides,
      }),

      // Reset UI state (preserves configs/darkMode/shortcuts/cloudApiKey)
      resetUIState: () =>
        set({
          connectionTabs: [
            { ...DEFAULT_CONNECTION_TAB, id: Date.now().toString() },
          ],
          activeTabId: Date.now().toString(),
          draggedTabId: null,
          draggedInnerTabId: null,
          consoleStates: {},
          tableStates: {},
          configSyncStates: {},
          cloudSyncState: { status: "idle", lastSyncedAt: null, error: null },
        }),

      // Cloud actions
      setCloudApiKey: (key) => set({ cloudApiKey: key }),
      clearCloudApiKey: () =>
        set((state) => ({
          cloudApiKey: null,
          // Remove all cloud configs when unlinking
          databaseConfigs: state.databaseConfigs.filter(
            (c) => c.source !== "cloud",
          ),
          cloudSyncState: {
            status: "idle",
            lastSyncedAt: null,
            error: null,
          },
        })),
      setCloudSyncState: (updates) =>
        set((state) => ({
          cloudSyncState: { ...state.cloudSyncState, ...updates },
        })),
      syncCloudConfigs: (cloudConnections) =>
        set((state) => {
          // Keep all local configs unchanged
          const localConfigs = state.databaseConfigs.filter(
            (c) => c.source === "local",
          );

          // Build a map of existing cloud configs to preserve their cache
          const existingCloudConfigs = new Map(
            state.databaseConfigs
              .filter((c) => c.source === "cloud")
              .map((c) => [c.id, c]),
          );

          // Create new cloud configs from API response, preserving existing cache
          const cloudConfigs: DatabaseConfig[] = cloudConnections.map(
            (conn) => {
              const configId = `cloud_${conn.id}`;
              const existingConfig = existingCloudConfigs.get(configId);
              return {
                id: configId,
                display: conn.config.display,
                connection: conn.config.connection,
                cache: existingConfig?.cache ?? {},
                source: "cloud" as const,
                cloud: {
                  id: conn.id,
                  ownerId: conn.ownerId,
                  ownerEmail: conn.ownerEmail,
                  role: conn.role,
                  access: conn.access,
                  updatedAt: conn.updatedAt,
                },
              };
            },
          );

          return {
            databaseConfigs: [...localConfigs, ...cloudConfigs],
          };
        }),
      convertToCloudConfig: (localId, cloudInfo) =>
        set((state) => ({
          databaseConfigs: state.databaseConfigs.map((c) =>
            c.id === localId
              ? {
                  ...c,
                  id: `cloud_${cloudInfo.id}`,
                  source: "cloud" as const,
                  cloud: cloudInfo,
                }
              : c,
          ),
        })),

      // Getters
      getActiveTab: () => {
        const state = get();
        return state.connectionTabs.find((t) => t.id === state.activeTabId);
      },

      getActiveInnerTab: () => {
        const activeTab = get().getActiveTab();
        if (!activeTab?.activeInnerTabId) return undefined;
        return activeTab.innerTabs.find(
          (t) => t.id === activeTab.activeInnerTabId,
        );
      },
    }),
    {
      name: "dbdiff-storage",
      version: 2,
      storage: {
        getItem: (name) => {
          const raw = localStorage.getItem(name);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          // Rehydrate Set<string> fields in pendingNewRows
          if (parsed?.state?.tableStates) {
            for (const ts of Object.values(
              parsed.state.tableStates,
            ) as TableTabState[]) {
              if (ts.cellEditState?.pendingNewRows) {
                ts.cellEditState.pendingNewRows =
                  ts.cellEditState.pendingNewRows.map(
                    (
                      row: PendingNewRow & {
                        explicitlySetColumns: string[] | Set<string>;
                      },
                    ) => ({
                      ...row,
                      explicitlySetColumns: Array.isArray(
                        row.explicitlySetColumns,
                      )
                        ? new Set(row.explicitlySetColumns)
                        : row.explicitlySetColumns,
                    }),
                  );
              }
            }
          }
          return parsed;
        },
        setItem: (name, value) => {
          // Serialize Set<string> fields to arrays before storing
          const clone = JSON.parse(
            JSON.stringify(value, (_key, val) =>
              val instanceof Set ? [...val] : val,
            ),
          );
          localStorage.setItem(name, JSON.stringify(clone));
        },
        removeItem: (name) => localStorage.removeItem(name),
      },
      partialize: (state) =>
        ({
          databaseConfigs: state.databaseConfigs,
          darkMode: state.darkMode,
          shortcutOverrides: state.shortcutOverrides,
          cloudApiKey: state.cloudApiKey,
          csvExportPrefs: state.csvExportPrefs,
          connectionTabs: state.connectionTabs,
          activeTabId: state.activeTabId,
          // Strip result/error/transient execution state from consoleStates; keep queryText
          consoleStates: Object.fromEntries(
            Object.entries(state.consoleStates).map(([id, cs]) => [
              id,
              {
                queryText: cs.queryText,
                status: "idle" as const,
                executionId: null,
                startedAt: null,
                completedAt: null,
                result: null,
                error: null,
                diffResult: null,
                lastAction: null,
              },
            ]),
          ),
          // Strip result/error/transient state from tableStates; keep filters, sorts, pending user work
          tableStates: Object.fromEntries(
            Object.entries(state.tableStates).map(([id, ts]) => [
              id,
              {
                tableName: ts.tableName,
                whereClause: ts.whereClause,
                sortColumns: ts.sortColumns,
                currentPage: ts.currentPage,
                totalRowCount: null,
                status: "idle" as const,
                executionId: null,
                startedAt: null,
                completedAt: null,
                result: null,
                error: null,
                cellEditState: {
                  selectedCell: null,
                  selectedRange: null,
                  isDragging: false,
                  editingCell: null,
                  editValue: "",
                  pendingChanges: ts.cellEditState.pendingChanges,
                  pendingNewRows: ts.cellEditState.pendingNewRows,
                  pendingDeletions: ts.cellEditState.pendingDeletions,
                },
              },
            ]),
          ),
        }) as unknown as AppState,
      migrate: (persistedState, version) => {
        const state = persistedState as Partial<AppState>;

        // Migration from version 0 to 1: add source field to existing configs
        if (version === 0) {
          if (state.databaseConfigs) {
            state.databaseConfigs = state.databaseConfigs.map((config) => ({
              ...config,
              source: config.source ?? ("local" as const),
            }));
          }
        }

        // Migration from version 1 to 2: no-op, new fields fall back to defaults
        return state as AppState;
      },
    },
  ),
);
