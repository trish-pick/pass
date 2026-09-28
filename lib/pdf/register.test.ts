import { describe, expect, it } from "vitest";

import { line } from "@/lib/testing/fixtures";

import { readRegister } from "./register";

const pattern = /^[A-Z]\d{2,3}[a-z]?$/;

describe("readRegister", () => {
  it("reads rows split into prefix, number and title, including lettered sheets", () => {
    const lines = [
      line("Drawing Register", 963, 171, 16),
      ...[
        ["A", "01", "Cover Page"],
        ["A", "02", "Site Plan"],
        ["A", "04a", "Floor Plan -Dimensions"],
        ["A", "100", "Waterproofing Notes"],
      ].flatMap(([p, n, t], i) => [line(p, 969, 195 + i * 11, 9), line(n, 976, 195 + i * 11, 9), line(t, 1011, 195 + i * 11, 9)]),
      line("Total Floor Area", 954, 725, 18),
    ];
    const register = readRegister(lines, 0, ["Drawing Register"], pattern);
    expect(register?.entries.map((e) => [e.sheetNumber, e.title])).toEqual([
      ["A01", "Cover Page"],
      ["A02", "Site Plan"],
      ["A04a", "Floor Plan -Dimensions"],
      ["A100", "Waterproofing Notes"],
    ]);
  });

  it("returns null when the page has no register heading", () => {
    expect(readRegister([line("Site Plan", 10, 10)], 0, ["Drawing Register"], pattern)).toBeNull();
  });
});
