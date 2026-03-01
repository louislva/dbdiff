import { useState, useRef, useEffect } from "react";
import type { DatabaseConfig, ExportType } from "../types";

interface DatabaseMenuProps {
  databaseConfig: DatabaseConfig;
}

export function DatabaseMenu({ databaseConfig }: DatabaseMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  async function handleExport(exportType: ExportType) {
    setMenuOpen(false);
    setExporting(true);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection: databaseConfig.connection,
          exportType,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Export failed");
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="(.+)"/);
      const filename =
        match?.[1] ?? `${databaseConfig.connection.database}.sql`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed — could not reach server");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="px-3 h-8 rounded-md text-[13px] font-semibold text-secondary hover:text-primary hover:bg-stone-200/50 dark:hover:bg-white/[0.06] transition-all duration-150 disabled:opacity-50"
        onClick={() => setMenuOpen(!menuOpen)}
        disabled={exporting}
      >
        {exporting ? "Exporting..." : "Database"}
      </button>
      {menuOpen && (
        <div className="absolute top-full left-0 mt-1 p-1 min-w-[200px] bg-white/90 dark:bg-[#2a2a2a]/90 backdrop-blur-xl border border-stone-200/50 dark:border-white/10 rounded-lg shadow-xl z-50">
          <button
            className="w-full px-2.5 py-1 text-left text-[13px] text-primary rounded-md hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
            onClick={() => handleExport("schema")}
          >
            Export Schema
          </button>
          <button
            className="w-full px-2.5 py-1 text-left text-[13px] text-primary rounded-md hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
            onClick={() => handleExport("schema-and-data")}
          >
            Export Schema + Data
          </button>
        </div>
      )}
    </div>
  );
}
