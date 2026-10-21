import aliasData from "@/data/cra-aliases.json";

/**
 * Search over the 53 Community Reporting Areas by name and by the smaller
 * places the City lists inside each one (e.g. "Lake City", "South Lake
 * Union"), from the CRA layer's DETL_NAMES field.
 */
export interface NeighborhoodEntry {
  /** Upper-case area value, as used by the requests dataset and the filters. */
  area: string;
  name: string;
  aliases: readonly string[];
}

export interface SearchResult {
  area: string;
  name: string;
  /** The alias that matched, when the match wasn't on the area's own name. */
  matchedAlias: string | null;
}

export const NEIGHBORHOODS: readonly NeighborhoodEntry[] = Object.entries(aliasData.areas)
  .map(([area, v]) => ({ area, name: v.name, aliases: v.aliases }))
  .sort((a, b) => a.name.localeCompare(b.name));

/** Lower-case, unify "mt"/"mount" and "&"/"and", and treat punctuation as spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bmt\b\.?/g, "mount")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** 0 = exact, 1 = whole text starts with the query, 2 = a word starts with it, 3 = contains it; null = no match. */
function matchRank(candidate: string, query: string): number | null {
  const c = normalize(candidate);
  if (c === query) return 0;
  if (c.startsWith(query)) return 1;
  if (c.split(" ").some((_, i, words) => words.slice(i).join(" ").startsWith(query))) return 2;
  if (c.includes(query)) return 3;
  return null;
}

/** Added to alias match ranks so every name match sorts first. */
const ALIAS_OFFSET = 10;

/**
 * Neighborhoods matching `query`, best first: every match on an area's own
 * name comes before matches on places inside other areas. An empty query
 * returns every neighborhood alphabetically.
 */
export function searchNeighborhoods(query: string, entries: readonly NeighborhoodEntry[] = NEIGHBORHOODS): SearchResult[] {
  const q = normalize(query);
  if (!q) return entries.map((e) => ({ area: e.area, name: e.name, matchedAlias: null }));

  const scored: { result: SearchResult; score: number }[] = [];
  for (const e of entries) {
    const nameRank = matchRank(e.name, q);
    if (nameRank !== null) {
      scored.push({ result: { area: e.area, name: e.name, matchedAlias: null }, score: nameRank });
      continue;
    }
    let best: { alias: string; rank: number } | null = null;
    for (const alias of e.aliases) {
      const r = matchRank(alias, q);
      if (r !== null && (best === null || r < best.rank)) best = { alias, rank: r };
    }
    if (best) scored.push({ result: { area: e.area, name: e.name, matchedAlias: best.alias }, score: ALIAS_OFFSET + best.rank });
  }
  return scored.sort((a, b) => a.score - b.score || a.result.name.localeCompare(b.result.name)).map((s) => s.result);
}

export function neighborhoodName(area: string): string | null {
  return NEIGHBORHOODS.find((e) => e.area === area)?.name ?? null;
}
