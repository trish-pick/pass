import type { Check } from "./types";

/**
 * Phase 2: an open AI review prompt per checklist item. Until it is built,
 * the item is listed for the reviewer to check by eye.
 */
export const check: Check = {
  type: "ai_review_note",
  label: "AI review (open question)",
  description:
    "An open question for the AI to review on each applicable sheet, e.g. \"Are smoke alarms shown near every bedroom?\". Arrives with the Phase 2 AI checks; until then it is listed for the reviewer to check by eye.",
  source: "ai",
  mode: "reviewer",
  params: [{ key: "prompt", label: "Question to review", kind: "textarea", required: true }],
  run: async () => [],
};
