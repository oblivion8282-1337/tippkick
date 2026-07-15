import { requireUser } from '@/lib/session';
import { AppNav } from '@/components/app-nav';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();

  return (
    <div className="min-h-screen">
      <AppNav userName={session.user.name ?? session.user.email} isAdmin={session.user.role === 'admin'} />
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
