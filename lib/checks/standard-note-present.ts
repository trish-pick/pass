import type { Check, FindingInput, ParsedSheet } from "./types";
import { bestMatch, numberParam, sheetLabel, sheetWords, stringListParam, stringParam, words } from "./util";

export const check: Check = {
  type: "standard_note_present",
  label: "Required standard notes appear",
  description:
    "Each required standard note for this stage appears in the set (or on every sheet), allowing for line breaks and small wording differences.",
  source: "rule",
  params: [
    {
      key: "codes",
      label: "Note codes (optional)",
      kind: "text",
      help: "Limit this item to these notes, e.g. GEN-01, DISCLAIMER. Leave blank for every required note for the stage.",
    },
    {
      key: "scope",
      label: "Where the note must appear",
      kind: "select",
      options: [
        { value: "set", label: "Somewhere in the set" },
        { value: "every_sheet", label: "On every sheet this item applies to" },
      ],
    },
    {
      key: "threshold",
      label: "Match strictness",
      kind: "number",
      help: "From 0 to 1. Default 0.85 allows a few changed words.",
    },
  ],
  run: async (ctx, params) => {
    const codes = stringListParam(params, "codes");
    const scope = stringParam(params, "scope", "set");
    const threshold = numberParam(params, "threshold", 0.85);

    const notes = ctx.standardNotes.filter(
      (n) =>
        (codes ? codes.includes(n.code) : n.required) &&
        (n.stageId === null || n.stageId === ctx.drawingSet.stageId),
    );
    const cache = new Map<ParsedSheet, string[]>();
    const wordsOf = (s: ParsedSheet) => cache.get(s) ?? cache.set(s, sheetWords(s)).get(s)!;

    const findings: FindingInput[] = [];
    for (const note of notes) {
      const needle = words(note.text);
      const preview = note.text.length > 60 ? `${note.text.slice(0, 57).trim()}...` : note.text;
      if (scope === "every_sheet") {
        for (const sheet of ctx.sheets) {
          if (bestMatch(needle, wordsOf(sheet)) < threshold) {
            findings.push({
              sheetId: sheet.id,
              message: `Standard note ${note.code} is missing from ${sheetLabel(sheet)}: "${preview}"`,
              bbox: null,
            });
          }
        }
      } else if (!ctx.sheets.some((s) => bestMatch(needle, wordsOf(s)) >= threshold)) {
        findings.push({
          sheetId: null,
          message: `Standard note ${note.code} doesn't appear anywhere in the set: "${preview}"`,
          bbox: null,
        });
      }
    }
    return findings;
  },
};
