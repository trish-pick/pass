# Test sets

Put real drawing sets here for local testing. Everything in this folder is git-ignored except this README and the two seeded sets, because real sets can contain client data.

## Seeded sets

`seeded-error-set.pdf` is a fictional six-sheet set with one deliberate mistake per check:
- wrong sheet number
- badly formatted sheet number
- job number mismatch
- wrong revision
- "Author" placeholder
- "TO BE UPDATED"
- broken sheet reference
- misspelling
- missing disclaimer
- missing north point

`seeded-clean-set.pdf` is the same set with no mistakes.

Regenerate both with `npm run seeded-set`. The acceptance test (`lib/testing/seeded-set.test.ts`) audits both with the full pipeline. Every check must catch its mistake, and the clean set must come back with no outstanding items. The missing north point waits for the Phase 2 AI check.

## Auditing a real set

```bash
npm run audit -- "test-sets/My Set.pdf" --stage "Building Documentation" --revision Rev03 --job FS25008 --out out/
```

This writes a correction list, as PDF and CSV, to `out/`.
