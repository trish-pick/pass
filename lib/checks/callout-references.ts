import { sheetNumberRegExp } from "@/lib/pdf/parse-set";
import { readRegister } from "@/lib/pdf/register";
import { normaliseSheetNumber } from "@/lib/pdf/text";

import type { Check, FindingInput } from "./types";
import { stringListParam } from "./util";

export const check: Check = {
  type: "callout_references",
  label: "Sheet references point to sheets in the set",
  description:
    "Section, elevation and detail callouts, and notes such as \"refer to B09\", refer to sheet numbers that exist in this set.",
  source: "rule",
  params: [
    {
      key: "prefixes",
      label: "Sheet prefixes to look for (optional)",
      kind: "text",
      help: "For example A, B. Leave blank to use the prefixes of the sheets in the set. Listing other prefixes catches references left over from an earlier stage.",
    },
  ],
  run: async (ctx, params) => {
    const pattern = sheetNumberRegExp(ctx.profile);
    const existing = new Set(ctx.sheets.map((s) => s.sheetNumber).filter((n): n is string => !!n));
    const prefixes =
      stringListParam(params, "prefixes")?.map((p) => p.toUpperCase()) ??
      [...new Set([...existing].map((n) => n.match(/^[A-Z]+/)?.[0]).filter((p): p is string => !!p))];
    if (prefixes.length === 0) return [];

    // A reference: a prefix and 2-3 digits (optionally spaced), not part of a longer word or decimal.
    const token = new RegExp(
      `(?<![A-Za-z0-9.])(${prefixes.map((p) => p.replace(/[^A-Z]/g, "")).join("|")})\\s?(\\d{2,3}[a-z]?)(?![A-Za-z0-9]|\\.\\d)`,
      "g",
    );
    const registerRows = new Set<string>();
    for (const sheet of ctx.sheets) {
      const r = readRegister(sheet.textBlocks, sheet.pageIndex, ctx.profile.conventions.registerHeadings ?? [], pattern);
      r?.entries.forEach((e) => registerRows.add(`${sheet.id}:${Math.round(e.bbox.y)}`));
    }

    const findings: FindingInput[] = [];
    for (const sheet of ctx.sheets) {
      const own = sheet.titleBlockBoxes?.sheet_number;
      const reported = new Set<string>();
      for (const line of sheet.textBlocks) {
        if (own && line.bbox.x === own.x && line.bbox.y === own.y) continue;
        if (registerRows.has(`${sheet.id}:${Math.round(line.bbox.y)}`)) continue;
        for (const m of line.text.matchAll(token)) {
          const ref = normaliseSheetNumber(`${m[1]}${m[2]}`);
          if (!pattern.test(ref) || existing.has(ref) || reported.has(ref)) continue;
          reported.add(ref);
          findings.push({
            sheetId: sheet.id,
            message: `Refers to ${ref}, but there is no sheet ${ref} in this set.`,
            bbox: line.bbox,
          });
        }
      }
    }
    return findings;
  },
};
