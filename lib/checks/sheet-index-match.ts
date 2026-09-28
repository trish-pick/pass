import { sheetNumberRegExp } from "@/lib/pdf/parse-set";
import { readRegister, type Register } from "@/lib/pdf/register";

import type { Check, FindingInput } from "./types";
import { bestMatch, numberParam, sheetWords, stringListParam, words } from "./util";

export const check: Check = {
  type: "sheet_index_match",
  label: "Drawing register matches the sheets in the set",
  description:
    "Every sheet in the register is in the set, every sheet in the set is in the register, and each register title appears on its sheet.",
  source: "rule",
  params: [
    {
      key: "headings",
      label: "Register headings (optional)",
      kind: "textarea",
      help: "One per line. Leave blank to use the practice profile's register headings.",
    },
    {
      key: "titleThreshold",
      label: "Title match strictness",
      kind: "number",
      help: "How closely the sheet must show the register title, from 0 to 1. Default 0.8.",
    },
  ],
  run: async (ctx, params) => {
    const headings = stringListParam(params, "headings") ?? ctx.profile.conventions.registerHeadings ?? [];
    const threshold = numberParam(params, "titleThreshold", 0.8);
    const pattern = sheetNumberRegExp(ctx.profile);

    let register: Register | null = null;
    for (const sheet of ctx.sheets) {
      const r = readRegister(sheet.textBlocks, sheet.pageIndex, headings, pattern);
      if (r && r.entries.length > 0) {
        register = r;
        break;
      }
    }

    if (!register) {
      return [{ sheetId: null, message: "No drawing register found in the set.", bbox: null }];
    }

    const registerSheet = ctx.sheets.find((s) => s.pageIndex === register.pageIndex)!;
    const findings: FindingInput[] = [];
    const bySheetNumber = new Map(ctx.sheets.filter((s) => s.sheetNumber).map((s) => [s.sheetNumber!, s]));
    const listed = new Set(register.entries.map((e) => e.sheetNumber));

    for (const entry of register.entries) {
      const sheet = bySheetNumber.get(entry.sheetNumber);
      if (!sheet) {
        findings.push({
          sheetId: registerSheet.id,
          message: `The register lists ${entry.sheetNumber} ${entry.title}, but there is no sheet ${entry.sheetNumber} in the set.`,
          bbox: entry.bbox,
        });
        continue;
      }
      if (sheet === registerSheet) continue;
      const score = bestMatch(words(entry.title), sheetWords(sheet));
      if (score < threshold) {
        findings.push({
          sheetId: sheet.id,
          message: `The register calls ${entry.sheetNumber} "${entry.title}", but that title doesn't appear on the sheet.`,
          bbox: null,
        });
      }
    }

    for (const sheet of ctx.sheets) {
      if (sheet.sheetNumber && !listed.has(sheet.sheetNumber)) {
        findings.push({
          sheetId: sheet.id,
          message: `Sheet ${sheet.sheetNumber} isn't listed in the drawing register.`,
          bbox: sheet.titleBlockBoxes?.sheet_number ?? null,
        });
      }
    }

    return findings;
  },
};
