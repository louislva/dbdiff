import { useCallback, useEffect, useRef, useState } from "react";
import type { CellPosition, CellRange } from "../../types";
import type { DataGridColumn, DataGridSelection, ExtraRow } from "./types";
import {
  serializeCellValue,
  setInternalClipboard,
  storeToVirtualIndex,
  virtualToStoreIndex,
} from "./utils";

interface UseDataGridSelectionOptions {
  columns: DataGridColumn[];
  rows: Record<string, unknown>[];
  extraRows?: ExtraRow[];
  /** Controlled mode: external selection state */
  selection?: DataGridSelection;
  /** Controlled mode: callback when selection changes */
  onSelectionChange?: (selection: DataGridSelection) => void;
  /** Intercept keydown. Return true to prevent DataGrid's default handling. */
  onKeyDown?: (e: KeyboardEvent) => boolean;
  /** Ref to scroll a row into view */
  scrollToIndex?: (index: number) => void;
}

export function useDataGridSelection({
  columns,
  rows,
  extraRows,
  selection: controlledSelection,
  onSelectionChange,
  onKeyDown: externalOnKeyDown,
  scrollToIndex,
}: UseDataGridSelectionOptions) {
  // Uncontrolled internal state
  const [internalSelection, setInternalSelection] = useState<DataGridSelection>(
    {
      selectedCell: null,
      selectedRange: null,
      isDragging: false,
    },
  );

  const isControlled = controlledSelection !== undefined;
  const selection = isControlled ? controlledSelection : internalSelection;

  const updateSelection = useCallback(
    (updater: (prev: DataGridSelection) => DataGridSelection) => {
      if (isControlled && onSelectionChange) {
        onSelectionChange(updater(controlledSelection!));
      } else {
        setInternalSelection(updater);
      }
    },
    [isControlled, onSelectionChange, controlledSelection],
  );

  const selectCell = useCallback(
    (cell: CellPosition | null) => {
      updateSelection(() => ({
        selectedCell: cell,
        selectedRange: null,
        isDragging: false,
      }));
    },
    [updateSelection],
  );

  const selectCellRange = useCallback(
    (range: CellRange) => {
      updateSelection((prev) => ({
        ...prev,
        selectedCell: prev.selectedCell,
        selectedRange: range,
      }));
    },
    [updateSelection],
  );

  const setDragging = useCallback(
    (isDragging: boolean) => {
      updateSelection((prev) => ({ ...prev, isDragging }));
    },
    [updateSelection],
  );

  // Track drag start cell and dragging state via ref for synchronous access.
  // React useState is async, so handleCellMouseEnter would see stale isDragging
  // from its closure. The ref is updated synchronously in handleCellMouseDown.
  const dragStartCell = useRef<CellPosition | null>(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const handleCellClick = useCallback(
    (rowIndex: number, columnName: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (e.shiftKey && selection.selectedCell) {
        const anchor = selection.selectedRange?.start ?? selection.selectedCell;
        selectCellRange({
          start: anchor,
          end: { rowIndex, columnName },
        });
      } else {
        selectCell({ rowIndex, columnName });
      }
    },
    [
      selection.selectedCell,
      selection.selectedRange,
      selectCell,
      selectCellRange,
    ],
  );

  const handleCellMouseDown = useCallback(
    (rowIndex: number, columnName: string, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault(); // Prevent native text selection during drag
      if (e.shiftKey) return; // Let handleCellClick handle shift+click for range selection
      dragStartCell.current = { rowIndex, columnName };
      isDraggingRef.current = true;
      setDragging(true);
      selectCell({ rowIndex, columnName });
    },
    [selectCell, setDragging],
  );

  const handleCellMouseEnter = useCallback(
    (rowIndex: number, columnName: string) => {
      if (!isDraggingRef.current || !dragStartCell.current) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        selectCellRange({
          start: dragStartCell.current!,
          end: { rowIndex, columnName },
        });
      });
    },
    [selectCellRange],
  );

  // Global mouse up - end drag
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        setDragging(false);
        dragStartCell.current = null;
      }
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [setDragging]);

  // Keyboard: arrow nav, Cmd+C, Cmd+A, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if in input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      // Let external handler intercept first
      if (externalOnKeyDown && externalOnKeyDown(e)) return;

      const { selectedCell, selectedRange } = selection;

      // Cmd+C / Ctrl+C - copy
      if (selectedCell && e.key === "c" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const columnNames = columns.map((c) => c.name);
        const existingRowCount = rows.length;

        if (selectedRange) {
          const startColIdx = columnNames.indexOf(
            selectedRange.start.columnName,
          );
          const endColIdx = columnNames.indexOf(selectedRange.end.columnName);
          const minCol = Math.min(startColIdx, endColIdx);
          const maxCol = Math.max(startColIdx, endColIdx);

          const startV = storeToVirtualIndex(
            selectedRange.start.rowIndex,
            existingRowCount,
          );
          const endV = storeToVirtualIndex(
            selectedRange.end.rowIndex,
            existingRowCount,
          );
          const minRow = Math.min(startV, endV);
          const maxRow = Math.max(startV, endV);

          const tsvRows: string[] = [];
          for (let v = minRow; v <= maxRow; v++) {
            const storeIdx = virtualToStoreIndex(v, existingRowCount);
            const tsvCols: string[] = [];
            for (let c = minCol; c <= maxCol; c++) {
              const colName = columnNames[c];
              let value: unknown;
              if (storeIdx < 0 && extraRows) {
                const newRowIdx = Math.abs(storeIdx) - 1;
                const extraRow = extraRows[newRowIdx];
                value = extraRow?.data[colName] ?? null;
              } else {
                value = rows[storeIdx]?.[colName];
              }
              tsvCols.push(serializeCellValue(value));
            }
            tsvRows.push(tsvCols.join("\t"));
          }
          const text = tsvRows.join("\n");
          navigator.clipboard.writeText(text);
          setInternalClipboard(text, undefined, true);
        } else {
          // Single cell copy
          let value: unknown;
          if (selectedCell.rowIndex < 0 && extraRows) {
            const newRowIdx = Math.abs(selectedCell.rowIndex) - 1;
            const extraRow = extraRows[newRowIdx];
            value = extraRow?.data[selectedCell.columnName] ?? null;
          } else {
            value = rows[selectedCell.rowIndex]?.[selectedCell.columnName];
          }
          const text = serializeCellValue(value);
          navigator.clipboard.writeText(text);
          setInternalClipboard(text, value);
        }
        return;
      }

      // Cmd+A / Ctrl+A - select all
      if (e.key === "a" && (e.metaKey || e.ctrlKey)) {
        const totalRowCount = rows.length + (extraRows?.length ?? 0);
        if (columns.length === 0 || totalRowCount === 0) return;
        e.preventDefault();
        const firstCol = columns[0].name;
        const lastCol = columns[columns.length - 1].name;
        const lastStoreIndex = virtualToStoreIndex(
          totalRowCount - 1,
          rows.length,
        );
        updateSelection(() => ({
          selectedCell: { rowIndex: 0, columnName: firstCol },
          selectedRange: {
            start: { rowIndex: 0, columnName: firstCol },
            end: { rowIndex: lastStoreIndex, columnName: lastCol },
          },
          isDragging: false,
        }));
        return;
      }

      // Escape - deselect
      if (e.key === "Escape" && selectedCell) {
        e.preventDefault();
        selectCell(null);
        return;
      }

      // Arrow key navigation
      if (
        selectedCell &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
        const columnNames = columns.map((c) => c.name);
        const existingRowCount = rows.length;
        const extraRowCount = extraRows?.length ?? 0;
        const totalRows = existingRowCount + extraRowCount;

        if (columnNames.length === 0 || totalRows === 0) return;

        const moveFrom =
          e.shiftKey && selectedRange ? selectedRange.end : selectedCell;

        let newVirtual = storeToVirtualIndex(
          moveFrom.rowIndex,
          existingRowCount,
        );
        let newColIndex = columnNames.indexOf(moveFrom.columnName);

        switch (e.key) {
          case "ArrowUp":
            newVirtual = Math.max(0, newVirtual - 1);
            break;
          case "ArrowDown":
            newVirtual = Math.min(totalRows - 1, newVirtual + 1);
            break;
          case "ArrowLeft":
            newColIndex = Math.max(0, newColIndex - 1);
            break;
          case "ArrowRight":
            newColIndex = Math.min(columnNames.length - 1, newColIndex + 1);
            break;
        }

        const newCell = {
          rowIndex: virtualToStoreIndex(newVirtual, existingRowCount),
          columnName: columnNames[newColIndex],
        };

        if (e.shiftKey) {
          const anchor = selectedRange?.start ?? selectedCell;
          updateSelection((prev) => ({
            ...prev,
            selectedRange: { start: anchor, end: newCell },
          }));
        } else {
          selectCell(newCell);
        }

        scrollToIndex?.(
          storeToVirtualIndex(newCell.rowIndex, existingRowCount),
        );
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selection,
    columns,
    rows,
    extraRows,
    externalOnKeyDown,
    selectCell,
    selectCellRange,
    updateSelection,
    scrollToIndex,
  ]);

  return {
    selection,
    selectCell,
    selectCellRange,
    setDragging,
    handleCellClick,
    handleCellMouseDown,
    handleCellMouseEnter,
  };
}
