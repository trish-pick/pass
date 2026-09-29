import { addressKey, practiceValues, valuesAgree } from "@/lib/consultants/compare";
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

      // Address
      const address = doc.fields.address;
      const ourAddress = ctx.project.address ?? ours.project ?? ours.coverText;
      if (address && ourAddress) {
        const key = addressKey(address);
        const text = ourAddress.toLowerCase().replace(/\s+/g, "");
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
