import { readSchedules, type Schedule } from "@/lib/pdf/schedule";

import type { BBox, Check, FindingInput, ParsedSheet } from "./types";
import { numberParam, sheetLabel, stringListParam, stringParam } from "./util";

type Kind = { name: "window" | "door"; headings: string[]; tag: RegExp };
type Tag = { key: string; text: string; sheet: ParsedSheet; bbox: BBox };
type Mark = { key: string; mark: string; sheet: ParsedSheet; bbox: BBox };

/** Marks compare without letters for numeric schedules: tag (w13) matches mark 13 or W13. */
const markKey = (mark: string) => mark.toLowerCase().replace(/^(w|d)(?=\d)/, "");

export const check: Check = {
  type: "schedule_tags_match",
  label: "Window and door tags match the schedules",
  description:
    "Every window and door tag on the drawings (e.g. (w13), (D10)) is in the window or door schedule, every scheduled window and door is tagged somewhere, and schedule numbering has no duplicates or gaps.",
  source: "rule",
  params: [
    { key: "windowHeadings", label: "Window schedule headings", kind: "textarea", help: "One per line. Default: Window Schedule." },
    { key: "doorHeadings", label: "Door schedule headings", kind: "textarea", help: "One per line. Default: Door Schedule." },
    {
      key: "windowTagPattern",
      label: "Window tag pattern (advanced)",
      kind: "text",
      help: "A regular expression whose first group is the mark. Default matches (w13) and (wS1).",
    },
    {
      key: "doorTagPattern",
      label: "Door tag pattern (advanced)",
      kind: "text",
      help: "A regular expression whose first group is the mark. Default matches (D10) and (DS1).",
    },
    { key: "maxGap", label: "Largest numbering gap to report", kind: "number", help: "Default 3." },
  ],
  run: async (ctx, params) => {
    const kinds: Kind[] = [
      {
        name: "window",
        headings: stringListParam(params, "windowHeadings") ?? ["Window Schedule"],
        tag: new RegExp(stringParam(params, "windowTagPattern", "\\(\\s*[wW]\\s?([A-Za-z]?\\d{1,3}[a-z]?)\\s*\\)"), "g"),
      },
      {
        name: "door",
        headings: stringListParam(params, "doorHeadings") ?? ["Door Schedule"],
        tag: new RegExp(stringParam(params, "doorTagPattern", "\\(\\s*[dD]\\s?([A-Za-z]?\\d{1,3}[a-z]?)\\s*\\)"), "g"),
      },
    ];
    const maxGap = numberParam(params, "maxGap", 3);
    const prefixes = Object.fromEntries(
      Object.entries(ctx.profile.conventions.markPrefixes ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
    /** "Existing window E2", "Shed door S1", "Window 4". */
    const named = (kind: Kind["name"], mark: string) => {
      const meaning = prefixes[mark.match(/^[A-Za-z]+/)?.[0].toLowerCase() ?? ""];
      return meaning ? cap(`${meaning} ${kind} ${mark}`) : `${cap(kind)} ${mark}`;
    };
    const findings: FindingInput[] = [];

    for (const kind of kinds) {
      const schedules: { sheet: ParsedSheet; schedule: Schedule }[] = ctx.sheets.flatMap((sheet) =>
        readSchedules(sheet.textBlocks, kind.headings).map((schedule) => ({ sheet, schedule })),
      );
      const scheduleSheets = new Set(schedules.map((s) => s.sheet));

      const tags: Tag[] = [];
      for (const sheet of ctx.sheets) {
        if (scheduleSheets.has(sheet)) continue;
        for (const line of sheet.textBlocks) {
          for (const m of line.text.matchAll(kind.tag)) tags.push({ key: markKey(m[1]), text: m[0], sheet, bbox: line.bbox });
        }
      }

      if (schedules.length === 0) {
        if (tags.length > 0) {
          findings.push({
            sheetId: null,
            message: `${cap(kind.name)} tags are shown (e.g. ${tags[0].text} on ${sheetLabel(tags[0].sheet)}) but no ${kind.name} schedule was found.`,
            bbox: null,
          });
        }
        continue;
      }

      const marks: Mark[] = schedules.flatMap(({ sheet, schedule }) =>
        schedule.rows.map((r) => ({ key: markKey(r.mark), mark: r.mark, sheet, bbox: r.bbox })),
      );
      const scheduled = new Map<string, Mark>();
      for (const m of marks) {
        if (scheduled.has(m.key)) {
          findings.push({
            sheetId: m.sheet.id,
            message: `${named(kind.name, m.mark)} appears twice in the ${kind.name} schedule.`,
            bbox: m.bbox,
          });
        } else scheduled.set(m.key, m);
      }

      // Tags with no schedule entry: one item per tag per sheet.
      const reported = new Set<string>();
      for (const t of tags) {
        const id = `${t.sheet.id}:${t.key}`;
        if (scheduled.has(t.key) || reported.has(id)) continue;
        reported.add(id);
        findings.push({
          sheetId: t.sheet.id,
          message: `${named(kind.name, t.key.toUpperCase())} (tag ${t.text}) isn't in the ${kind.name} schedule.`,
          bbox: t.bbox,
        });
      }

      // Scheduled but never tagged.
      const tagged = new Set(tags.map((t) => t.key));
      for (const m of scheduled.values()) {
        if (!tagged.has(m.key)) {
          findings.push({
            sheetId: m.sheet.id,
            message: `${named(kind.name, m.mark)} is in the schedule but isn't tagged on any plan or elevation.`,
            bbox: m.bbox,
          });
        }
      }

      // Small gaps in the numbering of each series (1, 2, 3... and E1, E2... separately).
      const series = new Map<string, number[]>();
      for (const m of scheduled.values()) {
        const parts = m.mark.match(/^([A-Za-z]*)(\d+)$/);
        if (!parts) continue;
        const prefix = parts[1].toUpperCase();
        series.set(prefix, [...(series.get(prefix) ?? []), Number(parts[2])]);
      }
      for (const [prefix, list] of series) {
        const numbers = [...new Set(list)].sort((a, b) => a - b);
        for (let i = 1; i < numbers.length; i++) {
          const missing = numbers[i] - numbers[i - 1] - 1;
          if (missing >= 1 && missing <= maxGap) {
            const gap = Array.from({ length: missing }, (_, k) => `${prefix}${numbers[i - 1] + k + 1}`);
            const label = prefix ? named(kind.name, prefix).replace(new RegExp(`\\s${prefix}$`), "") : cap(kind.name);
            findings.push({
              sheetId: schedules[0].sheet.id,
              message: `${label} numbering skips ${gap.join(", ")} (goes from ${prefix}${numbers[i - 1]} to ${prefix}${numbers[i]}).`,
              bbox: schedules[0].schedule.bbox,
              severity: "minor",
            });
          }
        }
      }
    }
    return findings;
  },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
