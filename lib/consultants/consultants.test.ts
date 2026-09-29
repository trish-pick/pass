import { describe, expect, it } from "vitest";

import { context, line, sheet, testProfile } from "@/lib/testing/fixtures";

import { addressKey, jobDigits, parseDate, valuesAgree } from "./compare";
import { identifyFirm, readConsultantDocument } from "./extract";
import type { ConsultantDocument, ConsultantProfile } from "./types";

const engineer: ConsultantProfile = {
  firm: "Sample Engineering",
  discipline: "structural",
  match: ["sample-eng.example"],
  fields: [
    { key: "site_class", label: "SITE CLASSIFICATION:" },
    { key: "based_on_revision", label: "BUILDING DRAWINGS REV:" },
    { key: "based_on_date", pattern: "DRAWINGS DATE:\\s*\\|?\\s*([\\d/]+)" },
  ],
  statusPattern: "\\d{1,3}% DESIGN REVIEW|FOR CONSTRUCTION",
};

const energy: ConsultantProfile = {
  firm: "Sample Energy",
  discipline: "energy",
  match: ["sample energy"],
  fields: [{ key: "star_rating", pattern: "(\\d{1,2}(?:\\.\\d)?)\\s*Stars" }],
  windowPattern: "\\b(?<mark>W\\d{1,3})\\s*\\|\\s*(?<height>\\d{3,4})\\s*\\|\\s*(?<width>\\d{3,4})\\s*\\|\\s*awning",
};

const page = (lines: ReturnType<typeof line>[], pageIndex = 0) => ({ pageIndex, width: 1190, height: 842, lines });

describe("comparison helpers", () => {
  it("normalises job numbers, dates, classifications and addresses", () => {
    expect(jobDigits("TCP-24003")).toBe("24003");
    expect(jobDigits("FS24003")).toBe(jobDigits("24003"));
    expect(parseDate("27.02.26")).toBe(parseDate("27/02/2026"));
    expect(parseDate("22.01.25")! < parseDate("27.02.26")!).toBe(true);
    expect(valuesAgree("P/A", "Class P (A to Dolerite Bedrock)")).toBe(true);
    expect(valuesAgree("19", "BAL-19")).toBe(true);
    expect(valuesAgree("6.1", "6.1*")).toBe(true);
    expect(valuesAgree("H1", "Class P")).toBe(false);
    expect(addressKey("111 RAVENSWOOD ROAD")).toEqual(["111", "ravenswood"]);
  });
});

describe("reading consultant documents", () => {
  it("identifies the firm and reads labelled fields, patterns, statuses and windows", () => {
    const pages = [
      page([
        line("sample-eng.example", 60, 20),
        line("SITE CLASSIFICATION:", 60, 100),
        line("M", 200, 100),
        line("BUILDING DRAWINGS REV:", 60, 120),
        line("B", 200, 120),
        line("DRAWINGS DATE:", 60, 140),
        line("27/02/2026", 200, 140),
        line("50% DESIGN REVIEW", 600, 300),
      ]),
    ];
    const profile = identifyFirm(pages, [energy, engineer])!;
    expect(profile.firm).toBe("Sample Engineering");
    const doc = readConsultantDocument(pages, "eng.pdf", profile, testProfile);
    expect(doc.fields).toEqual({ site_class: "M", based_on_revision: "B", based_on_date: "27/02/2026" });
    expect(doc.statuses).toEqual(["50% DESIGN REVIEW"]);

    const e = readConsultantDocument(
      [page([line("Sample Energy", 0, 0), line("6.5 Stars", 0, 20), line("W1", 0, 40), line("2100", 50, 40), line("3300", 90, 40), line("awning", 130, 40)])],
      "energy.pdf",
      energy,
      testProfile,
    );
    expect(e.fields.star_rating).toBe("6.5");
    expect(e.windows).toEqual([{ mark: "W1", width: 3300, height: 2100 }]);
  });

  it("reads the practice's own sheets attached to a report", () => {
    const attached = page([line("DRAWING NO.", 1091, 748), line("B02", 1091, 758, 16), line("REVISION NO.", 1024, 748), line("Rev05", 1024, 758, 16)]);
    const doc = readConsultantDocument([page([line("Sample Energy", 0, 0)]), attached], "bal.pdf", energy, testProfile);
    expect(doc.attachedPlans).toMatchObject({ revision: "Rev05", sheets: 1 });
  });
});

const doc = (d: Partial<ConsultantDocument>): ConsultantDocument => ({
  id: "d",
  fileName: "doc.pdf",
  firm: "Sample Engineering",
  discipline: "structural",
  fields: {},
  windows: [],
  statuses: [],
  attachedPlans: null,
  ...d,
});

describe("consultant checks", () => {
  const sheets = () => [
    sheet({ number: "B01", type: "cover", titleBlock: { soil: "Class M", wind: "N2", bal: "BAL-12.5", energy_rating: "6.5*" } }),
    sheet({ number: "B02", titleBlock: { job_number: "FS90001", date: "27.02.26", revision: "RevB", project: "Client 1 Example Street" } }),
  ];
  const run = async (type: string, docs: ConsultantDocument[], params = {}) => {
    const { getCheck } = await import("@/lib/checks/index");
    const out = await getCheck(type)!.run(
      context(sheets(), { consultantDocs: docs, drawingSet: { revision: "RevB", stageId: "s", stageName: "BD" } }),
      params,
    );
    return out.map((f) => f.message);
  };

  it("flags consultant work based on older drawings or another job", async () => {
    const out = await run("consultant_based_on_current", [
      doc({ fields: { based_on_job: "FS90001", based_on_revision: "B", based_on_date: "27/02/2026" } }),
      doc({ fileName: "old.pdf", fields: { based_on_job: "FS90001", based_on_revision: "05" } }),
      doc({ fileName: "other.pdf", fields: { based_on_job: "FS80002", based_on_revision: "B" } }),
      doc({ fileName: "silent.pdf" }),
    ]);
    expect(out).toEqual([
      expect.stringContaining("(old.pdf) is based on your drawings revision 05, but this set is issuing as RevB"),
      expect.stringContaining("(other.pdf) refers to job FS80002, but this set is job FS90001"),
      expect.stringContaining("(silent.pdf) doesn't say which revision"),
    ]);
  });

  it("uses attached plans when the consultant doesn't quote a revision", async () => {
    const out = await run("consultant_based_on_current", [
      doc({ discipline: "bushfire", firm: "Sample Bushfire Consultants", attachedPlans: { revision: "Rev05", jobNumber: "FS90001", date: "09.01.24", sheets: 12 } }),
    ], { discipline: "bushfire" });
    expect(out).toEqual([expect.stringMatching(/^Sample Bushfire Consultants' bushfire assessment .* revision Rev05, dated 09\.01\.24/)]);
  });

  it("compares values with the cover, flags assumptions and wrong addresses", async () => {
    const out = await run("consultant_values_match", [
      doc({ fields: { site_class: "ASSUMED H1", wind_class: "N2", address: "9 Other Road" } }),
    ]);
    expect(out).toEqual([
      'Site classification on the cover is "Class M", but Sample Engineering says "ASSUMED H1".',
      'Sample Engineering has assumed the site classification ("ASSUMED H1"). Confirm it with a site report before issuing.',
      "Sample Engineering's document is for \"9 Other Road\", which doesn't match this project's address.",
    ]);
    expect(await run("consultant_values_match", [doc({ discipline: "bushfire", fields: { bal: "12.5" } })], { discipline: "bushfire" })).toEqual([]);
  });

  it("flags consultant documents not issued for construction", async () => {
    expect(await run("consultant_status_final", [doc({ statuses: ["50% DESIGN REVIEW"] }), doc({ statuses: ["FOR CONSTRUCTION"] })])).toEqual([
      'Sample Engineering\'s documents (doc.pdf) are marked "50% DESIGN REVIEW", not issued for construction.',
    ]);
  });

  it("compares the window schedule with the energy assessment", async () => {
    const { getCheck } = await import("@/lib/checks/index");
    const schedule = sheet({ number: "B06", type: "schedule" });
    schedule.textBlocks = [
      line("Window Schedule", 62, 71, 16),
      line("Mark", 70, 96, 10),
      line("Description", 223, 96, 10),
      line("Width", 338, 96, 10),
      line("Height", 409, 96, 10),
      ...[
        ["1", "Sliding Door", "3300", "2100"],
        ["2", "Awning Window", "910", "2000"],
        ["4", "Sliding Door", "1690", "2100"],
        ["19", "Awning Window", "450", "1650"],
        ["29", "Skylight", "567", "1420"],
      ].flatMap(([m, d, w, h], i) => [line(m, 61, 109 + i * 12, 10), line(d, 173, 109 + i * 12, 10), line(w, 315, 109 + i * 12, 10), line(h, 387, 109 + i * 12, 10)]),
    ];
    const energyDoc = doc({
      discipline: "energy",
      firm: "Sample Energy",
      windows: [
        { mark: "W1", width: 3300, height: 2100 },
        { mark: "W2", width: 1210, height: 2000 },
        { mark: "W4", width: 1700, height: 2100 },
        { mark: "W7", width: 900, height: 900 },
      ],
    });
    const out = await getCheck("energy_windows_match")!.run(context([schedule], { consultantDocs: [energyDoc] }), {});
    expect(out.map((f) => f.message)).toEqual([
      "Window 2 is 910 x 2000 (W x H) here but 1210 x 2000 in Sample Energy's energy assessment.",
      "Window 19 isn't in Sample Energy's energy assessment. It may have been added after the assessment.",
      "Sample Energy's energy assessment includes window W7 (900 x 900), which isn't in the window schedule.",
    ]);
  });
});
