'use client';
import { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Task, TaskPriority } from '@mini-jira/shared';
import { CalendarDays, Trash2 } from 'lucide-react';
import { useDeleteTask } from '@/hooks/use-tasks';

const priorityColors: Record<TaskPriority, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Low: 'bg-green-100 text-green-700',
};

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
  isManager: boolean;
  token: string;
}

export function TaskCard({ task, onClick, isManager, token }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.taskId });
  const deleteTask = useDeleteTask(token);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStart.current) return;
    const dx = e.clientX - pointerStart.current.x;
    const dy = e.clientY - pointerStart.current.y;
    if (Math.sqrt(dx * dx + dy * dy) < 5) {
      onClick(task);
    }
    pointerStart.current = null;
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete task "${task.title}"?`)) {
      deleteTask.mutate(task.taskId);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      className="group relative cursor-pointer rounded-lg border bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
    >
      {isManager && (
        <button
          onClick={handleDelete}
          onPointerDown={(e) => { e.stopPropagation(); pointerStart.current = null; }}
          onPointerUp={(e) => e.stopPropagation()}
          disabled={deleteTask.isPending}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50"
          aria-label="Delete task"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <p className="text-sm font-medium text-gray-900 mb-2 line-clamp-2 pr-5">{task.title}</p>
      <div className="flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityColors[task.priority]}`}>
          {task.priority}
        </span>
        {task.deadline && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <CalendarDays className="h-3 w-3" />
            {new Date(task.deadline).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}
