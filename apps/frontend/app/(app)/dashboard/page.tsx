import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseJwtPayload } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { TaskStatus } from '@mini-jira/shared';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? null;
  if (!token) redirect('/login');
  const user = parseJwtPayload(token);
  if (!user) redirect('/login');

  const { items: tasks } = await apiClient.tasks.list(token);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === TaskStatus.Done).length;
  const inProgress = tasks.filter((t) => t.status === TaskStatus.InProgress).length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-gray-600">Welcome back, {user.displayName}!</p>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Tasks', value: total },
          { label: 'In Progress', value: inProgress },
          { label: 'Completed', value: done },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
