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

interface EditConnectionModalProps {
  config: DatabaseConfig;
  onClose: () => void;
  onSave: (config: DatabaseConfig) => void;
  onDelete: (id: string) => void;
  isSaving?: boolean;
  saveError?: string | null;
  isDeleting?: boolean;
  deleteError?: string | null;
}

export function EditConnectionModal({
  config,
  onClose,
  onSave,
  onDelete,
  isSaving = false,
  saveError = null,
  isDeleting = false,
  deleteError = null,
}: EditConnectionModalProps) {
  const [connectionString, setConnectionString] = useState("");
  const [name, setName] = useState(config.display.name);
  const [color, setColor] = useState(config.display.color);
  const [host, setHost] = useState(config.connection.host);
  const [port, setPort] = useState(config.connection.port.toString());
  const [database, setDatabase] = useState(config.connection.database);
  const [username, setUsername] = useState(config.connection.username);
  const [password, setPassword] = useState(config.connection.password);
  const [extraParams, setExtraParams] = useState<Record<string, string>>(
    config.connection.params ?? {},
  );
  const [paramsString, setParamsString] = useState(
    config.connection.params
      ? new URLSearchParams(config.connection.params).toString()
      : "",
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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

  // Close delete confirmation first if open, otherwise close the modal
  useHotkey("closeModal", () => {
    if (showDeleteConfirm) {
      setShowDeleteConfirm(false);
    } else {
      onClose();
    }
  });

  function parseConnectionString(connStr: string) {
    try {
      const url = new URL(connStr);
      if (url.protocol === "postgresql:" || url.protocol === "postgres:") {
        if (url.hostname) setHost(url.hostname);
        if (url.port) setPort(url.port);
        if (url.username) setUsername(decodeURIComponent(url.username));
        if (url.password) setPassword(decodeURIComponent(url.password));
        if (url.pathname && url.pathname.length > 1) {
          setDatabase(url.pathname.slice(1));
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
    const updatedConfig: DatabaseConfig = {
      ...config,
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
    };
    onSave(updatedConfig);
  }

  function handleDelete() {
    onDelete(config.id);
  }

  if (showDeleteConfirm) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => !isDeleting && setShowDeleteConfirm(false)}
          />
          <div className="relative bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-sm border border-stone-200 dark:border-white/10">
            <div className="p-6">
              <h2 className="text-[18px] font-semibold text-primary mb-2">
                Delete Connection
              </h2>
              <p className="text-[14px] text-secondary mb-6">
                Are you sure you want to delete "{config.display.name}"? This
                action cannot be undone.
              </p>
              {deleteError && (
                <div className="mb-4 p-3 text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/20">
                  {deleteError}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-[14px] font-medium text-secondary bg-stone-100 dark:bg-white/5 hover:bg-stone-200 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-[14px] font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeleting && (
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
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
                  )}
                  {isDeleting ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
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
              Edit Connection
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
                  disabled={isSaving}
                  className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
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
                  disabled={isSaving}
                  className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  autoFocus
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
                      disabled={isSaving}
                      className={`w-7 h-7 rounded-full transition-transform disabled:opacity-50 disabled:cursor-not-allowed ${
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
                    disabled={isSaving}
                    className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
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
                    disabled={isSaving}
                    className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
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
                  disabled={isSaving}
                  className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
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
                    disabled={isSaving}
                    className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
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
                    disabled={isSaving}
                    className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
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
                  disabled={isSaving}
                  className="w-full px-3 py-2 text-[14px] bg-stone-50 dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded-lg text-primary placeholder:text-tertiary focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {saveError && (
                <div className="p-3 text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 rounded-lg border border-red-200 dark:border-red-500/20">
                  {saveError}
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isSaving}
                  className="px-4 py-2.5 text-[14px] font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSaving}
                  className="px-4 py-2.5 text-[14px] font-medium text-secondary bg-stone-100 dark:bg-white/5 hover:bg-stone-200 dark:hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2.5 text-[14px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isSaving && (
                    <svg
                      className="animate-spin h-4 w-4"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
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
                  )}
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
