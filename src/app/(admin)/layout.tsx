import { requireAdmin } from '@/lib/session';
import { AppNav } from '@/components/app-nav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  return (
    <div className="min-h-screen">
      <AppNav userName={session.user.name ?? session.user.email} isAdmin />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
