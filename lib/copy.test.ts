import { describe, expect, it } from "vitest";

import { copy } from "./copy";

// CLAUDE.md section 2a: words that must never describe an audit result.
const BANNED = [/\bcomplian(t|ce)\b/i, /\bcertified\b/i, /\bapproved\b/i, /\bstandards\b/i, /\bpassed\b/i];

function collectStrings(value: unknown, path: string[] = []): [string, string][] {
  if (typeof value === "string") return [[path.join("."), value]];
  if (typeof value === "function") {
    const out = (value as (...args: number[]) => unknown)(1, 2);
    return collectStrings(out, path);
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, v]) => collectStrings(v, [...path, key]));
  }
  return [];
}

describe("copy", () => {
  it("keeps the disclaimer wording from the brief", () => {
    expect(copy.disclaimer).toBe(
      "PASS checks your drawings against your own practice requirements. It does not assess compliance with the NCC or Australian Standards.",
    );
  });

  it("never uses banned verdict words outside the disclaimer", () => {
    const strings = collectStrings(copy).filter(([path]) => path !== "disclaimer");
    for (const [path, text] of strings) {
      for (const pattern of BANNED) {
        expect(pattern.test(text), `${path}: "${text}" matches ${pattern}`).toBe(false);
      }
    }
  });

  it("never labels the main button PASS alone", () => {
    expect(copy.audit.runButton).not.toBe("PASS");
  });
});
