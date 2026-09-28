/**
 * The check engine interface (brief section 6).
 *
 * Every check is a self-contained module in lib/checks/<check-type>.ts that
 * exports `check: Check`, and is listed in lib/checks/index.ts. Checks never
 * touch the database: the engine gives them a CheckContext and saves the
 * findings they return.
 */

export type Severity = "critical" | "major" | "minor";
export type FindingSource = "rule" | "ai";

/** PDF user-space rectangle on a sheet, in points, origin top-left. */
export type BBox = { x: number; y: number; width: number; height: number };

/** One line of text on a sheet, as extracted from the PDF text layer. */
export type TextBlock = {
  text: string;
  bbox: BBox;
  /** Font size in points, where known. */
  size?: number;
};

export type ParsedSheet = {
  id: string;
  pageIndex: number;
  /** Page size in points. */
  width: number;
  height: number;
  sheetNumber: string | null;
  sheetTitle: string | null;
  sheetType: string | null;
  titleBlock: Record<string, string>;
  /** Where each title block value was found, for pointing findings at it. */
  titleBlockBoxes?: Record<string, BBox>;
  /** Text lines in the order MuPDF extracted them (paragraphs stay together). */
  textBlocks: TextBlock[];
  /** Storage path of the rendered page image, for AI checks. */
  imagePath: string | null;
};

/**
 * A title block field, found by its printed label. The value is the nearest
 * text in the given direction from the label, so the same definition works
 * across title block layouts.
 */
export type TitleBlockField = {
  /** Stable key, e.g. "sheet_number", "revision", "job_number". */
  key: string;
  /** The label as printed, e.g. "DRAWING NO.". Matched ignoring case, spaces and trailing colons. */
  label: string;
  required: boolean;
  /** Where the value sits relative to the label. Defaults to "below". */
  direction?: "below" | "right";
  /** Lines to read for multi-line values such as the project name and address. Defaults to 1. */
  maxLines?: number;
};

export type PracticeConventions = {
  /** Headings that introduce the drawing register, e.g. "Building Drawings". */
  registerHeadings?: string[];
  /** Sheet type keywords: a sheet whose title contains a keyword gets that type. */
  sheetTypes?: Record<string, string[]>;
  /** What a letter before a window or door mark means, e.g. { E: "existing", S: "shed" }. */
  markPrefixes?: Record<string, string>;
  /** Text left in by templates that means a field was never filled in, e.g. "Author". */
  placeholders?: string[];
};

export type PracticeProfile = {
  sheetNumberPattern: string | null;
  titleBlockFields: TitleBlockField[];
  conventions: PracticeConventions;
};

export type StandardNote = {
  code: string;
  text: string;
  required: boolean;
  stageId: string | null;
};

export type CheckContext = {
  project: { name: string; projectNumber: string | null; address: string | null };
  drawingSet: { revision: string; stageId: string; stageName: string };
  sheets: ParsedSheet[];
  profile: PracticeProfile;
  standardNotes: StandardNote[];
  /** Organisation dictionary terms, for the spelling check. */
  dictionary: string[];
};

/** What a check returns. The engine adds audit, checklist item, severity and source. */
export type FindingInput = {
  /** Null for set-level findings (e.g. a missing sheet). */
  sheetId: string | null;
  message: string;
  /** Null for sheet-level findings. */
  bbox: BBox | null;
  /** Overrides the checklist item's severity when a check knows better. */
  severity?: Severity;
};

export type ParamField =
  | { key: string; label: string; kind: "text" | "textarea"; required?: boolean; help?: string }
  | { key: string; label: string; kind: "number"; required?: boolean; help?: string }
  | { key: string; label: string; kind: "boolean"; help?: string }
  | { key: string; label: string; kind: "select"; options: { value: string; label: string }[]; help?: string };

export type Check<P = Record<string, unknown>> = {
  /** Stored in checklist_items.check_type. Never rename once released. */
  type: string;
  label: string;
  description?: string;
  source: FindingSource;
  /**
   * "automatic" (default) checks run in the audit. "reviewer" items are not run:
   * they are listed on the correction list for the reviewer to tick off by eye,
   * e.g. judgement calls, or visual checks until the Phase 2 AI checks arrive.
   */
  mode?: "automatic" | "reviewer";
  /** Settings shown in the checklist item editor. */
  params?: ParamField[];
  run: (ctx: CheckContext, params: P) => Promise<FindingInput[]>;
};
