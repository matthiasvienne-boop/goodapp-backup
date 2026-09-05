const DEFAULTS = {
    dailyDays: 7,
    weeklySundays: 4,
    monthlySnapshots: 12,
};
export function daysToRetain(now, policy = {}) {
    const { dailyDays, weeklySundays, monthlySnapshots } = { ...DEFAULTS, ...policy };
    const dayKey = (d) => d.toISOString().slice(0, 10);
    const retained = new Set();
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
