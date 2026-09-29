import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

import { copy } from "@/lib/copy";
import type { Severity } from "@/lib/checks/types";

import type { CorrectionList } from "./correction-list";

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 48;
const INK = rgb(0.13, 0.15, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.85, 0.86, 0.88);
export const SEVERITY_COLOUR: Record<Severity, ReturnType<typeof rgb>> = {
  critical: rgb(0.75, 0.22, 0.17),
  major: rgb(0.8, 0.52, 0.1),
  minor: rgb(0.4, 0.45, 0.55),
};
export const SEVERITY_LABEL: Record<Severity, string> = { critical: "Critical", major: "Major", minor: "Minor" };

/** Standard PDF fonts only cover WinAnsi; swap anything else for a close equivalent. */
export function safe(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2192/g, "->")
    .replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "?");
}

export function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of safe(text).split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function correctionListPdf(list: CorrectionList): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`${list.projectName} correction list`);
  doc.setCreator(copy.product.name);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const width = A4[0] - MARGIN * 2;

  // Cover
  const cover = doc.addPage(A4);
  let y = A4[1] - MARGIN;
  const text = (page: PDFPage, s: string, x: number, yy: number, size: number, font = regular, color = INK) =>
    page.drawText(safe(s), { x, y: yy, size, font, color });

  text(cover, `${copy.product.name}  ${copy.product.fullName}`, MARGIN, y, 10, bold, MUTED);
  y -= 40;
  text(cover, "Correction list", MARGIN, y, 26, bold);
  y -= 34;
  for (const line of wrap(list.projectName, bold, 15, width)) {
    text(cover, line, MARGIN, y, 15, bold);
    y -= 20;
  }
  y -= 8;
  const meta: [string, string][] = [
    ["Job number", list.projectNumber ?? "-"],
    ["Stage", list.stageName],
    ["Revision", list.revision ?? "-"],
    ["Checklist", list.checklistName],
    ["Prepared", list.generatedAt.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })],
  ];
  for (const [k, v] of meta) {
    text(cover, k, MARGIN, y, 10, regular, MUTED);
    text(cover, v, MARGIN + 90, y, 10);
    y -= 16;
  }

  y -= 20;
  if (list.total === 0) {
    text(cover, copy.audit.noOutstandingItems, MARGIN, y, 16, bold);
    y -= 24;
  } else {
    text(cover, `${list.total} outstanding item${list.total === 1 ? "" : "s"}`, MARGIN, y, 16, bold);
    y -= 24;
    let x = MARGIN;
    for (const sev of ["critical", "major", "minor"] as Severity[]) {
      cover.drawRectangle({ x, y: y - 2, width: 8, height: 8, color: SEVERITY_COLOUR[sev] });
      text(cover, `${SEVERITY_LABEL[sev]}: ${list.counts[sev]}`, x + 14, y, 11);
      x += 110;
    }
    y -= 20;
  }
  if (list.reviewerTotal > 0) {
    y -= 6;
    text(cover, `Plus ${list.reviewerTotal} reviewer check${list.reviewerTotal === 1 ? "" : "s"} to tick off by eye`, MARGIN, y, 11, regular, MUTED);
    y -= 20;
  }

  // Disclaimer at the foot of the cover
  const disclaimer = wrap(copy.disclaimer, regular, 9, width - 24);
  const boxHeight = disclaimer.length * 13 + 20;
  cover.drawRectangle({ x: MARGIN, y: MARGIN, width, height: boxHeight, borderColor: RULE, borderWidth: 1 });
  disclaimer.forEach((line, i) => text(cover, line, MARGIN + 12, MARGIN + boxHeight - 20 - i * 13, 9, regular, MUTED));
  text(cover, "Reviewed by: ____________________    Date: ____________", MARGIN, MARGIN + boxHeight + 24, 10, regular, MUTED);

  // Items
  let page = doc.addPage(A4);
  y = A4[1] - MARGIN;
  const ensure = (needed: number) => {
    if (y - needed < MARGIN + 20) {
      page = doc.addPage(A4);
      y = A4[1] - MARGIN;
    }
  };

  if (list.total === 0) {
    text(page, copy.audit.noOutstandingItems, MARGIN, y, 12, bold);
  }

  for (const group of list.groups) {
    ensure(40);
    y -= 6;
    text(page, group.heading, MARGIN, y, 12, bold);
    y -= 8;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.8, color: RULE });
    y -= 16;

    for (const row of group.rows) {
      const message = wrap(row.message + (row.source === "ai" ? ` (${copy.audit.aiFindingLabel})` : ""), regular, 10, width - 110);
      const detail = `${row.location}  ·  ${row.checklistItem}`;
      ensure(message.length * 13 + 22);
      page.drawRectangle({ x: MARGIN, y: y - 2, width: 6, height: 9, color: SEVERITY_COLOUR[row.severity] });
      text(page, `#${row.no}`, MARGIN + 10, y, 9, bold);
      text(page, SEVERITY_LABEL[row.severity], MARGIN + 32, y, 9, bold, SEVERITY_COLOUR[row.severity]);
      text(page, "[  ]", MARGIN + width - 16, y, 9, regular, MUTED);
      message.forEach((line, i) => text(page, line, MARGIN + 90, y - i * 13, 10));
      y -= message.length * 13;
      text(page, detail.replace("·", "-"), MARGIN + 90, y, 8, regular, MUTED);
      y -= 18;
    }
  }

  // Reviewer checks: a tick list, grouped by sheet type
  if (list.reviewerGroups.length > 0) {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
    text(page, "Reviewer checks", MARGIN, y, 16, bold);
    y -= 18;
    for (const line of wrap(
      "PASS doesn't check these automatically. Tick each one off by eye before the set issues. Items marked AI will be checked automatically once the Phase 2 AI checks are added.",
      regular,
      9,
      width,
    )) {
      text(page, line, MARGIN, y, 9, regular, MUTED);
      y -= 12;
    }
    y -= 6;
    for (const group of list.reviewerGroups) {
      ensure(40);
      y -= 6;
      text(page, group.heading, MARGIN, y, 11, bold);
      y -= 7;
      page.drawLine({ start: { x: MARGIN, y }, end: { x: MARGIN + width, y }, thickness: 0.8, color: RULE });
      y -= 14;
      for (const item of group.items) {
        const lines = wrap(item.note ? `${item.label} (${item.note})` : item.label, regular, 9.5, width - 70);
        ensure(lines.length * 12 + 6);
        page.drawRectangle({ x: MARGIN, y: y - 1, width: 8, height: 8, borderColor: MUTED, borderWidth: 0.8 });
        lines.forEach((l, i) => text(page, l, MARGIN + 16, y - i * 12, 9.5));
        if (item.aiLater) text(page, "AI", MARGIN + width - 12, y, 7, bold, MUTED);
        y -= lines.length * 12 + 5;
      }
    }
  }

  // Page numbers and footer
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    text(p, `${list.projectName}  -  correction list`, MARGIN, 24, 8, regular, MUTED);
    const label = `${i + 1} of ${pages.length}`;
    text(p, label, A4[0] - MARGIN - regular.widthOfTextAtSize(label, 8), 24, 8, regular, MUTED);
  });

  return doc.save();
}
