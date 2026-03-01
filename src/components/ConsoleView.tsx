import CodeMirror from "@uiw/react-codemirror";
import { PostgreSQL, sql, type SQLNamespace } from "@codemirror/lang-sql";
import { keymap } from "@codemirror/view";
import { Download } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatShortcutDisplay,
  useActiveDatabaseConfig,
  useConsoleDiff,
  useConsoleExecution,
  useConsoleState,
  useShortcut,
} from "../stores/hooks";
import { useStore } from "../stores/store";
import { CsvExportModal } from "./CsvExportModal";
import { DiffView } from "./DiffView";
import { Resizer } from "./Resizer";
import { DataGrid } from "./DataGrid";

/** Convert our shortcut format to CodeMirror's format */
function toCodeMirrorKey(shortcut: string): string {
  return shortcut
    .split("+")
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "mod") return "Mod";
      if (lower === "ctrl") return "Ctrl";
      if (lower === "alt") return "Alt";
      if (lower === "shift") return "Shift";
      if (lower === "enter") return "Enter";
      if (lower === "escape") return "Escape";
      return part;
    })
    .join("-");
}

interface ConsoleViewProps {
  tabId: string;
}

export function ConsoleView({ tabId }: ConsoleViewProps) {
  const consoleState = useConsoleState(tabId);
  const setConsoleQueryText = useStore((state) => state.setConsoleQueryText);
  const initConsoleState = useStore((state) => state.initConsoleState);
  const runQueryShortcut = useShortcut("runQuery");
  const { execute } = useConsoleExecution(tabId);
  const { executeDiff } = useConsoleDiff(tabId);
  const isDark = useStore((state) => state.darkMode);
  const databaseConfig = useActiveDatabaseConfig();
  const [editorHeight, setEditorHeight] = useState(200);
  const [showCsvExport, setShowCsvExport] = useState(false);

  // Build CodeMirror schema namespace from cached database metadata
  const sqlSchema = useMemo((): SQLNamespace | undefined => {
    const schemas = databaseConfig?.cache?.schemas;
    if (!schemas?.length) return undefined;
    const ns: {
      [schema: string]: {
        [table: string]: { label: string; type: string; detail: string }[];
      };
    } = {};
    for (const schema of schemas) {
      const tables: {
        [table: string]: { label: string; type: string; detail: string }[];
      } = {};
      for (const table of schema.tables) {
        tables[table.name] = table.columns.map((col) => ({
          label: col.name,
          type: "property",
          detail: col.dataType,
        }));
      }
      ns[schema.name] = tables;
    }
    return ns;
  }, [databaseConfig?.cache?.schemas]);

  const sqlExtension = useMemo(
    () =>
      sql({
        dialect: PostgreSQL,
        schema: sqlSchema,
        defaultSchema: "public",
      }),
    [sqlSchema],
  );

  const handleEditorResize = useCallback((delta: number) => {
    setEditorHeight((h) =>
      Math.max(100, Math.min(h + delta, window.innerHeight - 200)),
    );
  }, []);

  // Initialize state on mount if not exists
  useEffect(() => {
    initConsoleState(tabId);
  }, [tabId, initConsoleState]);

  // Create keybinding for run query (configurable)
  const executeKeymap = useMemo(
    () =>
      keymap.of([
        {
          key: toCodeMirrorKey(runQueryShortcut),
          run: () => {
            execute();
            return true;
          },
        },
      ]),
    [execute, runQueryShortcut],
  );

  // On Mac, also accept Cmd+Enter when shortcut is Ctrl+Enter.
  // Native capture-phase listener so we intercept before CodeMirror.
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    if (!isMac) return;

    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && !e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        execute();
      }
    };
    el.addEventListener("keydown", handler, { capture: true });
    return () => el.removeEventListener("keydown", handler, { capture: true });
  }, [execute]);

  const handleChange = (value: string) => {
    setConsoleQueryText(tabId, value);
  };

  const { status, result, error, diffResult, lastAction } = consoleState;

  return (
    <div className="h-full w-full flex flex-col">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 border-b border-stone-200 dark:border-white/[0.06] bg-stone-50 dark:bg-white/[0.02]">
        <button
          onClick={execute}
          disabled={status === "executing" || !consoleState.queryText.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-md bg-stone-800 dark:bg-white text-white dark:text-stone-900 hover:bg-stone-700 dark:hover:bg-stone-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "executing" ? (
            <>
              <svg
                className="animate-spin h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Running...
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
              Run
            </>
          )}
        </button>
        <span className="text-[11px] text-tertiary">
          {formatShortcutDisplay(runQueryShortcut)}
        </span>
        <div className="w-px h-4 bg-stone-200 dark:bg-white/10 mx-1" />
        <button
          onClick={executeDiff}
          disabled={status === "executing" || !consoleState.queryText.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-md border border-stone-300 dark:border-white/15 text-secondary hover:bg-stone-100 dark:hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M12 3v18M3 12h18M3 6h8M13 6h8M3 18h8M13 18h8"
              strokeLinecap="round"
            />
          </svg>
          Diff
        </button>
      </div>

      {/* Editor section */}
      <div
        ref={editorRef}
        className="flex-shrink-0"
        style={{ height: editorHeight }}
      >
        <CodeMirror
          className="h-full"
          key={isDark ? "dark" : "light"}
          value={consoleState.queryText}
          onChange={handleChange}
          height="100%"
          autoFocus
          theme={isDark ? "dark" : "light"}
          extensions={[sqlExtension, executeKeymap]}
          placeholder="-- Write your SQL query here... (Cmd/Ctrl+Enter to run)"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: false,
            highlightActiveLine: true,
            foldGutter: false,
            dropCursor: true,
            allowMultipleSelections: true,
            indentOnInput: true,
            bracketMatching: true,
            closeBrackets: true,
            autocompletion: true,
            rectangularSelection: true,
            crosshairCursor: false,
            highlightSelectionMatches: true,
            searchKeymap: true,
          }}
        />
      </div>

      <Resizer direction="vertical" onResize={handleEditorResize} />

      {/* Results section */}
      <div className="flex-1 min-h-0 overflow-auto border-t border-stone-200 dark:border-white/[0.06]">
        {status === "idle" && (
          <div className="flex items-center justify-center h-full text-tertiary text-[13px]">
            Press Cmd/Ctrl+Enter to run query
          </div>
        )}

        {status === "executing" && (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-3 text-secondary text-[13px]">
              <svg
                className="animate-spin h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Executing query...
            </div>
          </div>
        )}

        {status === "error" && error && (
          <div className="p-4">
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 p-4">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
                <div>
                  <p className="text-[13px] font-medium text-red-800 dark:text-red-300">
                    Query Error
                  </p>
                  <p className="text-[13px] text-red-700 dark:text-red-400 mt-1 font-mono whitespace-pre-wrap">
                    {error}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {status === "completed" && lastAction === "diff" && diffResult && (
          <DiffView diffResult={diffResult} />
        )}

        {status === "completed" && lastAction !== "diff" && result && (
          <div className="h-full flex flex-col">
            {/* Result header */}
            <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-stone-200 dark:border-white/[0.06] bg-stone-50 dark:bg-white/[0.02]">
              <span className="text-[12px] text-secondary">
                {result.rowCount !== null
                  ? `${result.rowCount} row${result.rowCount !== 1 ? "s" : ""}`
                  : "Query executed"}
                {result.fields.length > 0 &&
                  ` • ${result.fields.length} column${
                    result.fields.length !== 1 ? "s" : ""
                  }`}
              </span>
              {result.fields.length > 0 && (
                <button
                  onClick={() => setShowCsvExport(true)}
                  className="p-0.5 rounded hover:bg-stone-200 dark:hover:bg-white/10 text-secondary transition-colors"
                  title="Export to CSV"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Result table */}
            {result.fields.length > 0 ? (
              <DataGrid columns={result.fields} rows={result.rows} />
            ) : (
              <div className="flex items-center justify-center h-full text-tertiary text-[13px]">
                Query executed successfully
              </div>
            )}
          </div>
        )}
      </div>

      {showCsvExport && result && (
        <CsvExportModal
          onClose={() => setShowCsvExport(false)}
          fields={result.fields}
          currentRows={result.rows}
          defaultFilename="query_results"
        />
      )}
    </div>
  );
}
