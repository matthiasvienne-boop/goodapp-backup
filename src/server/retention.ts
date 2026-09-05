/**
 * Grandfather-father-son retention: which calendar days (as "YYYY-MM-DD", in
 * UTC) a backup taken on that day is allowed to survive on.
 *
 * Calculated from calendar dates, not "N days ago" — the latter drifts a
 * Sunday or a month's first day relative to the actual calendar every time it
 * runs, which would silently change which backups survive from one run to
 * the next.
 *
 * Extracted verbatim from Newbuild's original implementation (PLAT-102) —
 * the only change is that the policy's three numbers are now parameters
 * instead of hardcoded, since a second consumer may reasonably want a
 * different retention window.
 */
export interface RetentionPolicy {
  /** How many of the most recent calendar days (including today) to keep. Default 7. */
  dailyDays?: number;
  /** How many of the most recent Sundays to keep. Default 4. */
  weeklySundays?: number;
  /** How many of the most recent months' first-of-month snapshots to keep. Default 12. */
  monthlySnapshots?: number;
}

const DEFAULTS: Required<RetentionPolicy> = {
  dailyDays: 7,
  weeklySundays: 4,
  monthlySnapshots: 12,
};

export function daysToRetain(now: Date, policy: RetentionPolicy = {}): Set<string> {
  const { dailyDays, weeklySundays, monthlySnapshots } = { ...DEFAULTS, ...policy };
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const retained = new Set<string>();

  for (let i = 0; i < dailyDays; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    retained.add(dayKey(d));
  }

  for (let i = 0, found = 0; found < weeklySundays && i < 60; i++) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    if (d.getUTCDay() === 0) {
      retained.add(dayKey(d));
      found++;
    }
  }

  for (let i = 0; i < monthlySnapshots; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    retained.add(dayKey(d));
  }

  return retained;
}
