import type { PracticeProfile } from "@/lib/checks/types";
import type { ExtractedPage } from "@/lib/pdf/parse-set";
import { parseSet } from "@/lib/pdf/parse-set";
import { readTitleBlock } from "@/lib/pdf/title-block";

import { drawingTokens, floorAreas } from "./tokens";

import type { AttachedSheet, ConsultantDocument, ConsultantProfile, PermitCondition } from "./types";

/** Page text in extraction order, lines separated by " | " (what profile patterns are written against). */
export function pageText(page: ExtractedPage): string {
  return page.lines.map((l) => l.text.replace(/\s+/g, " ").trim()).join(" | ");
}

/** Which profile a document belongs to, from its first pages. */
export function identifyFirm(pages: ExtractedPage[], profiles: ConsultantProfile[]): ConsultantProfile | null {
  const text = pages.slice(0, 3).map(pageText).join(" ").toLowerCase();
  return profiles.find((p) => p.match.some((m) => text.includes(m.toLowerCase()))) ?? null;
}

export function readConsultantDocument(
  pages: ExtractedPage[],
  fileName: string,
  profile: ConsultantProfile,
  practice: PracticeProfile,
): ConsultantDocument {
  const texts = pages.map(pageText);
  const fields: Record<string, string> = {};

  for (const rule of profile.fields) {
    const onPages = rule.pages ?? pages.map((_, i) => i);
    for (const i of onPages) {
      const page = pages[i];
      if (!page) continue;
      let value: string | undefined;
      if (rule.label) {
        value = readTitleBlock(page.lines, [
          { key: rule.key, label: rule.label, required: false, direction: rule.direction ?? "right", maxLines: rule.maxLines },
        ])[rule.key]?.value;
      } else if (rule.pattern) {
        value = texts[i].match(new RegExp(rule.pattern, "i"))?.[1];
      }
      if (value?.trim()) {
        fields[rule.key] = value.replace(/\s*\|\s*/g, " ").replace(/\s+/g, " ").trim();
        break;
      }
    }
  }

  const windows = profile.windowPattern
    ? dedupeWindows(
        texts.flatMap((t) =>
          [...t.matchAll(new RegExp(profile.windowPattern!, "gi"))].map((m) => ({
            mark: m.groups!.mark.toUpperCase(),
            width: Number(m.groups!.width),
            height: Number(m.groups!.height),
          })),
        ),
      )
    : [];

  const statuses = profile.statusPattern
    ? // Statuses are read from the cover page, where the issue register sits.
      [...new Set([...(texts[0] ?? "").matchAll(new RegExp(profile.statusPattern!, "gi"))].map((m) => m[0].toUpperCase().trim()))]
    : [];

  return {
    id: fileName,
    fileName,
    firm: profile.firm,
    discipline: profile.discipline,
    fields,
    windows,
    statuses,
    attachedPlans: readAttachedPlans(pages, practice),
    attachedSheets: readAttachedSheets(pages, practice),
    conditions: profile.conditions ? readConditions(pages) : undefined,
  };
}

/** The practice's own sheets inside the document, with the values needed to compare them. */
function readAttachedSheets(pages: ExtractedPage[], practice: PracticeProfile): AttachedSheet[] {
  const { sheets } = parseSet(pages, practice);
  return sheets
    .filter((s) => s.sheetNumber && (s.titleBlock.revision || s.sheetType === "cover"))
    .map((s) => {
      const text = s.textBlocks.map((l) => l.text).join(" ");
      return { sheetNumber: s.sheetNumber!, title: s.sheetTitle, sheetType: s.sheetType, tokens: drawingTokens(text), floorAreas: floorAreas(text) };
    });
}

const CONDITION = /^\s*(\d{1,2})\.\s+([A-Z][A-Z0-9 &/,'()-]{3,}?)\s*$/;
const REPEATED_HEADER = /APPENDIX A|DA Number:|Applicant:|Owner:|Address of Development:|^\s*\d{1,2}\s*$/;

/** Numbered conditions such as "4. STORMWATER" and their text, up to "Permit Notes". */
export function readConditions(pages: ExtractedPage[]): PermitCondition[] {
  const conditions: PermitCondition[] = [];
  let current: PermitCondition | null = null;
  for (const page of pages) {
    for (const line of page.lines) {
      const text = line.text.replace(/\s+/g, " ").trim();
      if (!text || REPEATED_HEADER.test(text)) continue;
      if (/^permit notes/i.test(text)) return conditions;
      const m = text.match(CONDITION);
      if (m) {
        current = { number: m[1], title: m[2].trim(), text: "" };
        conditions.push(current);
      } else if (current) {
        current.text = `${current.text} ${text}`.trim();
      }
    }
  }
  return conditions;
}

/** Reads the practice's own title blocks on any attached sheets and takes the most common values. */
function readAttachedPlans(pages: ExtractedPage[], practice: PracticeProfile): ConsultantDocument["attachedPlans"] {
  const found = pages
    .map((p) => readTitleBlock(p.lines, practice.titleBlockFields))
    .filter((tb) => tb.sheet_number && tb.revision);
  if (found.length === 0) return null;
  const common = (key: string) => {
    const counts = new Map<string, number>();
    for (const tb of found) {
      const v = tb[key]?.value;
      if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };
  return { revision: common("revision"), jobNumber: common("job_number"), date: common("date"), sheets: found.length };
}

function dedupeWindows<T extends { mark: string }>(list: T[]): T[] {
  const seen = new Map<string, T>();
  for (const w of list) if (!seen.has(w.mark)) seen.set(w.mark, w);
  return [...seen.values()];
}
