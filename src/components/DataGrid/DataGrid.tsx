import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef } from "react";
import type { DataGridProps } from "./types";
import { getCellRangeInfo, ROW_HEIGHT, virtualToStoreIndex } from "./utils";
import { DataGridHeader } from "./DataGridHeader";
import { DataGridCell } from "./DataGridCell";
import { useColumnResize } from "./useColumnResize";
import { useDataGridSelection } from "./useDataGridSelection";

export function DataGrid({
  columns,
  rows,
  extraRows,
  sortColumns,
  onSortChange,
  selection: controlledSelection,
  onSelectionChange,
  renderCell,
  onKeyDown,
  className,
  scrollRef: externalScrollRef,
  tableRef: externalTableRef,
  onHeaderContextMenu,
  fkPreviewActiveColumns,
}: DataGridProps) {
  const internalScrollRef = useRef<HTMLDivElement>(null);
  const internalTableRef = useRef<HTMLTableElement>(null);
  const scrollRef = externalScrollRef ?? internalScrollRef;
  const tableRef = externalTableRef ?? internalTableRef;

  const totalVirtualRowCount = rows.length + (extraRows?.length ?? 0);

  const virtualizer = useVirtualizer({
    count: totalVirtualRowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 15,
  });

  const { columnWidths, resizingColumn, justResizedRef, handleResizeStart } =
    useColumnResize({
      columns,
      scrollRef,
      tableRef,
    });

  const scrollToIndex = useCallback(
    (index: number) => {
      virtualizer.scrollToIndex(index);
    },
    [virtualizer],
  );

  const {
    selection,
    handleCellClick,
    handleCellMouseDown,
    handleCellMouseEnter,
  } = useDataGridSelection({
    columns,
    rows,
    extraRows,
    selection: controlledSelection,
    onSelectionChange,
    onKeyDown,
    scrollToIndex,
  });

  const handleColumnClick = useCallback(
    (columnName: string, e: React.MouseEvent) => {
      e.preventDefault();
      if (justResizedRef.current) return;
      const addToExisting = e.ctrlKey || e.metaKey;
      onSortChange?.(columnName, addToExisting);
    },
    [onSortChange, justResizedRef],
  );

  const columnNames = columns.map((c) => c.name);

  return (
    <div
      ref={scrollRef}
      className={`flex-1 overflow-auto pb-8 pr-4 ${className ?? ""}`}
    >
      <table
        ref={tableRef}
        className={`w-full text-[13px] border-collapse ${
          selection.isDragging || resizingColumn ? "select-none" : ""
        }`}
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          {columns.map((col) => (
            <col
              key={col.name}
              style={{ width: columnWidths[col.name] ?? 150 }}
            />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-10 bg-stone-100 dark:bg-neutral-900">
          <tr>
            {columns.map((col, i) => (
              <DataGridHeader
                key={i}
                columnName={col.name}
                sortColumns={sortColumns}
                onClick={onSortChange ? handleColumnClick : undefined}
                onResizeStart={handleResizeStart}
                onContextMenu={onHeaderContextMenu}
                fkPreviewActive={fkPreviewActiveColumns?.has(col.name)}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {(() => {
            const virtualItems = virtualizer.getVirtualItems();
            const paddingTop = virtualItems[0]?.start ?? 0;
            const paddingBottom =
              virtualItems.length > 0
                ? virtualizer.getTotalSize() -
                  virtualItems[virtualItems.length - 1].end
                : 0;
            return (
              <>
                {paddingTop > 0 && (
                  <tr>
                    <td
                      style={{ height: paddingTop, padding: 0 }}
                      colSpan={columns.length}
                    />
                  </tr>
                )}
                {virtualItems.map((virtualItem) => {
                  const isExtraRow = virtualItem.index >= rows.length;
                  const storeIndex = virtualToStoreIndex(
                    virtualItem.index,
                    rows.length,
                  );

                  if (isExtraRow) {
                    const extraRowIdx = virtualItem.index - rows.length;
                    const extraRow = extraRows?.[extraRowIdx];
                    if (!extraRow) return null;

                    return (
                      <tr key={`extra-${extraRow.key}`}>
                        {columns.map((col, colIndex) => {
                          const value = extraRow.data[col.name] ?? null;
                          const rangeInfo = getCellRangeInfo(
                            { rowIndex: storeIndex, columnName: col.name },
                            selection.selectedRange,
                            columnNames,
                            rows.length,
                          );
                          const isSelected =
                            selection.selectedCell?.rowIndex === storeIndex &&
                            selection.selectedCell?.columnName === col.name;

                          if (renderCell) {
                            return renderCell({
                              rowIndex: storeIndex,
                              columnIndex: colIndex,
                              columnName: col.name,
                              value,
                              isSelected,
                              isInRange: rangeInfo.isInRange,
                              rangeEdges: rangeInfo.edges,
                              onClick: handleCellClick,
                              onMouseDown: handleCellMouseDown,
                              onMouseEnter: handleCellMouseEnter,
                            });
                          }

                          return (
                            <DataGridCell
                              key={colIndex}
                              rowIndex={storeIndex}
                              columnName={col.name}
                              value={value}
                              isSelected={isSelected}
                              isInRange={rangeInfo.isInRange}
                              rangeEdges={rangeInfo.edges}
                              onClick={handleCellClick}
                              onMouseDown={handleCellMouseDown}
                              onMouseEnter={handleCellMouseEnter}
                            />
                          );
                        })}
                      </tr>
                    );
                  }

                  const row = rows[storeIndex];
                  if (!row) return null;

                  return (
                    <tr
                      key={storeIndex}
                      className="hover:bg-stone-50 dark:hover:bg-white/[0.02]"
                    >
                      {columns.map((col, colIndex) => {
                        const rangeInfo = getCellRangeInfo(
                          { rowIndex: storeIndex, columnName: col.name },
                          selection.selectedRange,
                          columnNames,
                          rows.length,
                        );
                        const isSelected =
                          selection.selectedCell?.rowIndex === storeIndex &&
                          selection.selectedCell?.columnName === col.name;

                        if (renderCell) {
                          return renderCell({
                            rowIndex: storeIndex,
                            columnIndex: colIndex,
                            columnName: col.name,
                            value: row[col.name],
                            isSelected,
                            isInRange: rangeInfo.isInRange,
                            rangeEdges: rangeInfo.edges,
                            onClick: handleCellClick,
                            onMouseDown: handleCellMouseDown,
                            onMouseEnter: handleCellMouseEnter,
                          });
                        }

                        return (
                          <DataGridCell
                            key={colIndex}
                            rowIndex={storeIndex}
                            columnName={col.name}
                            value={row[col.name]}
                            isSelected={isSelected}
                            isInRange={rangeInfo.isInRange}
                            rangeEdges={rangeInfo.edges}
                            onClick={handleCellClick}
                            onMouseDown={handleCellMouseDown}
                            onMouseEnter={handleCellMouseEnter}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td
                      style={{ height: paddingBottom, padding: 0 }}
                      colSpan={columns.length}
                    />
                  </tr>
                )}
              </>
            );
          })()}
        </tbody>
      </table>
    </div>
  );
}
