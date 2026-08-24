import { requireAdmin, getDisplayUser } from '@/lib/session';
import { getCompetitionsAdmin } from '@/lib/admin';
import { AppNav } from '@/components/app-nav';
import { AdminSidebar } from '@/components/admin-sidebar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const user = await getDisplayUser(session.user.id);
  // Wettbewerbe der aktiven Saison fuer die Sidebar-Unterebene.
  const competitions = (await getCompetitionsAdmin()).map((c) => ({
    id: c.id,
    seasonId: c.seasonId,
    label: c.name.split(' (')[0],
    active: c.sourceShortcuts.length > 0,
  }));
  return (
    <div className="min-h-screen">
      <AppNav userName={user.name ?? user.email} userImage={user.image} isAdmin />
      {/* Admin-Inhalt mit Sidebar: Desktop zweispaltig, Mobil Sidebar als
          horizontale Leiste ueber dem Inhalt (siehe AdminSidebar). */}
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div className="-mx-4 flex gap-8 px-4 lg:gap-10">
          <AdminSidebar competitions={competitions} />
          <main className="min-w-0 flex-1 space-y-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
