import { useEffect, useRef } from "react";
import type { InnerTab } from "../types";

interface InnerTabBarProps {
  innerTabs: InnerTab[];
  activeInnerTabId: string | null;
  draggedInnerTabId: string | null;
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onNewConsole: () => void;
  onDragStart: (e: React.DragEvent, tabId: string) => void;
  onDragOver: (e: React.DragEvent, tabId: string) => void;
  onDragEnd: () => void;
}

export function InnerTabBar({
  innerTabs,
  activeInnerTabId,
  draggedInnerTabId,
  onTabSelect,
  onTabClose,
  onNewConsole,
  onDragStart,
  onDragOver,
  onDragEnd,
}: InnerTabBarProps) {
  const activeTabRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (activeInnerTabId && activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeInnerTabId]);

  return (
    <div className="flex items-center min-h-9 bg-stone-50 dark:bg-[#0f0f0f] border-b border-stone-200 dark:border-white/[0.06] gap-1 px-2 py-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {innerTabs.map((tab) => (
        <div
          key={tab.id}
          ref={tab.id === activeInnerTabId ? activeTabRef : undefined}
          draggable
          onDragStart={(e) => onDragStart(e, tab.id)}
          onDragOver={(e) => onDragOver(e, tab.id)}
          onDragEnd={onDragEnd}
          className={`group flex items-center gap-1.5 pl-3 pr-1.5 h-7 rounded-md cursor-pointer select-none transition-all duration-150 flex-shrink-0 ${
            tab.id === activeInnerTabId
              ? "bg-white dark:bg-white/[0.06] text-primary shadow-sm dark:shadow-none"
              : "text-tertiary hover:text-primary hover:bg-stone-100 dark:hover:bg-white/[0.03]"
          } ${draggedInnerTabId === tab.id ? "opacity-50" : ""}`}
          onClick={() => onTabSelect(tab.id)}
        >
          {tab.type === "table" && (
            <svg
              className="w-3.5 h-3.5 flex-shrink-0 opacity-60"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 6h18M3 12h18M3 18h18M9 6v12M15 6v12" />
            </svg>
          )}
          {tab.type === "console" && (
            <svg
              className="w-3.5 h-3.5 flex-shrink-0 opacity-60"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M4 17l6-6-6-6M12 19h8" />
            </svg>
          )}
          {tab.type === "query" && (
            <svg
              className="w-3.5 h-3.5 flex-shrink-0 opacity-60"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
          )}
          <span className="text-[12px] font-medium tracking-[-0.01em] truncate max-w-[100px]">
            {tab.name}
          </span>
          <button
            className="w-4 h-4 flex items-center justify-center rounded-full transition-all hover:bg-stone-200 dark:hover:bg-white/10 opacity-0 group-hover:opacity-40 hover:!opacity-100 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onTabClose(tab.id);
            }}
          >
            <svg
              className="w-2.5 h-2.5"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M3 3l6 6M9 3l-6 6" />
            </svg>
          </button>
        </div>
      ))}
      <button
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-interactive-subtle hover:bg-stone-100 dark:hover:bg-white/[0.03] transition-all duration-150 focus:outline-none"
        onClick={onNewConsole}
        title="New Console"
      >
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M8 3v10M3 8h10" />
        </svg>
      </button>
    </div>
  );
}
