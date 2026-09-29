import { drawingTokens, floorAreas, tokenChanges } from "@/lib/consultants/tokens";
import type { AttachedSheet } from "@/lib/consultants/types";

import type { Check, FindingInput, ParsedSheet } from "./types";
import { bestMatch, words } from "./util";

const MAX_LISTED = 12;

/** Our sheet that shows the same drawing as an endorsed sheet: by title, then by sheet type. */
function matchSheet(endorsed: AttachedSheet, sheets: ParsedSheet[]): ParsedSheet | null {
  if (endorsed.title) {
    const scored = sheets
      .map((s) => ({ s, score: s.sheetTitle ? bestMatch(words(endorsed.title!), words(s.sheetTitle)) : 0 }))
      .sort((a, b) => b.score - a.score)[0];
    if (scored && scored.score >= 0.6) return scored.s;
  }
  return endorsed.sheetType ? (sheets.find((s) => s.sheetType === endorsed.sheetType) ?? null) : null;
}

export const check: Check = {
  type: "endorsed_plans_match",
  label: "Drawings match the plans endorsed by the planning permit",
  description:
    "Compares the endorsed plans attached to a planning permit with this set: dimensions, levels, roof pitches and floor areas that have changed or are no longer shown. Differences aren't necessarily wrong; they are listed so the reviewer can decide whether council needs to see them.",
  source: "rule",
  run: async (ctx) => {
    const permits = (ctx.consultantDocs ?? []).filter((d) => d.discipline === "planning" && (d.attachedSheets?.length ?? 0) > 0);
    const findings: FindingInput[] = [];
    const tokensBySheet = new Map(ctx.sheets.map((s) => [s, drawingTokens(s.textBlocks.map((l) => l.text).join(" "))]));

    for (const permit of permits) {

      const endorsedRef = [permit.fields.endorsed_revision && `revision ${permit.fields.endorsed_revision}`, permit.fields.endorsed_date]
        .filter(Boolean)
        .join(", ");

      for (const endorsed of permit.attachedSheets ?? []) {
        // Floor areas on the cover
        if (endorsed.sheetType === "cover" && Object.keys(endorsed.floorAreas).length > 0) {
          const cover = ctx.sheets.find((s) => s.sheetType === "cover");
          if (!cover) continue;
          const ours = floorAreas(cover.textBlocks.map((l) => l.text).join(" "));
          const changed = Object.entries(endorsed.floorAreas)
            .filter(([label, v]) => ours[label] !== undefined && Math.abs(ours[label] - v) >= 0.01)
            .map(([label, v]) => `${label.toLowerCase()} ${v.toFixed(2)} → ${ours[label].toFixed(2)} m² (${ours[label] > v ? "+" : ""}${(ours[label] - v).toFixed(2)})`);
          if (changed.length > 0) {
            findings.push({
              sheetId: cover.id,
              message: `Floor areas differ from the endorsed plans${endorsedRef ? ` (${endorsedRef})` : ""}: ${changed.join("; ")}.`,
              bbox: null,
            });
          }
          continue;
        }

        const ourSheet = matchSheet(endorsed, ctx.sheets);
        if (!ourSheet) {
          if (endorsed.sheetType && !["cover", "views"].includes(endorsed.sheetType)) {
            findings.push({
              sheetId: null,
              message: `Endorsed sheet ${endorsed.sheetNumber} ${endorsed.title ?? ""} has no matching sheet in this set.`.replace(/\s+\./, "."),
              bbox: null,
              severity: "minor",
            });
          }
          continue;
        }
        if (["views", "cover"].includes(ourSheet.sheetType ?? "")) continue;

        const elsewhere = new Map(
          [...tokensBySheet].filter(([s]) => s !== ourSheet).map(([s, t]) => [s.sheetNumber ?? `page ${s.pageIndex + 1}`, t]),
        );
        const changes = tokenChanges(endorsed.tokens, tokensBySheet.get(ourSheet) ?? [], elsewhere);
        if (changes.length === 0) continue;

        const counted = new Map<string, number>();
        for (const c of changes) {
          const text = c.to ? `${c.from} → ${c.to}${c.onSheet ? ` on ${c.onSheet}` : ""}${c.note ? ` (${c.note})` : ""}` : `${c.from} no longer shown`;
          counted.set(text, (counted.get(text) ?? 0) + 1);
        }
        const described = [...counted].map(([text, n]) => (n > 1 ? `${text} (×${n})` : text));
        findings.push({
          sheetId: ourSheet.id,
          message: `Differs from endorsed ${endorsed.sheetNumber}${endorsed.title ? ` ${endorsed.title}` : ""}: ${described.slice(0, MAX_LISTED).join(", ")}${described.length > MAX_LISTED ? ` and ${described.length - MAX_LISTED} more` : ""}. Confirm whether council needs to see these changes.`,
          bbox: null,
        });
      }
    }
    return findings;
  },
};
