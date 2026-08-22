import { requireAdmin, getDisplayUser } from '@/lib/session';
import { AppNav } from '@/components/app-nav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const user = await getDisplayUser(session.user.id);
  return (
    <div className="min-h-screen">
      <AppNav userName={user.name ?? user.email} userImage={user.image} isAdmin />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
