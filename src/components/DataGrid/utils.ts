import type { CellPosition } from "../../types";
import type { RangeEdges } from "./types";

/** Row height in pixels for the virtualizer */
export const ROW_HEIGHT = 37;

/**
 * Convert store index (negative for new rows) to virtual index.
 * Virtual indices: 0..M-1 for existing rows, M..M+N-1 for new rows.
 */
export function storeToVirtualIndex(
  storeIndex: number,
  existingRowCount: number,
): number {
  if (storeIndex >= 0) return storeIndex;
  // New rows: -1 → existingRowCount, -2 → existingRowCount+1, etc.
  const newRowArrayIndex = Math.abs(storeIndex) - 1;
  return existingRowCount + newRowArrayIndex;
}

/**
 * Convert virtual index to store index (negative for new rows).
 */
export function virtualToStoreIndex(
  virtualIndex: number,
  existingRowCount: number,
): number {
  if (virtualIndex < existingRowCount) return virtualIndex;
  // Virtual index >= existingRowCount means it's a new row
  const newRowArrayIndex = virtualIndex - existingRowCount;
  return -(newRowArrayIndex + 1);
}

/**
 * Get all row indices from a selection (single cell or range).
 */
export function getSelectedRowIndices(
  selectedCell: CellPosition | null,
  selectedRange: { start: CellPosition; end: CellPosition } | null,
  existingRowCount: number,
): number[] {
  if (!selectedCell) return [];

  if (!selectedRange) {
    return [selectedCell.rowIndex];
  }

  const startVirtual = storeToVirtualIndex(
    selectedRange.start.rowIndex,
    existingRowCount,
  );
  const endVirtual = storeToVirtualIndex(
    selectedRange.end.rowIndex,
    existingRowCount,
  );
  const minVirtual = Math.min(startVirtual, endVirtual);
  const maxVirtual = Math.max(startVirtual, endVirtual);

  const rowIndices: number[] = [];
  for (let v = minVirtual; v <= maxVirtual; v++) {
    rowIndices.push(virtualToStoreIndex(v, existingRowCount));
  }
  return rowIndices;
}

/**
 * Check if a cell is within a selected range and return its edge positions.
 * Uses virtual indices to handle both existing rows (0..M-1) and new rows (-1..-N)
 * as a unified linear space.
 */
export function getCellRangeInfo(
  cell: CellPosition,
  range: { start: CellPosition; end: CellPosition } | null,
  columnOrder: string[],
  existingRowCount: number,
): { isInRange: boolean; edges: RangeEdges | null } {
  if (!range) return { isInRange: false, edges: null };

  const cellVirtual = storeToVirtualIndex(cell.rowIndex, existingRowCount);
  const startVirtual = storeToVirtualIndex(
    range.start.rowIndex,
    existingRowCount,
  );
  const endVirtual = storeToVirtualIndex(range.end.rowIndex, existingRowCount);

  const minRowVirtual = Math.min(startVirtual, endVirtual);
  const maxRowVirtual = Math.max(startVirtual, endVirtual);

  const startColIndex = columnOrder.indexOf(range.start.columnName);
  const endColIndex = columnOrder.indexOf(range.end.columnName);
  const cellColIndex = columnOrder.indexOf(cell.columnName);

  const minColIndex = Math.min(startColIndex, endColIndex);
  const maxColIndex = Math.max(startColIndex, endColIndex);

  const isInRange =
    cellVirtual >= minRowVirtual &&
    cellVirtual <= maxRowVirtual &&
    cellColIndex >= minColIndex &&
    cellColIndex <= maxColIndex;

  if (!isInRange) return { isInRange: false, edges: null };

  return {
    isInRange: true,
    edges: {
      top: cellVirtual === minRowVirtual,
      bottom: cellVirtual === maxRowVirtual,
      left: cellColIndex === minColIndex,
      right: cellColIndex === maxColIndex,
    },
  };
}

export function formatCellValue(value: unknown): string {
  if (value === null) return "NULL";
  if (value === undefined) return "";
  if (typeof value === "object") {
    if (Array.isArray(value)) {
      return `[${value.length} item${value.length !== 1 ? "s" : ""}]`;
    }
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return "{}";
    if (keys.length <= 3) return `{ ${keys.join(", ")} }`;
    return `{ ${keys.slice(0, 3).join(", ")}, ... }`;
  }
  return String(value);
}

/** Full serialization for clipboard copy (not truncated) */
export function serializeCellValue(value: unknown): string {
  if (value === null) return "NULL";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Parse TSV text into a 2D array of strings.
 * Returns null if text has no tabs or newlines (single value, not a range).
 * Handles \r\n line endings and trims a trailing empty line.
 */
export function parseTSV(text: string): string[][] | null {
  if (!text.includes("\t") && !text.includes("\n")) return null;
  const lines = text.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  return lines.map((line) => line.split("\t"));
}

// Internal clipboard: stashes raw cell value alongside the system clipboard text
// so we can detect when a paste originates from a copy within this app.
let _internalClipboard: {
  text: string;
  rawValue: unknown;
  isRangeCopy: boolean;
} | null = null;

export function setInternalClipboard(
  text: string,
  rawValue: unknown,
  isRangeCopy = false,
) {
  _internalClipboard = { text, rawValue, isRangeCopy };
}

export function getInternalClipboardValue(
  systemClipboardText: string,
): unknown | undefined {
  if (_internalClipboard && _internalClipboard.text === systemClipboardText) {
    return _internalClipboard.rawValue;
  }
  return undefined;
}

/**
 * Check if the pasted text originated from our own range copy.
 * When true, "NULL" cells in TSV should be treated as SQL null.
 */
export function isInternalRangeCopy(systemClipboardText: string): boolean {
  return (
    _internalClipboard !== null &&
    _internalClipboard.text === systemClipboardText &&
    _internalClipboard.isRangeCopy
  );
}
