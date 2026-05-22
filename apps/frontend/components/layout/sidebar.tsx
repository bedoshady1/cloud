'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderKanban, Users, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserRole, type CognitoUser } from '@mini-jira/shared';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
];

const managerItems = [{ href: '/teams', label: 'Teams', icon: Users }];

export function Sidebar({ user }: { user: CognitoUser }) {
  const pathname = usePathname();
  const items = user.role === UserRole.Manager ? [...navItems, ...managerItems] : navItems;

  const handleSignOut = () => {
    document.cookie = 'access_token=; Max-Age=0; path=/';
    document.cookie = 'id_token=; Max-Age=0; path=/';
    const cognitoDomain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN!;
    const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID!;
    const logoutUri = encodeURIComponent(`${process.env.NEXT_PUBLIC_APP_URL}/login`);
    window.location.href = `${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${logoutUri}`;
  };

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-gray-50 px-3 py-4">
      <div className="mb-6 px-2 text-xl font-bold text-blue-600">Mini-Jira</div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith(href)
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <button
        onClick={handleSignOut}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </aside>
  );
}
