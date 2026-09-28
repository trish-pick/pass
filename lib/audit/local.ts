import type { ChecklistItemInput } from "@/lib/checks/engine";
import type { CheckContext, PracticeProfile, Severity, StandardNote } from "@/lib/checks/types";

/**
 * The shape of supabase/seed-data/<practice>.json: a practice's profile,
 * notes, dictionary and checklists, keyed by stage name. Used to seed the
 * database and to run audits locally before the database exists.
 */
export type PracticeSeed = {
  organisation: { name: string; slug: string };
  stages: string[];
  profile: PracticeProfile;
  standardNotes: { code: string; stage: string | null; required: boolean; text: string }[];
  dictionary: string[];
  checklists: {
    stage: string;
    name: string;
    items: { label: string; check_type: string; severity: Severity; params: Record<string, unknown>; applies_to?: string[] }[];
  }[];
};

export type LocalChecklistItem = ChecklistItemInput & { label: string };

/** Builds what the engine needs from seed data, using stage names as stage ids. */
export function fromSeed(seed: PracticeSeed, stageName: string) {
  const stage = seed.stages.find((s) => s.toLowerCase() === stageName.toLowerCase());
  if (!stage) throw new Error(`Unknown stage "${stageName}". Stages: ${seed.stages.join(", ")}`);
  const checklist = seed.checklists.find((c) => c.stage === stage);
  if (!checklist) throw new Error(`No checklist for stage "${stage}".`);

  const standardNotes: StandardNote[] = seed.standardNotes.map((n) => ({
    code: n.code,
    text: n.text,
    required: n.required,
    stageId: n.stage,
  }));
  const items: LocalChecklistItem[] = checklist.items.map((it, i) => ({
    id: `item-${i + 1}`,
    label: it.label,
    checkType: it.check_type,
    params: it.params,
    severity: it.severity,
    appliesTo: it.applies_to ?? null,
  }));

  return { stage, checklist, items, standardNotes };
}

export type ContextBase = Omit<CheckContext, "sheets">;
