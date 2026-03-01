import React from "react";
import type { SortColumn } from "../../types";

interface DataGridHeaderProps {
  columnName: string;
  sortColumns?: SortColumn[];
  onClick?: (columnName: string, e: React.MouseEvent) => void;
  onResizeStart: (columnName: string, clientX: number) => void;
  onContextMenu?: (columnName: string, e: React.MouseEvent) => void;
  fkPreviewActive?: boolean;
}

export const DataGridHeader = React.memo(function DataGridHeader({
  columnName,
  sortColumns,
  onClick,
  onResizeStart,
  onContextMenu,
  fkPreviewActive,
}: DataGridHeaderProps) {
  const sortIndex = sortColumns?.findIndex((s) => s.column === columnName);
  const sortInfo =
    sortIndex != null && sortIndex !== -1 ? sortColumns![sortIndex] : null;
  const showPriority =
    sortColumns != null && sortColumns.length > 1 && sortInfo;

  return (
    <th
      onClick={onClick ? (e) => onClick(columnName, e) : undefined}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu?.(columnName, e);
      }}
      className={`text-left px-3 py-2 font-medium text-primary border-b border-r border-stone-200 dark:border-white/[0.06] ${onClick ? "cursor-pointer" : ""} hover:bg-stone-200 bg-stone-100 dark:bg-neutral-900 dark:hover:bg-neutral-800 select-none transition-colors relative`}
    >
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span className="truncate">{columnName}</span>
        {fkPreviewActive && (
          <span
            className="w-1.5 h-1.5 rounded-full bg-violet-500 dark:bg-violet-400 flex-shrink-0"
            title="FK preview active"
          />
        )}
        {sortInfo && (
          <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0">
            {sortInfo.direction === "ASC" ? (
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="18 15 12 9 6 15" />
              </svg>
            ) : (
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
            {showPriority && (
              <span className="text-[10px] font-bold">{sortIndex! + 1}</span>
            )}
          </span>
        )}
      </div>
      {/* Resize handle */}
      <div
        onMouseDown={(e) => {
          e.stopPropagation();
          onResizeStart(columnName, e.clientX);
        }}
        className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize bg-transparent hover:bg-blue-500/50 active:bg-blue-500/50 transition-colors"
        style={{
          marginLeft: -4,
          marginRight: -4,
          paddingLeft: 4,
          paddingRight: 4,
        }}
      />
    </th>
  );
});
