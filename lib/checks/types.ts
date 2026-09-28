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

export type TextBlock = {
  text: string;
  bbox: BBox;
};

export type ParsedSheet = {
  id: string;
  pageIndex: number;
  sheetNumber: string | null;
  sheetTitle: string | null;
  sheetType: string | null;
  titleBlock: Record<string, string>;
  textBlocks: TextBlock[];
  /** Storage path of the rendered page image, for AI checks. */
  imagePath: string | null;
};

export type TitleBlockField = {
  key: string;
  label: string;
  required: boolean;
  /** Expected region on the sheet, as fractions of page width and height. */
  region?: BBox;
};

export type PracticeProfile = {
  sheetNumberPattern: string | null;
  titleBlockFields: TitleBlockField[];
  conventions: Record<string, unknown>;
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
  /** Settings shown in the checklist item editor. */
  params?: ParamField[];
  run: (ctx: CheckContext, params: P) => Promise<FindingInput[]>;
};
