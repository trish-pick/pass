import type { Check, FindingInput } from "./types";
import { fieldLabel, valueBox } from "./util";

/** "Rev 03", "rev03", "03" and "3" all compare as "3"; "Rev A" as "a". */
export function normaliseRevision(value: string): string {
  const v = value.toLowerCase().replace(/\s+/g, "").replace(/^rev(ision)?[.:_-]?/, "");
  const core = v.match(/^[0-9a-z]+/)?.[0] ?? v;
  return /^\d+$/.test(core) ? String(Number(core)) : core;
}

export const check: Check = {
  type: "revision_consistent",
  label: "Title block revision matches the set revision",
  description:
    "The revision in every title block matches the revision of the set being issued. Descriptions after the revision, such as \"Rev 03_Prelim Build\", are ignored.",
  source: "rule",
  run: async (ctx) => {
    const setRevision = ctx.drawingSet.revision?.trim();
    if (!setRevision) return [];
    const expected = normaliseRevision(setRevision);
    const findings: FindingInput[] = [];

    for (const sheet of ctx.sheets) {
      const value = sheet.titleBlock.revision;
      if (!value) continue;
      if (normaliseRevision(value) !== expected) {
        findings.push({
          sheetId: sheet.id,
          message: `${fieldLabel(ctx, "revision")} shows "${value}" but this set is issuing as ${setRevision}.`,
          bbox: valueBox(sheet, "revision"),
        });
      }
    }
    return findings;
  },
};
