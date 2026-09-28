import dictionaryEnAu from "dictionary-en-au";
import nspell from "nspell";

import { constructionTerms } from "./data/construction-terms";
import type { BBox, Check, FindingInput, ParsedSheet } from "./types";
import { numberParam, sheetLabel, stringListParam } from "./util";

let speller: ReturnType<typeof nspell> | null = null;
function getSpeller() {
  speller ??= nspell(Buffer.from(dictionaryEnAu.aff), Buffer.from(dictionaryEnAu.dic));
  return speller;
}

const WORD = /(?<![A-Za-z0-9'’])[A-Za-z][A-Za-z'’]*[A-Za-z](?![A-Za-z0-9])/g;
const CODE = /(?<![A-Za-z0-9])[A-Z]{2,5}(?![A-Za-z0-9])/g;

export const check: Check = {
  type: "spelling",
  label: "Spelling (Australian English)",
  description:
    "Checks words against an Australian English dictionary, common building terms and the practice's own dictionary. Ignores codes, abbreviations, numbers, and the project's names and address. A misspelling repeated on several sheets is listed once, as it is usually in the title block or a template.",
  source: "rule",
  params: [
    {
      key: "ignore",
      label: "Extra words to ignore (optional)",
      kind: "textarea",
      help: "One per line, for this checklist item only. Add words you use everywhere to the practice dictionary instead.",
    },
    {
      key: "maxPerSheet",
      label: "Most spelling items per sheet",
      kind: "number",
      help: "Keeps the list readable if a sheet has a lot of unusual words. Default 15.",
    },
    {
      key: "repeatThreshold",
      label: "List once when repeated on this many sheets",
      kind: "number",
      help: "Default 3.",
    },
  ],
  run: async (ctx, params) => {
    const spell = getSpeller();
    const maxPerSheet = numberParam(params, "maxPerSheet", 15);
    const repeatThreshold = numberParam(params, "repeatThreshold", 3);

    const ignore = new Set(
      [
        ...constructionTerms,
        ...ctx.dictionary,
        ...(stringListParam(params, "ignore") ?? []),
        ...[ctx.project.name, ctx.project.address ?? ""].flatMap((t) => t.split(/[^A-Za-z']+/)),
      ].map((w) => w.toLowerCase()),
    );
    for (const sheet of ctx.sheets) {
      // Names, addresses and councils in the title blocks are proper nouns, not spelling.
      for (const key of ["project", "local_council", "designed_by", "drawn_by"]) {
        sheet.titleBlock[key]?.split(/[^A-Za-z']+/).forEach((w) => w && ignore.add(w.toLowerCase()));
      }
      // Abbreviations written in capitals anywhere in the set (NCC, BAL) are fine in lower case too.
      for (const line of sheet.textBlocks) for (const m of line.text.matchAll(CODE)) ignore.add(m[0].toLowerCase());
    }

    const verdicts = new Map<string, string[] | null>();
    const misspelt = (word: string): string[] | null => {
      const lower = word.toLowerCase();
      if (verdicts.has(lower)) return verdicts.get(lower)!;
      const ok =
        ignore.has(lower) ||
        ignore.has(lower.replace(/s$/, "")) ||
        spell.correct(word) ||
        spell.correct(lower) ||
        spell.correct(lower.charAt(0).toUpperCase() + lower.slice(1));
      const result = ok ? null : spell.suggest(lower).slice(0, 3);
      verdicts.set(lower, result);
      return result;
    };

    // First pass: where each misspelt word appears.
    const hits = new Map<string, { word: string; suggestions: string[]; places: { sheet: ParsedSheet; bbox: BBox }[] }>();
    for (const sheet of ctx.sheets) {
      const seen = new Set<string>();
      for (const line of sheet.textBlocks) {
        for (const m of line.text.matchAll(WORD)) {
          const word = m[0].replace(/[’']s$/i, "").replace(/’/g, "'");
          if (word.length < 3) continue;
          if (word === word.toUpperCase() && word.length <= 5) continue; // codes such as NCC, BAL, SHS
          if (/^[A-Z]{2,}s$/.test(word)) continue; // plural codes such as WCs
          if (/^rev[A-Za-z0-9]{1,3}$/i.test(word)) continue; // revision codes such as RevB
          if (word.includes("'") && !spell.correct(word)) continue; // abbreviations such as L'Dry, H't
          const lower = word.toLowerCase();
          if (seen.has(lower)) continue;
          const suggestions = misspelt(word);
          if (suggestions === null) continue;
          seen.add(lower);
          const hit = hits.get(lower) ?? { word, suggestions, places: [] };
          hit.places.push({ sheet, bbox: line.bbox });
          hits.set(lower, hit);
        }
      }
    }

    const message = (word: string, suggestions: string[]) =>
      suggestions.length ? `"${word}" may be misspelt. Did you mean "${suggestions.join('", "')}"?` : `"${word}" may be misspelt.`;

    const findings: FindingInput[] = [];
    const perSheet = new Map<ParsedSheet, number>();
    for (const { word, suggestions, places } of hits.values()) {
      if (places.length >= repeatThreshold) {
        const labels = places.map((p) => sheetLabel(p.sheet));
        findings.push({
          sheetId: null,
          message: `${message(word, suggestions)} It appears on ${places.length} sheets (${labels.length > 6 ? `${labels.slice(0, 5).join(", ")} and ${labels.length - 5} more` : labels.join(", ")}), so it's probably in the title block or a template.`,
          bbox: null,
        });
        continue;
      }
      for (const { sheet, bbox } of places) {
        const n = (perSheet.get(sheet) ?? 0) + 1;
        perSheet.set(sheet, n);
        if (n <= maxPerSheet) findings.push({ sheetId: sheet.id, message: message(word, suggestions), bbox });
      }
    }
    for (const [sheet, n] of perSheet) {
      if (n > maxPerSheet) {
        findings.push({
          sheetId: sheet.id,
          message: `${n - maxPerSheet} more possible spelling items on this sheet were not listed.`,
          bbox: null,
        });
      }
    }
    return findings;
  },
};
