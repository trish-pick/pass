import { describe, expect, it } from "vitest";

import { runChecklist } from "./engine";
import type { Check, CheckContext } from "./types";

const ctx: CheckContext = {
  project: { name: "Test", projectNumber: "001", address: null },
  drawingSet: { revision: "A", stageId: "s1", stageName: "Concept" },
  sheets: [
    { id: "p1", pageIndex: 0, width: 1190, height: 842, sheetNumber: "A001", sheetTitle: "Site plan", sheetType: "plan", titleBlock: {}, textBlocks: [], imagePath: null },
    { id: "p2", pageIndex: 1, width: 1190, height: 842, sheetNumber: "A201", sheetTitle: "Elevations", sheetType: "elevation", titleBlock: {}, textBlocks: [], imagePath: null },
  ],
  profile: { sheetNumberPattern: null, titleBlockFields: [], conventions: {} },
  standardNotes: [],
  dictionary: [],
};

const onePerSheet: Check = {
  type: "one_per_sheet",
  label: "Flags every sheet",
  source: "rule",
  run: async (c) => c.sheets.map((s) => ({ sheetId: s.id, message: `Sheet ${s.sheetNumber}`, bbox: null })),
};

const broken: Check = {
  type: "broken",
  label: "Throws",
  source: "ai",
  run: async () => {
    throw new Error("boom");
  },
};

const lookup = (t: string) => [onePerSheet, broken].find((c) => c.type === t);

describe("runChecklist", () => {
  it("runs items, applies sheet-type filters and fills in severity and source", async () => {
    const { findings, errors } = await runChecklist(
      ctx,
      [
        { id: "i1", checkType: "one_per_sheet", params: {}, severity: "major", appliesTo: null },
        { id: "i2", checkType: "one_per_sheet", params: {}, severity: "minor", appliesTo: ["elevation"] },
      ],
      lookup,
    );
    expect(errors).toEqual([]);
    expect(findings).toHaveLength(3);
    expect(findings[2]).toMatchObject({ sheetId: "p2", checklistItemId: "i2", severity: "minor", source: "rule" });
  });

  it("reports unknown and failing checks without stopping the audit", async () => {
    const progress: number[] = [];
    const { findings, errors } = await runChecklist(
      ctx,
      [
        { id: "i1", checkType: "missing", params: {}, severity: "major", appliesTo: null },
        { id: "i2", checkType: "broken", params: {}, severity: "major", appliesTo: null },
        { id: "i3", checkType: "one_per_sheet", params: {}, severity: "major", appliesTo: null },
      ],
      lookup,
      (done) => progress.push(done),
    );
    expect(errors.map((e) => e.error)).toEqual(["Unknown check type", "boom"]);
    expect(findings).toHaveLength(2);
    expect(progress).toEqual([1, 2, 3]);
  });
});

describe("appliesTo", () => {
  it("supports include lists, exclusions and no filter", async () => {
    const { appliesTo } = await import("./engine");
    expect(appliesTo("plan", null)).toBe(true);
    expect(appliesTo("plan", ["plan"])).toBe(true);
    expect(appliesTo("elevation", ["plan"])).toBe(false);
    expect(appliesTo(null, ["plan"])).toBe(false);
    expect(appliesTo("cover", ["!cover"])).toBe(false);
    expect(appliesTo(null, ["!cover"])).toBe(true);
    expect(appliesTo("plan", ["!cover"])).toBe(true);
  });
});
