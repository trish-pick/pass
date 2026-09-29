import { possessive } from "./consultant-based-on-current";
import type { Check, FindingInput } from "./types";
import { stringListParam } from "./util";

export const check: Check = {
  type: "consultant_status_final",
  label: "Consultant documents are issued for construction",
  description:
    "Consultant documents that show an issue status (e.g. \"50% DESIGN REVIEW\") are at a final status before the set issues.",
  source: "rule",
  params: [
    {
      key: "finalStatuses",
      label: "Final statuses",
      kind: "textarea",
      help: "One per line. Default: FOR CONSTRUCTION, ISSUED FOR CONSTRUCTION, CONSTRUCTION ISSUE, FOR BUILDING APPROVAL.",
    },
  ],
  run: async (ctx, params) => {
    const finals = (
      stringListParam(params, "finalStatuses") ?? [
        "FOR CONSTRUCTION",
        "ISSUED FOR CONSTRUCTION",
        "CONSTRUCTION ISSUE",
        "FOR BUILDING APPROVAL",
      ]
    ).map((s) => s.toUpperCase());
    const findings: FindingInput[] = [];
    for (const doc of ctx.consultantDocs ?? []) {
      if (doc.statuses.length === 0) continue;
      const notFinal = doc.statuses.filter((s) => !finals.some((f) => s.includes(f)));
      if (notFinal.length > 0) {
        findings.push({
          sheetId: null,
          message: `${possessive(doc.firm)} documents (${doc.fileName}) are marked "${notFinal.join('", "')}", not issued for construction.`,
          bbox: null,
        });
      }
    }
    return findings;
  },
};
