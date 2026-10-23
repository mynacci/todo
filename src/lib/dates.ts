// All dates are YYYY-MM-DD strings; arithmetic is done in UTC to avoid timezone drift.
const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function isValidYMD(s: string): boolean {
  if (!YMD.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function addDays(s: string, days: number): string {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing the given date. */
export function weekStart(s: string): string {
  const dow = new Date(`${s}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(s, -((dow + 6) % 7));
}

export function weekRange(s: string): { startDate: string; endDate: string } {
  const startDate = weekStart(s);
  return { startDate, endDate: addDays(startDate, 6) };
}

/** Today as a local-time YYYY-MM-DD string. */
export function todayLocal(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}
