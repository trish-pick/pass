import { jobDigits, parseDate, practiceValues, sameRevision } from "@/lib/consultants/compare";
import type { ConsultantDocument, Discipline } from "@/lib/consultants/types";

import type { Check, FindingInput } from "./types";
import { stringParam } from "./util";

const NAMES: Record<Discipline, string> = {
  structural: "engineering",
  energy: "energy assessment",
  bushfire: "bushfire assessment",
  geotech: "geotechnical report",
  other: "consultant document",
};

/** What a consultant says their work was based on: fields first, then any of our sheets attached to it. */
export function basedOn(doc: ConsultantDocument) {
  return {
    jobNumber: doc.fields.based_on_job ?? doc.attachedPlans?.jobNumber ?? null,
    revision: doc.fields.based_on_revision ?? doc.attachedPlans?.revision ?? null,
    date: doc.fields.based_on_date ?? doc.attachedPlans?.date ?? null,
  };
}

export const check: Check = {
  type: "consultant_based_on_current",
  label: "Consultant documents are based on the current drawings",
  description:
    "Each consultant document of the chosen discipline refers to this job, and to the revision being issued (or at least drawings no older than this set). Uses the drawing reference the consultant quotes, or the practice's own sheets attached to the report.",
  source: "rule",
  params: [
    {
      key: "discipline",
      label: "Discipline",
      kind: "select",
      options: [
        { value: "structural", label: "Engineering" },
        { value: "energy", label: "Energy" },
        { value: "bushfire", label: "Bushfire" },
        { value: "geotech", label: "Geotechnical" },
      ],
    },
  ],
  run: async (ctx, params) => {
    const discipline = stringParam(params, "discipline", "structural") as Discipline;
    const docs = (ctx.consultantDocs ?? []).filter((d) => d.discipline === discipline);
    const ours = practiceValues(ctx.sheets);
    const revision = ctx.drawingSet.revision?.trim();
    const ourDate = parseDate(ours.date);
    const findings: FindingInput[] = [];

    for (const doc of docs) {
      const name = `${possessive(doc.firm)} ${NAMES[doc.discipline]} (${doc.fileName})`;
      const ref = basedOn(doc);

      if (ref.jobNumber && ours.jobNumber && jobDigits(ref.jobNumber) !== jobDigits(ours.jobNumber)) {
        findings.push({ sheetId: null, message: `${name} refers to job ${ref.jobNumber}, but this set is job ${ours.jobNumber}.`, bbox: null });
      }

      if (!ref.revision && !ref.date) {
        findings.push({
          sheetId: null,
          message: `${name} doesn't say which revision of the drawings it's based on. Confirm it reflects ${revision || "the current set"}.`,
          bbox: null,
          severity: "minor",
        });
        continue;
      }

      const theirDate = parseDate(ref.date);
      const revisionOk = ref.revision && revision ? sameRevision(ref.revision, revision) : null;
      const dateOk = theirDate !== null && ourDate !== null ? theirDate >= ourDate : null;
      if (revisionOk === true || (revisionOk === null && dateOk !== false)) continue;

      const quoted = [ref.revision && `revision ${ref.revision}`, ref.date && `dated ${ref.date}`].filter(Boolean).join(", ");
      findings.push({
        sheetId: null,
        message: `${name} is based on your drawings ${quoted}, but this set is issuing as ${revision || "a later revision"}${ours.date ? ` (${ours.date})` : ""}. Confirm the ${NAMES[doc.discipline]} reflects the current drawings.`,
        bbox: null,
      });
    }
    return findings;
  },
};

/** "Geoton's", "Rebecca Green & Associates'". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`;
}
