import type { DiffResponse, DiffTableResult } from "../types";
import { formatCellValue } from "./DataGrid/utils";

interface DiffViewProps {
  diffResult: DiffResponse;
}

export function DiffView({ diffResult }: DiffViewProps) {
  if (diffResult.tables.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-tertiary text-[13px]">
        No changes detected
      </div>
    );
  }

  const totalChanges = diffResult.tables.reduce(
    (sum, t) => sum + t.deleted.length + t.added.length + t.modified.length,
    0,
  );

  if (totalChanges === 0) {
    return (
      <div className="flex items-center justify-center h-full text-tertiary text-[13px]">
        No changes detected — all rows unchanged
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center px-4 py-2 border-b border-stone-200 dark:border-white/[0.06] bg-stone-50 dark:bg-white/[0.02]">
        <span className="text-[12px] text-secondary">
          Diff preview (transaction rolled back)
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        {diffResult.tables.map((table) => (
          <DiffTable key={table.tableName} table={table} />
        ))}
      </div>
    </div>
  );
}

function DiffTable({ table }: { table: DiffTableResult }) {
  const parts: string[] = [];
  if (table.added.length > 0) parts.push(`${table.added.length} added`);
  if (table.modified.length > 0)
    parts.push(`${table.modified.length} modified`);
  if (table.deleted.length > 0) parts.push(`${table.deleted.length} deleted`);

  const colNames = table.columns.map((c) => c.name);

  return (
    <div className="pb-4 h-full flex flex-col">
      {/* Table header */}
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-stone-100 dark:bg-white/[0.04] border-b border-stone-200 dark:border-white/[0.06]">
        <span className="text-[13px] font-medium text-primary font-mono">
          {table.tableName}
        </span>
        <span className="text-[12px] text-tertiary">{parts.join(", ")}</span>
      </div>

      {/* Diff table */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-[12px] font-mono border-collapse">
          <thead>
            <tr className="border-b border-stone-200 dark:border-white/[0.06]">
              <th className="w-6 px-1 py-1.5 text-center text-tertiary font-normal" />
              {colNames.map((col) => (
                <th
                  key={col}
                  className="px-3 py-1.5 text-left font-medium text-secondary whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Deleted rows */}
            {table.deleted.map((row, i) => (
              <DiffRow
                key={`del-${i}`}
                type="deleted"
                row={row}
                colNames={colNames}
              />
            ))}

            {/* Modified rows */}
            {table.modified.map((mod, i) => (
              <ModifiedRows
                key={`mod-${i}`}
                before={mod.before}
                after={mod.after}
                changedColumns={mod.changedColumns}
                colNames={colNames}
              />
            ))}

            {/* Added rows */}
            {table.added.map((row, i) => (
              <DiffRow
                key={`add-${i}`}
                type="added"
                row={row}
                colNames={colNames}
              />
            ))}

            {/* Unchanged summary */}
            {table.unchangedCount > 0 && (
              <tr>
                <td
                  colSpan={colNames.length + 1}
                  className="px-4 py-2 text-center text-tertiary text-[11px] border-t border-stone-200 dark:border-white/[0.06]"
                >
                  {table.unchangedCount} row
                  {table.unchangedCount !== 1 ? "s" : ""} unchanged
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffRow({
  type,
  row,
  colNames,
  highlightCols,
}: {
  type: "added" | "deleted";
  row: Record<string, unknown>;
  colNames: string[];
  highlightCols?: Set<string>;
}) {
  const isAdded = type === "added";
  const bgClass = isAdded
    ? "bg-green-50 dark:bg-green-950/30"
    : "bg-red-50 dark:bg-red-950/30";
  const textClass = isAdded
    ? "text-green-800 dark:text-green-300"
    : "text-red-800 dark:text-red-300";
  const gutterClass = isAdded
    ? "text-green-500 dark:text-green-400"
    : "text-red-500 dark:text-red-400";

  return (
    <tr className={bgClass}>
      <td
        className={`px-1 py-1 text-center font-bold select-none ${gutterClass}`}
      >
        {isAdded ? "+" : "\u2212"}
      </td>
      {colNames.map((col) => {
        const emphasize = highlightCols?.has(col);
        const value = row[col];
        return (
          <td
            key={col}
            className={`px-3 py-1 whitespace-nowrap ${textClass} ${
              emphasize
                ? isAdded
                  ? "bg-green-200/50 dark:bg-green-800/40 font-medium"
                  : "bg-red-200/50 dark:bg-red-800/40 font-medium"
                : ""
            }`}
          >
            {value === null ? (
              <span className="italic opacity-60">NULL</span>
            ) : (
              formatCellValue(value)
            )}
          </td>
        );
      })}
    </tr>
  );
}

function ModifiedRows({
  before,
  after,
  changedColumns,
  colNames,
}: {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changedColumns: string[];
  colNames: string[];
}) {
  const changedSet = new Set(changedColumns);
  return (
    <>
      <DiffRow
        type="deleted"
        row={before}
        colNames={colNames}
        highlightCols={changedSet}
      />
      <DiffRow
        type="added"
        row={after}
        colNames={colNames}
        highlightCols={changedSet}
      />
    </>
  );
}
