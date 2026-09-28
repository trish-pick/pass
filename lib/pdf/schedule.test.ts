import { describe, expect, it } from "vitest";

import { line } from "@/lib/testing/fixtures";

import { readSchedules } from "./schedule";

describe("readSchedules", () => {
  it("reads the Mark column under each heading and stops at the next table", () => {
    const lines = [
      line("Window Schedule", 340, 73, 16),
      line("Mark", 103, 96, 9),
      line("Description", 200, 96, 9),
      ...["1", "2", "3", "S1"].map((m, i) => line(m, 93, 115 + i * 11, 9)),
      line("Awning Window", 200, 115, 9),
      line("Door Schedule", 328, 200, 16),
      line("Mark", 119, 225, 9),
      ...["1", "2", "15"].map((m, i) => line(m, 93, 245 + i * 11, 9)),
    ];
    const schedules = readSchedules(lines, ["Window Schedule", "Door Schedule"]);
    expect(schedules.map((s) => [s.heading, s.rows.map((r) => r.mark)])).toEqual([
      ["Window Schedule", ["1", "2", "3", "S1"]],
      ["Door Schedule", ["1", "2", "15"]],
    ]);
  });
});
