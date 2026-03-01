import type { DatabaseConfig } from "../types";
import { CLOUD_ENABLED } from "../constants";

interface ConnectionPickerProps {
  databaseConfigs: DatabaseConfig[];
  onConnect: (databaseConfigId: string) => void;
  onAddNew: () => void;
  onEdit: (config: DatabaseConfig) => void;
  cloudApiKey: string | null;
  onLinkCloud: () => void;
  onUnlinkCloud: () => void;
  onRefreshCloud: () => void;
  isCloudSyncing: boolean;
  cloudSyncError: string | null;
  onTransferToCloud: (config: DatabaseConfig) => void;
  transferringId: string | null;
  onManageMembers: (config: DatabaseConfig) => void;
}

function SettingsIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M5 13l4 4L19 7"
      />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-4 h-4"}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function CloudUploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className ?? "w-4 h-4"}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
      />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
      />
    </svg>
  );
}

function formatConfigString(config: DatabaseConfig) {
  return `${config.connection.username}:******@${config.connection.host}:${config.connection.port}/${config.connection.database}`;
}

export function ConnectionPicker({
  databaseConfigs,
  onConnect,
  onAddNew,
  onEdit,
  cloudApiKey,
  onLinkCloud,
  onUnlinkCloud,
  onRefreshCloud,
  isCloudSyncing,
  cloudSyncError,
  onTransferToCloud,
  transferringId,
  onManageMembers,
}: ConnectionPickerProps) {
  const localConfigs = databaseConfigs.filter((c) => c.source === "local");
  const cloudConfigs = databaseConfigs.filter((c) => c.source === "cloud");
  return (
    <div className="flex flex-col items-center justify-center min-h-full p-8 overflow-auto">
      <div className="w-full max-w-md">
        {/* Cloud status */}
        {CLOUD_ENABLED && (
          <div className="mb-8 p-4 bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/[0.06] rounded-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CloudIcon />
                <span className="text-[14px] font-medium text-primary">
                  dbdiff Cloud
                </span>
              </div>
              {cloudApiKey ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-[12px] text-green-600 dark:text-green-400">
                    <CheckIcon />
                    Linked
                  </span>
                  <button
                    onClick={onRefreshCloud}
                    disabled={isCloudSyncing}
                    className="p-1 rounded text-tertiary hover:text-primary hover:bg-stone-200 dark:hover:bg-white/10 transition-all disabled:opacity-50"
                    title="Refresh cloud connections"
                  >
                    <RefreshIcon
                      className={`w-3.5 h-3.5 ${isCloudSyncing ? "animate-spin" : ""}`}
                    />
                  </button>
                  <button
                    onClick={onUnlinkCloud}
                    className="text-[12px] text-tertiary hover:text-primary transition-colors"
                  >
                    Unlink
                  </button>
                </div>
              ) : (
                <button
                  onClick={onLinkCloud}
                  className="px-3 py-1.5 text-[12px] font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Link to Cloud
                </button>
              )}
            </div>
            {!cloudApiKey && (
              <p className="text-[12px] text-tertiary mt-2">
                Link to sync connections across devices and share with
                teammates.
              </p>
            )}
            {cloudSyncError && (
              <p className="text-[12px] text-red-500 mt-2">
                Sync error: {cloudSyncError}
              </p>
            )}
          </div>
        )}

        <h2 className="text-[22px] font-semibold text-primary tracking-[-0.02em] mb-2">
          Connect to a database
        </h2>
        <p className="text-[14px] text-secondary mb-8">
          Select a saved connection to get started
        </p>

        {/* Cloud connections section */}
        {CLOUD_ENABLED && cloudConfigs.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <CloudIcon />
              <span className="text-[12px] font-medium text-tertiary uppercase tracking-wide">
                Cloud Connections
              </span>
            </div>
            <div className="space-y-2">
              {cloudConfigs.map((config) => (
                <div
                  key={config.id}
                  className="group p-4 bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/[0.06] rounded-xl hover:bg-stone-100 dark:hover:bg-white/[0.04] hover:border-stone-300 dark:hover:border-white/[0.1] cursor-pointer transition-all duration-150"
                  onClick={() => onConnect(config.id)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: config.display.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-medium text-primary transition-colors">
                          {config.display.name}
                        </span>
                        {config.cloud?.role === "owner" ? (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 rounded">
                            Owner
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded">
                            {(() => {
                              const access = config.cloud?.access;
                              if (!access) return "Member";
                              const keys = Object.keys(access);
                              if (keys.length === 1 && access["*"] === "write")
                                return "Full Access";
                              if (keys.length === 1 && access["*"] === "read")
                                return "Read Only";
                              if (keys.length === 1 && access["*"] === "none")
                                return "No Access";
                              return "Custom Access";
                            })()}
                          </span>
                        )}
                        {config.cloud?.role === "owner" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEdit(config);
                            }}
                            className="p-1 rounded text-interactive-subtle hover:bg-stone-200 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all duration-150"
                            title="Edit connection"
                          >
                            <SettingsIcon />
                          </button>
                        )}
                        {config.cloud?.role === "owner" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onManageMembers(config);
                            }}
                            className="p-1 rounded text-interactive-subtle hover:bg-stone-200 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all duration-150"
                            title="Manage members"
                          >
                            <UsersIcon />
                          </button>
                        )}
                      </div>
                      <div className="text-[12px] text-tertiary font-mono mt-0.5 truncate">
                        {formatConfigString(config)}
                      </div>
                    </div>
                    <span className="text-interactive-subtle group-hover:text-tertiary transition-colors text-lg">
                      →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Local connections section */}
        {localConfigs.length > 0 && (
          <div className="mb-4">
            {CLOUD_ENABLED && cloudConfigs.length > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[12px] font-medium text-tertiary uppercase tracking-wide">
                  Local Connections
                </span>
              </div>
            )}
            <div className="space-y-2">
              {localConfigs.map((config) => (
                <div
                  key={config.id}
                  className="group p-4 bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/[0.06] rounded-xl hover:bg-stone-100 dark:hover:bg-white/[0.04] hover:border-stone-300 dark:hover:border-white/[0.1] cursor-pointer transition-all duration-150"
                  onClick={() => onConnect(config.id)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: config.display.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[14px] font-medium text-primary transition-colors">
                          {config.display.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit(config);
                          }}
                          className="p-1 rounded text-interactive-subtle hover:bg-stone-200 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all duration-150"
                          title="Edit connection"
                        >
                          <SettingsIcon />
                        </button>
                        {CLOUD_ENABLED && cloudApiKey && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onTransferToCloud(config);
                            }}
                            disabled={transferringId === config.id}
                            className="p-1 rounded text-interactive-subtle hover:bg-stone-200 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-all duration-150 disabled:opacity-50"
                            title="Transfer to cloud"
                          >
                            <CloudUploadIcon
                              className={`w-4 h-4 ${transferringId === config.id ? "animate-pulse" : ""}`}
                            />
                          </button>
                        )}
                      </div>
                      <div className="text-[12px] text-tertiary font-mono mt-0.5 truncate">
                        {formatConfigString(config)}
                      </div>
                    </div>
                    <span className="text-interactive-subtle group-hover:text-tertiary transition-colors text-lg">
                      →
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={onAddNew}
          className="w-full mt-4 p-4 border border-dashed border-stone-300 dark:border-white/[0.12] rounded-xl text-[13px] text-interactive hover:border-stone-400 dark:hover:border-white/25 transition-all duration-150 cursor-pointer"
        >
          + Add new connection
        </button>
      </div>
    </div>
  );
}
