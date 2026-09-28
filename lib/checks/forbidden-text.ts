import { normaliseText } from "@/lib/pdf/text";

import type { Check, FindingInput } from "./types";
import { stringListParam } from "./util";

export const check: Check = {
  type: "forbidden_text",
  label: "No placeholder or draft text left on sheets",
  description:
    "Flags text that should never go out on an issued sheet, such as \"TO BE UPDATED\", \"XXXX\" or \"TBC\".",
  source: "rule",
  params: [
    {
      key: "phrases",
      label: "Phrases to flag",
      kind: "textarea",
      help: "One per line. Matched as whole words, ignoring case.",
      required: true,
    },
  ],
  run: async (ctx, params) => {
    const phrases = stringListParam(params, "phrases") ?? [];
    const patterns = phrases.map((p) => ({
      phrase: p,
      re: new RegExp(`(?<![a-z0-9])${normaliseText(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`),
    }));
    const findings: FindingInput[] = [];

    for (const sheet of ctx.sheets) {
      const reported = new Set<string>();
      for (const line of sheet.textBlocks) {
        const text = normaliseText(line.text);
        for (const { phrase, re } of patterns) {
          if (reported.has(phrase) || !re.test(text)) continue;
          reported.add(phrase);
          findings.push({ sheetId: sheet.id, message: `"${line.text.trim()}" is placeholder or draft text.`, bbox: line.bbox });
        }
      }
    }
    return findings;
  },
};
