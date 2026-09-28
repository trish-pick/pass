import type { Check, FindingInput, ParsedSheet } from "./types";
import { fieldLabel, stringListParam, valueBox, words } from "./util";

const DEFAULT_FIELDS = ["job_number", "project", "local_council", "accreditation", "title_ref", "date", "revision"];

/** Compare values ignoring runs of whitespace only: case and punctuation differences are real. */
const key = (v: string) => v.replace(/\s+/g, " ").trim();

export const check: Check = {
  type: "title_block_consistent",
  label: "Title block details match across sheets and the project",
  description:
    "Job number, project, council, date and the other chosen fields are the same on every sheet, and the job number and address match the project record.",
  source: "rule",
  params: [
    {
      key: "fields",
      label: "Fields to compare (optional)",
      kind: "textarea",
      help: "Field keys, one per line. Default: job_number, project, local_council, accreditation, title_ref, date, revision.",
    },
  ],
  run: async (ctx, params) => {
    const fields = (stringListParam(params, "fields") ?? DEFAULT_FIELDS).filter(
      (f) =>
        ctx.profile.titleBlockFields.some((tf) => tf.key === f) &&
        // With a set revision, revision_consistent reports mismatches against it instead.
        !(f === "revision" && ctx.drawingSet.revision?.trim()),
    );
    const findings: FindingInput[] = [];

    for (const field of fields) {
      const withValue = ctx.sheets.filter((s) => s.titleBlock[field]?.trim());
      if (withValue.length < 2) continue;

      const groups = new Map<string, ParsedSheet[]>();
      for (const s of withValue) {
        const k = key(s.titleBlock[field]);
        groups.set(k, [...(groups.get(k) ?? []), s]);
      }
      if (groups.size < 2) continue;

      // The project record decides the job number; otherwise the most common value is the reference.
      const recorded = field === "job_number" ? ctx.project.projectNumber?.trim() : undefined;
      const [majority, majoritySheets] =
        recorded && groups.has(recorded)
          ? [recorded, groups.get(recorded)!]
          : [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
      for (const [value, sheets] of groups) {
        if (value === majority) continue;
        for (const s of sheets) {
          findings.push({
            sheetId: s.id,
            message: `${fieldLabel(ctx, field)} is "${value}" here but "${majority}" on ${majoritySheets.length} other sheet${majoritySheets.length === 1 ? "" : "s"}.`,
            bbox: valueBox(s, field),
          });
        }
      }
    }

    // Against the project record
    const jobNumbers = new Set(ctx.sheets.map((s) => s.titleBlock.job_number).filter(Boolean).map((v) => key(v!)));
    const expected = ctx.project.projectNumber?.trim();
    if (expected && jobNumbers.size > 0 && !jobNumbers.has(expected)) {
      findings.push({
        sheetId: null,
        message: `No sheet shows the project's job number ${expected} (sheets show ${[...jobNumbers].join(", ")}).`,
        bbox: null,
      });
    }

    const address = ctx.project.address?.trim();
    if (address) {
      const addressWords = words(address);
      for (const s of ctx.sheets) {
        const project = s.titleBlock.project;
        if (!project) continue;
        const projectWords = new Set(words(project));
        if (!addressWords.every((w) => projectWords.has(w))) {
          findings.push({
            sheetId: s.id,
            message: `Project details don't include the project address "${address}".`,
            bbox: valueBox(s, "project"),
          });
        }
      }
    }

    return findings;
  },
};
