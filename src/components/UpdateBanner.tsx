import { useState } from "react";
import { X, Copy, Check } from "lucide-react";

const UPDATE_COMMAND = "npx dbdiff-app@latest install-from-source";

export function UpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  // TODO: Add update check logic here

  if (!updateAvailable || dismissed) return null;

  function handleCopy() {
    navigator.clipboard.writeText(UPDATE_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-blue-600 text-white text-sm">
      <span>
        A new version of dbdiff is available. Run{" "}
        <code
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 bg-blue-700 px-1.5 py-0.5 rounded font-mono text-xs cursor-pointer hover:bg-blue-800 transition-colors"
        >
          {UPDATE_COMMAND}
          {copied ? <Check size={12} /> : <Copy size={12} />}
        </code>{" "}
        to update.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 p-0.5 rounded hover:bg-blue-500 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
}
