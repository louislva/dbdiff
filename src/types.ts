export interface DatabaseConfigDisplay {
  name: string;
  color: string;
}

export type DatabaseType = "postgres";

export interface DatabaseConfigConnection {
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  params?: Record<string, string>;
}

// Schema metadata types

export interface ColumnConstraints {
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isIndexed: boolean; // Part of any non-PK, non-unique index
  isUnique: boolean; // Part of a unique index/constraint
  foreignKeyRef?: { schema: string; table: string; column: string };
}

export interface ColumnInfo {
  name: string;
  dataType: string; // e.g., "integer", "varchar(255)"
  isNullable: boolean;
  defaultValue: string | null;
  constraints: ColumnConstraints;
}

export interface IndexInfo {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
}

export interface TableMetadata {
  schema: string;
  name: string;
  columns: ColumnInfo[];
  primaryKey: string[];
  indexes: IndexInfo[];
}

export interface SchemaMetadata {
  name: string;
  tables: TableMetadata[];
}

export interface DatabaseConfigCache {
  tables?: string[]; // Keep for backward compat
  schemas?: SchemaMetadata[]; // New comprehensive metadata
}

export type DatabaseConfigSource = "local" | "cloud";

export type AccessLevel = "write" | "read" | "none";
export type AccessMap = Record<string, AccessLevel>;

export type CloudConnectionRole = "owner" | "member";

export interface CloudConnectionInfo {
  id: string; // cloud UUID
  ownerId: string;
  ownerEmail: string;
  role: CloudConnectionRole;
  access?: AccessMap;
  updatedAt: string;
}

export interface DatabaseConfig {
  id: string;
  display: DatabaseConfigDisplay;
  connection: DatabaseConfigConnection;
  cache: DatabaseConfigCache;
  source: DatabaseConfigSource;
  cloud?: CloudConnectionInfo;
  tableConfigs?: Record<string, TableConfig>;
}

export interface TableConfig {
  pageSize?: number;
  fkPreviewColumns?: Record<string, string>; // FK col name -> display col from referenced table
}

export interface InnerTab {
  id: string;
  type: "table" | "console" | "query";
  name: string;
}

export interface ConnectionTab {
  id: string;
  name: string;
  databaseConfigId: string | null;
  innerTabs: InnerTab[];
  activeInnerTabId: string | null;
}

// API types

export interface QueryRequest {
  connection: DatabaseConfigConnection;
  query: string;
}

export interface QueryFieldInfo {
  name: string;
  dataTypeID: number;
}

export interface QueryResponse {
  rows: Record<string, unknown>[];
  fields: QueryFieldInfo[];
  rowCount: number | null;
}

export interface QueryErrorResponse {
  error: string;
}

export interface ScanLocalhostResult {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export interface ScanLocalhostResponse {
  databases: ScanLocalhostResult[];
  error?: string;
}

// Diff types

export interface DiffTableResult {
  tableName: string;
  columns: QueryFieldInfo[];
  primaryKeyColumns: string[];
  deleted: Record<string, unknown>[];
  added: Record<string, unknown>[];
  modified: {
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    changedColumns: string[];
  }[];
  unchangedCount: number;
}

export interface DiffResponse {
  tables: DiffTableResult[];
}

// Console tab state types

export type ExecutionStatus = "idle" | "executing" | "completed" | "error";

export interface ConsoleTabState {
  queryText: string;
  status: ExecutionStatus;
  executionId: string | null; // For race condition handling
  startedAt: number | null;
  completedAt: number | null;
  result: QueryResponse | null;
  error: string | null;
  diffResult: DiffResponse | null;
  lastAction: "run" | "diff" | null;
}

// Table tab state types

export type SortDirection = "ASC" | "DESC";

export interface SortColumn {
  column: string;
  direction: SortDirection;
}

export interface TableTabState {
  tableName: string;
  whereClause: string; // e.g., "user_id='abc123'"
  sortColumns: SortColumn[]; // Ordered list of sort columns
  currentPage: number; // Zero-indexed page number
  totalRowCount: number | null; // From COUNT query, null = unknown
  status: ExecutionStatus;
  executionId: string | null;
  startedAt: number | null;
  completedAt: number | null;
  result: QueryResponse | null;
  error: string | null;
  cellEditState: TableCellEditState;
}

// Config sync state (for syncing schema metadata per database config)

export interface ConfigSyncState {
  status: ExecutionStatus;
  executionId: string | null;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
}

// Cell editing types

export interface CellPosition {
  rowIndex: number;
  columnName: string;
}

export interface CellRange {
  start: CellPosition;
  end: CellPosition;
}

export interface CellChange {
  rowIndex: number;
  columnName: string;
  originalValue: unknown;
  newValue: string | null; // null means SQL NULL
}

// New row pending insertion
export interface PendingNewRow {
  tempId: string; // Unique ID (e.g., timestamp)
  explicitlySetColumns: Set<string>; // Columns user explicitly set
  values: Record<string, string | null>; // Column values (null = SQL NULL)
}

export interface TableCellEditState {
  selectedCell: CellPosition | null;
  selectedRange: CellRange | null;
  isDragging: boolean;
  editingCell: CellPosition | null;
  editValue: string | null;
  pendingChanges: Record<string, CellChange>; // key: "rowIndex:columnName"
  pendingNewRows: PendingNewRow[]; // Rows to insert
  pendingDeletions: number[]; // Row indices marked for deletion (positive only)
}

// Keyboard shortcuts

export type ShortcutAction =
  | "newConsole"
  | "closeInnerTab"
  | "nextInnerTab"
  | "prevInnerTab"
  | "newConnectionTab"
  | "closeConnectionTab"
  | "nextConnectionTab"
  | "prevConnectionTab"
  | "runQuery"
  | "closeModal"
  | "openTableSwitcher"
  | "deleteRows"
  | "selectAll"
  | "refreshTable"
  | "openDatabaseSwitcher";

export type ShortcutConfig = Record<ShortcutAction, string>;

export type ExportType = "schema" | "schema-and-data";

// Connection member (for sharing cloud connections)
export interface ConnectionMember {
  id: string;
  email: string;
  access: AccessMap;
  createdAt: string;
}
