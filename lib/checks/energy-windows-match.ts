import { readSchedules } from "@/lib/pdf/schedule";

import { possessive } from "./consultant-based-on-current";

import type { Check, FindingInput } from "./types";
import { numberParam, stringListParam } from "./util";

const key = (mark: string) => mark.toUpperCase().replace(/^W(?=\d)/, "");

export const check: Check = {
  type: "energy_windows_match",
  label: "Window schedule matches the energy assessment",
  description:
    "Every window in the window schedule is in the energy assessment's window schedule at the same size (within a tolerance), and the assessment has no windows the drawings don't.",
  source: "rule",
  params: [
    { key: "tolerance", label: "Size tolerance (mm)", kind: "number", help: "Default 20." },
    {
      key: "skip",
      label: "Schedule descriptions to leave out",
      kind: "textarea",
      help: "One per line. Default: skylight, roof window (assessed separately).",
    },
    { key: "headings", label: "Window schedule headings", kind: "textarea", help: "Default: Window Schedule." },
  ],
  run: async (ctx, params) => {
    const docs = (ctx.consultantDocs ?? []).filter((d) => d.discipline === "energy" && d.windows.length > 0);
    if (docs.length === 0) return [];
    const tolerance = numberParam(params, "tolerance", 20);
    const skip = (stringListParam(params, "skip") ?? ["skylight", "roof window"]).map((s) => s.toLowerCase());
    const headings = stringListParam(params, "headings") ?? ["Window Schedule"];

    const ours = ctx.sheets.flatMap((sheet) =>
      readSchedules(sheet.textBlocks, headings).flatMap((schedule) =>
        schedule.rows
          .filter((r) => !skip.some((s) => (r.cells.description ?? "").toLowerCase().includes(s)))
          .map((r) => ({ sheet, row: r, width: Number(r.cells.width), height: Number(r.cells.height) })),
      ),
    );
    if (ours.length === 0) return [];

    const findings: FindingInput[] = [];
    for (const doc of docs) {
      const theirs = new Map(doc.windows.filter((w) => /^W/i.test(w.mark)).map((w) => [key(w.mark), w]));
      const oursByKey = new Map(ours.map((o) => [key(o.row.mark), o]));

      for (const o of ours) {
        const t = theirs.get(key(o.row.mark));
        if (!t) {
          findings.push({
            sheetId: o.sheet.id,
            message: `Window ${o.row.mark} isn't in ${possessive(doc.firm)} energy assessment. It may have been added after the assessment.`,
            bbox: o.row.bbox,
          });
        } else if (
          Number.isFinite(o.width) &&
          Number.isFinite(o.height) &&
          (Math.abs(o.width - t.width) > tolerance || Math.abs(o.height - t.height) > tolerance)
        ) {
          findings.push({
            sheetId: o.sheet.id,
            message: `Window ${o.row.mark} is ${o.width} x ${o.height} (W x H) here but ${t.width} x ${t.height} in ${possessive(doc.firm)} energy assessment.`,
            bbox: o.row.bbox,
          });
        }
      }
      for (const [k, t] of theirs) {
        if (!oursByKey.has(k)) {
          findings.push({
            sheetId: null,
            message: `${possessive(doc.firm)} energy assessment includes window ${t.mark} (${t.width} x ${t.height}), which isn't in the window schedule.`,
            bbox: null,
          });
        }
      }
    }
    return findings;
  },
};
