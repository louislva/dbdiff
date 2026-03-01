import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DataGridColumn } from "./types";

interface UseColumnResizeOptions {
  columns: DataGridColumn[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  tableRef: React.RefObject<HTMLTableElement | null>;
}

export function useColumnResize({
  columns,
  scrollRef,
  tableRef,
}: UseColumnResizeOptions) {
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumn, setResizingColumn] = useState<{
    name: string;
    startX: number;
    startWidth: number;
    startScrollLeft: number;
  } | null>(null);
  const justResizedRef = useRef(false);
  const lastClientXRef = useRef(0);

  // Reset column widths when columns change
  const fieldKey = useMemo(
    () => columns.map((f) => f.name).join(","),
    [columns],
  );
  useEffect(() => {
    if (columns.length > 0) {
      const widths: Record<string, number> = {};
      for (const col of columns) {
        widths[col.name] = 150;
      }
      setColumnWidths(widths);
    }
  }, [fieldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResizeStart = useCallback(
    (columnName: string, clientX: number) => {
      lastClientXRef.current = clientX;

      // Read actual rendered widths from the DOM so that all columns have
      // accurate state before the drag begins.  Without this, columns whose
      // state width (150px) differs from their visual width (wider due to
      // table-layout:fixed + w-full proportional distribution) would appear
      // to compress when a sibling column is resized.
      let startWidth = columnWidths[columnName] ?? 150;
      if (tableRef.current) {
        const ths = tableRef.current.querySelectorAll("thead > tr > th");
        const actualWidths: Record<string, number> = {};
        columns.forEach((col, i) => {
          if (ths[i]) {
            actualWidths[col.name] = Math.round(
              ths[i].getBoundingClientRect().width,
            );
          } else {
            actualWidths[col.name] = columnWidths[col.name] ?? 150;
          }
        });
        startWidth = actualWidths[columnName] ?? startWidth;
        setColumnWidths(actualWidths);
      }

      setResizingColumn({
        name: columnName,
        startX: clientX,
        startWidth,
        startScrollLeft: scrollRef.current?.scrollLeft ?? 0,
      });
    },
    [columnWidths, scrollRef, columns, tableRef],
  );

  useEffect(() => {
    if (!resizingColumn) return;

    const colIndex = columns.findIndex((f) => f.name === resizingColumn.name);
    const colEl =
      colIndex >= 0
        ? tableRef.current?.querySelector<HTMLElement>(
            `colgroup > col:nth-child(${colIndex + 1})`,
          )
        : null;

    const scrollEl = scrollRef.current;
    const EDGE_ZONE = 40;
    const SCROLL_SPEED = 12;
    let rafId = 0;
    let alive = true;

    const computeWidth = () =>
      Math.max(
        50,
        resizingColumn.startWidth +
          (lastClientXRef.current - resizingColumn.startX) +
          ((scrollEl?.scrollLeft ?? 0) - resizingColumn.startScrollLeft),
      );

    const tick = () => {
      if (!alive) return;
      if (scrollEl) {
        const rect = scrollEl.getBoundingClientRect();
        const x = lastClientXRef.current;
        if (x > rect.right - EDGE_ZONE) {
          scrollEl.scrollLeft += SCROLL_SPEED;
        } else if (x < rect.left + EDGE_ZONE) {
          scrollEl.scrollLeft -= SCROLL_SPEED;
        }
      }
      if (colEl) {
        colEl.style.width = `${computeWidth()}px`;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    const handleMouseMove = (e: MouseEvent) => {
      lastClientXRef.current = e.clientX;
    };

    const handleMouseUp = () => {
      alive = false;
      cancelAnimationFrame(rafId);
      setColumnWidths((prev) => ({
        ...prev,
        [resizingColumn.name]: computeWidth(),
      }));
      justResizedRef.current = true;
      requestAnimationFrame(() => {
        justResizedRef.current = false;
      });
      setResizingColumn(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingColumn, columns, scrollRef, tableRef]);

  return {
    columnWidths,
    resizingColumn,
    justResizedRef,
    handleResizeStart,
  };
}
