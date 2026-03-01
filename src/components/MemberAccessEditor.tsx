import { useState, useMemo } from "react";
import type {
  ConnectionMember,
  AccessMap,
  AccessLevel,
  SchemaMetadata,
} from "../types";

interface MemberAccessEditorProps {
  member: ConnectionMember;
  schemas: SchemaMetadata[];
  onSave: (access: AccessMap) => void;
  onBack: () => void;
  isSaving: boolean;
}

type BaseLevel = "write" | "read" | "none";

interface TableRule {
  key: string; // "schema.table"
  level: AccessLevel;
}

interface ColumnRule {
  key: string; // "schema.table.column"
}

function parseAccessMap(access: AccessMap): {
  base: BaseLevel;
  tableRules: TableRule[];
  columnRules: ColumnRule[];
} {
  const base: BaseLevel = (access["*"] as BaseLevel) ?? "read";
  const tableRules: TableRule[] = [];
  const columnRules: ColumnRule[] = [];

  for (const [key, level] of Object.entries(access)) {
    if (key === "*") continue;
    const parts = key.split(".");
    if (parts.length === 2) {
      tableRules.push({ key, level });
    } else if (parts.length === 3) {
      columnRules.push({ key });
    }
  }

  return { base, tableRules, columnRules };
}

function buildAccessMap(
  base: BaseLevel,
  tableRules: TableRule[],
  columnRules: ColumnRule[],
): AccessMap {
  const map: AccessMap = { "*": base };
  for (const rule of tableRules) {
    map[rule.key] = rule.level;
  }
  for (const rule of columnRules) {
    map[rule.key] = "none";
  }
  return map;
}

function BackIcon() {
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
        d="M15 19l-7-7 7-7"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  );
}

const BASE_OPTIONS: { value: BaseLevel; label: string; description: string }[] =
  [
    {
      value: "write",
      label: "Full Access",
      description: "Can read and write all tables",
    },
    {
      value: "read",
      label: "Read Only",
      description: "Can read all tables, cannot modify data",
    },
    {
      value: "none",
      label: "No Access",
      description: "Cannot access anything unless explicitly allowed below",
    },
  ];

export function MemberAccessEditor({
  member,
  schemas,
  onSave,
  onBack,
  isSaving,
}: MemberAccessEditorProps) {
  const initial = useMemo(() => parseAccessMap(member.access), [member.access]);

  const [base, setBase] = useState<BaseLevel>(initial.base);
  const [tableRules, setTableRules] = useState<TableRule[]>(initial.tableRules);
  const [columnRules, setColumnRules] = useState<ColumnRule[]>(
    initial.columnRules,
  );
  const [showColumnRules, setShowColumnRules] = useState(
    initial.columnRules.length > 0,
  );

  // Available tables from schemas
  const allTables = useMemo(() => {
    const tables: { key: string; label: string }[] = [];
    for (const schema of schemas) {
      for (const table of schema.tables) {
        tables.push({
          key: `${schema.name}.${table.name}`,
          label: `${schema.name}.${table.name}`,
        });
      }
    }
    return tables;
  }, [schemas]);

  // Available columns from schemas
  const allColumns = useMemo(() => {
    const columns: { key: string; label: string }[] = [];
    for (const schema of schemas) {
      for (const table of schema.tables) {
        for (const col of table.columns) {
          columns.push({
            key: `${schema.name}.${table.name}.${col.name}`,
            label: `${schema.name}.${table.name}.${col.name}`,
          });
        }
      }
    }
    return columns;
  }, [schemas]);

  // Track which tables/columns are already used in rules
  const usedTableKeys = new Set(tableRules.map((r) => r.key));
  const usedColumnKeys = new Set(columnRules.map((r) => r.key));

  // Check if anything changed
  const currentMap = buildAccessMap(base, tableRules, columnRules);
  const originalMap = member.access;
  const hasChanges = JSON.stringify(currentMap) !== JSON.stringify(originalMap);

  function handleSave() {
    onSave(buildAccessMap(base, tableRules, columnRules));
  }

  function addTableRule() {
    const available = allTables.find((t) => !usedTableKeys.has(t.key));
    if (available) {
      setTableRules((prev) => [
        ...prev,
        { key: available.key, level: base === "none" ? "read" : "none" },
      ]);
    }
  }

  function removeTableRule(index: number) {
    setTableRules((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTableRuleKey(index: number, key: string) {
    setTableRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, key } : r)),
    );
  }

  function updateTableRuleLevel(index: number, level: AccessLevel) {
    setTableRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, level } : r)),
    );
  }

  function addColumnRule() {
    const available = allColumns.find((c) => !usedColumnKeys.has(c.key));
    if (available) {
      setColumnRules((prev) => [...prev, { key: available.key }]);
    }
  }

  function removeColumnRule(index: number) {
    setColumnRules((prev) => prev.filter((_, i) => i !== index));
  }

  function updateColumnRuleKey(index: number, key: string) {
    setColumnRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, key } : r)),
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-1 rounded text-tertiary hover:text-primary hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
        >
          <BackIcon />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-semibold text-primary truncate">
            {member.email}
          </h2>
          <p className="text-[12px] text-tertiary">Configure access level</p>
        </div>
        <button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          className="px-4 py-2 text-[13px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>

      {/* Base Access Level */}
      <div className="mb-6">
        <label className="block text-[12px] font-medium text-secondary mb-2">
          Base Access Level
        </label>
        <div className="flex rounded-lg border border-stone-200 dark:border-white/10 overflow-hidden">
          {BASE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setBase(opt.value)}
              className={`flex-1 px-3 py-2 text-[13px] font-medium transition-colors ${
                base === opt.value
                  ? "bg-blue-600 text-white"
                  : "bg-stone-50 dark:bg-white/[0.02] text-secondary hover:bg-stone-100 dark:hover:bg-white/[0.04]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-tertiary mt-1.5">
          {BASE_OPTIONS.find((o) => o.value === base)?.description}
        </p>
      </div>

      {/* Table Rules */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-[12px] font-medium text-secondary">
            Table Overrides
          </label>
          <button
            onClick={addTableRule}
            disabled={
              allTables.length === 0 || usedTableKeys.size >= allTables.length
            }
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <PlusIcon />
            Add Rule
          </button>
        </div>
        {tableRules.length === 0 ? (
          <p className="text-[12px] text-tertiary py-3">
            No table-level overrides. All tables follow the base access level.
          </p>
        ) : (
          <div className="space-y-2">
            {tableRules.map((rule, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-2 bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/[0.06] rounded-lg"
              >
                <select
                  value={rule.key}
                  onChange={(e) => updateTableRuleKey(i, e.target.value)}
                  className="flex-1 px-2 py-1 text-[12px] bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {allTables.map((t) => (
                    <option
                      key={t.key}
                      value={t.key}
                      disabled={usedTableKeys.has(t.key) && t.key !== rule.key}
                    >
                      {t.label}
                    </option>
                  ))}
                </select>
                <select
                  value={rule.level}
                  onChange={(e) =>
                    updateTableRuleLevel(i, e.target.value as AccessLevel)
                  }
                  className="px-2 py-1 text-[12px] bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="write">Write</option>
                  <option value="read">Read</option>
                  <option value="none">Hidden</option>
                </select>
                <button
                  onClick={() => removeTableRule(i)}
                  className="p-1 rounded text-tertiary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <XIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Column Rules */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowColumnRules(!showColumnRules)}
            className="flex items-center gap-1 text-[12px] font-medium text-secondary hover:text-primary transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showColumnRules ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            Column Overrides
          </button>
          {showColumnRules && (
            <button
              onClick={addColumnRule}
              disabled={
                allColumns.length === 0 ||
                usedColumnKeys.size >= allColumns.length
              }
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PlusIcon />
              Add Rule
            </button>
          )}
        </div>
        {showColumnRules && (
          <>
            {columnRules.length === 0 ? (
              <p className="text-[12px] text-tertiary py-3">
                No column-level overrides. Use this to hide specific columns
                (e.g., PII).
              </p>
            ) : (
              <div className="space-y-2">
                {columnRules.map((rule, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 p-2 bg-stone-50 dark:bg-white/[0.02] border border-stone-200 dark:border-white/[0.06] rounded-lg"
                  >
                    <select
                      value={rule.key}
                      onChange={(e) => updateColumnRuleKey(i, e.target.value)}
                      className="flex-1 px-2 py-1 text-[12px] bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 rounded text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      {allColumns.map((c) => (
                        <option
                          key={c.key}
                          value={c.key}
                          disabled={
                            usedColumnKeys.has(c.key) && c.key !== rule.key
                          }
                        >
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <span className="px-2 py-1 text-[12px] text-tertiary">
                      Hidden
                    </span>
                    <button
                      onClick={() => removeColumnRule(i)}
                      className="p-1 rounded text-tertiary hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <XIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
