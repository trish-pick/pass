import type { Check, CheckContext, FindingInput, FindingSource, Severity } from "./types";

export type ChecklistItemInput = {
  id: string;
  checkType: string;
  params: Record<string, unknown>;
  severity: Severity;
  /** Sheet types this item applies to. Null or empty means all sheets. */
  appliesTo: string[] | null;
};

export type EngineFinding = FindingInput & {
  checklistItemId: string;
  checkType: string;
  severity: Severity;
  source: FindingSource;
};

export type ItemError = { checklistItemId: string; checkType: string; error: string };

/**
 * Runs checklist items against a parsed set. Pure: no database access.
 * A check that throws, or is missing from the registry, is reported as an
 * item error rather than stopping the audit.
 */
export async function runChecklist(
  ctx: CheckContext,
  items: ChecklistItemInput[],
  lookup: (type: string) => Check | undefined,
  onProgress?: (done: number, total: number) => void,
): Promise<{ findings: EngineFinding[]; errors: ItemError[] }> {
  const findings: EngineFinding[] = [];
  const errors: ItemError[] = [];

  for (const [index, item] of items.entries()) {
    const check = lookup(item.checkType);
    if (!check) {
      errors.push({ checklistItemId: item.id, checkType: item.checkType, error: "Unknown check type" });
    } else {
      const sheets =
        item.appliesTo && item.appliesTo.length > 0
          ? ctx.sheets.filter((s) => s.sheetType && item.appliesTo!.includes(s.sheetType))
          : ctx.sheets;

      try {
        const results = await check.run({ ...ctx, sheets }, item.params);
        for (const r of results) {
          findings.push({
            ...r,
            checklistItemId: item.id,
            checkType: check.type,
            severity: r.severity ?? item.severity,
            source: check.source,
          });
        }
      } catch (err) {
        errors.push({
          checklistItemId: item.id,
          checkType: item.checkType,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    onProgress?.(index + 1, items.length);
  }

  return { findings, errors };
}
