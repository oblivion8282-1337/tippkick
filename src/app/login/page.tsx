import { LoginForm } from './login-form';

// Server-Wrapper: liest den Redirect-Grund aus der URL — als reine Client-
// Komponente mit useSearchParams wäre die Seite nicht statisch prerenderbar
// (Production-Build schlägt fehl).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  return (
    <LoginForm
      gateMessage={
        reason === 'banned'
          ? 'Dein Konto ist noch nicht freigeschaltet oder wurde gesperrt. Bitte wende dich an die Tippleitung.'
          : null
      }
    />
  );
}
