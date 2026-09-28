import { describe, expect, it } from "vitest";

import { bestMatch, words } from "./util";

describe("bestMatch", () => {
  const note = words("Do not scale off drawings, contact designer if you require further clarification.");

  it("finds a note across line breaks and punctuation", () => {
    const text = words("N 1 : 100 do not scale off\ndrawings, contact designer if you require further clarification. written dimensions");
    expect(bestMatch(note, text)).toBe(1);
  });

  it("scores a one-word difference just below a perfect match", () => {
    const text = words("do not scale off drawings, contact designer if you require furter clarification.");
    const score = bestMatch(note, text);
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThan(1);
  });

  it("scores missing text low", () => {
    expect(bestMatch(note, words("Floor Plan 1 : 100 Kitchen Dining Lounge"))).toBeLessThan(0.3);
  });

  it("treats & and 'and' as the same", () => {
    expect(bestMatch(words("North and West Elevations"), words("North & West Elevations"))).toBe(1);
  });
});
