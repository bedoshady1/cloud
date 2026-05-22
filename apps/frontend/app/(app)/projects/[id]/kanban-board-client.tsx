'use client';
import { useState } from 'react';
import { Task, CognitoUser, Team, User, UserRole } from '@mini-jira/shared';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { TaskDetailModal } from '@/components/tasks/task-detail-modal';
import { CreateTaskModal } from '@/components/tasks/create-task-modal';
import { useTasks } from '@/hooks/use-tasks';

interface KanbanBoardClientProps {
  initialTasks: Task[];
  teamObjects: Team[];
  users: User[];
  user: CognitoUser;
  token: string;
  projectId: string;
}

export function KanbanBoardClient({ initialTasks, teamObjects, users, user, token, projectId }: KanbanBoardClientProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { data } = useTasks(token);
  const tasks = (data?.items ?? initialTasks).filter((t) => t.projectId === projectId);

  return (
    <>
      {user.role === UserRole.Manager && (
        <div className="flex justify-end">
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + New Task
          </button>
        </div>
      )}
      <KanbanBoard tasks={tasks} teams={teamObjects} user={user} token={token} onTaskClick={setSelectedTask} />
      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        user={user}
        token={token}
      />
      <CreateTaskModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        token={token}
        projectId={projectId}
        teams={teamObjects}
        users={users}
      />
    </>
  );
}
