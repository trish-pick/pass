import type { PracticeProfile } from "@/lib/checks/types";
import type { ExtractedPage } from "@/lib/pdf/parse-set";
import { readTitleBlock } from "@/lib/pdf/title-block";

import type { ConsultantDocument, ConsultantProfile } from "./types";

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
        fields[rule.key] = value.replace(/\s+/g, " ").trim();
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
  };
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
