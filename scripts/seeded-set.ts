/** Writes the seeded error set and its clean twin to test-sets/, for viewing or auditing by hand. */
import fs from "node:fs";

import { seededSet } from "@/lib/testing/seeded-set";

fs.writeFileSync("test-sets/seeded-error-set.pdf", await seededSet({ errors: true }));
fs.writeFileSync("test-sets/seeded-clean-set.pdf", await seededSet({ errors: false }));
console.log("Wrote test-sets/seeded-error-set.pdf and test-sets/seeded-clean-set.pdf");
