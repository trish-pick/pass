import type { Check } from "./types";

/**
 * Phase 2: an AI vision check that a visual element (north point, scale bar,
 * legend, hatching...) is on the sheet. Until it is built, the item is listed
 * for the reviewer to check by eye.
 */
export const check: Check = {
  type: "visual_element_present",
  label: "Visual element is shown",
  description:
    "Checks a sheet shows a visual element such as a north point, scale bar, hatching or line style. Arrives with the Phase 2 AI checks; until then it is listed for the reviewer to check by eye.",
  source: "ai",
  mode: "reviewer",
  params: [{ key: "element", label: "What should be shown", kind: "textarea", required: true }],
  run: async () => [],
};
