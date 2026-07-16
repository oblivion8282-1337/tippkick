'use client';

/**
 * Catch-all für unbehandelte Fehler im (admin)-Segment (z. B. parseDate-Throw,
 * P2002-Konflikt beim parallelen Anlegen). Server-Actions sollten nach Möglichkeit
 * selbst try/catch machen; dieser Boundary ist die zweite Verteidigungslinie.
 */
export default function AdminError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="border-destructive/30 bg-destructive/5 mx-auto mt-12 max-w-md rounded-2xl border p-6 text-center">
      <h2 className="font-display text-xl font-semibold">Aktion fehlgeschlagen</h2>
      <p className="text-muted-foreground mt-2 text-sm">
        Bitte versuche es erneut. Falls der Fehler bleibt, prüfe deine Eingabe oder sag der Tippleitung Bescheid.
      </p>
      {process.env.NODE_ENV !== 'production' && (
        <pre className="bg-muted/40 mt-4 max-h-40 overflow-auto rounded p-3 text-left text-xs">{error.message}</pre>
      )}
      <button
        type="button"
        onClick={reset}
        className="bg-primary text-primary-foreground mt-4 rounded-md px-4 py-2 text-sm font-medium"
      >
        Erneut versuchen
      </button>
    </div>
  );
}
