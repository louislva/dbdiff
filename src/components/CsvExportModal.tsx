import { useState } from "react";
import { useHotkey } from "../stores/hooks";
import { useStore } from "../stores/store";
import { generateCsv } from "../utils/csv";

interface CsvExportModalProps {
  onClose: () => void;
  fields: { name: string }[];
  currentRows: Record<string, unknown>[];
  defaultFilename: string;
  totalRowCount?: number;
  fetchAllRows?: () => Promise<Record<string, unknown>[]>;
}

export function CsvExportModal({
  onClose,
  fields,
  currentRows,
  defaultFilename,
  totalRowCount,
  fetchAllRows,
}: CsvExportModalProps) {
  const csvExportPrefs = useStore((state) => state.csvExportPrefs);
  const setCsvExportPrefs = useStore((state) => state.setCsvExportPrefs);
  const [includeHeaders, setIncludeHeaders] = useState(
    csvExportPrefs.includeHeaders,
  );
  const [scope, setScope] = useState<"current" | "all">(csvExportPrefs.scope);
  const [exporting, setExporting] = useState(false);

  useHotkey("closeModal", onClose);

  async function doExport(destination: "file" | "clipboard") {
    setExporting(true);
    setCsvExportPrefs({ includeHeaders, scope });
    try {
      const rows =
        scope === "all" && fetchAllRows ? await fetchAllRows() : currentRows;
      const csv = generateCsv(fields, rows, { includeHeaders });

      if (destination === "clipboard") {
        await navigator.clipboard.writeText(csv);
      } else {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${defaultFilename}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      onClose();
    } catch {
      // Stay open on error so user can retry
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-sm mx-4 border border-stone-200 dark:border-white/10">
        <div className="p-6">
          <h2 className="text-[18px] font-semibold text-primary mb-5">
            Export to CSV
          </h2>

          <div className="space-y-4">
            {/* Include headers */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeHeaders}
                onChange={(e) => setIncludeHeaders(e.target.checked)}
                className="rounded border-stone-300 dark:border-white/20"
              />
              <span className="text-[14px] text-primary">
                Include column headers
              </span>
            </label>

            {/* Data scope - only when fetchAllRows is available */}
            {fetchAllRows && (
              <div>
                <p className="text-[13px] text-secondary mb-2">Data scope</p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === "current"}
                      onChange={() => setScope("current")}
                    />
                    <span className="text-[14px] text-primary">
                      Current page ({currentRows.length.toLocaleString()} rows)
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="scope"
                      checked={scope === "all"}
                      onChange={() => setScope("all")}
                    />
                    <span className="text-[14px] text-primary">
                      All rows
                      {totalRowCount != null &&
                        ` (${totalRowCount.toLocaleString()} total)`}
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-5">
            <button
              type="button"
              onClick={() => doExport("clipboard")}
              disabled={exporting}
              className="flex-1 px-4 py-2.5 text-[14px] font-medium text-secondary bg-stone-100 dark:bg-white/5 hover:bg-stone-200 dark:hover:bg-white/10 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {exporting ? "Exporting..." : "Copy to clipboard"}
            </button>
            <button
              type="button"
              onClick={() => doExport("file")}
              disabled={exporting}
              className="flex-1 px-4 py-2.5 text-[14px] font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {exporting ? "Exporting..." : "Save to file"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
