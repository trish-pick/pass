/**
 * Runs a PASS audit on a PDF from the command line, using a practice's seed
 * data instead of the database.
 *
 *   npm run audit -- <set.pdf> --stage "Building Documentation" --revision Rev03 \
 *     [--job FS25008] [--address "7-9 Leads Ave"] [--name "Hill Gunton"] [--out out/] \
 *     [--consultant engineering.pdf --consultant energy.pdf ...] \
 *     [--seed supabase/seed-data/forme-studio.json]
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { fromSeed, type PracticeSeed } from "@/lib/audit/local";
import { identifyFirm, readConsultantDocument } from "@/lib/consultants/extract";
import type { ConsultantDocument } from "@/lib/consultants/types";
import { copy } from "@/lib/copy";
import { appliesTo, runChecklist } from "@/lib/checks/engine";
import { getCheck } from "@/lib/checks/index";
import { buildCorrectionList, correctionListCsv } from "@/lib/export/correction-list";
import { correctionListPdf } from "@/lib/export/correction-list-pdf";
import { extractPages } from "@/lib/pdf/extract";
import { parseSet } from "@/lib/pdf/parse-set";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    stage: { type: "string", default: "Building Documentation" },
    revision: { type: "string", default: "" },
    job: { type: "string" },
    address: { type: "string" },
    name: { type: "string" },
    out: { type: "string", default: "out" },
    seed: { type: "string", default: "supabase/seed-data/forme-studio.json" },
    consultant: { type: "string", multiple: true, default: [] },
  },
});

const file = positionals[0];
if (!file) {
  console.error("Usage: npm run audit -- <set.pdf> --stage <stage> --revision <rev>");
  process.exit(1);
}

const seed = JSON.parse(fs.readFileSync(values.seed!, "utf8")) as PracticeSeed;
const { stage, checklist, items, standardNotes } = fromSeed(seed, values.stage!);

const pages = extractPages(fs.readFileSync(file), (done, total) => {
  process.stdout.write(`\r${copy.audit.progress(done, total)}   `);
});
process.stdout.write("\n");

const { sheets } = parseSet(pages, seed.profile);

// Consultant documents to compare against, each read with its firm's profile.
const consultantDocs: ConsultantDocument[] = [];
for (const path_ of values.consultant ?? []) {
  const cPages = extractPages(fs.readFileSync(path_));
  const profile = identifyFirm(cPages, seed.consultants ?? []);
  if (!profile) {
    console.error(`No consultant profile recognises ${path_}; skipped. Add the firm to the seed data.`);
    continue;
  }
  const doc = readConsultantDocument(cPages, path.basename(path_), profile, seed.profile);
  consultantDocs.push(doc);
  console.log(`Read ${profile.firm} (${profile.discipline}): ${Object.entries(doc.fields).map(([k, v]) => `${k}=${v}`).join(", ")}`);
}
const project = {
  name: values.name ?? path.basename(file, ".pdf"),
  projectNumber: values.job ?? null,
  address: values.address ?? null,
};
const ctx = {
  project,
  drawingSet: { revision: values.revision!, stageId: stage, stageName: stage },
  sheets,
  profile: seed.profile,
  standardNotes,
  dictionary: seed.dictionary,
  consultantDocs,
};

const started = Date.now();
const { findings, errors } = await runChecklist(ctx, items, getCheck);
for (const e of errors) console.error(`Check ${e.checkType} could not run: ${e.error}`);

// Reviewer items (judgement calls, and visual checks until Phase 2) for the sheet types in this set.
const reviewerItems = items
  .filter((i) => getCheck(i.checkType)?.mode === "reviewer")
  .filter((i) => !i.appliesTo?.length || sheets.some((s) => appliesTo(s.sheetType, i.appliesTo)))
  .map((i) => ({ label: i.label, appliesTo: i.appliesTo, aiLater: getCheck(i.checkType)?.source === "ai" }));

const list = buildCorrectionList({
  projectName: project.name,
  projectNumber: project.projectNumber,
  stageName: stage,
  revision: values.revision || null,
  checklistName: checklist.name,
  generatedAt: new Date(),
  sheets,
  findings,
  itemLabels: new Map(items.map((i) => [i.id, i.label])),
  reviewerItems,
});

fs.mkdirSync(values.out!, { recursive: true });
const base = path.join(values.out!, `${path.basename(file, ".pdf")} correction list`);
fs.writeFileSync(`${base}.csv`, correctionListCsv(list));
fs.writeFileSync(`${base}.pdf`, await correctionListPdf(list));

console.log(`${sheets.length} sheets, ${findings.length} items in ${Date.now() - started} ms`);
for (const group of list.groups) {
  console.log(`\n${group.heading}`);
  for (const row of group.rows) console.log(`  [${row.severity}] ${row.message}  (${row.location})`);
}
console.log(`\n${reviewerItems.length} reviewer checks listed for ticking off by eye.`);
console.log(`\nWrote ${base}.csv and ${base}.pdf`);
