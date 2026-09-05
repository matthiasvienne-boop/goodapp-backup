import { describe, it, expect } from "vitest";
import { daysToRetain } from "../../src/server/retention.js";

describe("daysToRetain", () => {
  it("keeps the default 7 most recent calendar days, including today", () => {
    const now = new Date("2026-09-15T12:00:00Z");
    const retained = daysToRetain(now);
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      expect(retained.has(d.toISOString().slice(0, 10))).toBe(true);
    }
    expect(retained.has("2026-09-07")).toBe(false); // 8 days back
  });

  it("keeps the 4 most recent Sundays", () => {
    // 2026-09-15 is a Tuesday. Sundays before it: 13, 6, 30 aug, 23 aug.
    const now = new Date("2026-09-15T12:00:00Z");
    const retained = daysToRetain(now);
    expect(retained.has("2026-09-13")).toBe(true);
    expect(retained.has("2026-09-06")).toBe(true);
    expect(retained.has("2026-08-30")).toBe(true);
    expect(retained.has("2026-08-23")).toBe(true);
    expect(retained.has("2026-08-16")).toBe(false); // the 5th Sunday back
  });

  it("keeps the 1st of the month for the last 12 months", () => {
    const now = new Date("2026-09-15T12:00:00Z");
    const retained = daysToRetain(now);
    expect(retained.has("2026-09-01")).toBe(true);
    expect(retained.has("2026-01-01")).toBe(true);
    expect(retained.has("2025-10-01")).toBe(true); // 11 months back
    expect(retained.has("2025-09-01")).toBe(false); // 12 months back, outside the window
  });

  it("respects a custom retention policy instead of the defaults", () => {
    // 2026-09-16 is a Wednesday, chosen so the daily and weekly windows don't
    // overlap and confound the assertions below.
    const now = new Date("2026-09-16T12:00:00Z");
    const retained = daysToRetain(now, { dailyDays: 2, weeklySundays: 1, monthlySnapshots: 1 });
    expect(retained.has("2026-09-16")).toBe(true);
    expect(retained.has("2026-09-15")).toBe(true);
    expect(retained.has("2026-09-14")).toBe(false); // would be day 3, outside dailyDays: 2
    expect(retained.has("2026-09-13")).toBe(true); // the most recent Sunday, within weeklySundays: 1
    expect(retained.has("2026-09-01")).toBe(true); // this month's 1st, within monthlySnapshots: 1
    expect(retained.has("2026-08-01")).toBe(false); // outside monthlySnapshots: 1
  });

  it("computes everything relative to the given `now`, not the real clock", () => {
    const a = daysToRetain(new Date("2020-01-01T00:00:00Z"));
    const b = daysToRetain(new Date("2026-09-15T00:00:00Z"));
    expect(a.has("2020-01-01")).toBe(true);
    expect(b.has("2020-01-01")).toBe(false);
  });
});
