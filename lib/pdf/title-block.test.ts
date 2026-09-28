import { describe, expect, it } from "vitest";

import { line, testProfile, titleBlockLines } from "@/lib/testing/fixtures";

import { readTitleBlock } from "./title-block";

const values = (lines: Parameters<typeof readTitleBlock>[0]) =>
  Object.fromEntries(Object.entries(readTitleBlock(lines, testProfile.titleBlockFields)).map(([k, v]) => [k, v.value]));

describe("readTitleBlock", () => {
  it("reads values below and to the right of their labels, including multi-line values", () => {
    const lines = titleBlockLines({
      sheetNumber: "B04",
      revision: "Rev03",
      jobNumber: "XX25001",
      drawnBy: "abc",
      date: "01.02.26",
    });
    expect(values(lines)).toEqual({
      sheet_number: "B04",
      revision: "Rev03",
      job_number: "XX25001",
      project: "Sample Client PROPOSED NEW RESIDENCE 1 Example St",
      drawn_by: "abc",
      date: "01.02.26",
    });
  });

  it("leaves a field out when nothing sits in the value position", () => {
    const lines = titleBlockLines({ sheetNumber: "B04", revision: "Rev03", jobNumber: "XX25001" });
    const v = values(lines);
    expect(v.drawn_by).toBeUndefined();
    expect(v.date).toBeUndefined();
  });

  it("reads a value printed on the same line as its label", () => {
    const v = values([line("REVISION NO. Rev03", 1024, 748), line("DRAWING NO. B07", 1091, 748)]);
    expect(v).toMatchObject({ revision: "Rev03", sheet_number: "B07" });
  });

  it("does not take another label as a value", () => {
    const v = values([line("DRAWN BY:", 1091, 692), line("DATE:", 1091, 700)]);
    expect(v.drawn_by).toBeUndefined();
  });

  it("does not treat a longer label as an inline value", () => {
    const v = values([line("PROJECT DETAILS:", 900, 100)]);
    expect(v.project).toBeUndefined();
  });
});

describe("readTitleBlock on a cover layout", () => {
  it("falls back to the other direction when a label is laid out differently", () => {
    const v = values([line("REVISION NO.", 101, 778), line("Rev03", 157, 774, 16), line("JOB No:", 217, 783), line("FS25008", 247, 774, 16)]);
    expect(v).toMatchObject({ revision: "Rev03", job_number: "FS25008" });
  });
});
