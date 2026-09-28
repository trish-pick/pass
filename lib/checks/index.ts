/**
 * Check registry. The checklist editor and the audit engine both read from
 * here, so a check is available everywhere as soon as it is listed.
 *
 * To add a check: create lib/checks/<check-type>.ts exporting `check`, then
 * import it and add it to the list below.
 */
import type { Check } from "./types";

// Phase 1 rule checks are added here.
const checks: Check[] = [];

export const registry: ReadonlyMap<string, Check> = new Map(checks.map((c) => [c.type, c]));

export function getCheck(type: string): Check | undefined {
  return registry.get(type);
}

export function listChecks(): Check[] {
  return [...registry.values()];
}

export type { Check, CheckContext, FindingInput } from "./types";
