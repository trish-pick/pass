import { normaliseRevision } from "./revision-consistent";
import type { Check, FindingInput, ParsedSheet } from "./types";
import { fieldLabel, sheetWords, stringListParam, valueBox, words } from "./util";

const DEFAULT_FIELDS = ["job_number", "local_council", "title_ref", "revision"];

export const check: Check = {
  type: "cover_sheet_consistent",
  label: "Cover page matches the sheets and the project",
  description:
    "The cover shows the same job number, council, title reference and revision as the sheets' title blocks, the set revision, and the project address.",
  source: "rule",
  params: [
    {
      key: "fields",
      label: "Title block fields to compare (optional)",
      kind: "textarea",
      help: "Field keys, one per line. Default: job_number, local_council, title_ref, revision.",
    },
  ],
  run: async (ctx, params) => {
    const covers = ctx.sheets.filter((s) => s.sheetType === "cover");
    const others = ctx.sheets.filter((s) => s.sheetType !== "cover");
    if (covers.length === 0) return [];
    const fields = stringListParam(params, "fields") ?? DEFAULT_FIELDS;
    const findings: FindingInput[] = [];

    for (const cover of covers) {
      const coverWords = sheetWords(cover);
      const shows = (value: string) => {
        const w = words(value);
        return w.length > 0 && w.every((x) => coverWords.includes(x));
      };

      for (const field of fields) {
        const expected =
          field === "job_number" && ctx.project.projectNumber
            ? ctx.project.projectNumber
            : field === "revision" && ctx.drawingSet.revision
              ? ctx.drawingSet.revision
              : mostCommon(others, field);
        if (!expected) continue;

        const onCover = cover.titleBlock[field];
        const matches =
          field === "revision"
            ? onCover
              ? normaliseRevision(onCover) === normaliseRevision(expected)
              : shows(expected)
            : onCover
              ? onCover.replace(/\s+/g, " ").trim() === expected.replace(/\s+/g, " ").trim()
              : shows(expected);
        if (!matches) {
          findings.push({
            sheetId: cover.id,
            message: onCover
              ? `${fieldLabel(ctx, field)} on the cover is "${onCover}" but should be "${expected}".`
              : `The cover doesn't show the ${fieldLabel(ctx, field).toLowerCase()} "${expected}".`,
            bbox: valueBox(cover, field),
          });
        }
      }

      const address = ctx.project.address?.trim();
      if (address && !shows(address)) {
        findings.push({ sheetId: cover.id, message: `The cover doesn't show the project address "${address}".`, bbox: null });
      }
    }
    return findings;
  },
};

function mostCommon(sheets: ParsedSheet[], field: string): string | null {
  const counts = new Map<string, number>();
  for (const s of sheets) {
    const v = s.titleBlock[field]?.replace(/\s+/g, " ").trim();
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
