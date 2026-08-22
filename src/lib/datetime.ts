import { WEEKDAY_LABELS } from '@/lib/constants';

/**
 * Datumsformatierung (SSOT) – einmalig hier, nicht pro Seite dupliziert.
 * Locale de-DE, Zeitzone explizit Europe/Berlin — unabhängig von der Prozess-TZ.
 * Wir tippen deutschen Fußball; Anstoßzeiten und Spieltage sind deutsche Ortszeit.
 * (Vorher hing alles an TZ=Europe/Berlin pro Einstiegspunkt — ein fehlender
 * Cron-Sidecar-Eintrag hätte Abendspiele auf den Vortag verschoben.)
 */
const TZ = 'Europe/Berlin';

/** Kalenderdatum in Berliner Ortszeit als Teile (für dateKeyOf). */
function berlinParts(date: Date): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  };
}

/**
 * Kalendertag eines Anstoßes als sortierbarer Schlüssel („2026-01-13"), in
 * Server-Lokalzeit. Der Kalendertag — nicht der Wochentag — ist die Identität
 * eines Spieltags innerhalb eines Tipptags: ein Tipptag kann mehrere Wochenenden
 * bündeln (25/26 TT 1: 2. Liga ST 1 + 2) oder Nachholspiele enthalten (TT 17:
 * ein Mittwochsspiel sieben Wochen später). Zwei „Mi" sind dann nicht derselbe Tag.
 */
export function dateKeyOf(date: Date): string {
  const { year, month, day } = berlinParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Wochentags-Index eines Anstoßes (0 = So … 6 = Sa), wie `Date.getDay()`. */
function weekdayOf(date: Date): number {
  return berlinParts(date).weekday;
}

/** Wochentags-Kürzel eines Anstoßes („Fr"). */
export function weekdayLabelOf(date: Date): string {
  return WEEKDAY_LABELS[weekdayOf(date)];
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString('de-DE', {
    timeZone: TZ,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Wochentag + Uhrzeit („Fr, 20:30") – z. B. für Anstoßzeiten in Listen. */
export function formatWeekdayTime(date: Date): string {
  return date.toLocaleString('de-DE', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Tag + Monat („31.10.") – kompakte Datumsangabe. */
export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString('de-DE', { timeZone: TZ, day: '2-digit', month: '2-digit' });
}

export function formatDateRange(start: Date, end: Date): string {
  return `${formatDayMonth(start)} - ${formatDayMonth(end)}`;
}

/** Relative Frist bis zu einer Deadline („in 3 Tagen", „morgen", „in 5 Std"). */
export function formatCountdown(deadline: Date): string {
  const now = new Date();
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) {
    return 'abgelaufen';
  }
  if (ms < 60_000) {
    return `in ${Math.max(1, Math.round(ms / 1000))} Sek`;
  }
  const mins = Math.round(ms / 60_000);
  if (mins < 60) {
    return `in ${mins} Min`;
  }
  const hours = Math.round(mins / 60);
  if (hours < 24) {
    return `in ${hours} Std`;
  }
  const days = Math.round(hours / 24);
  if (days === 1) {
    return 'morgen';
  }
  return `in ${days} Tagen`;
}
