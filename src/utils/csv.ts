interface CsvOptions {
  includeHeaders: boolean;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function generateCsv(
  fields: { name: string }[],
  rows: Record<string, unknown>[],
  options: CsvOptions,
): string {
  const lines: string[] = [];
  if (options.includeHeaders) {
    lines.push(fields.map((f) => escapeCsvValue(f.name)).join(","));
  }
  for (const row of rows) {
    lines.push(fields.map((f) => escapeCsvValue(row[f.name])).join(","));
  }
  return lines.join("\n");
}
