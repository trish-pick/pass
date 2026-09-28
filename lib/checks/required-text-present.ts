import type { Check, FindingInput, ParsedSheet } from "./types";
import { bestMatch, numberParam, sheetLabel, sheetWords, stringParam, words } from "./util";

export const check: Check = {
  type: "required_text_present",
  label: "Required text appears",
  description:
    "Checks that some text appears on the sheets this item applies to, for example \"interconnected\" on the electrical plan. Choose the sheet types with the item's sheet filter. For flexible matches, such as any roof pitch in degrees, use a pattern instead.",
  source: "rule",
  params: [
    { key: "text", label: "Text that must appear", kind: "textarea" },
    {
      key: "pattern",
      label: "Or a pattern (advanced)",
      kind: "text",
      help: "A regular expression, matched ignoring case, e.g. \\d+(\\.\\d+)?\\s?° for a roof pitch.",
    },
    {
      key: "describe",
      label: "Describe what's needed (for patterns)",
      kind: "text",
      help: "Shown in the correction list, e.g. \"A roof pitch in degrees\".",
    },
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
      help: "For text, from 0 to 1. Default 1 (exact, ignoring case, spacing and punctuation).",
    },
  ],
  run: async (ctx, params) => {
    const text = stringParam(params, "text", "");
    const source = stringParam(params, "pattern", "");
    if (!text && !source) return [];
    const scope = stringParam(params, "scope", "every_sheet");
    const threshold = numberParam(params, "threshold", 1);

    let has: (s: ParsedSheet) => boolean;
    let what: string;
    if (source) {
      const re = new RegExp(source, "i");
      has = (s) => re.test(s.textBlocks.map((l) => l.text).join(" \n "));
      what = stringParam(params, "describe", `text matching ${source}`);
      what = what.charAt(0).toLowerCase() + what.slice(1);
    } else {
      const needle = words(text);
      has = (s) => bestMatch(needle, sheetWords(s)) >= threshold;
      what = `"${text}"`;
    }

    if (scope === "set") {
      return ctx.sheets.length === 0 || ctx.sheets.some(has)
        ? []
        : [{ sheetId: null, message: `Not found on any of the sheets it should be on: ${what}.`, bbox: null }];
    }
    const findings: FindingInput[] = [];
    for (const sheet of ctx.sheets) {
      if (!has(sheet)) findings.push({ sheetId: sheet.id, message: `Not found on ${sheetLabel(sheet)}: ${what}.`, bbox: null });
    }
    return findings;
  },
};
