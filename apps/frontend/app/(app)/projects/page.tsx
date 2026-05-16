import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseJwtPayload } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { UserRole } from '@mini-jira/shared';
import { cn } from '@/lib/utils';

export default async function ProjectsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? null;
  if (!token) redirect('/login');
  const user = parseJwtPayload(token);
  if (!user) redirect('/login');

  const { items: projects } = await apiClient.projects.list(token);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        {user.role === UserRole.Manager && (
          <Link href="/projects/new" className={cn(buttonVariants({ size: 'sm' }))}>
            New Project
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Link key={p.projectId} href={`/projects/${p.projectId}`}>
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <h2 className="font-semibold">{p.title}</h2>
              {p.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
              <p className="text-xs text-gray-400 mt-2">{new Date(p.createdAt).toLocaleDateString()}</p>
            </Card>
          </Link>
        ))}
        {projects.length === 0 && <p className="text-gray-400 text-sm">No projects yet.</p>}
      </div>
    </div>
  );
}
