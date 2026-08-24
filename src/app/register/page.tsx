import { RegisterForm } from './register-form';

// Server-Wrapper: kennt die Server-Konfiguration (SMTP vorhanden?) und reicht
// sie an das Client-Formular weiter — ohne eigene API-Abfrage.
export default function RegisterPage() {
  const verificationRequired = Boolean(process.env.SMTP_HOST);
  return <RegisterForm verificationRequired={verificationRequired} />;
}
