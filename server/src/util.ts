export function rowToCamel<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => (c as string).toUpperCase());
    out[camel] = v;
  }
  return out;
}

export function normalizeUserId(raw: unknown): string {
  if (raw == null) return '';
  const s = String(raw).trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) {
    return String(parseInt(s, 10)).padStart(3, '0');
  }
  return s;
}
