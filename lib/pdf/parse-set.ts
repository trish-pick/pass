import type { ParsedSheet, PracticeProfile, TextBlock } from "@/lib/checks/types";

import { readRegister, type Register } from "./register";
import { normaliseSheetNumber, normaliseText } from "./text";
import { readTitleBlock } from "./title-block";

export type ExtractedPage = {
  pageIndex: number;
  width: number;
  height: number;
  lines: TextBlock[];
  imagePath?: string | null;
};

export type ParsedSet = {
  sheets: ParsedSheet[];
  register: Register | null;
};

/** Anchored version of the practice's sheet number pattern. */
export function sheetNumberRegExp(profile: PracticeProfile): RegExp {
  const source = profile.sheetNumberPattern ?? "[A-Z]{1,2}\\d{1,4}[a-z]?";
  return new RegExp(`^(?:${source.replace(/^\^|\$$/g, "")})$`);
}

/**
 * Turns extracted pages into sheets: reads each title block, finds the
 * drawing register, and names and types each sheet. Pure, so it can be tested
 * without PDFs.
 */
export function parseSet(pages: ExtractedPage[], profile: PracticeProfile): ParsedSet {
  const pattern = sheetNumberRegExp(profile);
  const headings = profile.conventions.registerHeadings ?? [];

  let register: Register | null = null;
  for (const page of pages) {
    register = readRegister(page.lines, page.pageIndex, headings, pattern);
    if (register && register.entries.length > 0) break;
  }
  const titles = new Map(register?.entries.map((e) => [e.sheetNumber, e.title]) ?? []);

  const sheets = pages.map((page): ParsedSheet => {
    const tb = readTitleBlock(page.lines, profile.titleBlockFields);
    const titleBlock = Object.fromEntries(Object.entries(tb).map(([k, v]) => [k, v.value]));
    const rawNumber = titleBlock.sheet_number ?? null;
    let sheetNumber = rawNumber ? normaliseSheetNumber(rawNumber) : null;
    // The cover sheet often has no title block of its own; name it from the register.
    if (!sheetNumber && register?.pageIndex === page.pageIndex) {
      sheetNumber = register.entries[0]?.sheetNumber ?? null;
    }
    const sheetTitle = titleBlock.sheet_title ?? (sheetNumber ? titles.get(sheetNumber) : undefined) ?? null;

    return {
      id: `page-${page.pageIndex}`,
      pageIndex: page.pageIndex,
      width: page.width,
      height: page.height,
      sheetNumber,
      sheetTitle,
      sheetType: sheetTypeFor(sheetTitle, profile),
      titleBlock,
      textBlocks: page.lines,
      imagePath: page.imagePath ?? null,
    };
  });

  return { sheets, register };
}

export function sheetTypeFor(title: string | null, profile: PracticeProfile): string | null {
  if (!title) return null;
  const t = normaliseText(title);
  for (const [type, keywords] of Object.entries(profile.conventions.sheetTypes ?? {})) {
    if (keywords.some((k) => t.includes(normaliseText(k)))) return type;
  }
  return null;
}
