function safeCell(value: string): string {
  const protectedValue = /^[\s]*[=+\-@\t\r\n]/.test(value)
    ? `'${value}`
    : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function encodeMarketingCsv(
  rows: ReadonlyArray<ReadonlyArray<string>>,
): Uint8Array<ArrayBuffer> {
  const text = rows.map((row) => row.map(safeCell).join(",")).join("\r\n");
  return new TextEncoder().encode(`\uFEFF${text}\r\n`);
}
