import { describe, expect, it } from "vitest";

import { line, testProfile, titleBlockLines } from "@/lib/testing/fixtures";

import { parseSet } from "./parse-set";

describe("parseSet", () => {
  it("names sheets from the title block, titles them from the register and types them", () => {
    const cover = [
      line("Drawing Register", 963, 171, 16),
      line("A 01", 969, 195, 9),
      line("Cover Page", 1011, 195, 9),
      line("A 02", 969, 206, 9),
      line("North Elevation", 1011, 206, 9),
    ];
    const elevation = titleBlockLines({ sheetNumber: "A02", revision: "Rev01", jobNumber: "XX1" });
    const { sheets, register } = parseSet(
      [
        { pageIndex: 0, width: 1190, height: 842, lines: cover },
        { pageIndex: 1, width: 1190, height: 842, lines: elevation },
      ],
      testProfile,
    );
    expect(register?.entries).toHaveLength(2);
    expect(sheets.map((s) => [s.sheetNumber, s.sheetTitle, s.sheetType])).toEqual([
      ["A01", "Cover Page", "cover"],
      ["A02", "North Elevation", "elevation"],
    ]);
    expect(sheets[1].titleBlock.revision).toBe("Rev01");
  });
});
