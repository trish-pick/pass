import fs from "node:fs";

import * as mupdf from "mupdf";
import { PDFDocument, StandardFonts, degrees } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { fromSeed, type PracticeSeed } from "@/lib/audit/local";
import { runChecklist } from "@/lib/checks/engine";
import { getCheck } from "@/lib/checks/index";
import { extractPages } from "@/lib/pdf/extract";
import { parseSet } from "@/lib/pdf/parse-set";
import { SEEDED, seededSet } from "@/lib/testing/seeded-set";

import { buildCorrectionList } from "./correction-list";
import { correctionListPdf } from "./correction-list-pdf";
import { markupPdf, viewToPdf } from "./markup-pdf";

describe("viewToPdf", () => {
  it.each([0, 90, 180, 270])("maps MuPDF's view coordinates back to PDF space on a page rotated %i°", async (rotation) => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([400, 200]);
    page.setRotation(degrees(rotation));
    page.drawText("X", { x: 50, y: 30, size: 20, font });
    const bytes = await doc.save();

    const m = mupdf.Document.openDocument(bytes, "application/pdf").loadPage(0);
    const st = JSON.parse(m.toStructuredText("preserve-whitespace").asJSON());
    const b = st.blocks[0].lines[0].bbox;
    const reloaded = (await PDFDocument.load(bytes)).getPage(0);
    const map = viewToPdf(reloaded);
    // The glyph box in view space, mapped back, should contain the PDF point just inside the glyph.
    const corners = [map({ x: b.x, y: b.y }), map({ x: b.x + b.w, y: b.y + b.h })];
    const xs = corners.map((c) => c.x).sort((a, z) => a - z);
    const ys = corners.map((c) => c.y).sort((a, z) => a - z);
    expect(52).toBeGreaterThan(xs[0]);
    expect(52).toBeLessThan(xs[1]);
    expect(33).toBeGreaterThan(ys[0]);
    expect(33).toBeLessThan(ys[1]);
  });
});

describe("markupPdf", () => {
  it("adds the correction list in front and a numbered comment per finding on the drawings", async () => {
    const seed = JSON.parse(fs.readFileSync("supabase/seed-data/forme-studio.json", "utf8")) as PracticeSeed;
    const { stage, items, standardNotes, checklist } = fromSeed(seed, "Building Documentation");
    const original = await seededSet({ errors: true });
    const { sheets } = parseSet(extractPages(original), seed.profile);
    const { findings } = await runChecklist(
      {
        project: { name: "Seeded", projectNumber: SEEDED.jobNumber, address: SEEDED.address },
        drawingSet: { revision: SEEDED.revision, stageId: stage, stageName: stage },
        sheets,
        profile: seed.profile,
        standardNotes,
        dictionary: seed.dictionary,
      },
      items,
      getCheck,
    );
    const list = buildCorrectionList({
      projectName: "Seeded",
      projectNumber: SEEDED.jobNumber,
      stageName: stage,
      revision: SEEDED.revision,
      checklistName: checklist.name,
      generatedAt: new Date(),
      sheets,
      findings,
      itemLabels: new Map(),
    });
    const listPdf = await correctionListPdf(list);
    const out = await markupPdf({ original, sheets, findings, list, correctionListPdf: listPdf });

    const summaryPages = (await PDFDocument.load(listPdf)).getPageCount();
    const doc = mupdf.Document.openDocument(out, "application/pdf");
    expect(doc.countPages()).toBe(summaryPages + sheets.length);

    const onSheets = list.groups.flatMap((g) => g.rows).filter((r) => r.sheetNumber !== "Whole set");
    let comments = 0;
    for (let i = summaryPages; i < doc.countPages(); i++) comments += (doc.loadPage(i) as mupdf.PDFPage).getAnnotations().length;
    expect(comments).toBe(onSheets.length);

    // The job number finding on B03 is clouded where the job number is.
    const job = onSheets.find((r) => r.message.includes("TCP90001"))!;
    const b03 = doc.loadPage(summaryPages + 2).toStructuredText("preserve-whitespace").asText();
    expect(b03).toContain(`#${job.no} Major`);
  });
});
