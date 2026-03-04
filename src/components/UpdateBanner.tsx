import { useState, useEffect, useRef } from "react";

interface UpdateInfo {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    fetch("/api/check-update")
      .then((res) => res.json())
      .then((data: UpdateInfo) => {
        if (data.updateAvailable) setUpdate(data);
      })
      .catch(() => {
        // silently fail — no network is fine
      });
  }, []);

  // Handle Electron "Check for Updates" menu action
  useEffect(() => {
    if (!window.electronAPI?.onMenuAction) return;

    // We listen for the menu action to trigger a manual check and report
    // the result back to the main process for a native dialog.
    const unsub = window.electronAPI.onMenuAction((action) => {
      if (action !== "check-for-updates") return;
      fetch("/api/check-update")
        .then((res) => res.json())
        .then((data: UpdateInfo) => {
          window.electronAPI?.sendUpdateCheckResult(data);
          if (data.updateAvailable) {
            setUpdate(data);
            setDismissed(false);
          }
        })
        .catch(() => {
          window.electronAPI?.sendUpdateCheckResult({
            currentVersion: "unknown",
            latestVersion: null,
            updateAvailable: false,
          });
        });
    });
    return unsub;
  }, []);

  if (!update || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-500/10 border-b border-blue-200 dark:border-blue-500/20 text-[13px]">
      <span className="text-blue-800 dark:text-blue-300">
        dbdiff <strong>v{update.latestVersion}</strong> is available (you have v
        {update.currentVersion}).{" "}
        <span className="text-blue-600 dark:text-blue-400">
          Run{" "}
          <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-500/20 rounded text-[12px]">
            npx dbdiff-app@latest install-from-source
          </code>{" "}
          to update.
        </span>
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="flex-shrink-0 text-blue-400 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-300 transition-colors"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
