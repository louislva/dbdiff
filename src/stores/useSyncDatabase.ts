import { useCallback, useRef } from "react";
import type {
  ColumnConstraints,
  ColumnInfo,
  ConfigSyncState,
  IndexInfo,
  SchemaMetadata,
  TableMetadata,
} from "../types";
import { useStore } from "./store";

// SQL Queries for schema metadata

const COLUMNS_QUERY = `
SELECT c.table_schema, c.table_name, c.column_name, c.ordinal_position,
       c.data_type, c.character_maximum_length, c.numeric_precision,
       c.numeric_scale, c.is_nullable, c.column_default
FROM information_schema.columns c
JOIN information_schema.tables t
  ON c.table_schema = t.table_schema AND c.table_name = t.table_name
WHERE t.table_type = 'BASE TABLE'
  AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY c.table_schema, c.table_name, c.ordinal_position
`;

const PRIMARY_KEYS_QUERY = `
SELECT tc.table_schema, tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY'
  AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
`;

const FOREIGN_KEYS_QUERY = `
SELECT tc.table_schema, tc.table_name, kcu.column_name,
       ccu.table_schema AS ref_schema, ccu.table_name AS ref_table, ccu.column_name AS ref_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
`;

const INDEXES_QUERY = `
SELECT n.nspname AS table_schema, t.relname AS table_name, i.relname AS index_name,
       array_agg(a.attname ORDER BY x.ordinality) AS columns,
       ix.indisunique AS is_unique, ix.indisprimary AS is_primary
FROM pg_index ix
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ordinality)
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = x.attnum
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
GROUP BY n.nspname, t.relname, i.relname, ix.indisunique, ix.indisprimary
`;

// Types for raw query results

interface ColumnRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  ordinal_position: number;
  data_type: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: string;
  column_default: string | null;
}

interface PrimaryKeyRow {
  table_schema: string;
  table_name: string;
  column_name: string;
}

interface ForeignKeyRow {
  table_schema: string;
  table_name: string;
  column_name: string;
  ref_schema: string;
  ref_table: string;
  ref_column: string;
}

interface IndexRow {
  table_schema: string;
  table_name: string;
  index_name: string;
  columns: string[];
  is_unique: boolean;
  is_primary: boolean;
}

// Helper to format data type with length/precision
function formatDataType(row: ColumnRow): string {
  const {
    data_type,
    character_maximum_length,
    numeric_precision,
    numeric_scale,
  } = row;

  if (character_maximum_length) {
    return `${data_type}(${character_maximum_length})`;
  }
  if (numeric_precision && numeric_scale) {
    return `${data_type}(${numeric_precision},${numeric_scale})`;
  }
  if (numeric_precision) {
    return `${data_type}(${numeric_precision})`;
  }
  return data_type;
}

// Build schema metadata from query results
function buildSchemaMetadata(
  columns: ColumnRow[],
  primaryKeys: PrimaryKeyRow[],
  foreignKeys: ForeignKeyRow[],
  indexes: IndexRow[],
): SchemaMetadata[] {
  // Build lookup maps
  const pkMap = new Map<string, Set<string>>(); // "schema.table" -> Set of column names
  for (const pk of primaryKeys) {
    const key = `${pk.table_schema}.${pk.table_name}`;
    if (!pkMap.has(key)) pkMap.set(key, new Set());
    pkMap.get(key)!.add(pk.column_name);
  }

  const fkMap = new Map<
    string,
    { schema: string; table: string; column: string }
  >(); // "schema.table.column" -> ref
  for (const fk of foreignKeys) {
    const key = `${fk.table_schema}.${fk.table_name}.${fk.column_name}`;
    fkMap.set(key, {
      schema: fk.ref_schema,
      table: fk.ref_table,
      column: fk.ref_column,
    });
  }

  // Build index lookup: "schema.table.column" -> { isUnique, isIndexed }
  const indexMap = new Map<string, { isUnique: boolean; isIndexed: boolean }>();
  for (const idx of indexes) {
    // Skip primary key indexes (handled separately)
    if (idx.is_primary) continue;

    for (const col of idx.columns) {
      const key = `${idx.table_schema}.${idx.table_name}.${col}`;
      const existing = indexMap.get(key) ?? {
        isUnique: false,
        isIndexed: false,
      };
      indexMap.set(key, {
        isUnique: existing.isUnique || idx.is_unique,
        isIndexed: existing.isIndexed || !idx.is_unique,
      });
    }
  }

  // Group columns by schema and table
  const schemaMap = new Map<string, Map<string, ColumnRow[]>>();
  for (const col of columns) {
    if (!schemaMap.has(col.table_schema)) {
      schemaMap.set(col.table_schema, new Map());
    }
    const tableMap = schemaMap.get(col.table_schema)!;
    if (!tableMap.has(col.table_name)) {
      tableMap.set(col.table_name, []);
    }
    tableMap.get(col.table_name)!.push(col);
  }

  // Build index info per table
  const tableIndexMap = new Map<string, IndexInfo[]>();
  for (const idx of indexes) {
    const key = `${idx.table_schema}.${idx.table_name}`;
    if (!tableIndexMap.has(key)) {
      tableIndexMap.set(key, []);
    }
    tableIndexMap.get(key)!.push({
      name: idx.index_name,
      columns: idx.columns,
      isUnique: idx.is_unique,
      isPrimary: idx.is_primary,
    });
  }

  // Build schema metadata
  const schemas: SchemaMetadata[] = [];
  for (const [schemaName, tableMap] of schemaMap) {
    const tables: TableMetadata[] = [];

    for (const [tableName, cols] of tableMap) {
      const tableKey = `${schemaName}.${tableName}`;
      const pkColumns = pkMap.get(tableKey) ?? new Set();

      const columnInfos: ColumnInfo[] = cols.map((col) => {
        const colKey = `${schemaName}.${tableName}.${col.column_name}`;
        const isPrimaryKey = pkColumns.has(col.column_name);
        const foreignKeyRef = fkMap.get(colKey);
        const indexInfo = indexMap.get(colKey) ?? {
          isUnique: false,
          isIndexed: false,
        };

        const constraints: ColumnConstraints = {
          isPrimaryKey,
          isForeignKey: !!foreignKeyRef,
          isUnique: indexInfo.isUnique,
          isIndexed: indexInfo.isIndexed,
          foreignKeyRef,
        };

        return {
          name: col.column_name,
          dataType: formatDataType(col),
          isNullable: col.is_nullable === "YES",
          defaultValue: col.column_default,
          constraints,
        };
      });

      tables.push({
        schema: schemaName,
        name: tableName,
        columns: columnInfos,
        primaryKey: Array.from(pkColumns),
        indexes: tableIndexMap.get(tableKey) ?? [],
      });
    }

    // Sort tables by name
    tables.sort((a, b) => a.name.localeCompare(b.name));
    schemas.push({ name: schemaName, tables });
  }

  // Sort schemas by name, but put 'public' first
  schemas.sort((a, b) => {
    if (a.name === "public") return -1;
    if (b.name === "public") return 1;
    return a.name.localeCompare(b.name);
  });

  return schemas;
}

// Build legacy tables list for backward compatibility
function buildTablesList(schemas: SchemaMetadata[]): string[] {
  const tables: string[] = [];
  for (const schema of schemas) {
    for (const table of schema.tables) {
      // Only include schema prefix for non-public schemas
      if (schema.name === "public") {
        tables.push(table.name);
      } else {
        tables.push(`${schema.name}.${table.name}`);
      }
    }
  }
  return tables.sort();
}

export const DEFAULT_SYNC_STATE: ConfigSyncState = {
  status: "idle",
  executionId: null,
  startedAt: null,
  completedAt: null,
  error: null,
};

/** Sync database schema (tables, columns, indexes, keys) for a specific database config */
export function useSyncDatabase(configId: string | undefined) {
  const syncState =
    useStore((state) =>
      configId ? state.configSyncStates[configId] : undefined,
    ) ?? DEFAULT_SYNC_STATE;

  const updateConfigSyncState = useStore(
    (state) => state.updateConfigSyncState,
  );
  const updateConfigCache = useStore((state) => state.updateConfigCache);

  const getDatabaseConfig = useCallback(() => {
    if (!configId) return null;
    return (
      useStore.getState().databaseConfigs.find((c) => c.id === configId) ?? null
    );
  }, [configId]);

  // Use ref to track current execution ID to handle race conditions
  const currentExecutionRef = useRef<string | null>(null);

  const sync = useCallback(async () => {
    const config = getDatabaseConfig();
    if (!config || !configId) return;

    // Generate unique execution ID for race condition handling
    const executionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    currentExecutionRef.current = executionId;

    // Set executing state
    updateConfigSyncState(configId, {
      status: "executing",
      executionId,
      startedAt: Date.now(),
      completedAt: null,
      error: null,
    });

    try {
      // Execute all queries in parallel
      const [columnsRes, pkRes, fkRes, indexesRes] = await Promise.all([
        fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connection: config.connection,
            query: COLUMNS_QUERY,
          }),
        }),
        fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connection: config.connection,
            query: PRIMARY_KEYS_QUERY,
          }),
        }),
        fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connection: config.connection,
            query: FOREIGN_KEYS_QUERY,
          }),
        }),
        fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connection: config.connection,
            query: INDEXES_QUERY,
          }),
        }),
      ]);

      // Check if this execution is still current (race condition check)
      if (currentExecutionRef.current !== executionId) {
        return; // Stale response, discard
      }

      // Check for errors
      if (!columnsRes.ok) {
        const data = await columnsRes.json();
        throw new Error(data.error || "Failed to fetch columns");
      }
      if (!pkRes.ok) {
        const data = await pkRes.json();
        throw new Error(data.error || "Failed to fetch primary keys");
      }
      if (!fkRes.ok) {
        const data = await fkRes.json();
        throw new Error(data.error || "Failed to fetch foreign keys");
      }
      if (!indexesRes.ok) {
        const data = await indexesRes.json();
        throw new Error(data.error || "Failed to fetch indexes");
      }

      const [columnsData, pkData, fkData, indexesData] = await Promise.all([
        columnsRes.json(),
        pkRes.json(),
        fkRes.json(),
        indexesRes.json(),
      ]);

      // Double-check after async operation
      if (currentExecutionRef.current !== executionId) {
        return; // Stale response, discard
      }

      // Build schema metadata
      const schemas = buildSchemaMetadata(
        columnsData.rows as ColumnRow[],
        pkData.rows as PrimaryKeyRow[],
        fkData.rows as ForeignKeyRow[],
        indexesData.rows as IndexRow[],
      );

      // Build legacy tables list for backward compatibility
      const tables = buildTablesList(schemas);

      // Update cache with both new and legacy formats
      updateConfigCache(config.id, { schemas, tables });
      updateConfigSyncState(configId, {
        status: "completed",
        completedAt: Date.now(),
      });
    } catch (err) {
      // Check if this execution is still current
      if (currentExecutionRef.current !== executionId) {
        return; // Stale response, discard
      }

      updateConfigSyncState(configId, {
        status: "error",
        completedAt: Date.now(),
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [configId, getDatabaseConfig, updateConfigCache, updateConfigSyncState]);

  return { sync, isSyncing: syncState.status === "executing" };
}
