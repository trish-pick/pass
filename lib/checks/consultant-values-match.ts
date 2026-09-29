import { addressKey, normaliseAddress, practiceValues, valuesAgree } from "@/lib/consultants/compare";
import type { Discipline } from "@/lib/consultants/types";

import { possessive } from "./consultant-based-on-current";

import type { Check, FindingInput } from "./types";
import { stringParam } from "./util";

type Pair = { consultant: string; ours: string; label: string };

/** Default comparisons per discipline: consultant field -> practice cover/title block field. */
const DEFAULT_PAIRS: Record<Discipline, Pair[]> = {
  structural: [
    { consultant: "site_class", ours: "soil", label: "Site classification" },
    { consultant: "wind_class", ours: "wind", label: "Wind classification" },
  ],
  geotech: [
    { consultant: "site_class", ours: "soil", label: "Site classification" },
    { consultant: "wind_class", ours: "wind", label: "Wind classification" },
  ],
  energy: [{ consultant: "star_rating", ours: "energy_rating", label: "Energy rating" }],
  bushfire: [{ consultant: "bal", ours: "bal", label: "BAL" }],
  planning: [],
  other: [],
};

export const check: Check = {
  type: "consultant_values_match",
  label: "Consultant values match the drawings",
  description:
    "Values in consultant documents (site and wind classification, BAL, star rating, address) match the cover page and title blocks. Values the consultant marks as assumed are flagged for confirmation.",
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
        { value: "planning", label: "Planning permit" },
      ],
    },
  ],
  run: async (ctx, params) => {
    const discipline = stringParam(params, "discipline", "structural") as Discipline;
    const docs = (ctx.consultantDocs ?? []).filter((d) => d.discipline === discipline);
    const ours = practiceValues(ctx.sheets);
    const cover = ctx.sheets.find((s) => s.sheetType === "cover");
    const findings: FindingInput[] = [];

    for (const doc of docs) {
      for (const pair of DEFAULT_PAIRS[discipline]) {
        const theirs = doc.fields[pair.consultant];
        if (!theirs || /^n\/?a$/i.test(theirs)) continue;
        const mine = ours.cover[pair.ours];
        if (!mine) {
          findings.push({
            sheetId: cover?.id ?? null,
            message: `${doc.firm} gives the ${pair.label.toLowerCase()} as ${theirs}, but the cover doesn't show one.`,
            bbox: cover?.titleBlockBoxes?.[pair.ours] ?? null,
          });
        } else if (!valuesAgree(theirs, mine)) {
          findings.push({
            sheetId: cover?.id ?? null,
            message: `${pair.label} on the cover is "${mine}", but ${doc.firm} says "${theirs}".`,
            bbox: cover?.titleBlockBoxes?.[pair.ours] ?? null,
          });
        }
        if (/assumed/i.test(theirs)) {
          findings.push({
            sheetId: null,
            message: `${doc.firm} has assumed the ${pair.label.toLowerCase()} ("${theirs}"). Confirm it with a site report before issuing.`,
            bbox: null,
          });
        }
      }

      // Titles: every certificate of title the document covers appears on the drawings.
      if (doc.fields.titles) {
        const ourText = [
          ours.coverText,
          ...ctx.sheets.map((s) => s.titleBlock.title_ref ?? ""),
          ...ctx.sheets.filter((s) => s.sheetType === "site_plan").flatMap((s) => s.textBlocks.map((l) => l.text)),
        ].join(" ");
        const missing = (doc.fields.titles.match(/\d{4,7}\/\d{1,4}/g) ?? []).filter((t) => !ourText.includes(t));
        const onCover = (doc.fields.titles.match(/\d{4,7}\/\d{1,4}/g) ?? []).filter((t) => !ours.coverText.includes(t));
        if (missing.length > 0) {
          findings.push({ sheetId: null, message: `${doc.firm} covers title ${missing.join(", ")}, which isn't shown on the drawings.`, bbox: null });
        } else if (onCover.length > 0) {
          findings.push({
            sheetId: cover?.id ?? null,
            message: `${doc.firm} covers titles ${doc.fields.titles}; the cover only shows ${(ours.coverText.match(/\d{4,7}\/\d{1,4}/g) ?? []).join(", ") || "no title"}. Show ${onCover.join(", ")} until the titles are consolidated.`,
            bbox: null,
            severity: "minor",
          });
        }
      }

      // Client names: flag near-misses such as "Gunston" for "Gunton" (first names are often abbreviated).
      const client = doc.fields.client;
      const ourNames = (ours.project ?? ours.coverText).toLowerCase().split(/[^a-z']+/).filter((w) => w.length >= 3);
      if (client && ourNames.length > 0) {
        const theirNames = client.toLowerCase().split(/[^a-z']+/).filter((w) => w.length >= 3 && !["and", "mr", "mrs", "ms"].includes(w));
        const misspelt = theirNames.filter(
          (w) => !ourNames.includes(w) && ourNames.some((o) => Math.abs(o.length - w.length) <= 2 && editDistance(o, w) <= 2),
        );
        if (misspelt.length > 0) {
          findings.push({
            sheetId: null,
            message: `${possessive(doc.firm)} document names the client "${client}", which doesn't match the drawings (${ours.project ?? "cover"}). Check the spelling of ${misspelt.map((w) => `"${w.toUpperCase()}"`).join(", ")}.`,
            bbox: null,
          });
        }
      }

      // Address
      const address = doc.fields.address;
      const ourAddress = ctx.project.address ?? ours.project ?? ours.coverText;
      if (address && ourAddress) {
        const key = addressKey(address);
        const text = normaliseAddress(ourAddress).replace(/\s+/g, "");
        if (key.length === 2 && !(text.includes(key[0]) && text.includes(key[1]))) {
          findings.push({
            sheetId: null,
            message: `${possessive(doc.firm)} document is for "${address}", which doesn't match this project's address.`,
            bbox: null,
          });
        }
      }
    }
    return findings;
  },
};

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
