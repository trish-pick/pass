import type { CheckContext, ParsedSheet, PracticeProfile, StandardNote, TextBlock } from "@/lib/checks/types";

/** A text line at (x, y). Width is estimated from the text length. */
export function line(text: string, x: number, y: number, size = 6): TextBlock {
  return { text, bbox: { x, y, width: text.length * size * 0.5, height: size }, size };
}

/** A generic practice profile for tests. Not any real practice's settings. */
export const testProfile: PracticeProfile = {
  sheetNumberPattern: "[A-Z]\\d{2,3}[a-z]?",
  titleBlockFields: [
    { key: "sheet_number", label: "DRAWING NO.", required: true },
    { key: "revision", label: "REVISION NO.", required: true },
    { key: "job_number", label: "JOB No:", required: true, direction: "right" },
    { key: "project", label: "PROJECT:", required: true, maxLines: 3 },
    { key: "drawn_by", label: "DRAWN BY:", required: true },
    { key: "date", label: "DATE:", required: true },
  ],
  conventions: {
    registerHeadings: ["Drawing Register"],
    sheetTypes: { cover: ["cover"], elevation: ["elevation"], floor_plan: ["floor plan"] },
    placeholders: ["Author", "Designer", "TO BE UPDATED"],
  },
};

/** Title block lines laid out like a typical A3 sheet's bottom-right block. */
export function titleBlockLines(values: {
  sheetNumber: string;
  revision: string;
  jobNumber: string;
  project?: string[];
  drawnBy?: string;
  date?: string;
}): TextBlock[] {
  const lines = [
    line("JOB No:", 868, 677),
    line(values.jobNumber, 899, 660, 22),
    line("PROJECT:", 868, 736),
    ...(values.project ?? ["Sample Client", "PROPOSED NEW RESIDENCE", "1 Example St"]).map((t, i) =>
      line(t, 868, 745 + i * 11, 10),
    ),
    line("DRAWN BY:", 1091, 692),
    line("DATE:", 1024, 716),
    line("REVISION NO.", 1024, 748),
    line(values.revision, 1024, 753, 22),
    line("DRAWING NO.", 1091, 748),
    line(values.sheetNumber, 1091, 755, 22),
  ];
  if (values.drawnBy) lines.push(line(values.drawnBy, 1091, 701, 10));
  if (values.date) lines.push(line(values.date, 1024, 722, 10));
  return lines;
}


let nextPage = 0;

/** A parsed sheet for check tests. Title block values get boxes at fixed spots so findings can point at them. */
export function sheet(opts: {
  number: string | null;
  title?: string;
  type?: string | null;
  titleBlock?: Record<string, string>;
  text?: string[];
  pageIndex?: number;
}): ParsedSheet {
  const pageIndex = opts.pageIndex ?? nextPage++;
  const titleBlock = { ...(opts.number ? { sheet_number: opts.number } : {}), ...(opts.titleBlock ?? {}) };
  return {
    id: `sheet-${pageIndex}`,
    pageIndex,
    width: 1190,
    height: 842,
    sheetNumber: opts.number,
    sheetTitle: opts.title ?? null,
    sheetType: opts.type ?? null,
    titleBlock,
    titleBlockBoxes: Object.fromEntries(Object.keys(titleBlock).map((k, i) => [k, { x: 1000, y: 700 + i * 10, width: 40, height: 8 }])),
    textBlocks: (opts.text ?? []).map((t, i) => line(t, 40, 40 + i * 12, 8)),
    imagePath: null,
  };
}

export function context(sheets: ParsedSheet[], overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    project: { name: "Sample Project", projectNumber: null, address: null },
    drawingSet: { revision: "Rev01", stageId: "stage-bd", stageName: "Building Documentation" },
    sheets,
    profile: testProfile,
    standardNotes: [] as StandardNote[],
    dictionary: [],
    ...overrides,
  };
}
