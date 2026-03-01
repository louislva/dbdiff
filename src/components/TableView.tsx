import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Braces,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Minus,
  Plus,
  RotateCcw,
  Trash2,
  XIcon,
} from "lucide-react";
import { PAGE_SIZE } from "../constants";
import {
  useTableExecution,
  useTableState,
  useTableCellEdit,
  useTablePrimaryKey,
  useTableMetadata,
  useGenerateCombinedQueries,
  useOpenConsoleWithQuery,
  useForeignKeyMap,
  useOpenTableTab,
  useIncomingForeignKeys,
  formatWhereValue,
  getQuotedTableName,
  useHotkey,
  type ForeignKeyRef,
  type IncomingForeignKey,
} from "../stores/hooks";
import { useStore } from "../stores/store";
import { CsvExportModal } from "./CsvExportModal";
import { JsonTreeViewer } from "./JsonTreeViewer";
import {
  DataGrid,
  type DataGridCellProps,
  type DataGridSelection,
  type ExtraRow,
  type RangeEdges,
  storeToVirtualIndex,
  virtualToStoreIndex,
  getSelectedRowIndices,
  getCellRangeInfo,
  formatCellValue,
  getInternalClipboardValue,
  parseTSV,
  isInternalRangeCopy,
} from "./DataGrid";

// Check if a column's data type is a date/datetime type
function getDateColumnType(dataType: string): "date" | "datetime" | null {
  const dt = dataType.toLowerCase();
  if (dt === "date") return "date";
  if (dt.startsWith("timestamp") || dt === "timestamptz" || dt === "datetime")
    return "datetime";
  return null;
}

function isJsonColumn(dataType: string): boolean {
  const dt = dataType.toLowerCase();
  return dt === "json" || dt === "jsonb";
}

function tryParseJson(value: unknown): unknown | null {
  if (value !== null && typeof value === "object") return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Convert a cell's edit value string to the native input format
function toNativeDateValue(
  value: string | null,
  type: "date" | "datetime",
): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    if (type === "date") {
      return d.toISOString().slice(0, 10);
    }
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return "";
  }
}

interface TableViewProps {
  tabId: string;
  tableName: string;
}

// Minimum height for the bottom panel
const MIN_BOTTOM_PANEL_HEIGHT = 100;
const DEFAULT_BOTTOM_PANEL_HEIGHT = 200;

export function TableView({ tabId, tableName }: TableViewProps) {
  const tableState = useTableState(tabId);
  const initTableState = useStore((state) => state.initTableState);
  const setTableWhereClause = useStore((state) => state.setTableWhereClause);
  const setTablePage = useStore((state) => state.setTablePage);
  const toggleTableSort = useStore((state) => state.toggleTableSort);
  const updateConfig = useStore((state) => state.updateConfig);
  const { execute } = useTableExecution(tabId);

  const activeDatabaseConfig = useStore((state) => {
    const activeTab = state.connectionTabs.find(
      (t) => t.id === state.activeTabId,
    );
    if (!activeTab?.databaseConfigId) return null;
    return (
      state.databaseConfigs.find((c) => c.id === activeTab.databaseConfigId) ??
      null
    );
  });
  const pageSize =
    activeDatabaseConfig?.tableConfigs?.[tableName]?.pageSize ?? PAGE_SIZE;

  // Cell editing state and actions
  const cellEdit = useTableCellEdit(tabId);
  const primaryKeyColumns = useTablePrimaryKey(tableName);
  const tableMetadata = useTableMetadata(tableName);
  const openConsoleWithQuery = useOpenConsoleWithQuery();
  const foreignKeyMap = useForeignKeyMap(tableName);
  const openTableTab = useOpenTableTab();
  const incomingForeignKeys = useIncomingForeignKeys(tableName);

  // Bottom panel resize state
  const [bottomPanelHeight, setBottomPanelHeight] = useState(
    DEFAULT_BOTTOM_PANEL_HEIGHT,
  );
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const prevNewRowCountRef = useRef(0);

  const rows = tableState.result?.rows ?? [];
  const pendingNewRowCount = cellEdit.pendingNewRows.length;
  const totalVirtualRowCount = rows.length + pendingNewRowCount;

  const generateCombinedQueries = useGenerateCombinedQueries(
    tabId,
    tableName,
    rows,
  );

  // FK preview config (persisted)
  const fkPreviewColumns =
    activeDatabaseConfig?.tableConfigs?.[tableName]?.fkPreviewColumns ?? {};

  // FK preview data: fkColumnName -> Map<pkValue, displayValue>
  const [fkPreviewData, setFkPreviewData] = useState<
    Record<string, Map<string, string>>
  >({});

  // Header context menu state (for FK preview column picker)
  const [headerContextMenu, setHeaderContextMenu] = useState<{
    x: number;
    y: number;
    columnName: string;
    foreignKeyRef: ForeignKeyRef;
  } | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    rowIndex: number;
    columnName: string;
  } | null>(null);

  // Handler: open header context menu for FK columns
  const handleHeaderContextMenu = useCallback(
    (columnName: string, e: React.MouseEvent) => {
      const fkRef = foreignKeyMap.get(columnName);
      if (!fkRef) return; // Only FK columns get a header context menu
      setHeaderContextMenu({
        x: e.clientX,
        y: e.clientY,
        columnName,
        foreignKeyRef: fkRef,
      });
    },
    [foreignKeyMap],
  );

  // Handler: set FK preview column choice (persist to config)
  const handleSetFkPreviewColumn = useCallback(
    (fkColumn: string, displayColumn: string | null) => {
      if (!activeDatabaseConfig) return;
      const existing =
        activeDatabaseConfig.tableConfigs?.[tableName]?.fkPreviewColumns ?? {};
      const updated = { ...existing };
      if (displayColumn === null) {
        delete updated[fkColumn];
      } else {
        updated[fkColumn] = displayColumn;
      }
      updateConfig(activeDatabaseConfig.id, {
        tableConfigs: {
          ...activeDatabaseConfig.tableConfigs,
          [tableName]: {
            ...activeDatabaseConfig.tableConfigs?.[tableName],
            fkPreviewColumns: updated,
          },
        },
      });
      setHeaderContextMenu(null);
    },
    [activeDatabaseConfig, updateConfig, tableName],
  );

  // Get columns of the referenced table (for header context menu)
  const getReferencedTableColumns = useCallback(
    (ref: ForeignKeyRef): string[] => {
      if (!activeDatabaseConfig?.cache?.schemas) return [];
      const schema = activeDatabaseConfig.cache.schemas.find(
        (s) => s.name === ref.schema,
      );
      if (!schema) return [];
      const table = schema.tables.find((t) => t.name === ref.table);
      if (!table) return [];
      return table.columns.map((c) => c.name);
    },
    [activeDatabaseConfig],
  );

  const [showCsvExport, setShowCsvExport] = useState(false);

  const fetchAllRowsForExport = useCallback(async () => {
    if (!activeDatabaseConfig) throw new Error("No database connection");
    const whereFragment = tableState.whereClause.trim()
      ? ` WHERE ${tableState.whereClause}`
      : "";
    const quotedTable = getQuotedTableName(tableName);
    let query = `SELECT * FROM ${quotedTable}${whereFragment}`;
    if (tableState.sortColumns.length > 0) {
      const orderByParts = tableState.sortColumns.map(
        (s) => `"${s.column}" ${s.direction}`,
      );
      query += ` ORDER BY ${orderByParts.join(", ")}`;
    }
    const res = await fetch("/api/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        connection: activeDatabaseConfig.connection,
        query,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Query failed");
    return data.rows as Record<string, unknown>[];
  }, [
    activeDatabaseConfig,
    tableState.whereClause,
    tableState.sortColumns,
    tableName,
  ]);

  // Can edit if we have a primary key
  const canEdit = primaryKeyColumns.length > 0;

  // Initialize state on mount
  useEffect(() => {
    initTableState(tabId, tableName);
  }, [tabId, tableName, initTableState]);

  // Auto-execute on first load
  useEffect(() => {
    if (tableState.status === "idle" && tableState.tableName === tableName) {
      execute();
    }
  }, [tableState.status, tableState.tableName, tableName, execute]);

  // Fetch FK preview data when results change or FK preview config changes
  useEffect(() => {
    if (!tableState.result || !activeDatabaseConfig) return;
    const entries = Object.entries(fkPreviewColumns);
    if (entries.length === 0) {
      setFkPreviewData({});
      return;
    }

    let cancelled = false;

    async function fetchPreviews() {
      const newPreviewData: Record<string, Map<string, string>> = {};

      await Promise.all(
        entries.map(async ([fkCol, displayCol]) => {
          const fkRef = foreignKeyMap.get(fkCol);
          if (!fkRef) return;

          // Collect distinct non-null FK values from current rows
          const values = new Set<string>();
          for (const row of rows) {
            const v = row[fkCol];
            if (v !== null && v !== undefined) {
              values.add(String(v));
            }
          }
          if (values.size === 0) return;

          const quotedRefTable =
            fkRef.schema === "public"
              ? `"${fkRef.table}"`
              : `"${fkRef.schema}"."${fkRef.table}"`;
          const inList = Array.from(values)
            .map((v) => `'${v.replace(/'/g, "''")}'`)
            .join(", ");
          const query = `SELECT DISTINCT "${fkRef.column}", "${displayCol}" FROM ${quotedRefTable} WHERE "${fkRef.column}" IN (${inList})`;

          try {
            const res = await fetch("/api/query", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                connection: activeDatabaseConfig!.connection,
                query,
              }),
            });
            if (!res.ok) return;
            const data = await res.json();
            if (cancelled) return;
            const map = new Map<string, string>();
            for (const row of data.rows ?? []) {
              const pk = String(row[fkRef.column] ?? "");
              const display = row[displayCol];
              map.set(pk, display === null ? "NULL" : String(display));
            }
            newPreviewData[fkCol] = map;
          } catch {
            // Silently ignore — cells just show raw value
          }
        }),
      );

      if (!cancelled) {
        setFkPreviewData(newPreviewData);
      }
    }

    fetchPreviews();
    return () => {
      cancelled = true;
    };
  }, [
    tableState.result,
    fkPreviewColumns,
    foreignKeyMap,
    activeDatabaseConfig,
    rows,
  ]);

  // Scroll to bottom when a new row is added
  useEffect(() => {
    const currentCount = cellEdit.pendingNewRows.length;
    if (currentCount > prevNewRowCountRef.current) {
      tableScrollRef.current?.scrollTo(0, tableScrollRef.current.scrollHeight);
    }
    prevNewRowCountRef.current = currentCount;
  }, [cellEdit.pendingNewRows.length]);

  const handleWhereChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setTableWhereClause(tabId, e.target.value);
    },
    [tabId, setTableWhereClause],
  );

  const handleWhereKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        execute();
      }
    },
    [execute],
  );

  // Sort change handler for DataGrid
  const handleSortChange = useCallback(
    (columnName: string, addToExisting: boolean) => {
      toggleTableSort(tabId, columnName, addToExisting);
      setTimeout(execute, 0);
    },
    [tabId, toggleTableSort, execute],
  );

  // Cell double-click handler - starts editing
  const handleCellDoubleClick = useCallback(
    (rowIndex: number, columnName: string, value: unknown) => {
      const isNewRow = rowIndex < 0;
      if (!canEdit && !isNewRow) return;
      const initialValue =
        value === null
          ? null
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value ?? "");
      cellEdit.startEditingCell({ rowIndex, columnName }, initialValue);
    },
    [canEdit, cellEdit],
  );

  // Bridge: DataGrid selection → Zustand cellEdit state
  const dataGridSelection: DataGridSelection = useMemo(
    () => ({
      selectedCell: cellEdit.selectedCell,
      selectedRange: cellEdit.selectedRange,
      isDragging: cellEdit.isDragging,
    }),
    [cellEdit.selectedCell, cellEdit.selectedRange, cellEdit.isDragging],
  );

  const handleSelectionChange = useCallback(
    (sel: DataGridSelection) => {
      // Enforce canEdit check: only allow selection for editable tables or new rows
      if (sel.selectedCell) {
        const isNewRow = sel.selectedCell.rowIndex < 0;
        if (!canEdit && !isNewRow) return;
      }
      if (sel.isDragging !== cellEdit.isDragging) {
        cellEdit.setCellDragging(sel.isDragging);
      }
      if (sel.selectedRange !== cellEdit.selectedRange) {
        if (sel.selectedRange) {
          cellEdit.selectCellRange(sel.selectedRange);
        }
      }
      if (sel.selectedCell !== cellEdit.selectedCell) {
        cellEdit.selectCell(sel.selectedCell);
      }
      // Handle selectAll: if both cell and range changed at once
      if (
        sel.selectedCell &&
        sel.selectedRange &&
        sel.selectedCell !== cellEdit.selectedCell
      ) {
        cellEdit.selectCell(sel.selectedCell);
        cellEdit.selectCellRange(sel.selectedRange);
      }
    },
    [canEdit, cellEdit],
  );

  // onKeyDown intercept: handle editing keys before DataGrid handles nav/copy
  const handleKeyDown = useCallback(
    (e: KeyboardEvent): boolean => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA")
        return false;

      const { selectedCell, editingCell } = cellEdit;

      // Cmd+V / Ctrl+V to paste
      if (
        selectedCell &&
        !editingCell &&
        e.key === "v" &&
        (e.metaKey || e.ctrlKey)
      ) {
        e.preventDefault();
        const isNewRow = selectedCell.rowIndex < 0;
        if (!canEdit && !isNewRow) return true;

        const fields = tableState.result?.fields ?? [];
        const columnNames = fields.map((f) => f.name);
        const existingRowCount = rows.length;
        const extraRowCount = cellEdit.pendingNewRows.length;
        const totalRows = existingRowCount + extraRowCount;

        navigator.clipboard.readText().then((pastedText) => {
          const parsed = parseTSV(pastedText);

          if (parsed) {
            // Multi-cell paste
            const isInternal = isInternalRangeCopy(pastedText);
            const { selectedRange } = cellEdit;

            let anchorVirtual: number;
            let anchorColIdx: number;
            let pasteRowCount: number;
            let pasteColCount: number;

            if (selectedRange) {
              // Paste into selected range — clamp to range dimensions
              const startV = storeToVirtualIndex(
                selectedRange.start.rowIndex,
                existingRowCount,
              );
              const endV = storeToVirtualIndex(
                selectedRange.end.rowIndex,
                existingRowCount,
              );
              anchorVirtual = Math.min(startV, endV);
              const startCI = columnNames.indexOf(
                selectedRange.start.columnName,
              );
              const endCI = columnNames.indexOf(selectedRange.end.columnName);
              anchorColIdx = Math.min(startCI, endCI);
              pasteRowCount = Math.min(
                parsed.length,
                Math.abs(endV - startV) + 1,
              );
              pasteColCount = Math.min(
                parsed[0]?.length ?? 0,
                Math.abs(endCI - startCI) + 1,
              );
            } else {
              // Single cell anchor — expand rightward/downward, clamp to grid
              anchorVirtual = storeToVirtualIndex(
                selectedCell.rowIndex,
                existingRowCount,
              );
              anchorColIdx = columnNames.indexOf(selectedCell.columnName);
              pasteRowCount = Math.min(
                parsed.length,
                totalRows - anchorVirtual,
              );
              pasteColCount = Math.min(
                parsed[0]?.length ?? 0,
                columnNames.length - anchorColIdx,
              );
            }

            const cells: Array<{
              rowIndex: number;
              columnName: string;
              value: string | null;
            }> = [];

            for (let r = 0; r < pasteRowCount; r++) {
              const tsvRow = parsed[r] ?? [];
              for (let c = 0; c < pasteColCount; c++) {
                const rawVal = tsvRow[c] ?? "";
                const value = isInternal && rawVal === "NULL" ? null : rawVal;
                const rowIdx = virtualToStoreIndex(
                  anchorVirtual + r,
                  existingRowCount,
                );
                const colName = columnNames[anchorColIdx + c];
                if (colName !== undefined) {
                  cells.push({ rowIndex: rowIdx, columnName: colName, value });
                }
              }
            }

            if (cells.length > 0) {
              cellEdit.pasteCellRange(cells);
            }
          } else {
            // Single-cell paste (unchanged behavior)
            const rawValue = getInternalClipboardValue(pastedText);
            if (rawValue === null) {
              cellEdit.setCellToNull(selectedCell);
            } else {
              cellEdit.startEditingCell(selectedCell, pastedText);
              setTimeout(() => {
                cellEdit.commitCellEdit();
              }, 0);
            }
          }
        });
        return true;
      }

      // Enter/F2 to start editing
      if (
        selectedCell &&
        !editingCell &&
        (e.key === "Enter" || e.key === "F2")
      ) {
        e.preventDefault();
        if (selectedCell.rowIndex < 0) {
          const newRowIndex = Math.abs(selectedCell.rowIndex) - 1;
          const newRow = cellEdit.pendingNewRows[newRowIndex];
          if (newRow) {
            const isExplicitlySet = newRow.explicitlySetColumns.has(
              selectedCell.columnName,
            );
            const value = isExplicitlySet
              ? newRow.values[selectedCell.columnName]
              : null;
            const initialValue =
              value === null
                ? null
                : typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value);
            cellEdit.startEditingCell(selectedCell, initialValue);
          }
        } else {
          const row = rows[selectedCell.rowIndex];
          const value = row?.[selectedCell.columnName];
          const initialValue =
            value === null
              ? null
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value ?? "");
          cellEdit.startEditingCell(selectedCell, initialValue);
        }
        return true;
      }

      // Escape to cancel edit (DataGrid handles deselect)
      if (e.key === "Escape" && editingCell) {
        e.preventDefault();
        cellEdit.cancelCellEdit();
        return true;
      }

      return false;
    },
    [cellEdit, rows, canEdit, tableState.result],
  );

  // Handle Apply Changes button
  const handleApplyChanges = useCallback(() => {
    const sql = generateCombinedQueries();
    if (sql) {
      openConsoleWithQuery(sql);
      cellEdit.clearPendingChanges();
    }
  }, [generateCombinedQueries, openConsoleWithQuery, cellEdit]);

  // Handle Add Row button
  const handleAddRow = useCallback(() => {
    cellEdit.addNewRow();
  }, [cellEdit]);

  // Handle Delete Rows button
  const handleDeleteRows = useCallback(() => {
    const rowIndices = getSelectedRowIndices(
      cellEdit.selectedCell,
      cellEdit.selectedRange,
      rows.length,
    );
    if (rowIndices.length > 0) {
      cellEdit.markRowsForDeletion(rowIndices);
    }
  }, [cellEdit, rows.length]);

  // Register Delete key shortcut
  useHotkey("deleteRows", handleDeleteRows, {
    enabled: !!cellEdit.selectedCell,
  });

  // Handle Select All (Cmd+A / Ctrl+A)
  const handleSelectAll = useCallback(() => {
    const fields = tableState.result?.fields;
    if (!fields || fields.length === 0 || totalVirtualRowCount === 0) return;
    const firstCol = fields[0].name;
    const lastCol = fields[fields.length - 1].name;
    const lastStoreIndex = virtualToStoreIndex(
      totalVirtualRowCount - 1,
      rows.length,
    );
    cellEdit.selectCell({ rowIndex: 0, columnName: firstCol });
    cellEdit.selectCellRange({
      start: { rowIndex: 0, columnName: firstCol },
      end: { rowIndex: lastStoreIndex, columnName: lastCol },
    });
  }, [tableState.result, totalVirtualRowCount, rows.length, cellEdit]);

  useHotkey("selectAll", handleSelectAll);
  useHotkey("refreshTable", execute);

  // Handle Set to Default action from context menu (for new rows)
  const handleSetToDefault = useCallback(() => {
    if (contextMenu && contextMenu.rowIndex < 0) {
      const newRowIndex = Math.abs(contextMenu.rowIndex) - 1;
      const newRow = cellEdit.pendingNewRows[newRowIndex];
      if (newRow) {
        cellEdit.setNewRowToDefault(newRow.tempId, contextMenu.columnName);
      }
      setContextMenu(null);
    }
  }, [contextMenu, cellEdit]);

  // Handle foreign key navigation
  const handleNavigateToForeignKey = useCallback(
    (ref: ForeignKeyRef, value: unknown) => {
      const targetTable =
        ref.schema === "public" ? ref.table : `${ref.schema}.${ref.table}`;
      const whereClause = `"${ref.column}" = ${formatWhereValue(value)}`;
      openTableTab(targetTable, { whereClause });
    },
    [openTableTab],
  );

  // Handle context menu
  const handleCellContextMenu = useCallback(
    (rowIndex: number, columnName: string, e: React.MouseEvent) => {
      const isNewRow = rowIndex < 0;
      if (!canEdit && !isNewRow) return;
      e.preventDefault();
      e.stopPropagation();
      cellEdit.selectCell({ rowIndex, columnName });
      setContextMenu({ x: e.clientX, y: e.clientY, rowIndex, columnName });
    },
    [canEdit, cellEdit],
  );

  // Handle Revert Cell action from context menu
  const handleRevertCell = useCallback(() => {
    if (contextMenu) {
      cellEdit.revertCellChange({
        rowIndex: contextMenu.rowIndex,
        columnName: contextMenu.columnName,
      });
      setContextMenu(null);
    }
  }, [contextMenu, cellEdit]);

  // Handle Set NULL action from context menu
  const handleSetNull = useCallback(() => {
    if (contextMenu) {
      cellEdit.setCellToNull({
        rowIndex: contextMenu.rowIndex,
        columnName: contextMenu.columnName,
      });
      setContextMenu(null);
    }
  }, [contextMenu, cellEdit]);

  // Close context menus on click outside or escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-context-menu]")) {
        setContextMenu(null);
        setHeaderContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setContextMenu(null);
        setHeaderContextMenu(null);
      }
    };
    if (contextMenu || headerContextMenu) {
      window.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [contextMenu, headerContextMenu]);

  // Determine if exactly one row is selected
  const selectedRowIndex = cellEdit.selectedCell?.rowIndex ?? null;
  const hasRangeSelection = cellEdit.selectedRange !== null;
  const isSingleRowSelected = selectedRowIndex !== null && !hasRangeSelection;
  const selectedRow = isSingleRowSelected ? rows[selectedRowIndex] : null;

  // Derive JSON data for selected cell (for bottom panel viewer)
  // Uses pending change value if one exists, so edits are reflected immediately
  const selectedCellJsonData = useMemo(() => {
    if (!isSingleRowSelected || !cellEdit.selectedCell) return null;
    const { rowIndex, columnName } = cellEdit.selectedCell;
    const col = tableMetadata?.columns.find((c) => c.name === columnName);
    const pendingChange = cellEdit.pendingChanges[`${rowIndex}:${columnName}`];
    const value = pendingChange
      ? pendingChange.newValue
      : selectedRow?.[columnName];
    const isJson = col ? isJsonColumn(col.dataType) : false;
    const parsed = isJson
      ? typeof value === "object" && value !== null
        ? value
        : tryParseJson(value)
      : tryParseJson(value);
    if (parsed === null) return null;
    return { columnName, data: parsed };
  }, [
    isSingleRowSelected,
    cellEdit.selectedCell,
    cellEdit.pendingChanges,
    selectedRow,
    tableMetadata,
  ]);

  // Handle JSON edit from tree viewer
  const handleJsonEdit = useCallback(
    (newData: unknown) => {
      if (!cellEdit.selectedCell) return;
      cellEdit.startEditingCell(
        cellEdit.selectedCell,
        JSON.stringify(selectedRow?.[cellEdit.selectedCell.columnName]),
      );
      cellEdit.updateEditValue(JSON.stringify(newData));
      // Use setTimeout to ensure startEditingCell has been processed
      setTimeout(() => {
        cellEdit.commitCellEdit();
      }, 0);
    },
    [cellEdit, selectedRow],
  );

  // Handle bottom panel resize
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;
      setBottomPanelHeight(
        Math.max(
          MIN_BOTTOM_PANEL_HEIGHT,
          Math.min(newHeight, containerRect.height - 200),
        ),
      );
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Handle incoming FK navigation
  const handleIncomingFKClick = useCallback(
    (fk: IncomingForeignKey) => {
      if (!selectedRow) return;
      const targetValue = selectedRow[fk.toColumn];
      const targetTable =
        fk.fromSchema === "public"
          ? fk.fromTable
          : `${fk.fromSchema}.${fk.fromTable}`;
      const whereClause = `"${fk.fromColumn}" = ${formatWhereValue(
        targetValue,
      )}`;
      openTableTab(targetTable, { whereClause });
    },
    [selectedRow, openTableTab],
  );

  const {
    status,
    result,
    error,
    whereClause,
    sortColumns,
    currentPage,
    totalRowCount,
  } = tableState;
  const totalPages =
    totalRowCount != null ? Math.ceil(totalRowCount / pageSize) : null;
  const pendingChangesCount =
    Object.keys(cellEdit.pendingChanges).length +
    cellEdit.pendingNewRows.length +
    cellEdit.pendingDeletions.length;

  const handlePrevPage = useCallback(() => {
    if (currentPage > 0) {
      setTablePage(tabId, currentPage - 1);
      tableScrollRef.current?.scrollTo(0, 0);
      setTimeout(execute, 0);
    }
  }, [tabId, currentPage, setTablePage, execute]);

  const handleNextPage = useCallback(() => {
    if (totalPages != null && currentPage < totalPages - 1) {
      setTablePage(tabId, currentPage + 1);
      tableScrollRef.current?.scrollTo(0, 0);
      setTimeout(execute, 0);
    }
  }, [tabId, currentPage, totalPages, setTablePage, execute]);

  const handlePageSizeChange = useCallback(
    (newPageSize: number) => {
      if (!activeDatabaseConfig) return;
      updateConfig(activeDatabaseConfig.id, {
        tableConfigs: {
          ...activeDatabaseConfig.tableConfigs,
          [tableName]: {
            ...activeDatabaseConfig.tableConfigs?.[tableName],
            pageSize: newPageSize,
          },
        },
      });
      setTablePage(tabId, 0);
      setTimeout(execute, 0);
    },
    [
      activeDatabaseConfig,
      updateConfig,
      tabId,
      tableName,
      setTablePage,
      execute,
    ],
  );

  // Build extraRows for DataGrid from pendingNewRows
  const extraRows: ExtraRow[] = useMemo(
    () =>
      cellEdit.pendingNewRows.map((nr) => ({
        key: nr.tempId,
        data: nr.values as Record<string, unknown>,
      })),
    [cellEdit.pendingNewRows],
  );

  // Set of columns with active FK preview (for header indicator)
  const fkPreviewActiveColumns = useMemo(
    () => new Set(Object.keys(fkPreviewColumns)),
    [fkPreviewColumns],
  );

  // renderCell: renders EditableCell for existing rows, NewRowCell for new rows
  const renderCell = useCallback(
    (props: DataGridCellProps) => {
      const { rowIndex, columnName, columnIndex } = props;
      const isNewRow = rowIndex < 0;

      if (isNewRow) {
        const newRowArrayIndex = Math.abs(rowIndex) - 1;
        const newRow = cellEdit.pendingNewRows[newRowArrayIndex];
        if (!newRow) return null;

        const columnInfo = tableMetadata?.columns.find(
          (c) => c.name === columnName,
        );
        const isExplicitlySet = newRow.explicitlySetColumns.has(columnName);
        const explicitValue = newRow.values[columnName];
        const defaultValue = columnInfo?.defaultValue;

        let displayContent: React.ReactNode;
        let cellValue: unknown;

        if (isExplicitlySet) {
          cellValue = explicitValue;
          displayContent =
            explicitValue === null ? (
              <span className="text-tertiary italic">NULL</span>
            ) : (
              explicitValue
            );
        } else if (defaultValue !== null && defaultValue !== undefined) {
          cellValue = null;
          displayContent = (
            <span className="text-tertiary italic">{defaultValue}</span>
          );
        } else {
          cellValue = null;
          const dataType = columnInfo?.dataType ?? "";
          const isAutoIncrement = dataType.includes("serial");
          const isNullable = columnInfo?.isNullable ?? false;

          if (isAutoIncrement) {
            displayContent = (
              <span className="text-tertiary italic">(auto)</span>
            );
          } else if (isNullable) {
            displayContent = <span className="text-tertiary italic">NULL</span>;
          } else {
            displayContent = <span className="text-tertiary italic">—</span>;
          }
        }

        const rangeInfo = getCellRangeInfo(
          { rowIndex, columnName },
          cellEdit.selectedRange,
          result?.fields.map((f) => f.name) ?? [],
          rows.length,
        );

        const isEditingThisCell =
          cellEdit.editingCell?.rowIndex === rowIndex &&
          cellEdit.editingCell?.columnName === columnName;

        return (
          <NewRowCell
            key={columnIndex}
            rowIndex={rowIndex}
            columnName={columnName}
            dateColumnType={getDateColumnType(columnInfo?.dataType ?? "")}
            displayContent={displayContent}
            value={cellValue}
            isExplicitlySet={isExplicitlySet}
            isSelected={
              cellEdit.selectedCell?.rowIndex === rowIndex &&
              cellEdit.selectedCell?.columnName === columnName
            }
            isEditing={isEditingThisCell}
            isInRange={rangeInfo.isInRange}
            rangeEdges={rangeInfo.edges}
            editValue={isEditingThisCell ? (cellEdit.editValue ?? "") : ""}
            onUpdateEditValue={cellEdit.updateEditValue}
            onCommitEdit={cellEdit.commitCellEdit}
            onCancelEdit={cellEdit.cancelCellEdit}
            onClick={props.onClick}
            onDoubleClick={handleCellDoubleClick}
            onMouseDown={props.onMouseDown}
            onMouseEnter={props.onMouseEnter}
            onContextMenu={handleCellContextMenu}
            isLastColumn={columnIndex === (result?.fields.length ?? 0) - 1}
            onRemoveRow={() => cellEdit.removeNewRow(newRow.tempId)}
          />
        );
      }

      // Existing row
      const rangeInfo = getCellRangeInfo(
        { rowIndex, columnName },
        cellEdit.selectedRange,
        result?.fields.map((f) => f.name) ?? [],
        rows.length,
      );

      const isEditingThisCell =
        cellEdit.editingCell?.rowIndex === rowIndex &&
        cellEdit.editingCell?.columnName === columnName;

      const editColumnInfo = tableMetadata?.columns.find(
        (c) => c.name === columnName,
      );

      const isMarkedForDeletion = cellEdit.pendingDeletions.includes(rowIndex);

      // FK preview value lookup
      const cellValue = rows[rowIndex]?.[columnName];
      const previewMap = fkPreviewData[columnName];
      const fkPreviewValue =
        previewMap && cellValue !== null && cellValue !== undefined
          ? previewMap.get(String(cellValue))
          : undefined;

      return (
        <EditableCell
          key={columnIndex}
          rowIndex={rowIndex}
          columnName={columnName}
          value={cellValue}
          dateColumnType={getDateColumnType(editColumnInfo?.dataType ?? "")}
          displayValue={
            cellEdit.pendingChanges[`${rowIndex}:${columnName}`]?.newValue
          }
          canEdit={canEdit}
          isJsonCell={
            editColumnInfo
              ? isJsonColumn(editColumnInfo.dataType)
              : tryParseJson(cellValue) !== null
          }
          isSelected={
            cellEdit.selectedCell?.rowIndex === rowIndex &&
            cellEdit.selectedCell?.columnName === columnName
          }
          isEditing={isEditingThisCell}
          isInRange={rangeInfo.isInRange}
          rangeEdges={rangeInfo.edges}
          isChanged={!!cellEdit.pendingChanges[`${rowIndex}:${columnName}`]}
          editValue={isEditingThisCell ? (cellEdit.editValue ?? "") : ""}
          foreignKeyRef={foreignKeyMap.get(columnName)}
          fkPreviewValue={fkPreviewValue}
          onUpdateEditValue={cellEdit.updateEditValue}
          onCommitEdit={cellEdit.commitCellEdit}
          onCancelEdit={cellEdit.cancelCellEdit}
          onClick={props.onClick}
          onDoubleClick={handleCellDoubleClick}
          onMouseDown={props.onMouseDown}
          onMouseEnter={props.onMouseEnter}
          onNavigateToForeignKey={handleNavigateToForeignKey}
          onContextMenu={handleCellContextMenu}
          isMarkedForDeletion={isMarkedForDeletion}
        />
      );
    },
    [
      cellEdit,
      tableMetadata,
      result,
      rows,
      canEdit,
      foreignKeyMap,
      fkPreviewData,
      handleCellDoubleClick,
      handleCellContextMenu,
      handleNavigateToForeignKey,
    ],
  );

  return (
    <div ref={containerRef} className="h-full w-full flex flex-col">
      {/* Action bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-stone-200 dark:border-white/[0.06] bg-stone-50 dark:bg-white/[0.02]">
        {/* Refresh button */}
        <button
          onClick={execute}
          disabled={status === "executing"}
          className="flex items-center gap-1.5 px-2 py-1 text-[12px] rounded hover:bg-stone-200/70 dark:hover:bg-white/[0.06] text-secondary hover:text-primary transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <svg
            className={`w-3.5 h-3.5 ${
              status === "executing" ? "animate-spin" : ""
            }`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span>Refresh</span>
        </button>

        <div className="w-px h-4 bg-stone-200 dark:bg-white/[0.08]" />

        {/* Add row button */}
        <button
          onClick={handleAddRow}
          className="flex items-center gap-1.5 px-2 py-1 text-[12px] rounded hover:bg-stone-200/70 dark:hover:bg-white/[0.06] text-secondary hover:text-primary transition-colors"
          title="Add new row"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Row</span>
        </button>

        {/* Delete rows button */}
        <button
          onClick={handleDeleteRows}
          disabled={!cellEdit.selectedCell}
          className="flex items-center gap-1.5 px-2 py-1 text-[12px] rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-secondary hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-secondary transition-colors"
          title="Delete selected rows"
        >
          <Minus className="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>

        <div className="flex-1" />

        {/* Pending changes actions */}
        {pendingChangesCount > 0 && (
          <>
            <button
              onClick={() => cellEdit.clearPendingChanges()}
              className="flex items-center gap-1.5 px-2 py-1 text-[12px] rounded hover:bg-stone-200/70 dark:hover:bg-white/[0.06] text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              title="Revert all changes"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Revert</span>
            </button>
            <button
              onClick={handleApplyChanges}
              className="flex items-center gap-1.5 px-3 py-1 text-[12px] font-medium rounded bg-amber-500 text-white hover:bg-amber-600 transition-colors"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Apply {pendingChangesCount} Change
              {pendingChangesCount !== 1 ? "s" : ""}
            </button>
          </>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex-shrink-0 flex items-center gap-4 px-3 py-1.5 border-b border-stone-200 dark:border-white/[0.06]">
        {/* WHERE input */}
        <div className="flex items-center gap-2 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] text-tertiary">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            <span className="font-medium">WHERE</span>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={whereClause}
              onChange={handleWhereChange}
              onKeyDown={handleWhereKeyDown}
              placeholder="e.g., user_id='abc123'"
              className="w-full px-2 py-1 pr-7 text-[13px] font-mono bg-white dark:bg-black/20 border border-stone-200 dark:border-white/[0.08] rounded focus:outline-none focus:border-stone-400 dark:focus:border-white/20 placeholder:text-tertiary"
            />
            {whereClause && (
              <button
                onClick={() => {
                  setTableWhereClause(tabId, "");
                  setTimeout(execute, 0);
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-stone-200 dark:hover:bg-white/10 text-tertiary hover:text-secondary transition-colors"
                title="Clear filter"
              >
                <XIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Sort indicator */}
        {sortColumns.length > 0 && (
          <div className="flex items-center gap-1.5 text-[12px] text-tertiary">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="4" y1="6" x2="14" y2="6" />
              <line x1="4" y1="12" x2="11" y2="12" />
              <line x1="4" y1="18" x2="8" y2="18" />
              <polyline points="17 10 20 7 23 10" />
              <line x1="20" y1="7" x2="20" y2="21" />
            </svg>
            <span className="font-mono">
              {sortColumns.map((s) => `${s.column} ${s.direction}`).join(", ")}
            </span>
          </div>
        )}
      </div>

      {/* Main content area with results and bottom panel */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Results section */}
        <div className="flex-1 min-h-0 relative">
          {/* Initial loading state (no previous results) */}
          {status === "idle" && !result && (
            <div className="flex items-center justify-center h-full text-tertiary text-[13px]">
              Loading table data...
            </div>
          )}

          {/* Loading state without previous results */}
          {status === "executing" && !result && (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-3 text-secondary text-[13px]">
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Loading data...
              </div>
            </div>
          )}

          {/* Error state */}
          {status === "error" && error && (
            <div className="p-4">
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-4">
                <div className="flex items-start gap-3">
                  <svg
                    className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <p className="text-[13px] font-medium text-red-800 dark:text-red-300">
                      Query Error
                    </p>
                    <p className="text-[13px] text-red-700 dark:text-red-400 mt-1 font-mono whitespace-pre-wrap">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Results table (shown when we have results, regardless of current status) */}
          {result && (
            <div className="h-full flex flex-col overflow-auto">
              {/* Result header */}
              <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-stone-200 dark:border-white/[0.06] bg-stone-50 dark:bg-white/[0.02]">
                <span className="text-[12px] text-secondary">
                  {totalRowCount != null
                    ? `${totalRowCount.toLocaleString()} row${
                        totalRowCount !== 1 ? "s" : ""
                      }`
                    : result.rowCount !== null
                      ? `${result.rowCount} row${
                          result.rowCount !== 1 ? "s" : ""
                        }`
                      : "Query executed"}
                  {result.fields.length > 0 &&
                    ` \u2022 ${result.fields.length} column${
                      result.fields.length !== 1 ? "s" : ""
                    }`}
                  {!canEdit && (
                    <span
                      className="text-tertiary ml-2"
                      title="This table has no primary key, so inline editing is disabled"
                    >
                      (read-only: no primary key)
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowCsvExport(true)}
                    className="p-0.5 rounded hover:bg-stone-200 dark:hover:bg-white/10 text-secondary transition-colors"
                    title="Export to CSV"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <select
                    value={pageSize}
                    onChange={(e) =>
                      handlePageSizeChange(Number(e.target.value))
                    }
                    className="text-[12px] text-secondary bg-transparent border border-stone-200 dark:border-white/10 rounded px-1 py-0.5 cursor-pointer hover:bg-stone-200/70 dark:hover:bg-white/[0.06] transition-colors"
                    title="Rows per page"
                  >
                    {[100, 250, 500, 1000, 2500, 5000].map((size) => (
                      <option key={size} value={size}>
                        {size} rows
                      </option>
                    ))}
                  </select>
                  {totalPages != null && totalPages > 1 && (
                    <>
                      <div className="w-px h-3.5 bg-stone-200 dark:bg-white/10 mx-0.5" />
                      <button
                        onClick={handlePrevPage}
                        disabled={currentPage === 0 || status === "executing"}
                        className="p-0.5 rounded hover:bg-stone-200 dark:hover:bg-white/10 text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Previous page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-[12px] text-secondary tabular-nums">
                        {currentPage + 1} / {totalPages.toLocaleString()}
                      </span>
                      <button
                        onClick={handleNextPage}
                        disabled={
                          currentPage >= totalPages - 1 ||
                          status === "executing"
                        }
                        className="p-0.5 rounded hover:bg-stone-200 dark:hover:bg-white/10 text-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        title="Next page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Result table via DataGrid */}
              {result.fields.length > 0 ? (
                <DataGrid
                  columns={result.fields}
                  rows={rows}
                  extraRows={extraRows}
                  sortColumns={sortColumns}
                  onSortChange={handleSortChange}
                  selection={dataGridSelection}
                  onSelectionChange={handleSelectionChange}
                  renderCell={renderCell}
                  onKeyDown={handleKeyDown}
                  scrollRef={tableScrollRef}
                  tableRef={tableRef}
                  onHeaderContextMenu={handleHeaderContextMenu}
                  fkPreviewActiveColumns={fkPreviewActiveColumns}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-tertiary text-[13px]">
                  No rows returned
                </div>
              )}
            </div>
          )}

          {/* Loading overlay (shown when executing with existing results) */}
          {status === "executing" && result && (
            <div className="absolute inset-0 bg-stone-500/20 dark:bg-black/40 flex items-center justify-center pointer-events-none">
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-white/80 dark:bg-stone-800/80 backdrop-blur-sm shadow-lg border border-stone-200/50 dark:border-white/10">
                <svg
                  className="animate-spin h-4 w-4 text-secondary"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                <span className="text-[13px] text-secondary">
                  Refreshing...
                </span>
              </div>
            </div>
          )}

          {/* Cell context menu */}
          {contextMenu &&
            (() => {
              const isNewRow = contextMenu.rowIndex < 0;
              const columnInfo = tableMetadata?.columns.find(
                (c) => c.name === contextMenu.columnName,
              );
              const isNullable = columnInfo?.isNullable ?? false;
              const hasDefault =
                columnInfo?.defaultValue !== null &&
                columnInfo?.defaultValue !== undefined;
              const cellKey = `${contextMenu.rowIndex}:${contextMenu.columnName}`;
              const hasPendingChange =
                !isNewRow && cellKey in cellEdit.pendingChanges;

              return (
                <div
                  data-context-menu
                  className="fixed p-1 min-w-[120px] bg-white/90 dark:bg-[#2a2a2a]/90 backdrop-blur-xl border border-stone-200/50 dark:border-white/10 rounded-lg shadow-xl z-50"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {hasPendingChange && (
                    <button
                      onClick={handleRevertCell}
                      className="w-full px-2.5 py-1.5 text-left text-[13px] rounded-md transition-colors text-primary hover:bg-stone-100 dark:hover:bg-white/10"
                    >
                      Revert Cell
                    </button>
                  )}
                  <button
                    onClick={isNullable ? handleSetNull : undefined}
                    disabled={!isNullable}
                    className={`w-full px-2.5 py-1.5 text-left text-[13px] rounded-md transition-colors ${
                      isNullable
                        ? "text-primary hover:bg-stone-100 dark:hover:bg-white/10"
                        : "text-tertiary cursor-not-allowed"
                    }`}
                  >
                    Set NULL
                  </button>
                  {isNewRow && hasDefault && (
                    <button
                      onClick={handleSetToDefault}
                      className="w-full px-2.5 py-1.5 text-left text-[13px] rounded-md transition-colors text-primary hover:bg-stone-100 dark:hover:bg-white/10"
                    >
                      Set to Default
                    </button>
                  )}
                </div>
              );
            })()}

          {/* Header context menu (FK preview column picker) */}
          {headerContextMenu &&
            (() => {
              const refColumns = getReferencedTableColumns(
                headerContextMenu.foreignKeyRef,
              );
              const currentChoice =
                fkPreviewColumns[headerContextMenu.columnName] ?? null;
              const refTable = headerContextMenu.foreignKeyRef.table;

              return (
                <div
                  data-context-menu
                  className="fixed p-1 min-w-[180px] max-h-[300px] overflow-auto bg-white/90 dark:bg-[#2a2a2a]/90 backdrop-blur-xl border border-stone-200/50 dark:border-white/10 rounded-lg shadow-xl z-50"
                  style={{
                    left: headerContextMenu.x,
                    top: headerContextMenu.y,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2.5 py-1.5 text-[11px] font-medium text-tertiary uppercase tracking-wide">
                    Preview from {refTable}
                  </div>
                  <button
                    onClick={() =>
                      handleSetFkPreviewColumn(
                        headerContextMenu.columnName,
                        null,
                      )
                    }
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[13px] rounded-md transition-colors text-primary hover:bg-stone-100 dark:hover:bg-white/10"
                  >
                    <span className="w-4 flex-shrink-0">
                      {currentChoice === null && (
                        <Check className="w-3.5 h-3.5" />
                      )}
                    </span>
                    <span className="text-tertiary italic">None</span>
                  </button>
                  {refColumns.map((col) => (
                    <button
                      key={col}
                      onClick={() =>
                        handleSetFkPreviewColumn(
                          headerContextMenu.columnName,
                          col,
                        )
                      }
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[13px] rounded-md transition-colors text-primary hover:bg-stone-100 dark:hover:bg-white/10"
                    >
                      <span className="w-4 flex-shrink-0">
                        {currentChoice === col && (
                          <Check className="w-3.5 h-3.5" />
                        )}
                      </span>
                      <span className="font-mono truncate">{col}</span>
                    </button>
                  ))}
                </div>
              );
            })()}
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeMouseDown}
          className={`flex-shrink-0 h-1 cursor-ns-resize border-t border-stone-200 dark:border-white/[0.06] hover:bg-blue-500/20 transition-colors ${
            isResizing ? "bg-blue-500/30" : ""
          }`}
        />

        {/* Bottom panel */}
        <div
          className="flex-shrink-0 flex border-t border-stone-200 dark:border-white/[0.06]"
          style={{ height: bottomPanelHeight }}
        >
          {/* Log / JSON pane (left) */}
          <div className="flex-1 flex flex-col min-w-0 border-r border-stone-200 dark:border-white/[0.06]">
            {selectedCellJsonData ? (
              <JsonTreeViewer
                data={selectedCellJsonData.data}
                columnName={selectedCellJsonData.columnName}
                onEdit={canEdit ? handleJsonEdit : undefined}
                canEdit={canEdit}
              />
            ) : (
              <>
                <div className="flex-shrink-0 px-3 py-1.5 border-b border-stone-200 dark:border-white/[0.06] bg-stone-50 dark:bg-white/[0.02]">
                  <span className="text-[11px] font-medium text-tertiary uppercase tracking-wide">
                    Log
                  </span>
                </div>
                <div className="flex-1 overflow-auto p-3">
                  <p className="text-[12px] text-tertiary italic">
                    Log output will appear here...
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Related tables pane (right) - only shown when single row selected and there are incoming FKs */}
          {isSingleRowSelected && incomingForeignKeys.length > 0 && (
            <div className="w-64 flex-shrink-0 flex flex-col">
              <div className="flex-shrink-0 px-3 py-1.5 border-b border-stone-200 dark:border-white/[0.06] bg-stone-50 dark:bg-white/[0.02]">
                <span className="text-[11px] font-medium text-tertiary uppercase tracking-wide">
                  Referenced By
                </span>
              </div>
              <div className="flex-1 overflow-auto">
                {incomingForeignKeys.map((fk, idx) => {
                  const displayTable =
                    fk.fromSchema === "public"
                      ? fk.fromTable
                      : `${fk.fromSchema}.${fk.fromTable}`;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleIncomingFKClick(fk)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-white/[0.04] transition-colors border-b border-stone-100 dark:border-white/[0.04] last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] text-primary truncate">
                          {displayTable}
                        </div>
                        <div className="text-[11px] text-tertiary truncate">
                          {fk.fromColumn} → {fk.toColumn}
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-tertiary flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {showCsvExport && result && (
        <CsvExportModal
          onClose={() => setShowCsvExport(false)}
          fields={result.fields}
          currentRows={rows}
          defaultFilename={tableName}
          totalRowCount={totalRowCount ?? undefined}
          fetchAllRows={fetchAllRowsForExport}
        />
      )}
    </div>
  );
}

interface EditableCellProps {
  rowIndex: number;
  columnName: string;
  value: unknown;
  displayValue: string | null | undefined;
  canEdit: boolean;
  isSelected: boolean;
  isEditing: boolean;
  isInRange: boolean;
  rangeEdges: RangeEdges | null;
  isChanged: boolean;
  isMarkedForDeletion?: boolean;
  isJsonCell?: boolean;
  editValue: string;
  foreignKeyRef?: ForeignKeyRef;
  fkPreviewValue?: string;
  dateColumnType?: "date" | "datetime" | null;
  onUpdateEditValue: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onClick: (rowIndex: number, columnName: string, e: React.MouseEvent) => void;
  onDoubleClick: (rowIndex: number, columnName: string, value: unknown) => void;
  onMouseDown: (
    rowIndex: number,
    columnName: string,
    e: React.MouseEvent,
  ) => void;
  onMouseEnter: (rowIndex: number, columnName: string) => void;
  onNavigateToForeignKey?: (ref: ForeignKeyRef, value: unknown) => void;
  onContextMenu: (
    rowIndex: number,
    columnName: string,
    e: React.MouseEvent,
  ) => void;
}

const EditableCell = React.memo(function EditableCell({
  rowIndex,
  columnName,
  value,
  displayValue,
  canEdit,
  isSelected,
  isEditing,
  isInRange,
  rangeEdges,
  isChanged,
  isMarkedForDeletion,
  isJsonCell,
  editValue,
  foreignKeyRef,
  fkPreviewValue,
  dateColumnType,
  onUpdateEditValue,
  onCommitEdit,
  onCancelEdit,
  onClick,
  onDoubleClick,
  onMouseDown,
  onMouseEnter,
  onNavigateToForeignKey,
  onContextMenu,
}: EditableCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      if (dateColumnType && dateInputRef.current) {
        try {
          dateInputRef.current.showPicker();
        } catch {
          // showPicker() may fail in some browsers or contexts
        }
      }
    }
  }, [isEditing, dateColumnType]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelEdit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      onCommitEdit();
    }
  };

  const handleInputBlur = () => {
    onCommitEdit();
  };

  const handleForeignKeyClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (foreignKeyRef && onNavigateToForeignKey && value !== null) {
      onNavigateToForeignKey(foreignKeyRef, value);
    }
  };

  const showForeignKeyIcon =
    isHovered && foreignKeyRef && value !== null && !isEditing;
  const showJsonIcon = isHovered && isJsonCell && value !== null && !isEditing;

  let cellClassName =
    "px-3 py-2 text-secondary border-b border-r border-stone-200 dark:border-white/[0.06]  font-mono max-w-[300px] relative";

  if (canEdit && !isEditing) {
    cellClassName += " cursor-pointer";
  }

  if (isSelected && !isEditing) {
    cellClassName += " bg-blue-100 dark:bg-blue-800/40";
  }

  if (isInRange && rangeEdges && !isEditing) {
    if (!isSelected) {
      cellClassName += " bg-blue-50 dark:bg-blue-900/20";
    }
  }

  if (isChanged) {
    cellClassName += " bg-amber-50 dark:bg-amber-900/20";
  }

  const rangeBorderStyle: React.CSSProperties | undefined =
    isInRange && rangeEdges
      ? {
          borderTop: rangeEdges.top ? "2px solid rgb(59, 130, 246)" : undefined,
          borderBottom: rangeEdges.bottom
            ? "2px solid rgb(59, 130, 246)"
            : undefined,
          borderLeft: rangeEdges.left
            ? "2px solid rgb(59, 130, 246)"
            : undefined,
          borderRight: rangeEdges.right
            ? "2px solid rgb(59, 130, 246)"
            : undefined,
        }
      : undefined;

  return (
    <td
      className={cellClassName}
      onClick={(e) => onClick(rowIndex, columnName, e)}
      onDoubleClick={() => onDoubleClick(rowIndex, columnName, value)}
      onMouseDown={(e) => onMouseDown(rowIndex, columnName, e)}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter(rowIndex, columnName);
      }}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={(e) => onContextMenu(rowIndex, columnName, e)}
    >
      {rangeBorderStyle && (
        <div
          className="absolute -inset-px pointer-events-none z-[1] box-border"
          style={rangeBorderStyle}
        />
      )}
      {isEditing ? (
        <>
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => onUpdateEditValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={(e) => {
              if (
                dateColumnType &&
                dateInputRef.current &&
                e.relatedTarget === dateInputRef.current
              )
                return;
              handleInputBlur();
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full px-1 py-0 text-[13px] font-mono bg-white dark:bg-stone-800 border border-blue-500 dark:border-blue-400 rounded outline-none"
          />
          {dateColumnType && (
            <input
              ref={dateInputRef}
              type={dateColumnType === "date" ? "date" : "datetime-local"}
              value={toNativeDateValue(editValue, dateColumnType)}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                if (dateColumnType === "date") {
                  onUpdateEditValue(v);
                } else {
                  onUpdateEditValue(v.replace("T", " "));
                }
                inputRef.current?.focus();
              }}
              onBlur={(e) => {
                if (e.relatedTarget === inputRef.current) return;
                handleInputBlur();
              }}
              onKeyDown={handleInputKeyDown}
              className="absolute left-0 top-full w-0 h-0 opacity-0 overflow-hidden"
              tabIndex={-1}
            />
          )}
        </>
      ) : (
        <div className="flex items-center gap-1">
          <div className="truncate flex-1">
            <div
              className={`truncate ${isMarkedForDeletion ? "line-through text-red-600 dark:text-red-400" : ""}`}
            >
              {displayValue !== undefined ? (
                displayValue === null ? (
                  <span className="text-tertiary italic">NULL</span>
                ) : (
                  displayValue
                )
              ) : value === null ? (
                <span className="text-tertiary italic">NULL</span>
              ) : (
                formatCellValue(value)
              )}
            </div>
            {fkPreviewValue !== undefined && (
              <div className="text-tertiary text-[11px] truncate leading-tight">
                {fkPreviewValue}
              </div>
            )}
          </div>
          {showForeignKeyIcon && (
            <button
              onClick={handleForeignKeyClick}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex-shrink-0 p-0.5 rounded hover:bg-stone-200 dark:hover:bg-white/10 text-tertiary hover:text-secondary transition-colors"
              title={`Go to ${foreignKeyRef.table}.${foreignKeyRef.column}`}
            >
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
          {showJsonIcon && !showForeignKeyIcon && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick(rowIndex, columnName, e);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex-shrink-0 p-0.5 rounded hover:bg-stone-200 dark:hover:bg-white/10 text-tertiary hover:text-secondary transition-colors"
              title="View JSON"
            >
              <Braces className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </td>
  );
});

interface NewRowCellProps {
  rowIndex: number;
  columnName: string;
  displayContent: React.ReactNode;
  value: unknown;
  isExplicitlySet: boolean;
  isSelected: boolean;
  isEditing: boolean;
  isInRange: boolean;
  rangeEdges: RangeEdges | null;
  editValue: string;
  dateColumnType?: "date" | "datetime" | null;
  onUpdateEditValue: (value: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onClick: (rowIndex: number, columnName: string, e: React.MouseEvent) => void;
  onDoubleClick: (rowIndex: number, columnName: string, value: unknown) => void;
  onMouseDown: (
    rowIndex: number,
    columnName: string,
    e: React.MouseEvent,
  ) => void;
  onMouseEnter: (rowIndex: number, columnName: string) => void;
  onContextMenu: (
    rowIndex: number,
    columnName: string,
    e: React.MouseEvent,
  ) => void;
  isLastColumn: boolean;
  onRemoveRow: () => void;
}

const NewRowCell = React.memo(function NewRowCell({
  rowIndex,
  columnName,
  displayContent,
  value,
  isExplicitlySet,
  isSelected,
  isEditing,
  isInRange,
  rangeEdges,
  editValue,
  dateColumnType,
  onUpdateEditValue,
  onCommitEdit,
  onCancelEdit,
  onClick,
  onDoubleClick,
  onMouseDown,
  onMouseEnter,
  onContextMenu,
  isLastColumn,
  onRemoveRow,
}: NewRowCellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
      if (dateColumnType && dateInputRef.current) {
        try {
          dateInputRef.current.showPicker();
        } catch {
          // showPicker() may fail in some browsers or contexts
        }
      }
    }
  }, [isEditing, dateColumnType]);

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onCommitEdit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancelEdit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      onCommitEdit();
    }
  };

  const handleInputBlur = () => {
    onCommitEdit();
  };

  let cellClassName =
    "px-3 py-2 text-secondary border-b border-r border-stone-200 dark:border-white/[0.06]  font-mono max-w-[300px] relative cursor-pointer";

  if (isSelected && !isEditing) {
    cellClassName += " bg-blue-100 dark:bg-blue-800/40";
  }

  if (isInRange && rangeEdges && !isEditing) {
    if (!isSelected) {
      cellClassName += " bg-blue-50 dark:bg-blue-900/20";
    }
  }

  if (isExplicitlySet) {
    cellClassName += " bg-green-100/50 dark:bg-green-900/20";
  }

  const rangeBorderStyle: React.CSSProperties | undefined =
    isInRange && rangeEdges
      ? {
          borderTop: rangeEdges.top ? "2px solid rgb(59, 130, 246)" : undefined,
          borderBottom: rangeEdges.bottom
            ? "2px solid rgb(59, 130, 246)"
            : undefined,
          borderLeft: rangeEdges.left
            ? "2px solid rgb(59, 130, 246)"
            : undefined,
          borderRight: rangeEdges.right
            ? "2px solid rgb(59, 130, 246)"
            : undefined,
        }
      : undefined;

  return (
    <td
      className={cellClassName}
      onClick={(e) => onClick(rowIndex, columnName, e)}
      onDoubleClick={() => onDoubleClick(rowIndex, columnName, value)}
      onMouseDown={(e) => onMouseDown(rowIndex, columnName, e)}
      onMouseEnter={() => {
        setIsHovered(true);
        onMouseEnter(rowIndex, columnName);
      }}
      onMouseLeave={() => setIsHovered(false)}
      onContextMenu={(e) => onContextMenu(rowIndex, columnName, e)}
    >
      {rangeBorderStyle && (
        <div
          className="absolute -inset-px pointer-events-none z-[1] box-border"
          style={rangeBorderStyle}
        />
      )}
      {isEditing ? (
        <>
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => onUpdateEditValue(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={(e) => {
              if (
                dateColumnType &&
                dateInputRef.current &&
                e.relatedTarget === dateInputRef.current
              )
                return;
              handleInputBlur();
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="w-full px-1 py-0 text-[13px] font-mono bg-white dark:bg-stone-800 border border-blue-500 dark:border-blue-400 rounded outline-none"
          />
          {dateColumnType && (
            <input
              ref={dateInputRef}
              type={dateColumnType === "date" ? "date" : "datetime-local"}
              value={toNativeDateValue(editValue, dateColumnType)}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                if (dateColumnType === "date") {
                  onUpdateEditValue(v);
                } else {
                  onUpdateEditValue(v.replace("T", " "));
                }
                inputRef.current?.focus();
              }}
              onBlur={(e) => {
                if (e.relatedTarget === inputRef.current) return;
                handleInputBlur();
              }}
              onKeyDown={handleInputKeyDown}
              className="absolute left-0 top-full w-0 h-0 opacity-0 overflow-hidden"
              tabIndex={-1}
            />
          )}
        </>
      ) : (
        <div className="flex items-center gap-1">
          <div className="truncate flex-1">{displayContent}</div>
          {isLastColumn && isHovered && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveRow();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="flex-shrink-0 p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-tertiary hover:text-red-500 transition-colors"
              title="Remove row"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </td>
  );
});
