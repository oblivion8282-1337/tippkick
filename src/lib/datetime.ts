import { WEEKDAY_LABELS } from '@/lib/constants';

/**
 * Datumsformatierung (SSOT) – einmalig hier, nicht pro Seite dupliziert.
 * Locale de-DE, einheitlich über die App.
 *
 * Zeitzone: alles hier rechnet in Server-Lokalzeit (kein explizites `timeZone`).
 * Das ist korrekt, WEIL der Prozess auf Europe/Berlin festgenagelt ist — `TZ=Europe/Berlin`
 * steht in allen Einstiegspunkten (package.json: dev/build/start/db:seed/sync:results).
 * Wir tippen deutschen Fußball; Anstoßzeiten und Spieltage sind deutsche Ortszeit.
 *
 * ACHTUNG bei neuen Einstiegspunkten (Cron-Sidecar, Docker-CMD, CI): ohne TZ läuft
 * Node in UTC, dann zeigt die App Anstoßzeiten falsch an UND `dateKeyOf` schneidet
 * Abendspiele auf den Vortag.
 */

/**
 * Kalendertag eines Anstoßes als sortierbarer Schlüssel („2026-01-13"), in
 * Server-Lokalzeit. Der Kalendertag — nicht der Wochentag — ist die Identität
 * eines Spieltags innerhalb eines Tipptags: ein Tipptag kann mehrere Wochenenden
 * bündeln (25/26 TT 1: 2. Liga ST 1 + 2) oder Nachholspiele enthalten (TT 17:
 * ein Mittwochsspiel sieben Wochen später). Zwei „Mi" sind dann nicht derselbe Tag.
 */
export function dateKeyOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Wochentags-Index eines Anstoßes (0 = So … 6 = Sa), wie `Date.getDay()`. */
function weekdayOf(date: Date): number {
  return date.getDay();
}

/** Wochentags-Kürzel eines Anstoßes („Fr"). */
export function weekdayLabelOf(date: Date): string {
  return WEEKDAY_LABELS[weekdayOf(date)];
}

export function formatDateTime(date: Date): string {
  return date.toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Wochentag + Uhrzeit („Fr, 20:30") – z. B. für Anstoßzeiten in Listen. */
export function formatWeekdayTime(date: Date): string {
  return date.toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Tag + Monat („31.10.") – kompakte Datumsangabe. */
export function formatDayMonth(date: Date): string {
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
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
