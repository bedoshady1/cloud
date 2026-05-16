import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { parseJwtPayload } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { KanbanBoardClient } from './kanban-board-client';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? null;
  if (!token) redirect('/login');
  const user = parseJwtPayload(token);
  if (!user) redirect('/login');

  const [project, tasksResult, teamsResult] = await Promise.all([
    apiClient.projects.get(params.id, token),
    apiClient.tasks.list(token),
    apiClient.teams.list(token).catch(() => ({ items: [] })),
  ]);

  const tasks = tasksResult.items.filter((t) => t.projectId === params.id);
  const teamNames = teamsResult.items.map((t) => t.teamId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{project.title}</h1>
        {project.description && <p className="text-gray-500 text-sm mt-1">{project.description}</p>}
      </div>
      <KanbanBoardClient initialTasks={tasks} teams={teamNames} user={user} token={token} />
    </div>
  );
}
