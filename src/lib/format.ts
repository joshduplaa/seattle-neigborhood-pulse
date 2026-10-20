const integer = new Intl.NumberFormat("en-US");
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export function formatCount(n: number): string {
  return integer.format(n);
}

export function formatCompact(n: number): string {
  return n < 10_000 ? integer.format(n) : compact.format(n);
}

export function formatPercent(fraction: number): string {
  if (!Number.isFinite(fraction)) return "—";
  const pct = fraction * 100;
  if (pct > 0 && pct < 0.1) return "<0.1%";
  return `${oneDecimal.format(pct)}%`;
}

export function formatDecimal(n: number): string {
  return oneDecimal.format(n);
}

// Words that should stay upper case when title-casing area names.
const KEEP_UPPER = new Set(["SODO", "II", "III"]);

/** "NORTH BEACON HILL/JEFFERSON PARK" → "North Beacon Hill/Jefferson Park". */
export function formatAreaName(value: string | null): string {
  if (value === null) return "No area recorded";
  return value
    .toLowerCase()
    .replace(/[a-z0-9.']+/g, (word) => {
      const upper = word.toUpperCase();
      if (KEEP_UPPER.has(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1);
    });
}

export function formatDistrict(value: string | null): string {
  return value === null ? "No district recorded" : `District ${value}`;
}

export function formatStatus(value: string | null): string {
  return value ?? "No status recorded";
}

export function formatCategory(value: string | null): string {
  return value ?? "No type recorded";
}

/** "SDOT-Seattle Department of Transportation" → "Seattle Department of Transportation (SDOT)". */
export function formatDepartment(value: string | null): string | null {
  if (value === null) return null;
  const m = /^([A-Z]{2,6})-(.+)$/.exec(value);
  return m ? `${m[2]} (${m[1]})` : value;
}

export function formatPrecinct(value: string | null): string | null {
  if (value === null) return null;
  return `${value.charAt(0)}${value.slice(1).toLowerCase()} Precinct`;
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : plural}`;
}
