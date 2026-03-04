import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import type {
  QueryRequest,
  QueryResponse,
  QueryErrorResponse,
  ScanLocalhostResponse,
  ExportType,
  DatabaseConfigConnection,
  DiffResponse,
  DiffTableResult,
  QueryFieldInfo,
} from "../src/types.js";
import { LOCALHOST_SCANNING_ENABLED } from "../src/constants.js";
import { pgDump } from "./export.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Find project root (where package.json lives) — works whether run from
// server/index.ts (dev) or dist-server/server/index.js (prod)
let projectRoot = __dirname;
while (
  !fs.existsSync(path.join(projectRoot, "package.json")) &&
  projectRoot !== path.dirname(projectRoot)
) {
  projectRoot = path.dirname(projectRoot);
}

const app = express();
const port = parseInt(process.env.PORT || "4088");

const distPath = path.join(projectRoot, "dist");
const hasBuiltFrontend = fs.existsSync(path.join(distPath, "index.html"));

app.use(express.json());

/** Build a PostgreSQL connection string from a DatabaseConfigConnection */
function buildConnectionString(conn: {
  username: string;
  password: string;
  host: string;
  port: number;
  database: string;
  params?: Record<string, string>;
}): string {
  const params =
    conn.params && Object.keys(conn.params).length > 0
      ? "?" + new URLSearchParams(conn.params).toString()
      : "";
  return `postgresql://${encodeURIComponent(conn.username)}:${encodeURIComponent(conn.password)}@${conn.host}:${conn.port}/${encodeURIComponent(conn.database)}${params}`;
}

// Dummy endpoint for testing
app.get("/api/ping", (_req, res) => {
  res.json({ message: "pong", timestamp: Date.now() });
});

// Execute SQL query against a database connection
app.post(
  "/api/query",
  async (req, res: express.Response<QueryResponse | QueryErrorResponse>) => {
    const { connection, query } = req.body as QueryRequest;

    if (!connection || !query) {
      res.status(400).json({ error: "Missing connection or query" });
      return;
    }

    const client = new pg.Client({
      connectionString: buildConnectionString(connection),
    });

    try {
      await client.connect();
      const result = await client.query(query);
      // pg returns an array of QueryResult when multiple statements are executed
      const lastResult = Array.isArray(result)
        ? result[result.length - 1]
        : result;
      const response: QueryResponse = {
        rows: lastResult.rows ?? [],
        fields: (lastResult.fields ?? []).map((f: pg.FieldDef) => ({
          name: f.name,
          dataTypeID: f.dataTypeID,
        })),
        rowCount: lastResult.rowCount,
      };
      res.json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    } finally {
      await client.end();
    }
  },
);

// Preview diff of DML statements (INSERT/UPDATE/DELETE) via rolled-back transaction
app.post(
  "/api/query-diff",
  async (req, res: express.Response<DiffResponse | QueryErrorResponse>) => {
    const { connection, query } = req.body as QueryRequest;

    if (!connection || !query) {
      res.status(400).json({ error: "Missing connection or query" });
      return;
    }

    // Parse table names from DML statements
    const tableRegex =
      /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:"?(\w+)"?\.)?"?(\w+)"?/gi;
    const tableNames = new Set<string>();
    let match;
    while ((match = tableRegex.exec(query)) !== null) {
      const schema = match[1] || "public";
      const table = match[2];
      tableNames.add(`${schema}.${table}`);
    }

    if (tableNames.size === 0) {
      res
        .status(400)
        .json({ error: "No INSERT/UPDATE/DELETE statements detected" });
      return;
    }

    const client = new pg.Client({
      connectionString: buildConnectionString(connection),
    });

    try {
      await client.connect();
      await client.query("BEGIN");

      // For each table, get PK columns and snapshot before state
      const tableInfo: Map<
        string,
        {
          schema: string;
          table: string;
          pkColumns: string[];
          columns: QueryFieldInfo[];
          before: Record<string, unknown>[];
        }
      > = new Map();

      for (const fullName of tableNames) {
        const [schema, table] = fullName.split(".");

        // Get primary key columns
        const pkResult = await client.query(
          `SELECT a.attname
           FROM pg_constraint c
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
           WHERE c.contype = 'p'
             AND c.conrelid = (
               SELECT oid FROM pg_class
               WHERE relname = $1
                 AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)
             )
           ORDER BY array_position(c.conkey, a.attnum)`,
          [table, schema],
        );

        const pkColumns = pkResult.rows.map(
          (r: { attname: string }) => r.attname,
        );

        if (pkColumns.length === 0) {
          await client.query("ROLLBACK");
          res.status(400).json({
            error: `Table "${schema}"."${table}" has no primary key. Diff requires a primary key to identify rows.`,
          });
          return;
        }

        // Snapshot before
        const orderBy = pkColumns.map((c: string) => `"${c}"`).join(", ");
        const beforeResult = await client.query(
          `SELECT * FROM "${schema}"."${table}" ORDER BY ${orderBy} LIMIT 10000`,
        );

        const columns: QueryFieldInfo[] = (beforeResult.fields ?? []).map(
          (f: pg.FieldDef) => ({
            name: f.name,
            dataTypeID: f.dataTypeID,
          }),
        );

        tableInfo.set(fullName, {
          schema,
          table,
          pkColumns,
          columns,
          before: beforeResult.rows,
        });
      }

      // Execute the user's SQL
      await client.query(query);

      // Snapshot after and compute diffs
      const tables: DiffTableResult[] = [];

      for (const [fullName, info] of tableInfo) {
        const orderBy = info.pkColumns.map((c) => `"${c}"`).join(", ");
        const afterResult = await client.query(
          `SELECT * FROM "${info.schema}"."${info.table}" ORDER BY ${orderBy} LIMIT 10000`,
        );
        const afterRows: Record<string, unknown>[] = afterResult.rows;

        // Index rows by PK
        const pkKey = (row: Record<string, unknown>) =>
          info.pkColumns.map((c) => JSON.stringify(row[c])).join("|");

        const beforeMap = new Map<string, Record<string, unknown>>();
        for (const row of info.before) {
          beforeMap.set(pkKey(row), row);
        }

        const afterMap = new Map<string, Record<string, unknown>>();
        for (const row of afterRows) {
          afterMap.set(pkKey(row), row);
        }

        const deleted: Record<string, unknown>[] = [];
        const added: Record<string, unknown>[] = [];
        const modified: DiffTableResult["modified"] = [];
        let unchangedCount = 0;

        // Find deleted and modified rows
        for (const [key, beforeRow] of beforeMap) {
          const afterRow = afterMap.get(key);
          if (!afterRow) {
            deleted.push(beforeRow);
          } else {
            // Compare all columns
            const changedColumns: string[] = [];
            for (const col of info.columns) {
              const bVal = beforeRow[col.name];
              const aVal = afterRow[col.name];
              if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
                changedColumns.push(col.name);
              }
            }
            if (changedColumns.length > 0) {
              modified.push({
                before: beforeRow,
                after: afterRow,
                changedColumns,
              });
            } else {
              unchangedCount++;
            }
          }
        }

        // Find added rows
        for (const [key, afterRow] of afterMap) {
          if (!beforeMap.has(key)) {
            added.push(afterRow);
          }
        }

        tables.push({
          tableName: fullName,
          columns: info.columns,
          primaryKeyColumns: info.pkColumns,
          deleted,
          added,
          modified,
          unchangedCount,
        });
      }

      // Always rollback — this is a preview only
      await client.query("ROLLBACK");

      res.json({ tables });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore rollback error
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    } finally {
      await client.end();
    }
  },
);

// Scan localhost for PostgreSQL databases
app.get(
  "/api/scan-localhost",
  async (_req, res: express.Response<ScanLocalhostResponse>) => {
    if (!LOCALHOST_SCANNING_ENABLED) {
      res.json({ databases: [], error: "Localhost scanning is disabled" });
      return;
    }
    const host = "localhost";
    const port = 5432;
    const username = "postgres";
    const candidates = ["", "password", "postgres"];

    for (const password of candidates) {
      const client = new pg.Client({
        connectionString: buildConnectionString({
          username,
          password,
          host,
          port,
          database: "postgres",
        }),
      });

      try {
        await client.connect();
        const result = await client.query(
          "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname",
        );
        const databases = result.rows.map((row: { datname: string }) => ({
          host,
          port,
          username,
          password,
          database: row.datname,
        }));
        res.json({ databases });
        return;
      } catch {
        // try next credential
      } finally {
        await client.end();
      }
    }

    res.json({
      databases: [],
      error: "Could not connect with any known credentials",
    });
  },
);

// Export database as .sql file via pg_dump
app.post("/api/export", async (req, res) => {
  const { connection, exportType } = req.body as {
    connection: DatabaseConfigConnection;
    exportType: ExportType;
  };

  if (!connection || !exportType) {
    res.status(400).json({ error: "Missing connection or exportType" });
    return;
  }

  try {
    const sql = await pgDump(connection, exportType === "schema");
    const suffix = exportType === "schema" ? "schema" : "full";
    const filename = `${connection.database}_${suffix}_${new Date().toISOString().slice(0, 10)}.sql`;
    res.setHeader("Content-Type", "application/sql");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(sql);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

// Read current version from package.json once at startup
const currentVersion: string = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"),
).version;

// Check npm registry for latest version
app.get("/api/check-update", async (_req, res) => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(
      "https://registry.npmjs.org/dbdiff-app/latest",
      { signal: controller.signal },
    );
    clearTimeout(timeout);

    if (!response.ok) {
      res.json({ currentVersion, latestVersion: null, updateAvailable: false });
      return;
    }

    const data = (await response.json()) as { version?: string };
    const latestVersion = data.version ?? null;

    // Simple semver comparison: split on dots, compare numerically
    let updateAvailable = false;
    if (latestVersion) {
      const current = currentVersion.split(".").map(Number);
      const latest = latestVersion.split(".").map(Number);
      for (let i = 0; i < 3; i++) {
        if ((latest[i] ?? 0) > (current[i] ?? 0)) {
          updateAvailable = true;
          break;
        }
        if ((latest[i] ?? 0) < (current[i] ?? 0)) break;
      }
    }

    res.json({ currentVersion, latestVersion, updateAvailable });
  } catch {
    res.json({ currentVersion, latestVersion: null, updateAvailable: false });
  }
});

// Serve built frontend if it exists
if (hasBuiltFrontend) {
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
}

export const serverReady = new Promise<void>((resolve) => {
  app.listen(port, () => {
    console.log(`dbdiff running at http://localhost:${port}`);
    if (hasBuiltFrontend) {
      console.log("Serving frontend from dist/");
    } else {
      console.log("No built frontend found - API only (use Vite for frontend)");
    }
    resolve();
  });
});
