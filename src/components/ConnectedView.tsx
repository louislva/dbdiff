import type { DatabaseConfig, InnerTab } from "../types";
import { ConsoleView } from "./ConsoleView";
import { TableView } from "./TableView";

interface ConnectedViewProps {
  name: string;
  databaseConfig: DatabaseConfig | null;
  activeInnerTab: InnerTab | null;
}

export function ConnectedView({
  name,
  databaseConfig,
  activeInnerTab,
}: ConnectedViewProps) {
  if (activeInnerTab) {
    if (activeInnerTab.type === "console") {
      return <ConsoleView tabId={activeInnerTab.id} />;
    }

    if (activeInnerTab.type === "table") {
      return (
        <TableView tabId={activeInnerTab.id} tableName={activeInnerTab.name} />
      );
    }

    // Query tab placeholder
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-white/[0.04] border border-stone-200 dark:border-white/[0.06] flex items-center justify-center mb-6">
          <svg
            className="w-5 h-5 text-tertiary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
        </div>
        <p className="text-[15px] text-primary font-medium">
          Query: {activeInnerTab.name}
        </p>
        <p className="text-[13px] text-secondary mt-2 max-w-xs">
          Saved query results
        </p>
        <div className="mt-8 px-4 py-2 rounded-md bg-stone-100 dark:bg-white/[0.04] border border-stone-200 dark:border-white/[0.06]">
          <span className="text-[12px] text-tertiary font-mono">
            {databaseConfig?.connection.host}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="w-12 h-12 rounded-xl bg-stone-100 dark:bg-white/[0.04] border border-stone-200 dark:border-white/[0.06] flex items-center justify-center mb-6">
        <span
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: databaseConfig?.display.color }}
        />
      </div>
      <p className="text-[15px] text-primary font-medium">
        Connected to {name}
      </p>
      <p className="text-[13px] text-secondary mt-2 max-w-xs">
        Select a table from the sidebar to view data
      </p>
      <div className="mt-8 px-4 py-2 rounded-md bg-stone-100 dark:bg-white/[0.04] border border-stone-200 dark:border-white/[0.06]">
        <span className="text-[12px] text-tertiary font-mono">
          {databaseConfig?.connection.host}
        </span>
      </div>
    </div>
  );
}
