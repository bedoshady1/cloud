'use client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Task, TaskStatus, CognitoUser } from '@mini-jira/shared';
import { CommentsThread } from '@/components/comments/comments-thread';
import { useUpdateTaskStatus } from '@/hooks/use-tasks';
import { apiClient } from '@/lib/api-client';
import { CalendarDays, Flag } from 'lucide-react';

const STATUS_OPTIONS: TaskStatus[] = [TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.InReview, TaskStatus.Done];
const STATUS_LABELS: Record<TaskStatus, string> = { ToDo: 'To Do', InProgress: 'In Progress', InReview: 'In Review', Done: 'Done' };

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  user: CognitoUser;
  token: string;
}

export function TaskDetailModal({ task, open, onClose, user: _user, token }: TaskDetailModalProps) {
  const updateStatus = useUpdateTaskStatus(token);

  const { data: auditData } = useQuery({
    queryKey: ['audit', task?.taskId],
    queryFn: () => apiClient.tasks.auditLog(task!.taskId, token),
    enabled: !!task,
  });

  if (!task) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{task.title}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-3 flex-wrap">
          <Badge variant="outline" className="flex items-center gap-1">
            <Flag className="h-3 w-3" /> {task.priority}
          </Badge>
          <Badge variant="outline" className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3" /> {new Date(task.deadline).toLocaleDateString()}
          </Badge>
        </div>

        {task.description && <p className="text-sm text-gray-600">{task.description}</p>}

        {task.resizedImageKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://${process.env.NEXT_PUBLIC_S3_RESIZED_BUCKET}.s3.amazonaws.com/${task.resizedImageKey}`}
            alt="Task attachment"
            className="rounded-lg max-h-48 object-contain"
          />
        )}

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">Status:</span>
          <Select
            value={task.status}
            onValueChange={(v) => v && updateStatus.mutate({ taskId: task.taskId, status: v as TaskStatus })}
          >
            <SelectTrigger className="w-40 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <Separator />
        <CommentsThread taskId={task.taskId} token={token} />

        {(auditData?.items ?? []).length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Activity</h4>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {auditData!.items.map((entry, i) => (
                  <p key={i} className="text-xs text-gray-500">
                    {new Date(entry.timestamp).toLocaleString()} —{' '}
                    {entry.event === 'STATUS_CHANGED'
                      ? `Status changed: ${entry.fromStatus} → ${entry.toStatus}`
                      : entry.event}
                  </p>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
