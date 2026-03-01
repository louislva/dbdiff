import React, { useCallback, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

interface JsonTreeViewerProps {
  data: unknown;
  columnName: string;
  onEdit?: (newData: unknown) => void;
  canEdit: boolean;
}

export function JsonTreeViewer({
  data,
  columnName,
  onEdit,
  canEdit,
}: JsonTreeViewerProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(["$"]),
  );

  const allPaths = useMemo(() => {
    const paths = new Set<string>();
    function collect(value: unknown, path: string) {
      if (value !== null && typeof value === "object") {
        paths.add(path);
        if (Array.isArray(value)) {
          value.forEach((item, i) => collect(item, `${path}[${i}]`));
        } else {
          Object.keys(value as Record<string, unknown>).forEach((key) =>
            collect((value as Record<string, unknown>)[key], `${path}.${key}`),
          );
        }
      }
    }
    collect(data, "$");
    return paths;
  }, [data]);

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedPaths(new Set(allPaths));
  }, [allPaths]);

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const handleEdit = useCallback(
    (path: string[], newValue: unknown) => {
      if (!onEdit) return;
      // Deep clone and set value at path
      const cloned = JSON.parse(JSON.stringify(data));
      let target = cloned;
      for (let i = 0; i < path.length - 1; i++) {
        target = target[path[i]];
      }
      target[path[path.length - 1]] = newValue;
      onEdit(cloned);
    },
    [data, onEdit],
  );

  const isAllExpanded = expandedPaths.size >= allPaths.size;

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-stone-200 dark:border-white/[0.06] bg-stone-50 dark:bg-white/[0.02]">
        <span className="text-[11px] font-medium text-tertiary uppercase tracking-wide">
          JSON: {columnName}
        </span>
        <button
          onClick={isAllExpanded ? collapseAll : expandAll}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[11px] text-tertiary hover:text-secondary rounded hover:bg-stone-200/70 dark:hover:bg-white/[0.06] transition-colors"
        >
          {isAllExpanded ? (
            <>
              <ChevronsDownUp className="w-3 h-3" />
              Collapse All
            </>
          ) : (
            <>
              <ChevronsUpDown className="w-3 h-3" />
              Expand All
            </>
          )}
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono text-[12px]">
        <JsonNode
          value={data}
          path="$"
          keyPath={[]}
          expandedPaths={expandedPaths}
          onToggle={togglePath}
          canEdit={canEdit}
          onEdit={handleEdit}
        />
      </div>
    </div>
  );
}

const ARRAY_TRUNCATE_LIMIT = 100;

interface JsonNodeProps {
  value: unknown;
  path: string;
  keyPath: string[];
  keyName?: string;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
  canEdit: boolean;
  onEdit: (path: string[], newValue: unknown) => void;
  isArrayItem?: boolean;
  arrayIndex?: number;
}

const JsonNode = React.memo(function JsonNode({
  value,
  path,
  keyPath,
  keyName,
  expandedPaths,
  onToggle,
  canEdit,
  onEdit,
  isArrayItem,
  arrayIndex,
}: JsonNodeProps) {
  const isExpanded = expandedPaths.has(path);
  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);

  if (!isObject) {
    return (
      <div className="flex items-start">
        {keyName !== undefined && (
          <span className="text-secondary">
            {keyName}
            <span className="text-tertiary">: </span>
          </span>
        )}
        {isArrayItem && arrayIndex !== undefined && (
          <span className="text-tertiary mr-1">{arrayIndex}: </span>
        )}
        <LeafValue
          value={value}
          canEdit={canEdit}
          onEdit={(newVal) => onEdit(keyPath, newVal)}
        />
      </div>
    );
  }

  const entries = isArray
    ? (value as unknown[])
    : Object.entries(value as Record<string, unknown>);
  const entryCount = isArray
    ? (value as unknown[]).length
    : Object.keys(value as Record<string, unknown>).length;

  const collapsedPreview = isArray
    ? `[${entryCount} item${entryCount !== 1 ? "s" : ""}]`
    : getObjectPreview(value as Record<string, unknown>);

  return (
    <div>
      <div
        className="flex items-start cursor-pointer hover:bg-stone-100 dark:hover:bg-white/[0.04] rounded px-0.5 -mx-0.5"
        onClick={() => onToggle(path)}
      >
        <ChevronRight
          className={`w-3 h-3 mt-0.5 flex-shrink-0 text-tertiary transition-transform ${isExpanded ? "rotate-90" : ""}`}
        />
        <span className="ml-0.5">
          {keyName !== undefined && (
            <span className="text-secondary">
              {keyName}
              <span className="text-tertiary">: </span>
            </span>
          )}
          {isArrayItem && arrayIndex !== undefined && (
            <span className="text-tertiary">{arrayIndex}: </span>
          )}
          {!isExpanded && (
            <span className="text-tertiary">{collapsedPreview}</span>
          )}
          {isExpanded && (
            <span className="text-tertiary">{isArray ? "[" : "{"}</span>
          )}
        </span>
      </div>
      {isExpanded && (
        <div className="pl-4">
          {isArray
            ? (entries as unknown[]).map((item, i) => {
                if (i >= ARRAY_TRUNCATE_LIMIT) {
                  if (i === ARRAY_TRUNCATE_LIMIT) {
                    return (
                      <ShowMoreButton
                        key="__show_more__"
                        remaining={entryCount - ARRAY_TRUNCATE_LIMIT}
                        onToggle={() => onToggle(path)}
                      />
                    );
                  }
                  return null;
                }
                return (
                  <JsonNode
                    key={i}
                    value={item}
                    path={`${path}[${i}]`}
                    keyPath={[...keyPath, String(i)]}
                    expandedPaths={expandedPaths}
                    onToggle={onToggle}
                    canEdit={canEdit}
                    onEdit={onEdit}
                    isArrayItem
                    arrayIndex={i}
                  />
                );
              })
            : (entries as [string, unknown][]).map(([k, v]) => (
                <JsonNode
                  key={k}
                  value={v}
                  path={`${path}.${k}`}
                  keyPath={[...keyPath, k]}
                  keyName={k}
                  expandedPaths={expandedPaths}
                  onToggle={onToggle}
                  canEdit={canEdit}
                  onEdit={onEdit}
                />
              ))}
          <div
            className="text-tertiary px-0.5 cursor-pointer hover:bg-stone-100 dark:hover:bg-white/[0.04] rounded -mx-0.5"
            onClick={() => onToggle(path)}
          >
            {isArray ? "]" : "}"}
          </div>
        </div>
      )}
    </div>
  );
});

function ShowMoreButton({
  remaining,
  onToggle,
}: {
  remaining: number;
  onToggle: () => void;
}) {
  return (
    <div
      className="px-0.5 -mx-0.5 text-blue-600 dark:text-blue-400 cursor-pointer hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      ... {remaining} more item{remaining !== 1 ? "s" : ""} (collapse to reset)
    </div>
  );
}

interface LeafValueProps {
  value: unknown;
  canEdit: boolean;
  onEdit: (newValue: unknown) => void;
}

function LeafValue({ value, canEdit, onEdit }: LeafValueProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canEdit) return;
    setEditText(value === null ? "" : String(value));
    setIsEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const handleCommit = () => {
    setIsEditing(false);
    const coerced = coerceValue(editText, value);
    onEdit(coerced);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isEditing) return;
    const text = value === null ? "null" : String(value);
    navigator.clipboard.writeText(text);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleCommit}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        className="px-1 py-0 text-[12px] font-mono bg-white dark:bg-stone-800 border border-blue-500 dark:border-blue-400 rounded outline-none min-w-[60px]"
      />
    );
  }

  return (
    <span
      className={`${getValueColorClass(value)} cursor-pointer hover:underline decoration-dotted`}
      onClick={handleCopy}
      onDoubleClick={handleDoubleClick}
      title={canEdit ? "Click to copy, double-click to edit" : "Click to copy"}
    >
      {formatLeafValue(value)}
    </span>
  );
}

function getValueColorClass(value: unknown): string {
  if (value === null) return "text-tertiary italic";
  if (typeof value === "string") return "text-green-600 dark:text-green-400";
  if (typeof value === "number") return "text-blue-600 dark:text-blue-400";
  if (typeof value === "boolean") return "text-purple-600 dark:text-purple-400";
  return "text-secondary";
}

function formatLeafValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

function getObjectPreview(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) return "{}";
  if (keys.length <= 3) return `{ ${keys.join(", ")} }`;
  return `{ ${keys.slice(0, 3).join(", ")}, ... }`;
}

function coerceValue(text: string, originalValue: unknown): unknown {
  if (text === "" || text === "null") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  if (typeof originalValue === "number") {
    const num = Number(text);
    if (!isNaN(num)) return num;
  }
  return text;
}
