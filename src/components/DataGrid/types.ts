import type { CellPosition, CellRange, SortColumn } from "../../types";

export interface RangeEdges {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export interface DataGridColumn {
  name: string;
  dataTypeID?: number;
}

export interface DataGridSelection {
  selectedCell: CellPosition | null;
  selectedRange: CellRange | null;
  isDragging: boolean;
}

export interface DataGridCellProps {
  rowIndex: number;
  columnIndex: number;
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

export interface ExtraRow {
  key: string;
  data: Record<string, unknown>;
}

export interface DataGridProps {
  columns: DataGridColumn[];
  rows: Record<string, unknown>[];
  extraRows?: ExtraRow[];
  sortColumns?: SortColumn[];
  onSortChange?: (column: string, addToExisting: boolean) => void;
  selection?: DataGridSelection;
  onSelectionChange?: (selection: DataGridSelection) => void;
  renderCell?: (props: DataGridCellProps) => React.ReactNode;
  /** Return true if the key was handled (prevents DataGrid's default handling) */
  onKeyDown?: (e: KeyboardEvent) => boolean;
  className?: string;
  /** Ref to the scroll container element */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  /** Ref to the table element */
  tableRef?: React.RefObject<HTMLTableElement | null>;
  /** Called when user right-clicks a column header */
  onHeaderContextMenu?: (columnName: string, e: React.MouseEvent) => void;
  /** Set of column names that have active FK preview */
  fkPreviewActiveColumns?: Set<string>;
}
