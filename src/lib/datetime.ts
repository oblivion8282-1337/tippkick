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
 * Node in UTC, dann zeigt die App Anstoßzeiten falsch an UND `weekdayOf` bucketet
 * Abendspiele auf den Vortag.
 */

/** Wochentags-Index eines Anstoßes (0 = So … 6 = Sa), wie `Date.getDay()`. */
export function weekdayOf(date: Date): number {
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

export function formatDateRange(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  return `${fmt(start)} - ${fmt(end)}`;
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
