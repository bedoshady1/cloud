'use client';
import { useState } from 'react';
import { Task, CognitoUser } from '@mini-jira/shared';
import { KanbanBoard } from '@/components/kanban/kanban-board';
import { TaskDetailModal } from '@/components/tasks/task-detail-modal';
import { useTasks } from '@/hooks/use-tasks';

interface KanbanBoardClientProps {
  initialTasks: Task[];
  teams: string[];
  user: CognitoUser;
  token: string;
  projectId: string;
}

export function KanbanBoardClient({ initialTasks, teams, user, token, projectId }: KanbanBoardClientProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const { data } = useTasks(token);
  const tasks = (data?.items ?? initialTasks).filter((t) => t.projectId === projectId);

  return (
    <>
      <KanbanBoard tasks={tasks} teams={teams} user={user} token={token} onTaskClick={setSelectedTask} />
      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        user={user}
        token={token}
      />
    </>
  );
}
