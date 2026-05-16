'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Task, TaskStatus } from '@mini-jira/shared';
import { toast } from 'sonner';

export function useTasks(token: string) {
  return useQuery({
    queryKey: ['tasks', token],
    queryFn: () => apiClient.tasks.list(token),
    enabled: !!token,
  });
}

export function useUpdateTaskStatus(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      apiClient.tasks.update(taskId, { status }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task status updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateTask(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Task>) => apiClient.tasks.create(body, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTask(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => apiClient.tasks.delete(taskId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
