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
export declare function daysToRetain(now: Date, policy?: RetentionPolicy): Set<string>;
