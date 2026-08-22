import { requireUser, getDisplayUser } from '@/lib/session';
import { AppNav } from '@/components/app-nav';
import { ROLE_ADMIN } from '@/lib/constants';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireUser();
  const user = await getDisplayUser(session.user.id);

  return (
    <div className="min-h-screen">
      <AppNav
        userName={user.name ?? user.email}
        userImage={user.image}
        isAdmin={user.role === ROLE_ADMIN}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
