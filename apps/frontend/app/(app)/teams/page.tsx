import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseJwtPayload } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { UserRole } from '@mini-jira/shared';

export default async function TeamsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('id_token')?.value ?? null;
  if (!token) redirect('/login');
  const user = parseJwtPayload(token);
  if (!user || user.role !== UserRole.Manager) redirect('/dashboard');

  const [{ items: teams }, { items: users }] = await Promise.all([
    apiClient.teams.list(token),
    apiClient.users.list(token),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Teams</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map((team) => {
          const members = users.filter((u) => u.teamId === team.teamId);
          return (
            <div key={team.teamId} className="rounded-xl border bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">{team.name}</h2>
              <p className="text-xs text-gray-400 mt-1 mb-3">{team.teamId}</p>
              <p className="text-sm font-medium text-gray-600 mb-2">Members ({members.length})</p>
              <ul className="space-y-1">
                {members.map((u) => (
                  <li key={u.userId} className="text-sm text-gray-700 flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                      {(u.email ?? '?').charAt(0).toUpperCase()}
                    </span>
                    {u.email}
                  </li>
                ))}
                {members.length === 0 && <li className="text-sm text-gray-400">No members</li>}
              </ul>
            </div>
          );
        })}
        {teams.length === 0 && <p className="text-gray-400 text-sm">No teams yet.</p>}
      </div>
    </div>
  );
}
