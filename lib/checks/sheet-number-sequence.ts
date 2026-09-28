import type { Check, FindingInput, ParsedSheet } from "./types";
import { numberParam, valueBox } from "./util";

type Parsed = { sheet: ParsedSheet; prefix: string; num: number; suffix: string };

function parse(sheet: ParsedSheet): Parsed | null {
  const m = sheet.sheetNumber?.match(/^([A-Za-z]*)(\d+)([A-Za-z]*)$/);
  return m ? { sheet, prefix: m[1].toUpperCase(), num: Number(m[2]), suffix: m[3].toLowerCase() } : null;
}

function format(prefix: string, num: number, width: number) {
  return `${prefix}${String(num).padStart(width, "0")}`;
}

export const check: Check = {
  type: "sheet_number_sequence",
  label: "No duplicate, missing or out-of-order sheet numbers",
  description:
    "Flags sheet numbers used twice, small gaps in a series (e.g. B12 then B14) and sheets out of order in the PDF. Larger jumps, such as B19 to B100, are treated as a new series.",
  source: "rule",
  params: [
    {
      key: "maxGap",
      label: "Largest gap to report",
      kind: "number",
      help: "Gaps of up to this many missing sheets are reported. Default 3.",
    },
  ],
  run: async (ctx, params) => {
    const maxGap = numberParam(params, "maxGap", 3);
    const findings: FindingInput[] = [];
    const parsed = ctx.sheets.map(parse).filter((p): p is Parsed => p !== null);

    // Duplicates
    const seen = new Map<string, ParsedSheet>();
    for (const sheet of ctx.sheets) {
      if (!sheet.sheetNumber) continue;
      const first = seen.get(sheet.sheetNumber);
      if (first) {
        findings.push({
          sheetId: sheet.id,
          message: `Sheet number ${sheet.sheetNumber} is also used on page ${first.pageIndex + 1}.`,
          bbox: valueBox(sheet, "sheet_number"),
        });
      } else {
        seen.set(sheet.sheetNumber, sheet);
      }
    }

    // Order in the PDF
    for (let i = 1; i < parsed.length; i++) {
      const a = parsed[i - 1];
      const b = parsed[i];
      if (a.prefix === b.prefix && (b.num < a.num || (b.num === a.num && b.suffix < a.suffix))) {
        findings.push({
          sheetId: b.sheet.id,
          message: `${b.sheet.sheetNumber} comes after ${a.sheet.sheetNumber} in the PDF. Check the sheet order.`,
          bbox: valueBox(b.sheet, "sheet_number"),
          severity: "minor",
        });
      }
    }

    // Gaps within each prefix
    const byPrefix = new Map<string, Parsed[]>();
    for (const p of parsed) byPrefix.set(p.prefix, [...(byPrefix.get(p.prefix) ?? []), p]);
    for (const group of byPrefix.values()) {
      const nums = [...new Set(group.map((p) => p.num))].sort((a, b) => a - b);
      for (let i = 1; i < nums.length; i++) {
        const missing = nums[i] - nums[i - 1] - 1;
        if (missing >= 1 && missing <= maxGap) {
          const before = group.find((p) => p.num === nums[i - 1])!;
          const after = group.find((p) => p.num === nums[i])!;
          // Pad missing numbers like their neighbour: B12 -> B13, B012 -> B013.
          const width = before.sheet.sheetNumber!.replace(/^[A-Za-z]*/, "").replace(/[A-Za-z]*$/, "").length;
          const gap = Array.from({ length: missing }, (_, k) => format(before.prefix, nums[i - 1] + k + 1, width));
          findings.push({
            sheetId: null,
            message: `${gap.join(", ")} ${missing === 1 ? "is" : "are"} missing: the set goes from ${before.sheet.sheetNumber} to ${after.sheet.sheetNumber}.`,
            bbox: null,
          });
        }
      }
    }

    return findings;
  },
};
