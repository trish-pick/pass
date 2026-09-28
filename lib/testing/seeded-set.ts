import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Generates a small, entirely fictional A3 drawing set laid out like a Revit
 * title block, for the acceptance test (brief section 11). With `errors`, it
 * carries one known mistake per check; without, it should audit clean.
 */
export const SEEDED = {
  jobNumber: "FS90001",
  revision: "Rev03",
  project: ["J + K Sample", "PROPOSED NEW RESIDENCE", "1 Example Street,", "Launceston"],
  address: "1 Example Street",
};

/** The deliberate mistakes, for the acceptance test to look for. */
export const SEEDED_ERRORS = {
  wrongSheetNumber: "B07", // Sections sheet numbered B07 instead of B05
  badFormat: "B-06", // Roof plan numbered "B-06"
  wrongJobNumber: "TCP90001", // on B03
  wrongRevision: "Rev02", // on B04
  placeholder: "Author", // drawn by on B-06
  draftText: "TO BE UPDATED", // on B04
  brokenCallout: "B12", // "Refer to B12" on B03
  misspelling: "landscapping", // on B02
  missingNoteSheet: "B-06", // no disclaimer
  missingNorthPoint: "B02", // Phase 2 (AI) check
  coverCouncil: "Meander Valley Council", // on the cover, sheets say Launceston
  untaggedWindow: "5", // floor plan tags (w5), which isn't scheduled; window 3 is then untagged
};

type Sheet = {
  number: string;
  title: string;
  body: string[];
  overrides?: Partial<Record<string, string>>;
  noDisclaimer?: boolean;
  northPoint?: boolean;
  schedules?: boolean;
};

const W = 1190.52;
const H = 841.92;

const DISCLAIMER = [
  "All plans, elevations and sections should be read in conjunction with accredited engineering drawings. Structural engineers' certificates may be required certify structural design, wind classifications and/or soil conditions, this work is outside the",
  "scope of this drafting service. The drafter does not accept any responsibility for any errors or omissions in the plans due to wrongly supplied information, nor for misconstruction, interpretation, or on-site variations.",
];
const SCALE_NOTE = ["do not scale off drawings, contact designer if", "you require further clarification. written", "dimensions override scaled dimensions"];
const GENERAL_NOTES = [
  "General notes",
  "Check & verify all dimensions & levels on site",
  "Written dimensions to take preference over scaled",
  "All work to be strictly in accordance with NCC, all codes & local authority by-laws",
  "All dimensions indicated are frame to frame and do not allow for wall linings",
];
const BOUNDARY = [
  "Boundary lines and final position of building works are to be confirmed",
  "on site prior to construction works starting by registered surveyor.",
];

function sheets(errors: boolean): Sheet[] {
  return [
    { number: "B01", title: "Cover Page", body: [] },
    {
      number: "B02",
      title: "Site Plan",
      body: [
        ...BOUNDARY,
        errors ? "Retain all rocks on-site for landscapping." : "Retain all rocks on-site for landscaping.",
        "Proposed New Residence FFL 12.50",
        "Contour interval 0.500m",
        "Concrete driveway, new crossover",
        "Connect to existing sewer and stormwater",
        "Boundary 32.15 m",
        "1 : 200",
      ],
      northPoint: !errors,
    },
    {
      number: "B03",
      title: "Floor Plan",
      body: [
        "Kitchen",
        "Living",
        "Bed 1",
        "Legend: csd Cavity sliding door, s/d Sliding door",
        "(w1)",
        "(w2)",
        errors ? `(w${SEEDED_ERRORS.untaggedWindow})` : "(w3)",
        "(D1)",
        "(D2)",
        errors ? "Refer to B12 for window details." : "Refer to B04 for window details.",
        "1 : 100",
      ],
      overrides: errors ? { job: SEEDED_ERRORS.wrongJobNumber } : {},
    },
    {
      number: "B04",
      title: "Elevations",
      body: ["Northern Elevation", "Colorbond roof cladding", "Floor Plan 10000", ...(errors ? ["TO BE UPDATED"] : []), "1 : 100"],
      schedules: true,
      overrides: errors ? { revision: SEEDED_ERRORS.wrongRevision } : {},
    },
    { number: errors ? SEEDED_ERRORS.wrongSheetNumber : "B05", title: "Sections", body: ["Section A", "Roof pitch 22.5°", "R5.0 ceiling insulation batts", "Refer to engineer's drawings", "1 : 50"] },
    {
      number: errors ? SEEDED_ERRORS.badFormat : "B06",
      title: "Roof Plan",
      body: ["Roof Plan", "Box gutter", "d.p. downpipe", "Eaves 450", "Roof pitch 22.5°", "1 : 100"],
      overrides: errors ? { drawnBy: SEEDED_ERRORS.placeholder } : {},
      noDisclaimer: errors,
    },
  ];
}

export async function seededSet({ errors }: { errors: boolean }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(errors ? "PASS seeded error set" : "PASS seeded clean set");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const all = sheets(errors);

  // Positions are top-left, in points, like the text MuPDF reads back.
  const put = (page: PDFPage, text: string, x: number, top: number, size: number, f: PDFFont = font) =>
    page.drawText(text, { x, y: H - top - size * 0.8, size, font: f });

  all.forEach((s, index) => {
    const page = doc.addPage([W, H]);

    if (index === 0) {
      put(page, "Building Drawings", 963, 171, 14, bold);
      const listed = sheets(false); // the register lists the intended set
      listed.forEach((l, i) => {
        put(page, "B", 969, 195 + i * 11, 8);
        put(page, l.number.slice(1), 976, 195 + i * 11, 8);
        put(page, l.title, 1011, 195 + i * 11, 8);
      });
      GENERAL_NOTES.forEach((t, i) => put(page, t, 60, 120 + i * 10, 7, i === 0 ? bold : font));
      put(page, "PROPOSED NEW RESIDENCE", 98, 300, 24, bold);
      put(page, `for ${SEEDED.project[0]} at ${SEEDED.address}, Launceston`, 98, 330, 14);
      put(page, "Title 123456/1", 98, 350, 14);
      const cover: [string, string, number, number][] = [
        ["LOCAL COUNCIL:", errors ? SEEDED_ERRORS.coverCouncil : "Launceston City Council", 101, 724],
        ["DESIGNED BY:", "Sample Designer", 101, 742],
        ["REVISION NO.", SEEDED.revision, 101, 776],
        ["JOB No:", SEEDED.jobNumber, 101, 792],
        ["BUSHFIRE ATTACK LEVEL (BAL):", "BAL-12.5", 446, 724],
        ["SOIL CLASSIFICATION:", "Class M", 446, 742],
        ["WIND CLASSIFICATION:", "N2", 446, 758],
        ["ENERGY RATING:", "7*", 446, 776],
        ["CLIMATE ZONE:", "7", 446, 793],
      ];
      for (const [label, value, x, top] of cover) {
        put(page, label, x, top, 7);
        put(page, value, x + 122, top - 3, 11);
      }
      return;
    }

    // Body text
    s.body.forEach((t, i) => put(page, t, 120, 120 + i * 14, 9));
    if (s.northPoint) put(page, "N", 814, 729, 20, bold);
    if (s.schedules) {
      const table = (heading: string, top: number, rows: [string, string, string][]) => {
        put(page, heading, 520, top, 12, bold);
        ["Mark", "Description", "Width"].forEach((h, i) => put(page, h, 500 + i * 90, top + 24, 8));
        rows.forEach((r, j) => r.forEach((c, i) => put(page, c, 500 + i * 90, top + 40 + j * 11, 8)));
      };
      table("Window Schedule", 100, [["1", "Awning Window", "1810"], ["2", "Awning Window", "910"], ["3", "Fixed Window", "610"]]);
      table("Door Schedule", 260, [["1", "Front Entry Door", "1200"], ["2", "Cavity Sliding Door", "820"]]);
    }

    // Title block
    const o = s.overrides ?? {};
    put(page, "JOB No:", 868, 677, 5);
    put(page, o.job ?? SEEDED.jobNumber, 899, 662, 16, bold);
    put(page, "LOCAL COUNCIL:", 868, 692, 5);
    put(page, "Launceston City Council", 868, 700, 6);
    put(page, "ACCREDITATION :", 868, 718, 5);
    put(page, "000000000", 927, 718, 6);
    put(page, "PROJECT:", 868, 736, 5);
    SEEDED.project.forEach((t, i) => put(page, t, 868, 745 + i * 11, 8));
    put(page, s.title, 868, 805, 8);
    put(page, "DESIGNED BY:", 1024, 692, 5);
    put(page, "abc", 1024, 701, 8);
    put(page, "DRAWN BY:", 1091, 692, 5);
    put(page, o.drawnBy ?? "abc", 1091, 701, 8);
    put(page, "DATE:", 1024, 716, 5);
    put(page, "28.09.26", 1024, 722, 8);
    put(page, "TITLE:", 1091, 716, 5);
    put(page, "123456/1", 1091, 722, 8);
    put(page, "REVISION NO.", 1024, 748, 5);
    put(page, o.revision ?? SEEDED.revision, 1024, 758, 16, bold);
    put(page, "DRAWING NO.", 1091, 748, 5);
    put(page, s.number, 1091, 758, 16, bold);
    SCALE_NOTE.forEach((t, i) => put(page, t, 1024, 786 + i * 8, 6));
    if (!s.noDisclaimer) DISCLAIMER.forEach((t, i) => put(page, t, 33, 805 + i * 6, 4.5));
  });

  return doc.save();
}
