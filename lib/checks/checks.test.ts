import { describe, expect, it } from "vitest";

import { context, line, sheet } from "@/lib/testing/fixtures";

import { check as calloutReferences } from "./callout-references";
import { check as forbiddenText } from "./forbidden-text";
import { check as requiredTextPresent } from "./required-text-present";
import { check as revisionConsistent, normaliseRevision } from "./revision-consistent";
import { check as sheetIndexMatch } from "./sheet-index-match";
import { check as sheetNumberFormat } from "./sheet-number-format";
import { check as sheetNumberSequence } from "./sheet-number-sequence";
import { check as spelling } from "./spelling";
import { check as standardNotePresent } from "./standard-note-present";
import { check as titleBlockComplete } from "./title-block-complete";
import { check as titleBlockConsistent } from "./title-block-consistent";
import type { ParsedSheet } from "./types";

const messages = async (c: typeof sheetNumberFormat, sheets: ParsedSheet[], params = {}, overrides = {}) =>
  (await c.run(context(sheets, overrides), params)).map((f) => f.message);

describe("sheet_number_format", () => {
  it("flags missing and badly formed sheet numbers", async () => {
    const out = await messages(sheetNumberFormat, [sheet({ number: "B01" }), sheet({ number: "B-2" }), sheet({ number: null })]);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain('"B-2"');
    expect(out[1]).toContain("No sheet number");
  });
});

describe("sheet_number_sequence", () => {
  it("flags duplicates, small gaps and out-of-order sheets but not new series", async () => {
    const out = await messages(sheetNumberSequence, [
      sheet({ number: "B01" }),
      sheet({ number: "B02" }),
      sheet({ number: "B02" }),
      sheet({ number: "B05" }),
      sheet({ number: "B04" }),
      sheet({ number: "B12" }),
      sheet({ number: "B14" }),
      sheet({ number: "B100" }),
      sheet({ number: "B110" }),
    ]);
    expect(out.some((m) => m.startsWith("Sheet number B02 is also used"))).toBe(true);
    expect(out.some((m) => m.includes("B04 comes after B05"))).toBe(true);
    expect(out).toContain("B03 is missing: the set goes from B02 to B04.");
    expect(out).toContain("B13 is missing: the set goes from B12 to B14.");
    expect(out.some((m) => m.includes("B101"))).toBe(false);
    expect(out.some((m) => m.includes("B06"))).toBe(false);
  });
});

describe("sheet_index_match", () => {
  const register = (rows: [string, string][]) => {
    const s = sheet({ number: "A01", title: "Cover Page", type: "cover" });
    s.textBlocks = [
      line("Drawing Register", 963, 171, 16),
      ...rows.flatMap(([n, t], i) => [line(n, 969, 195 + i * 11, 9), line(t, 1011, 195 + i * 11, 9)]),
    ];
    return s;
  };

  it("flags register rows with no sheet, sheets not in the register and titles not on their sheet", async () => {
    const out = await messages(sheetIndexMatch, [
      register([["A 01", "Cover Page"], ["A 02", "Site Plan"], ["A 03", "Floor Plan"], ["A 04", "Roof Plan"]]),
      sheet({ number: "A02", text: ["Site Plan 1 : 200"] }),
      sheet({ number: "A03", text: ["Elevations 1 : 100"] }),
      sheet({ number: "A05", text: ["3D Views"] }),
    ]);
    expect(out).toEqual([
      'The register calls A03 "Floor Plan", but that title doesn\'t appear on the sheet.',
      "The register lists A04 Roof Plan, but there is no sheet A04 in the set.",
      "Sheet A05 isn't listed in the drawing register.",
    ]);
  });

  it("reports a missing register", async () => {
    expect(await messages(sheetIndexMatch, [sheet({ number: "A02" })])).toEqual(["No drawing register found in the set."]);
  });
});

describe("title_block_complete", () => {
  it("flags missing fields and template placeholders", async () => {
    const full = { revision: "Rev01", job_number: "X1", project: "P", drawn_by: "abc", date: "1.1.26" };
    const out = await messages(titleBlockComplete, [
      sheet({ number: "A02", titleBlock: full }),
      sheet({ number: "A03", titleBlock: { ...full, drawn_by: "Author", date: "" } }),
    ]);
    expect(out).toEqual(['Drawn by shows "Author", which is template placeholder text.', "Title block is missing: Date."]);
  });

  it("reports a sheet with no title block at all once", async () => {
    const s = sheet({ number: null });
    expect(await messages(titleBlockComplete, [s])).toEqual([`No title block found on page ${s.pageIndex + 1}.`]);
  });
});

describe("title_block_consistent", () => {
  it("flags the odd one out, preferring the project's job number", async () => {
    const out = await messages(
      titleBlockConsistent,
      [
        sheet({ number: "A02", titleBlock: { job_number: "TCP1" } }),
        sheet({ number: "A03", titleBlock: { job_number: "TCP1" } }),
        sheet({ number: "A04", titleBlock: { job_number: "FS1" } }),
      ],
      {},
      { project: { name: "P", projectNumber: "FS1", address: null } },
    );
    expect(out).toEqual([
      'Job no is "TCP1" here but "FS1" on 1 other sheet.',
      'Job no is "TCP1" here but "FS1" on 1 other sheet.',
    ]);
  });

  it("checks the job number and address against the project record", async () => {
    const out = await messages(
      titleBlockConsistent,
      [sheet({ number: "A02", titleBlock: { job_number: "X9", project: "Client 2 Other St" } })],
      {},
      { project: { name: "P", projectNumber: "X1", address: "1 Example St" } },
    );
    expect(out).toEqual([
      "No sheet shows the project's job number X1 (sheets show X9).",
      'Project details don\'t include the project address "1 Example St".',
    ]);
  });
});

describe("revision_consistent", () => {
  it("normalises revision formats", () => {
    expect(normaliseRevision("Rev 03")).toBe("3");
    expect(normaliseRevision("rev03_Prelim Build")).toBe("3");
    expect(normaliseRevision("RevA")).toBe("a");
    expect(normaliseRevision("00")).toBe("0");
  });

  it("flags title blocks that don't match the set revision", async () => {
    const out = await messages(revisionConsistent, [
      sheet({ number: "A02", titleBlock: { revision: "Rev01" } }),
      sheet({ number: "A03", titleBlock: { revision: "Rev 1" } }),
      sheet({ number: "A04", titleBlock: { revision: "Rev00" } }),
    ]);
    expect(out).toEqual(['Revision no shows "Rev00" but this set is issuing as Rev01.']);
  });
});

describe("callout_references", () => {
  it("flags references to sheets that aren't in the set, ignoring look-alikes", async () => {
    const out = await messages(
      calloutReferences,
      [
        sheet({ number: "B01" }),
        sheet({ number: "B02", text: ["Refer to B01 for notes", "Refer to Page A18 for glazing", "see B 07", "Lintels F17 KDHW", "Wind N26.6", "(D10)"] }),
      ],
      { prefixes: ["A", "B"] },
    );
    expect(out).toEqual(["Refers to A18, but there is no sheet A18 in this set.", "Refers to B07, but there is no sheet B07 in this set."]);
  });
});

describe("standard_note_present", () => {
  const notes = [
    { code: "SCALE", text: "Do not scale off drawings, contact designer if you require further clarification.", required: true, stageId: null },
    { code: "BD-ONLY", text: "Builder to verify all levels on site before commencing.", required: true, stageId: "stage-bd" },
    { code: "PLANNING", text: "Planning only note.", required: true, stageId: "stage-planning" },
  ];

  it("finds notes across line breaks with small differences, per sheet or per set", async () => {
    const good = sheet({ number: "A02", text: ["do not scale off drawings, contact designer", "if you require furter clarification."] });
    const bad = sheet({ number: "A03", text: ["Floor Plan"] });
    const everySheet = await messages(standardNotePresent, [good, bad], { codes: ["SCALE"], scope: "every_sheet" }, { standardNotes: notes });
    expect(everySheet).toHaveLength(1);
    expect(everySheet[0]).toContain("SCALE is missing from A03");

    const set = await messages(standardNotePresent, [good, bad], {}, { standardNotes: notes });
    expect(set).toEqual([expect.stringContaining("Standard note BD-ONLY doesn't appear anywhere in the set")]);
  });
});

describe("required_text_present", () => {
  it("checks each applicable sheet, or the set", async () => {
    const sheets = [sheet({ number: "A02", text: ["BAL-12.5"] }), sheet({ number: "A03", text: ["Floor"] })];
    expect(await messages(requiredTextPresent, sheets, { text: "BAL" })).toEqual(['"BAL" is missing from A03.']);
    expect(await messages(requiredTextPresent, sheets, { text: "BAL", scope: "set" })).toEqual([]);
  });
});

describe("forbidden_text", () => {
  it("flags placeholder phrases as whole words only", async () => {
    const out = await messages(forbiddenText, [sheet({ number: "A02", text: ["Section TO BE UPDATED", "tbc", "Batch no. 4"] })], {
      phrases: ["TO BE UPDATED", "TBC", "BAT"],
    });
    expect(out).toEqual(['"Section TO BE UPDATED" is placeholder or draft text.', '"tbc" is placeholder or draft text.']);
  });
});

describe("spelling", () => {
  it("flags misspellings, allows building terms, codes and practice words, and groups repeats", async () => {
    const tb = { project: "Smithers Residence" };
    const sheets = [1, 2, 3].map((n) =>
      sheet({ number: `A0${n}`, titleBlock: tb, text: ["contact designer if you require furter clarification"] }),
    );
    sheets[0].textBlocks.push(line("Install noggings and sarking to NCC; ncc notes. Smithers colour: Monument", 40, 300));
    sheets[1].textBlocks.push(line("Waterproof the accoustic membrane", 40, 300));
    const out = (await spelling.run(context(sheets, { dictionary: ["monument"] }), {})).map((f) => [f.sheetId, f.message]);
    expect(out).toEqual([
      [null, expect.stringMatching(/^"furter" may be misspelt\..*appears on 3 sheets \(A01, A02, A03\)/)],
      [sheets[1].id, expect.stringContaining('"accoustic" may be misspelt')],
    ]);
  });
});
