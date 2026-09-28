/**
 * Acceptance test (brief section 11): a full audit of the seeded error set
 * must catch every deliberate mistake, and its clean twin must come back
 * with nothing outstanding. Runs the real pipeline: PDF -> MuPDF -> checks.
 */
import fs from "node:fs";

import { describe, expect, it } from "vitest";

import { fromSeed, type PracticeSeed } from "@/lib/audit/local";
import { runChecklist } from "@/lib/checks/engine";
import { getCheck } from "@/lib/checks/index";
import { extractPages } from "@/lib/pdf/extract";
import { parseSet } from "@/lib/pdf/parse-set";

import { SEEDED, SEEDED_ERRORS, seededSet } from "./seeded-set";

const seed = JSON.parse(fs.readFileSync("supabase/seed-data/forme-studio.json", "utf8")) as PracticeSeed;

async function audit(errors: boolean) {
  const { stage, items, standardNotes } = fromSeed(seed, "Building Documentation");
  const { sheets } = parseSet(extractPages(await seededSet({ errors })), seed.profile);
  const result = await runChecklist(
    {
      project: { name: "Seeded set", projectNumber: SEEDED.jobNumber, address: SEEDED.address },
      drawingSet: { revision: SEEDED.revision, stageId: stage, stageName: stage },
      sheets,
      profile: seed.profile,
      standardNotes,
      dictionary: seed.dictionary,
    },
    items,
    getCheck,
  );
  const sheetNumber = new Map(sheets.map((s) => [s.id, s.sheetNumber]));
  return {
    ...result,
    lines: result.findings.map((f) => `${f.checkType} | ${f.sheetId ? sheetNumber.get(f.sheetId) : "set"} | ${f.message}`),
  };
}

describe("seeded set acceptance", () => {
  it("finds nothing outstanding in the clean set", async () => {
    const { lines, errors } = await audit(false);
    expect(errors).toEqual([]);
    expect(lines).toEqual([]);
  });

  it("catches every seeded mistake", async () => {
    const { lines, errors } = await audit(true);
    expect(errors).toEqual([]);
    const has = (check: string, sheet: string, text: string) =>
      expect(lines, `${check} on ${sheet}: ${text}`).toContainEqual(expect.stringMatching(new RegExp(`^${check} \\| ${sheet} \\| .*${text}`)));

    has("sheet_number_format", "B-06", `"${SEEDED_ERRORS.badFormat}"`);
    has("sheet_number_sequence", "set", "B05, B06 are missing");
    has("sheet_index_match", "B01", "no sheet B05");
    has("sheet_index_match", SEEDED_ERRORS.wrongSheetNumber, "isn't listed in the drawing register");
    has("title_block_complete", "B-06", `"${SEEDED_ERRORS.placeholder}"`);
    has("title_block_consistent", "B03", `"${SEEDED_ERRORS.wrongJobNumber}"`);
    has("revision_consistent", "B04", `"${SEEDED_ERRORS.wrongRevision}"`);
    has("callout_references", "B03", SEEDED_ERRORS.brokenCallout);
    has("standard_note_present", SEEDED_ERRORS.missingNoteSheet, "DISCLAIMER");
    has("forbidden_text", "B04", SEEDED_ERRORS.draftText);
    has("spelling", "B02", SEEDED_ERRORS.misspelling);
  });

  it.todo("catches the missing north point on B02 (Phase 2 AI check visual_element_present)");
});
