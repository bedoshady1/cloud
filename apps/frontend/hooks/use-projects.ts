'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function useProjects(token: string) {
  return useQuery({
    queryKey: ['projects', token],
    queryFn: () => apiClient.projects.list(token),
    enabled: !!token,
  });
}
