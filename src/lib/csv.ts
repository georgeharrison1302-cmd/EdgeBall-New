export type CsvColumn<T> = { header: string; value: (row: T) => string | number | null | undefined };

/** Neutralise spreadsheet formula injection (=, +, -, @) in text cells. */
function cell(raw: string | number | null | undefined): string {
  if (raw == null) return "";
  let text = String(raw);
  if (typeof raw === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((column) => cell(column.header)).join(",")];
  for (const row of rows) lines.push(columns.map((column) => cell(column.value(row))).join(","));
  return lines.join("\r\n");
}
