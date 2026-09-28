import type { Check } from "./types";

export const check: Check = {
  type: "manual_review",
  label: "Reviewer check",
  description:
    "Something only the reviewer can judge, such as checking against the planning permit or the engineering. Listed on the correction list with a tick box; PASS doesn't check it.",
  source: "rule",
  mode: "reviewer",
  params: [{ key: "note", label: "Extra guidance (optional)", kind: "textarea" }],
  run: async () => [],
};
