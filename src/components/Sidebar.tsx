import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  RefreshCw,
  ChevronRight,
  Key,
  Link2,
  Fingerprint,
  Hash,
  Type,
  HashIcon,
  ToggleLeft,
  Calendar,
  Clock,
  Binary,
  List,
  Braces,
  MapPin,
  Circle,
  FileText,
  Boxes,
  HelpCircle,
} from "lucide-react";
import type {
  DatabaseConfig,
  SchemaMetadata,
  TableMetadata,
  ColumnInfo,
} from "../types";

interface SidebarProps {
  schemas: SchemaMetadata[];
  databaseConfig: DatabaseConfig | null;
  onTableClick: (tableName: string) => void;
  onTableOpenNewTab: (tableName: string) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  width?: number;
  activeTableName?: string | null;
}

// Map data types to icons
function DataTypeIcon({ dataType }: { dataType: string }) {
  const baseType = dataType.toLowerCase().split("(")[0].trim();
  const iconClass = "w-3 h-3 text-tertiary flex-shrink-0";

  // Text types
  if (
    [
      "text",
      "varchar",
      "char",
      "character",
      "character varying",
      "name",
      "citext",
    ].includes(baseType)
  ) {
    return <Type className={iconClass} strokeWidth={2} />;
  }

  // Numeric types
  if (
    [
      "integer",
      "int",
      "int2",
      "int4",
      "int8",
      "smallint",
      "bigint",
      "serial",
      "bigserial",
      "smallserial",
      "numeric",
      "decimal",
      "real",
      "float",
      "float4",
      "float8",
      "double precision",
      "money",
    ].includes(baseType)
  ) {
    return <HashIcon className={iconClass} strokeWidth={2} />;
  }

  // Boolean
  if (["boolean", "bool"].includes(baseType)) {
    return <ToggleLeft className={iconClass} strokeWidth={2} />;
  }

  // Date types
  if (["date"].includes(baseType)) {
    return <Calendar className={iconClass} strokeWidth={2} />;
  }

  // Time/timestamp types
  if (
    [
      "time",
      "timetz",
      "timestamp",
      "timestamptz",
      "timestamp without time zone",
      "timestamp with time zone",
      "interval",
    ].includes(baseType)
  ) {
    return <Clock className={iconClass} strokeWidth={2} />;
  }

  // Binary types
  if (["bytea", "bit", "bit varying", "varbit"].includes(baseType)) {
    return <Binary className={iconClass} strokeWidth={2} />;
  }

  // Array types
  if (baseType.endsWith("[]") || baseType === "array") {
    return <List className={iconClass} strokeWidth={2} />;
  }

  // JSON types
  if (["json", "jsonb"].includes(baseType)) {
    return <Braces className={iconClass} strokeWidth={2} />;
  }

  // UUID
  if (["uuid"].includes(baseType)) {
    return <Fingerprint className={iconClass} strokeWidth={2} />;
  }

  // Geometric/spatial types
  if (
    [
      "point",
      "line",
      "lseg",
      "box",
      "path",
      "polygon",
      "circle",
      "geometry",
      "geography",
    ].includes(baseType)
  ) {
    return <MapPin className={iconClass} strokeWidth={2} />;
  }

  // Network types
  if (["inet", "cidr", "macaddr", "macaddr8"].includes(baseType)) {
    return <Circle className={iconClass} strokeWidth={2} />;
  }

  // Text search types
  if (["tsvector", "tsquery"].includes(baseType)) {
    return <FileText className={iconClass} strokeWidth={2} />;
  }

  // Range types
  if (
    baseType.endsWith("range") ||
    [
      "int4range",
      "int8range",
      "numrange",
      "tsrange",
      "tstzrange",
      "daterange",
    ].includes(baseType)
  ) {
    return <Boxes className={iconClass} strokeWidth={2} />;
  }

  // XML
  if (["xml"].includes(baseType)) {
    return <FileText className={iconClass} strokeWidth={2} />;
  }

  // OID and system types
  if (
    [
      "oid",
      "regclass",
      "regtype",
      "regproc",
      "regoper",
      "regconfig",
      "regdictionary",
    ].includes(baseType)
  ) {
    return <Circle className={iconClass} strokeWidth={2} />;
  }

  // Default/unknown
  return <HelpCircle className={iconClass} strokeWidth={2} />;
}

// Constraint icons shown on the right
function ConstraintIcons({ column }: { column: ColumnInfo }) {
  const { constraints } = column;
  const icons: ReactNode[] = [];

  if (constraints.isPrimaryKey) {
    icons.push(
      <span key="pk" title="Primary Key">
        <Key className="w-3 h-3 text-amber-500" strokeWidth={2} />
      </span>,
    );
  }
  if (constraints.isForeignKey) {
    const fkTitle = constraints.foreignKeyRef
      ? `FK → ${constraints.foreignKeyRef.table}.${constraints.foreignKeyRef.column}`
      : "Foreign Key";
    icons.push(
      <span key="fk" title={fkTitle}>
        <Link2 className="w-3 h-3 text-blue-500" strokeWidth={2} />
      </span>,
    );
  }
  if (constraints.isUnique) {
    icons.push(
      <span key="uq" title="Unique">
        <Fingerprint className="w-3 h-3 text-purple-500" strokeWidth={2} />
      </span>,
    );
  }
  if (constraints.isIndexed) {
    icons.push(
      <span key="idx" title="Indexed">
        <Hash className="w-3 h-3 text-interactive-subtle" strokeWidth={2} />
      </span>,
    );
  }

  if (icons.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 flex-shrink-0 ml-1">{icons}</div>
  );
}

function TableRow({
  table,
  schema,
  isExpanded,
  isActive,
  onToggle,
  onTableClick,
  onTableOpenNewTab,
  onContextMenu,
  rowRef,
}: {
  table: TableMetadata;
  schema: SchemaMetadata;
  isExpanded: boolean;
  isActive: boolean;
  onToggle: () => void;
  onTableClick: (tableName: string) => void;
  onTableOpenNewTab: (tableName: string) => void;
  onContextMenu: (e: React.MouseEvent, tableName: string) => void;
  rowRef?: React.RefObject<HTMLLIElement | null>;
}) {
  const displayName = table.name;
  const qualifiedName =
    schema.name === "public" ? table.name : `${schema.name}.${table.name}`;

  return (
    <li ref={rowRef}>
      <div
        className={`flex items-center px-2 py-1.5 text-[13px] rounded-md cursor-pointer transition-all duration-150 ${
          isActive
            ? "bg-blue-100 dark:bg-blue-900/30 text-primary"
            : "text-secondary hover:text-primary hover:bg-stone-200/70 dark:hover:bg-white/[0.06]"
        }`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey) {
            onTableOpenNewTab(qualifiedName);
          } else {
            onTableClick(qualifiedName);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e, qualifiedName);
        }}
      >
        <button
          className="p-0.5 -ml-0.5 mr-1 rounded hover:bg-stone-300/50 dark:hover:bg-white/10 transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          <ChevronRight
            className={`w-3.5 h-3.5 text-tertiary transition-transform duration-150 ${
              isExpanded ? "rotate-90" : ""
            }`}
            strokeWidth={2}
          />
        </button>
        <span className="font-mono truncate">{displayName}</span>
      </div>

      {isExpanded && (
        <ul className="ml-3 border-l border-stone-200 dark:border-white/[0.08] pl-1 py-1">
          {table.columns.map((column) => (
            <li
              key={column.name}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-tertiary font-mono min-w-0"
              title={getColumnTooltip(column)}
            >
              <DataTypeIcon dataType={column.dataType} />
              <span className="truncate flex-shrink min-w-0">
                {column.name}
              </span>
              <span className="text-interactive-subtle text-[10px] truncate flex-shrink-[2] min-w-0">
                {column.dataType}
              </span>
              <ConstraintIcons column={column} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function getColumnTooltip(column: ColumnInfo): string {
  const parts: string[] = [column.dataType];

  if (column.constraints.isPrimaryKey) parts.push("Primary Key");
  if (column.constraints.isForeignKey && column.constraints.foreignKeyRef) {
    const ref = column.constraints.foreignKeyRef;
    parts.push(`FK → ${ref.schema}.${ref.table}.${ref.column}`);
  }
  if (column.constraints.isUnique) parts.push("Unique");
  if (column.constraints.isIndexed) parts.push("Indexed");
  if (!column.isNullable) parts.push("NOT NULL");
  if (column.defaultValue) parts.push(`Default: ${column.defaultValue}`);

  return parts.join(" | ");
}

export function Sidebar({
  schemas,
  databaseConfig,
  onTableClick,
  onTableOpenNewTab,
  onRefresh,
  isRefreshing,
  width,
  activeTableName,
}: SidebarProps) {
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set());
  const [collapsedSchemas, setCollapsedSchemas] = useState<Set<string>>(
    new Set(),
  );
  const activeRowRef = useRef<HTMLLIElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    tableName: string;
  } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  // Dismiss context menu on click-outside, Escape, or scroll
  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    const handleScroll = () => setContextMenu(null);
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    document.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("scroll", handleScroll, true);
    };
  }, [contextMenu]);

  // Scroll to active table when it changes
  useEffect(() => {
    if (activeTableName && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({
        block: "nearest",
      });
    }
  }, [activeTableName]);

  const toggleTable = (tableKey: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(tableKey)) {
        next.delete(tableKey);
      } else {
        next.add(tableKey);
      }
      return next;
    });
  };

  const toggleSchema = (schemaName: string) => {
    setCollapsedSchemas((prev) => {
      const next = new Set(prev);
      if (next.has(schemaName)) {
        next.delete(schemaName);
      } else {
        next.add(schemaName);
      }
      return next;
    });
  };

  const showSchemaHeaders = schemas.length > 1;

  return (
    <div
      className="bg-stone-100 dark:bg-[#0a0a0a] border-r border-stone-200 dark:border-white/[0.06] flex flex-col flex-shrink-0"
      style={{ width: width ?? 208 }}
    >
      <div className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: databaseConfig?.display.color }}
          />
          <span className="text-[11px] font-semibold text-tertiary uppercase tracking-[0.08em]">
            Schemas
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="p-1 rounded hover:bg-stone-200/70 dark:hover:bg-white/[0.06] text-interactive transition-colors disabled:opacity-50"
          title="Refresh tables"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${isRefreshing ? "animate-[spin_2s_linear_infinite]" : ""}`}
            strokeWidth={2}
          />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-4 select-none">
        {schemas.map((schema) => {
          const isCollapsed = collapsedSchemas.has(schema.name);

          const tableRows = schema.tables.map((table) => {
            const tableKey = `${schema.name}.${table.name}`;
            const qualifiedName =
              schema.name === "public"
                ? table.name
                : `${schema.name}.${table.name}`;
            const isActive = activeTableName === qualifiedName;
            return (
              <TableRow
                key={tableKey}
                table={table}
                schema={schema}
                isExpanded={expandedTables.has(tableKey)}
                isActive={isActive}
                onToggle={() => toggleTable(tableKey)}
                onTableClick={onTableClick}
                onTableOpenNewTab={onTableOpenNewTab}
                onContextMenu={(e, name) =>
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    tableName: name,
                  })
                }
                rowRef={isActive ? activeRowRef : undefined}
              />
            );
          });

          if (!showSchemaHeaders) return tableRows;

          return (
            <li key={schema.name}>
              <button
                className="flex items-center gap-1.5 w-full px-1 py-1.5 mt-1 first:mt-0 cursor-pointer group"
                onClick={() => toggleSchema(schema.name)}
              >
                <ChevronRight
                  className={`w-3 h-3 text-tertiary transition-transform duration-150 ${
                    !isCollapsed ? "rotate-90" : ""
                  }`}
                  strokeWidth={2}
                />
                <span className="text-[11px] font-semibold text-tertiary uppercase tracking-[0.08em]">
                  {schema.name}
                </span>
                <span className="text-[10px] text-interactive-subtle">
                  ({schema.tables.length})
                </span>
              </button>
              {!isCollapsed && <ul>{tableRows}</ul>}
            </li>
          );
        })}
      </ul>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 min-w-[160px] py-1 bg-white dark:bg-[#1a1a1a] border border-stone-200 dark:border-white/[0.1] rounded-lg shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-[13px] text-secondary hover:text-primary hover:bg-stone-100 dark:hover:bg-white/[0.06] transition-colors"
            onClick={() => {
              onTableOpenNewTab(contextMenu.tableName);
              setContextMenu(null);
            }}
          >
            Open in new tab
          </button>
        </div>
      )}
    </div>
  );
}
