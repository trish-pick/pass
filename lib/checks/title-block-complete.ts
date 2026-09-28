import { normaliseText } from "@/lib/pdf/text";

import type { Check, FindingInput } from "./types";
import { fieldLabel, sheetLabel, stringListParam, valueBox } from "./util";

export const check: Check = {
  type: "title_block_complete",
  label: "Title block fields are filled in on every sheet",
  description:
    "Each required title block field has a value, and no value is a template placeholder such as \"Author\" or \"Designer\".",
  source: "rule",
  params: [
    {
      key: "fields",
      label: "Fields to check (optional)",
      kind: "textarea",
      help: "Field keys, one per line. Leave blank for all required fields in the practice profile.",
    },
    {
      key: "placeholders",
      label: "Placeholder text (optional)",
      kind: "textarea",
      help: "One per line. Leave blank to use the practice profile's list.",
    },
  ],
  run: async (ctx, params) => {
    const fields =
      stringListParam(params, "fields") ??
      ctx.profile.titleBlockFields.filter((f) => f.required).map((f) => f.key);
    const placeholders = (stringListParam(params, "placeholders") ?? ctx.profile.conventions.placeholders ?? []).map(
      normaliseText,
    );
    const findings: FindingInput[] = [];

    for (const sheet of ctx.sheets) {
      const missing: string[] = [];
      for (const key of fields) {
        const value = sheet.titleBlock[key];
        if (!value || !value.trim()) {
          missing.push(fieldLabel(ctx, key));
        } else if (placeholders.includes(normaliseText(value))) {
          findings.push({
            sheetId: sheet.id,
            message: `${fieldLabel(ctx, key)} shows "${value}", which is template placeholder text.`,
            bbox: valueBox(sheet, key),
          });
        }
      }
      if (missing.length === fields.length) {
        findings.push({ sheetId: sheet.id, message: `No title block found on ${sheetLabel(sheet)}.`, bbox: null });
      } else if (missing.length > 0) {
        findings.push({
          sheetId: sheet.id,
          message: `Title block is missing: ${missing.join(", ")}.`,
          bbox: null,
        });
      }
    }
    return findings;
  },
};
