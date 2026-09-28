/**
 * Check registry. The checklist editor and the audit engine both read from
 * here, so a check is available everywhere as soon as it is listed.
 *
 * To add a check: create lib/checks/<check-type>.ts exporting `check`, then
 * import it and add it to the list below.
 */
import { check as aiReviewNote } from "./ai-review-note";
import { check as calloutReferences } from "./callout-references";
import { check as coverSheetConsistent } from "./cover-sheet-consistent";
import { check as forbiddenText } from "./forbidden-text";
import { check as manualReview } from "./manual-review";
import { check as requiredTextPresent } from "./required-text-present";
import { check as revisionConsistent } from "./revision-consistent";
import { check as sheetIndexMatch } from "./sheet-index-match";
import { check as sheetNumberFormat } from "./sheet-number-format";
import { check as sheetNumberSequence } from "./sheet-number-sequence";
import { check as spelling } from "./spelling";
import { check as standardNotePresent } from "./standard-note-present";
import { check as titleBlockComplete } from "./title-block-complete";
import { check as titleBlockConsistent } from "./title-block-consistent";
import type { Check } from "./types";
import { check as visualElementPresent } from "./visual-element-present";

const checks: Check[] = [
  sheetNumberFormat,
  sheetNumberSequence,
  sheetIndexMatch,
  titleBlockComplete,
  titleBlockConsistent,
  coverSheetConsistent,
  revisionConsistent,
  calloutReferences,
  standardNotePresent,
  requiredTextPresent,
  forbiddenText,
  spelling,
  // Listed for the reviewer (see Check.mode). The AI ones run from Phase 2.
  visualElementPresent,
  aiReviewNote,
  manualReview,
] as Check[];

export const registry: ReadonlyMap<string, Check> = new Map(checks.map((c) => [c.type, c]));

export function getCheck(type: string): Check | undefined {
  return registry.get(type);
}

export function listChecks(): Check[] {
  return [...registry.values()];
}

export type { Check, CheckContext, FindingInput } from "./types";
