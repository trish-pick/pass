import type { Check, FindingInput } from "./types";
import { bestMatch, numberParam, sheetLabel, sheetWords, stringParam, words } from "./util";

export const check: Check = {
  type: "required_text_present",
  label: "Required text appears",
  description:
    "Checks that some text appears on the sheets this item applies to, for example \"BAL\" on the site plan. Choose the sheet types with the item's sheet filter.",
  source: "rule",
  params: [
    { key: "text", label: "Text that must appear", kind: "textarea", required: true },
    {
      key: "scope",
      label: "Where it must appear",
      kind: "select",
      options: [
        { value: "every_sheet", label: "On every sheet this item applies to" },
        { value: "set", label: "On at least one of those sheets" },
      ],
    },
    {
      key: "threshold",
      label: "Match strictness",
      kind: "number",
      help: "From 0 to 1. Default 1 (exact, ignoring case, spacing and punctuation).",
    },
  ],
  run: async (ctx, params) => {
    const text = stringParam(params, "text", "");
    if (!text) return [];
    const scope = stringParam(params, "scope", "every_sheet");
    const threshold = numberParam(params, "threshold", 1);
    const needle = words(text);
    const has = ctx.sheets.map((s) => bestMatch(needle, sheetWords(s)) >= threshold);

    if (scope === "set") {
      return has.some(Boolean) || ctx.sheets.length === 0
        ? []
        : [{ sheetId: null, message: `"${text}" doesn't appear on any of the sheets it should.`, bbox: null }];
    }
    const findings: FindingInput[] = [];
    ctx.sheets.forEach((sheet, i) => {
      if (!has[i]) findings.push({ sheetId: sheet.id, message: `"${text}" is missing from ${sheetLabel(sheet)}.`, bbox: null });
    });
    return findings;
  },
};
