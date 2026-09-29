/**
 * Values on a drawing that matter when comparing two versions of it:
 * dimensions (4-5 digit mm), metre lengths and levels, angles and FFLs.
 */
export function drawingTokens(text: string): string[] {
  const re = /(?<![\d.])\d{4,5}(?![\d.])|(?<![\d.])\d{1,3}\.\d{1,3}\s?m\b|(?<![\d.])\d{1,2}(?:\.\d{1,2})?\s?°|FFL\s?\d{1,3}(?:\.\d+)?m?/g;
  // Repeats are kept: the same setback can be dimensioned twice and change once.
  return (text.match(re) ?? []).map((t) => t.replace(/\s+/g, ""));
}

/** Floor areas from a "Total Floor Area  m²  sq" table: { Garage: 56.57, Residence: 192.31, Total: 248.87 }. */
export function floorAreas(text: string): Record<string, number> {
  const start = text.search(/Total Floor Area/i);
  if (start < 0) return {};
  const table = text.slice(start + "Total Floor Area".length, start + 400);
  const areas: Record<string, number> = {};
  for (const m of table.matchAll(/([A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?)\s+(\d{1,4}\.\d{2})\s+\d{1,3}\.\d{2}/g)) {
    areas[m[1]] ??= Number(m[2]);
  }
  return areas;
}

export type TokenChange = { from: string; to: string | null; note?: string; onSheet?: string };

const numeric = (t: string) => Number(t.replace(/[^\d.]/g, ""));
const kind = (t: string) => (t.endsWith("°") ? "angle" : t.startsWith("FFL") ? "ffl" : /m$/.test(t) ? "metres" : "mm");
const tolerance = (t: string) => (kind(t) === "mm" ? 100 : kind(t) === "angle" ? 15 : 1);

function counts(list: string[]) {
  const c = new Map<string, number>();
  for (const t of list) c.set(t, (c.get(t) ?? 0) + 1);
  return c;
}

/**
 * Values on the endorsed sheet that no longer appear on the current one,
 * paired with the closest new value of the same kind. A dimension missing
 * here but shown exactly on another sheet is not reported; an overall
 * dimension (15m+) within 60mm on another sheet is followed there.
 */
export function tokenChanges(endorsed: string[], current: string[], elsewhere: Map<string, string[]>): TokenChange[] {
  const before = counts(endorsed);
  const now = counts(current);
  const added: string[] = [];
  for (const [t, n] of now) for (let i = 0; i < n - (before.get(t) ?? 0); i++) added.push(t);

  const changes: TokenChange[] = [];
  for (const [t, n] of before) {
    const missing = n - (now.get(t) ?? 0);
    for (let i = 0; i < missing; i++) {
      // Shown unchanged on another sheet (e.g. moved to the set-out plan): not a change.
      if (kind(t) === "mm" && [...elsewhere].some(([, tokens]) => tokens.includes(t))) continue;
      const j = added
        .map((a, k) => ({ a, k }))
        .filter(({ a }) => kind(a) === kind(t) && Math.abs(numeric(a) - numeric(t)) <= tolerance(t))
        .sort((x, y) => Math.abs(numeric(x.a) - numeric(t)) - Math.abs(numeric(y.a) - numeric(t)))[0];
      if (j) {
        added.splice(j.k, 1);
        changes.push({ from: t, to: j.a, note: numeric(j.a) < numeric(t) ? "smaller" : undefined });
        continue;
      }
      if (kind(t) === "mm") {
        // Only overall dimensions (15m and over) are followed approximately; smaller ones pair up by chance.
        const near = numeric(t) < 15000 ? undefined : [...elsewhere]
          .flatMap(([sheet, tokens]) => tokens.filter((a) => kind(a) === "mm" && Math.abs(numeric(a) - numeric(t)) <= 60).map((a) => ({ sheet, a })))
          .sort((x, y) => Math.abs(numeric(x.a) - numeric(t)) - Math.abs(numeric(y.a) - numeric(t)))[0];
        if (near) {
          changes.push({ from: t, to: near.a, onSheet: near.sheet, note: numeric(near.a) < numeric(t) ? "smaller" : undefined });
          continue;
        }
      }
      changes.push({ from: t, to: null });
    }
  }
  return changes;
}
