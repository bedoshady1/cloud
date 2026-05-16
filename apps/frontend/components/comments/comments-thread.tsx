'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface CommentsThreadProps {
  taskId: string;
  token: string;
}

export function CommentsThread({ taskId, token }: CommentsThreadProps) {
  const [body, setBody] = useState('');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['comments', taskId],
    queryFn: () => apiClient.comments.list(taskId, token),
  });

  const add = useMutation({
    mutationFn: () => apiClient.comments.create(taskId, body, token),
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey: ['comments', taskId] });
      toast.success('Comment added');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
      {isLoading ? (
        <p className="text-xs text-gray-400">Loading...</p>
      ) : (
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {(data?.items ?? []).map((c) => (
            <div key={c.commentId} className="rounded-lg bg-gray-50 p-3 text-sm">
              <p className="text-gray-900">{c.body}</p>
              <p className="mt-1 text-xs text-gray-400">{new Date(c.createdAt).toLocaleString()}</p>
            </div>
          ))}
          {(data?.items ?? []).length === 0 && <p className="text-xs text-gray-400">No comments yet.</p>}
        </div>
      )}
      <div className="flex gap-2">
        <Textarea
          placeholder="Add a comment..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[60px] text-sm"
        />
        <Button size="sm" onClick={() => add.mutate()} disabled={!body.trim() || add.isPending}>
          Send
        </Button>
      </div>
    </div>
  );
}
