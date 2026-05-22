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
    refetchInterval: 5000,
  });
}

export function useUpdateTaskStatus(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: TaskStatus }) =>
      apiClient.tasks.update(taskId, { status }, token),
    onMutate: async ({ taskId, status }) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', token] });
      const previous = queryClient.getQueryData<{ items: Task[] }>(['tasks', token]);
      if (previous) {
        queryClient.setQueryData(['tasks', token], {
          items: previous.items.map((t) => t.taskId === taskId ? { ...t, status } : t),
        });
      }
      return { previous };
    },
    onError: (e: Error, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['tasks', token], ctx.previous);
      toast.error(e.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task status updated');
    },
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

export function useUploadTaskImage(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, file }: { taskId: string; file: File }) => {
      const { uploadUrl, key } = await apiClient.files.getUploadUrl(taskId, file.name, token);
      await apiClient.files.uploadToS3(uploadUrl, file);
      await apiClient.files.confirmUpload(taskId, key, token);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Image uploaded');
    },
    onError: (e: Error) => toast.error(`Image upload failed: ${e.message}`),
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
