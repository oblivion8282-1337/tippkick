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
