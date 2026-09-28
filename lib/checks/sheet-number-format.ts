import { sheetNumberRegExp } from "@/lib/pdf/parse-set";

import type { Check, FindingInput } from "./types";
import { sheetLabel, stringParam, valueBox } from "./util";

export const check: Check = {
  type: "sheet_number_format",
  label: "Sheet numbers follow the practice pattern",
  description: "Every sheet has a sheet number in its title block, in the practice's numbering format.",
  source: "rule",
  params: [
    {
      key: "pattern",
      label: "Pattern (optional)",
      kind: "text",
      help: "Leave blank to use the practice profile's pattern.",
    },
  ],
  run: async (ctx, params) => {
    const source = stringParam(params, "pattern", ctx.profile.sheetNumberPattern ?? "");
    const pattern = sheetNumberRegExp({ ...ctx.profile, sheetNumberPattern: source || null });
    const findings: FindingInput[] = [];

    for (const sheet of ctx.sheets) {
      if (!sheet.sheetNumber) {
        findings.push({
          sheetId: sheet.id,
          message: `No sheet number found in the title block on ${sheetLabel(sheet)}.`,
          bbox: null,
        });
      } else if (!pattern.test(sheet.sheetNumber)) {
        findings.push({
          sheetId: sheet.id,
          message: `Sheet number "${sheet.sheetNumber}" doesn't follow the numbering pattern.`,
          bbox: valueBox(sheet, "sheet_number"),
        });
      }
    }
    return findings;
  },
};
