import { redirect } from 'next/navigation';

// Neuregistrierung deaktiviert: Zugänge werden von der Tippleitung vorbereitet,
// das Erstpasswort setzt man direkt im Login-Formular.
export default function RegisterPage() {
  redirect('/login');
}
