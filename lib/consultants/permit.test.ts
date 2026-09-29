import { describe, expect, it } from "vitest";

import { getCheck } from "@/lib/checks/index";
import { context, line, sheet } from "@/lib/testing/fixtures";

import { readConditions } from "./extract";
import { tokenChanges } from "./tokens";
import type { ConsultantDocument } from "./types";

describe("tokenChanges", () => {
  it("pairs changed values, keeps repeats, follows overall dimensions to other sheets", () => {
    const changes = tokenChanges(
      ["5836", "5836", "7341", "10°", "10°", "29304", "2980", "19.35m"],
      ["5876", "5822", "7341", "10.1°", "10.1°", "3000"],
      new Map([["B11", ["29256"]], ["B02", ["2980"]]]),
    );
    expect(changes).toEqual([
      { from: "5836", to: "5822", note: "smaller" },
      { from: "5836", to: "5876" },
      { from: "10°", to: "10.1°" },
      { from: "10°", to: "10.1°" },
      { from: "29304", to: "29256", onSheet: "B11", note: "smaller" },
      { from: "19.35m", to: null },
    ]);
  });
});

describe("readConditions", () => {
  it("reads numbered conditions, skipping repeated page headers, up to Permit Notes", () => {
    const page = (lines: string[], i: number) => ({ pageIndex: i, width: 595, height: 842, lines: lines.map((t, k) => line(t, 96, 100 + k * 12)) });
    const conditions = readConditions([
      page(["APPENDIX A", "1. ENDORSED PLANS", "The use must be as endorsed.", "2. STORMWATER", "Prior to works, a plan"], 0),
      page(["APPENDIX A", "Owner: A Person", "3", "is to be submitted.", "Permit Notes", "4. NOT A CONDITION"], 1),
    ]);
    expect(conditions).toEqual([
      { number: "1", title: "ENDORSED PLANS", text: "The use must be as endorsed." },
      { number: "2", title: "STORMWATER", text: "Prior to works, a plan is to be submitted." },
    ]);
  });
});

describe("endorsed_plans_match", () => {
  it("reports changed floor areas and dimensions against the endorsed sheets", async () => {
    const cover = sheet({ number: "B01", type: "cover", text: ["Total Floor Area m² sq Residence 192.31 20.70 Total 248.87 26.79"] });
    const site = sheet({ number: "B02", title: "Site Plan", type: "site_plan", text: ["5876 7371 FFL14.5m"] });
    const permit: ConsultantDocument = {
      id: "p",
      fileName: "permit.pdf",
      firm: "Planning permit",
      discipline: "planning",
      fields: { endorsed_revision: "02", endorsed_date: "12 May 2026" },
      windows: [],
      statuses: [],
      attachedPlans: null,
      attachedSheets: [
        { sheetNumber: "A01", title: "Cover Page", sheetType: "cover", tokens: [], floorAreas: { Residence: 188.86, Total: 247.03 } },
        { sheetNumber: "A02", title: "Site Plan", sheetType: "site_plan", tokens: ["5836", "7371", "FFL14.5m", "10880"], floorAreas: {} },
      ],
    };
    const out = (await getCheck("endorsed_plans_match")!.run(context([cover, site], { consultantDocs: [permit] }), {})).map((f) => f.message);
    expect(out).toEqual([
      "Floor areas differ from the endorsed plans (revision 02, 12 May 2026): residence 188.86 → 192.31 m² (+3.45); total 247.03 → 248.87 m² (+1.84).",
      "Differs from endorsed A02 Site Plan: 5836 → 5876, 10880 no longer shown. Confirm whether council needs to see these changes.",
    ]);
  });

  it("flags permit titles missing from the cover", async () => {
    const cover = sheet({ number: "B01", type: "cover", text: ["Title 154317/4"] });
    const permit = { id: "p", fileName: "p.pdf", firm: "Planning permit", discipline: "planning", fields: { titles: "154317/3 & 154317/4" }, windows: [], statuses: [], attachedPlans: null } as ConsultantDocument;
    const site = sheet({ number: "B02", type: "site_plan", text: ["Combine property titles, 154317/4 & 154317/3"] });
    const out = (await getCheck("consultant_values_match")!.run(context([cover, site], { consultantDocs: [permit] }), { discipline: "planning" })).map((f) => f.message);
    expect(out).toEqual([expect.stringContaining("the cover only shows 154317/4. Show 154317/3 until the titles are consolidated")]);
  });
});
