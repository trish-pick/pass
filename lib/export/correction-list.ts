import type { EngineFinding } from "@/lib/checks/engine";
import type { BBox, ParsedSheet, Severity } from "@/lib/checks/types";

export type CorrectionRow = {
  sheetNumber: string;
  sheetTitle: string;
  severity: Severity;
  message: string;
  location: string;
  checklistItem: string;
  source: "rule" | "ai";
};

export type CorrectionGroup = { heading: string; rows: CorrectionRow[] };

/** A checklist item the reviewer ticks off by eye (see Check.mode). */
export type ReviewerItem = { label: string; appliesTo: string[] | null; note?: string; aiLater?: boolean };
export type ReviewerGroup = { heading: string; items: ReviewerItem[] };

export type CorrectionList = {
  projectName: string;
  projectNumber: string | null;
  stageName: string;
  revision: string | null;
  checklistName: string;
  generatedAt: Date;
  counts: Record<Severity, number>;
  total: number;
  groups: CorrectionGroup[];
  reviewerGroups: ReviewerGroup[];
  reviewerTotal: number;
};

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, major: 1, minor: 2 };

export function buildCorrectionList(input: {
  projectName: string;
  projectNumber: string | null;
  stageName: string;
  revision: string | null;
  checklistName: string;
  generatedAt: Date;
  sheets: ParsedSheet[];
  findings: (EngineFinding & { status?: "open" | "resolved" | "dismissed" })[];
  itemLabels: Map<string, string>;
  reviewerItems?: ReviewerItem[];
}): CorrectionList {
  const open = input.findings.filter((f) => (f.status ?? "open") === "open");
  const sheetById = new Map(input.sheets.map((s) => [s.id, s]));

  const toRow = (f: (typeof open)[number]): CorrectionRow & { y: number } => {
    const sheet = f.sheetId ? sheetById.get(f.sheetId) : undefined;
    return {
      sheetNumber: sheet ? (sheet.sheetNumber ?? `Page ${sheet.pageIndex + 1}`) : "Whole set",
      sheetTitle: sheet?.sheetTitle ?? "",
      severity: f.severity,
      message: f.message,
      location: describeLocation(f.bbox, sheet),
      checklistItem: input.itemLabels.get(f.checklistItemId) ?? f.checkType,
      source: f.source,
      y: f.bbox ? f.bbox.y : -1,
    };
  };

  const bySeverity = (a: { severity: Severity; y: number }, b: { severity: Severity; y: number }) =>
    SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.y - b.y;
  const strip = (row: CorrectionRow & { y: number }): CorrectionRow => {
    const { y, ...rest } = row;
    void y;
    return rest;
  };

  const groups: CorrectionGroup[] = [];
  const setWide = open.filter((f) => !f.sheetId).map(toRow).sort(bySeverity);
  if (setWide.length) groups.push({ heading: "Whole set", rows: setWide.map(strip) });

  for (const sheet of [...input.sheets].sort((a, b) => a.pageIndex - b.pageIndex)) {
    const rows = open.filter((f) => f.sheetId === sheet.id).map(toRow).sort(bySeverity);
    if (!rows.length) continue;
    const name = sheet.sheetNumber ?? `Page ${sheet.pageIndex + 1}`;
    groups.push({ heading: sheet.sheetTitle ? `${name}  ${sheet.sheetTitle}` : name, rows: rows.map(strip) });
  }

  const counts: Record<Severity, number> = { critical: 0, major: 0, minor: 0 };
  for (const f of open) counts[f.severity]++;

  return {
    projectName: input.projectName,
    projectNumber: input.projectNumber,
    stageName: input.stageName,
    revision: input.revision,
    checklistName: input.checklistName,
    generatedAt: input.generatedAt,
    counts,
    total: open.length,
    groups,
    reviewerGroups: groupReviewerItems(input.reviewerItems ?? []),
    reviewerTotal: input.reviewerItems?.length ?? 0,
  };
}

/** Groups reviewer items by the sheet types they apply to, in first-seen order. */
function groupReviewerItems(items: ReviewerItem[]): ReviewerGroup[] {
  const groups = new Map<string, ReviewerItem[]>();
  for (const item of items) {
    const heading = sheetTypeHeading(item.appliesTo);
    groups.set(heading, [...(groups.get(heading) ?? []), item]);
  }
  return [...groups.entries()].map(([heading, list]) => ({ heading, items: list }));
}

/** "site_plan" -> "Site plan"; ["!cover"] -> "Every sheet except the cover". */
export function sheetTypeHeading(appliesTo: string[] | null): string {
  if (!appliesTo || appliesTo.length === 0) return "Whole set";
  const human = (t: string) => t.replace(/_/g, " ");
  const include = appliesTo.filter((t) => !t.startsWith("!")).map(human);
  const exclude = appliesTo.filter((t) => t.startsWith("!")).map((t) => human(t.slice(1)));
  const text = include.length
    ? include.join(", ")
    : `Every sheet except the ${exclude.join(", ")}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A plain description of where on the sheet a finding is, for the drafter. */
export function describeLocation(bbox: BBox | null, sheet: ParsedSheet | undefined): string {
  if (!sheet) return "Whole set";
  if (!bbox) return "Whole sheet";
  for (const [key, box] of Object.entries(sheet.titleBlockBoxes ?? {})) {
    if (Math.abs(box.x - bbox.x) < 1 && Math.abs(box.y - bbox.y) < 1) {
      return `Title block (${key.replace(/_/g, " ")})`;
    }
  }
  const cx = (bbox.x + bbox.width / 2) / sheet.width;
  const cy = (bbox.y + bbox.height / 2) / sheet.height;
  const v = cy < 1 / 3 ? "top" : cy < 2 / 3 ? "middle" : "bottom";
  const h = cx < 1 / 3 ? "left" : cx < 2 / 3 ? "centre" : "right";
  return v === "middle" && h === "centre" ? "Centre of sheet" : `${v[0].toUpperCase()}${v.slice(1)} ${h}`;
}

export function correctionListCsv(list: CorrectionList): string {
  const header = ["Sheet", "Sheet title", "Severity", "Item", "Location", "Checklist item", "Source"];
  const rows = list.groups.flatMap((g) =>
    g.rows.map((r) => [
      r.sheetNumber,
      r.sheetTitle,
      r.severity,
      r.message,
      r.location,
      r.checklistItem,
      r.source === "ai" ? "AI (please verify)" : "Rule",
    ]),
  );
  const reviewer = list.reviewerGroups.flatMap((g) =>
    g.items.map((i) => [g.heading, "", "reviewer check", i.note ? `${i.label} (${i.note})` : i.label, "", "", i.aiLater ? "Reviewer (AI from Phase 2)" : "Reviewer"]),
  );
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header, ...rows, ...reviewer].map((r) => r.map(escape).join(",")).join("\r\n") + "\r\n";
}
