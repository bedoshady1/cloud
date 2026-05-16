'use client';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Task, TaskStatus } from '@mini-jira/shared';
import { TaskCard } from './task-card';
import { EmptyState } from '@/components/shared/empty-state';

const columnLabels: Record<TaskStatus, string> = {
  ToDo: 'To Do',
  InProgress: 'In Progress',
  InReview: 'In Review',
  Done: 'Done',
};

const columnColors: Record<TaskStatus, string> = {
  ToDo: 'border-t-gray-400',
  InProgress: 'border-t-blue-500',
  InReview: 'border-t-yellow-500',
  Done: 'border-t-green-500',
};

interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function KanbanColumn({ status, tasks, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({ id: status });

  return (
    <div className={`flex w-64 flex-shrink-0 flex-col rounded-lg border border-t-4 bg-gray-50 ${columnColors[status]}`}>
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-semibold text-gray-700">{columnLabels[status]}</h3>
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium">{tasks.length}</span>
      </div>
      <SortableContext items={tasks.map((t) => t.taskId)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="flex flex-1 flex-col gap-2 p-2 min-h-[120px]">
          {tasks.length === 0
            ? <EmptyState message="No tasks" />
            : tasks.map((task) => <TaskCard key={task.taskId} task={task} onClick={onTaskClick} />)
          }
        </div>
      </SortableContext>
    </div>
  );
}
