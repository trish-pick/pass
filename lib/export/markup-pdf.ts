import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

import type { EngineFinding } from "@/lib/checks/engine";
import type { BBox, ParsedSheet } from "@/lib/checks/types";

import type { CorrectionList, CorrectionRow } from "./correction-list";
import { SEVERITY_COLOUR, SEVERITY_LABEL, safe, wrap } from "./correction-list-pdf";

const CLOUD_PADDING = 6;
const BUMP = 9;
const LABEL_SIZE = 7;
const PANEL_WIDTH = 300;

type Point = { x: number; y: number };

/**
 * Maps a point from page view space (what MuPDF reports: origin top-left of
 * the displayed page, y down) to PDF user space, for any page rotation.
 */
export function viewToPdf(page: PDFPage) {
  const box = page.getCropBox();
  const rotation = ((page.getRotation().angle % 360) + 360) % 360;
  return ({ x, y }: Point): Point => {
    switch (rotation) {
      case 90:
        return { x: box.x + y, y: box.y + x };
      case 180:
        return { x: box.x + box.width - x, y: box.y + y };
      case 270:
        return { x: box.x + box.width - y, y: box.y + box.height - x };
      default:
        return { x: box.x + x, y: box.y + box.height - y };
    }
  };
}

/** A revision cloud around a rectangle in view space, as an SVG path in PDF space (y negated for drawSvgPath). */
function cloudPath(b: BBox, map: (p: Point) => Point): string {
  const x0 = b.x - CLOUD_PADDING;
  const y0 = b.y - CLOUD_PADDING;
  const x1 = b.x + b.width + CLOUD_PADDING;
  const y1 = b.y + b.height + CLOUD_PADDING;
  const corners: Point[] = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  const svg = (p: Point) => {
    const q = map(p);
    return `${q.x.toFixed(2)} ${(-q.y).toFixed(2)}`;
  };
  let d = `M ${svg(corners[0])}`;
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const c = corners[(i + 1) % 4];
    const length = Math.hypot(c.x - a.x, c.y - a.y);
    const bumps = Math.max(1, Math.round(length / BUMP));
    // Outward normal for a clockwise rectangle in view space (y down).
    const nx = (c.y - a.y) / length;
    const ny = -(c.x - a.x) / length;
    for (let k = 0; k < bumps; k++) {
      const s = { x: a.x + ((c.x - a.x) * k) / bumps, y: a.y + ((c.y - a.y) * k) / bumps };
      const e = { x: a.x + ((c.x - a.x) * (k + 1)) / bumps, y: a.y + ((c.y - a.y) * (k + 1)) / bumps };
      const bulge = (length / bumps) * 0.6;
      const ctrl = { x: (s.x + e.x) / 2 - nx * bulge, y: (s.y + e.y) / 2 - ny * bulge };
      d += ` Q ${svg(ctrl)} ${svg(e)}`;
    }
  }
  return `${d} Z`;
}

/** Adds a comment (sticky note) annotation, so the item shows in Bluebeam's and Acrobat's markup lists. */
function addComment(doc: PDFDocument, page: PDFPage, at: Point, colour: RGB, title: string, contents: string, id: string) {
  const annot = doc.context.obj({
    Type: PDFName.of("Annot"),
    Subtype: PDFName.of("Text"),
    Rect: [at.x, at.y - 14, at.x + 14, at.y],
    Contents: PDFHexString.fromText(contents),
    T: PDFHexString.fromText("PASS"),
    Subj: PDFHexString.fromText(title),
    NM: PDFString.of(id),
    Name: PDFName.of("Comment"),
    C: [colour.red, colour.green, colour.blue],
    F: 4,
    Open: false,
  });
  page.node.addAnnot(doc.context.register(annot));
}

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * A small filled box with lines of text, drawn upright in view space. Kept
 * inside the page and nudged clear of labels already placed on it.
 */
function label(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  map: (p: Point) => Point,
  wanted: Point,
  lines: string[],
  colour: RGB,
  rotation: number,
  pageSize: { width: number; height: number },
  placed: Rect[],
  width?: number,
) {
  const lineHeight = LABEL_SIZE + 2;
  const w = width ?? Math.max(...lines.map((l, i) => (i === 0 ? bold : font).widthOfTextAtSize(safe(l), LABEL_SIZE))) + 8;
  const h = lines.length * lineHeight + 4;
  const at = { x: Math.min(Math.max(4, wanted.x), pageSize.width - w - 4), y: Math.min(Math.max(4, wanted.y), pageSize.height - h - 4) };
  for (let tries = 0; tries < 12 && placed.some((r) => overlaps(r, { x: at.x, y: at.y, w, h })); tries++) {
    at.y = at.y - h - 2 >= 4 ? at.y - h - 2 : at.y + h + 2;
  }
  placed.push({ x: at.x, y: at.y, w, h });

  const origin = map({ x: at.x, y: at.y + h });
  page.drawRectangle({
    x: origin.x,
    y: origin.y,
    width: w,
    height: h,
    color: rgb(1, 1, 1),
    opacity: 0.92,
    borderColor: colour,
    borderWidth: 0.8,
    rotate: degrees(rotation),
  });
  lines.forEach((l, i) => {
    const p = map({ x: at.x + 4, y: at.y + 2 + (i + 1) * lineHeight - 2 });
    page.drawText(safe(l), { x: p.x, y: p.y, size: LABEL_SIZE, font: i === 0 ? bold : font, color: i === 0 ? colour : rgb(0.1, 0.1, 0.12), rotate: degrees(rotation) });
  });
  return at;
}

/**
 * The original drawing set with every finding marked up: a revision cloud
 * and numbered note at each finding's location, sheet-wide findings listed
 * in a panel at the top right of the sheet, and PDF comments so the items
 * appear in Bluebeam/Acrobat markup lists. The correction list is placed in
 * front as the summary (with the disclaimer).
 */
export async function markupPdf(input: {
  original: Uint8Array;
  sheets: ParsedSheet[];
  findings: EngineFinding[];
  list: CorrectionList;
  correctionListPdf: Uint8Array;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input.original, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const sheetById = new Map(input.sheets.map((s) => [s.id, s]));

  const rows: CorrectionRow[] = input.list.groups.flatMap((g) => g.rows);
  const byPage = new Map<number, { row: CorrectionRow; finding: EngineFinding }[]>();
  for (const row of rows) {
    const finding = input.findings[row.findingIndex];
    const sheet = finding?.sheetId ? sheetById.get(finding.sheetId) : undefined;
    if (!sheet) continue;
    byPage.set(sheet.pageIndex, [...(byPage.get(sheet.pageIndex) ?? []), { row, finding }]);
  }

  for (const [pageIndex, items] of byPage) {
    const page = doc.getPage(pageIndex);
    const map = viewToPdf(page);
    const rotation = page.getRotation().angle;
    const sheet = input.sheets.find((s) => s.pageIndex === pageIndex)!;
    const pageSize = { width: sheet.width, height: sheet.height };
    const placed: Rect[] = [];

    // Located findings: cloud, numbered note, comment.
    for (const { row, finding } of items.filter((i) => i.finding.bbox)) {
      const colour = SEVERITY_COLOUR[row.severity];
      const b = finding.bbox!;
      page.drawSvgPath(cloudPath(b, map), { x: 0, y: 0, borderColor: colour, borderWidth: 1.2 });
      const note = `#${row.no} ${SEVERITY_LABEL[row.severity]}`;
      const text = row.message.length > 70 ? `${row.message.slice(0, 67)}...` : row.message;
      const above = { x: b.x - CLOUD_PADDING, y: Math.max(4, b.y - CLOUD_PADDING - 2 * (LABEL_SIZE + 2) - 8) };
      label(page, font, bold, map, above, [note, text], colour, rotation, pageSize, placed);
      addComment(doc, page, map({ x: b.x + b.width + CLOUD_PADDING, y: b.y - CLOUD_PADDING }), colour, note, `#${row.no} [${SEVERITY_LABEL[row.severity]}] ${row.message}`, `PASS-${row.no}`);
    }

    // Sheet-wide findings: a panel at the top right.
    const sheetWide = items.filter((i) => !i.finding.bbox);
    if (sheetWide.length > 0) {
      const lines = [`PASS: ${sheetWide.length} item${sheetWide.length === 1 ? "" : "s"} for this sheet`];
      for (const { row } of sheetWide) {
        wrap(`#${row.no} ${SEVERITY_LABEL[row.severity]}: ${row.message}`, font, LABEL_SIZE, PANEL_WIDTH - 10).forEach((l) => lines.push(l));
      }
      const worst = sheetWide.some((i) => i.row.severity === "critical") ? "critical" : sheetWide.some((i) => i.row.severity === "major") ? "major" : "minor";
      const at = label(page, font, bold, map, { x: sheet.width - PANEL_WIDTH - 16, y: 16 }, lines, SEVERITY_COLOUR[worst], rotation, pageSize, placed, PANEL_WIDTH);
      for (const { row } of sheetWide) {
        addComment(doc, page, map({ x: at.x - 16, y: at.y + 14 }), SEVERITY_COLOUR[row.severity], `#${row.no} ${SEVERITY_LABEL[row.severity]}`, `#${row.no} [${SEVERITY_LABEL[row.severity]}] ${row.message}`, `PASS-${row.no}`);
      }
    }
  }

  // Correction list in front, as the summary.
  const summary = await PDFDocument.load(input.correctionListPdf);
  const copied = await doc.copyPages(summary, summary.getPageIndices());
  copied.forEach((p, i) => doc.insertPage(i, p));

  doc.setTitle(`${input.list.projectName}: marked up`);
  return doc.save();
}
