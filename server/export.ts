import { spawn } from "child_process";
import type { DatabaseConfigConnection } from "../src/types.js";

export function pgDump(
  connection: DatabaseConfigConnection,
  schemaOnly: boolean,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = [
      "-h",
      connection.host,
      "-p",
      String(connection.port),
      "-U",
      connection.username,
      "-d",
      connection.database,
      "--no-password",
      "--format=plain",
    ];
    if (schemaOnly) args.push("--schema-only");

    const proc = spawn("pg_dump", args, {
      env: { ...process.env, PGPASSWORD: connection.password },
    });

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk;
    });

    proc.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "pg_dump not found. Install PostgreSQL client tools:\n" +
              "  macOS: brew install postgresql\n" +
              "  Ubuntu: sudo apt install postgresql-client\n" +
              "  Windows: https://www.postgresql.org/download/windows/",
          ),
        );
      } else {
        reject(err);
      }
    });

    proc.on("close", (code) => {
      code === 0
        ? resolve(stdout)
        : reject(new Error(stderr || `pg_dump exited with code ${code}`));
    });
  });
}
