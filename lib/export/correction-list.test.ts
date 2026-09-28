import { describe, expect, it } from "vitest";

import type { EngineFinding } from "@/lib/checks/engine";
import { sheet } from "@/lib/testing/fixtures";

import { buildCorrectionList, correctionListCsv, describeLocation } from "./correction-list";
import { correctionListPdf } from "./correction-list-pdf";

const finding = (f: Partial<EngineFinding>): EngineFinding => ({
  sheetId: null,
  message: "m",
  bbox: null,
  checklistItemId: "i1",
  checkType: "t",
  severity: "minor",
  source: "rule",
  ...f,
});

describe("correction list", () => {
  const a = sheet({ number: "A02", title: "Site Plan", pageIndex: 1 });
  const b = sheet({ number: "A03", title: "Floor Plan", pageIndex: 2 });
  const list = buildCorrectionList({
    projectName: "Sample",
    projectNumber: "X1",
    stageName: "Planning",
    revision: "Rev01",
    checklistName: "Planning checklist",
    generatedAt: new Date("2026-09-28T10:00:00+10:00"),
    sheets: [b, a],
    findings: [
      finding({ sheetId: a.id, message: "minor on A02", bbox: { x: 10, y: 800, width: 10, height: 5 } }),
      finding({ sheetId: a.id, message: "critical on A02", severity: "critical" }),
      finding({ message: 'set-wide, with "quotes", commas', severity: "major" }),
      finding({ sheetId: b.id, message: "dismissed", status: "dismissed" } as never),
      finding({ sheetId: b.id, message: "ai item", source: "ai" }),
    ],
    itemLabels: new Map([["i1", "Item one"]]),
    reviewerItems: [
      { label: "Cross-check the planning permit", appliesTo: null },
      { label: "North point shown", appliesTo: ["site_plan"], aiLater: true },
      { label: "Boundary tags checked", appliesTo: ["site_plan"] },
      { label: "Scale note", appliesTo: ["!cover"] },
    ],
  });

  it("groups by sheet in page order, whole set first, most severe first, leaving out dismissed items", () => {
    expect(list.groups.map((g) => [g.heading, g.rows.map((r) => r.message)])).toEqual([
      ["Whole set", ['set-wide, with "quotes", commas']],
      ["A02  Site Plan", ["critical on A02", "minor on A02"]],
      ["A03  Floor Plan", ["ai item"]],
    ]);
    expect(list.counts).toEqual({ critical: 1, major: 1, minor: 2 });
    expect(list.total).toBe(4);
  });

  it("groups reviewer checks by sheet type", () => {
    expect(list.reviewerTotal).toBe(4);
    expect(list.reviewerGroups.map((g) => [g.heading, g.items.length])).toEqual([
      ["Whole set", 1],
      ["Site plan", 2],
      ["Every sheet except the cover", 1],
    ]);
    expect(correctionListCsv(list)).toContain("Site plan,,reviewer check,North point shown,,,Reviewer (AI from Phase 2)");
  });

  it("describes locations in plain terms", () => {
    expect(describeLocation({ x: 10, y: 800, width: 10, height: 5 }, a)).toBe("Bottom left");
    expect(describeLocation({ x: 580, y: 400, width: 20, height: 5 }, a)).toBe("Centre of sheet");
    expect(describeLocation(null, a)).toBe("Whole sheet");
    expect(describeLocation(null, undefined)).toBe("Whole set");
  });

  it("writes CSV with quoting and marks AI items for verification", () => {
    const csv = correctionListCsv(list);
    expect(csv.split("\r\n")[0]).toBe("Sheet,Sheet title,Severity,Item,Location,Checklist item,Source");
    expect(csv).toContain('"set-wide, with ""quotes"", commas"');
    expect(csv).toContain("AI (please verify)");
  });

  it("writes a PDF", async () => {
    const pdf = await correctionListPdf(list);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
  });
});
