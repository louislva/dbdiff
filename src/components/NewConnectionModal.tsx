import { useState } from "react";
import type { DatabaseConfig } from "../types";
import { useHotkey } from "../stores/hooks";

const COLORS = [
  "#ef4444", // red
  "#f59e0b", // amber
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

interface NewConnectionModalProps {
  onClose: () => void;
  onSave: (config: DatabaseConfig) => void;
}

export function NewConnectionModal({
  onClose,
  onSave,
}: NewConnectionModalProps) {
  const [connectionString, setConnectionString] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("postgres");
  const [password, setPassword] = useState("");
  const [extraParams, setExtraParams] = useState<Record<string, string>>({});
  const [paramsString, setParamsString] = useState("");

  useHotkey("closeModal", onClose);

  function parseParamsString(value: string) {
    const params: Record<string, string> = {};
    if (value.trim()) {
      for (const pair of value.split("&")) {
        const [k, ...rest] = pair.split("=");
        if (k?.trim()) params[k.trim()] = rest.join("=") || "";
      }
    }
    setExtraParams(params);
  }

  function parseConnectionString(connStr: string) {
    // Parse: postgresql://username:password@host:port/database
    // or: postgres://username:password@host:port/database
    try {
      const url = new URL(connStr);
      if (url.protocol === "postgresql:" || url.protocol === "postgres:") {
        if (url.hostname) setHost(url.hostname);
        if (url.port) setPort(url.port);
        if (url.username) setUsername(decodeURIComponent(url.username));
        if (url.password) setPassword(decodeURIComponent(url.password));
        if (url.pathname && url.pathname.length > 1) {
          setDatabase(url.pathname.slice(1)); // remove leading /
        }
        const params: Record<string, string> = {};
        url.searchParams.forEach((value, key) => {
          params[key] = value;
        });
        setExtraParams(params);
        setParamsString(url.search ? url.searchParams.toString() : "");
      }
    } catch {
      // Not a valid URL, ignore
    }
  }

  function handleConnectionStringChange(value: string) {
    setConnectionString(value);
    parseConnectionString(value);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const config: DatabaseConfig = {
      id: Date.now().toString(),
      display: { name: name || "Untitled Connection", color },
      connection: {
        type: "postgres",
        host,
        port: parseInt(port, 10) || 5432,
        database,
        username,
        password,
        ...(Object.keys(extraParams).length > 0 && { params: extraParams }),
      },
      cache: {},
      source: "local",
    };
    onSave(config);
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <div className="relative bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-md border border-stone-200 dark:border-white/10">
          <div className="p-6">
            <h2 className="text-[18px] font-semibold text-primary mb-6">
              New Connection
            </h2>

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
              autoComplete="off"
            >
              <div>
                <label className="block text-[12px] font-medium text-secondary mb-1.5">
                  Connection String
                </label>
                <input
                  type="text"
                  value={connectionString}
                  onChange={(e) => handleConnectionStringChange(e.target.value)}
                  placeholder="postgresql://user:pass@host:5432/dbname"
                  className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono"
                  autoFocus
                />
                <p className="text-[11px] text-tertiary mt-1">
                  Paste a connection string to auto-fill the fields below
                </p>
              </div>

              <div className="border-t border-stone-200 dark:border-white/10 pt-4">
                <label className="block text-[12px] font-medium text-secondary mb-1.5">
                  Connection Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Database"
                  className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium text-secondary mb-1.5">
                  Color
                </label>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        color === c
                          ? "ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#1a1a1a] ring-blue-500 scale-110"
                          : "hover:scale-110"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[12px] font-medium text-secondary mb-1.5">
                    Host
                  </label>
                  <input
                    type="text"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder="localhost"
                    className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-secondary mb-1.5">
                    Port
                  </label>
                  <input
                    type="text"
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="5432"
                    className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-secondary mb-1.5">
                  Database
                </label>
                <input
                  type="text"
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder="postgres"
                  className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-secondary mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="postgres"
                    autoComplete="off"
                    className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-secondary mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-secondary mb-1.5">
                  Parameters
                </label>
                <input
                  type="text"
                  value={paramsString}
                  onChange={(e) => {
                    setParamsString(e.target.value);
                    parseParamsString(e.target.value);
                  }}
                  placeholder="sslmode=require"
                  className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 text-[14px] font-medium text-secondary bg-stone-100 dark:bg-white/5 hover:bg-stone-200 dark:hover:bg-white/10 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 text-[14px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Save Connection
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
