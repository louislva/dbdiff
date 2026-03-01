import React from "react";
import type { RangeEdges } from "./types";
import { formatCellValue } from "./utils";

interface DataGridCellInternalProps {
  rowIndex: number;
  columnName: string;
  value: unknown;
  isSelected: boolean;
  isInRange: boolean;
  rangeEdges: RangeEdges | null;
  onClick: (rowIndex: number, columnName: string, e: React.MouseEvent) => void;
  onMouseDown: (
    rowIndex: number,
    columnName: string,
    e: React.MouseEvent,
  ) => void;
  onMouseEnter: (rowIndex: number, columnName: string) => void;
}

export const DataGridCell = React.memo(function DataGridCell({
  rowIndex,
  columnName,
  value,
  isSelected,
  isInRange,
  rangeEdges,
  onClick,
  onMouseDown,
  onMouseEnter,
}: DataGridCellInternalProps) {
  let cellClassName =
    "px-3 py-2 text-secondary border-b border-r border-stone-200 dark:border-white/[0.06] font-mono max-w-[300px] cursor-pointer";

  if (isSelected) {
    cellClassName += " bg-blue-100 dark:bg-blue-800/40";
  }

  if (isInRange && rangeEdges && !isSelected) {
    cellClassName += " bg-blue-50 dark:bg-blue-900/20";
  }

  const rangeBorderStyle: React.CSSProperties = {};
  if (isInRange && rangeEdges) {
    const borderColor = "rgb(59, 130, 246)";
    const shadows: string[] = [];
    if (rangeEdges.top) shadows.push(`inset 0 2px 0 0 ${borderColor}`);
    if (rangeEdges.bottom) shadows.push(`inset 0 -2px 0 0 ${borderColor}`);
    if (rangeEdges.left) shadows.push(`inset 2px 0 0 0 ${borderColor}`);
    if (rangeEdges.right) shadows.push(`inset -2px 0 0 0 ${borderColor}`);
    if (shadows.length > 0) {
      rangeBorderStyle.boxShadow = shadows.join(", ");
    }
  }

  return (
    <td
      className={cellClassName}
      style={rangeBorderStyle}
      onClick={(e) => onClick(rowIndex, columnName, e)}
      onMouseDown={(e) => onMouseDown(rowIndex, columnName, e)}
      onMouseEnter={() => onMouseEnter(rowIndex, columnName)}
    >
      <div className="truncate">
        {value === null ? (
          <span className="text-tertiary italic">NULL</span>
        ) : (
          formatCellValue(value)
        )}
      </div>
    </td>
  );
});
