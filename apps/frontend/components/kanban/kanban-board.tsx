'use client';
import { useState } from 'react';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { Task, TaskStatus, UserRole, CognitoUser, Team } from '@mini-jira/shared';
import { KanbanColumn } from './kanban-column';
import { useUpdateTaskStatus } from '@/hooks/use-tasks';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ALL_STATUSES: TaskStatus[] = [TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.InReview, TaskStatus.Done];

interface KanbanBoardProps {
  tasks: Task[];
  teams: Team[];
  user: CognitoUser;
  token: string;
  onTaskClick: (task: Task) => void;
}

export function KanbanBoard({ tasks, teams, user, token, onTaskClick }: KanbanBoardProps) {
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const updateStatus = useUpdateTaskStatus(token);
  const isManager = user.role === UserRole.Manager;

  const filtered = teamFilter === 'all' ? tasks : tasks.filter((t) => t.teamId === teamFilter);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const newStatus = over.id as TaskStatus;
    if (!ALL_STATUSES.includes(newStatus)) return;
    updateStatus.mutate({ taskId: active.id as string, status: newStatus });
  };

  return (
    <div className="flex flex-col gap-4">
      {user.role === UserRole.Manager && teams.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-600">Filter by team:</span>
          <Select value={teamFilter} onValueChange={(v) => setTeamFilter(v ?? 'all')}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {teams.map((t) => <SelectItem key={t.teamId} value={t.teamId}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {ALL_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              tasks={filtered.filter((t) => t.status === status)}
              onTaskClick={onTaskClick}
              isManager={isManager}
              token={token}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
