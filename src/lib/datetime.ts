/**
 * Datumsformatierung (SSOT) – einmalig hier, nicht pro Seite dupliziert.
 * Locale de-DE, einheitlich über die App.
 */

export function formatDateTime(date: Date): string {
  return date.toLocaleString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
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
