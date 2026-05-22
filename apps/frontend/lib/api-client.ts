import { Task, Project, Team, User, Comment, AuditLogEntry } from '@mini-jira/shared';

const BASE_URL = typeof window !== 'undefined' ? '/api' : (process.env.BACKEND_URL ?? 'http://localhost:3001') + '/api';

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(error.message ?? `Request failed: ${res.status}`);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text);
}

export const apiClient = {
  tasks: {
    list: (token: string) => request<{ items: Task[] }>('/tasks', {}, token),
    get: (id: string, token: string) => request<Task>(`/tasks/${id}`, {}, token),
    create: (body: Partial<Task>, token: string) => request<Task>('/tasks', { method: 'POST', body: JSON.stringify(body) }, token),
    update: (id: string, body: Partial<Task>, token: string) => request<void>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
    delete: (id: string, token: string) => request<void>(`/tasks/${id}`, { method: 'DELETE' }, token),
    auditLog: (id: string, token: string) => request<{ items: AuditLogEntry[] }>(`/tasks/${id}/audit`, {}, token),
  },
  comments: {
    list: (taskId: string, token: string) => request<{ items: Comment[] }>(`/tasks/${taskId}/comments`, {}, token),
    create: (taskId: string, body: string, token: string) =>
      request<Comment>(`/tasks/${taskId}/comments`, { method: 'POST', body: JSON.stringify({ body }) }, token),
  },
  projects: {
    list: (token: string) => request<{ items: Project[] }>('/projects', {}, token),
    get: (id: string, token: string) => request<Project>(`/projects/${id}`, {}, token),
    create: (body: Partial<Project>, token: string) => request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }, token),
    delete: (id: string, token: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }, token),
  },
  teams: {
    list: (token: string) => request<{ items: Team[] }>('/teams', {}, token),
  },
  users: {
    list: (token: string) => request<{ items: User[] }>('/users', {}, token),
  },
  files: {
    getUploadUrl: (taskId: string, filename: string, token: string) =>
      request<{ uploadUrl: string; key: string }>(`/tasks/${taskId}/image`, { method: 'POST', body: JSON.stringify({ filename }) }, token),
    confirmUpload: (taskId: string, imageKey: string, token: string) =>
      request<{ success: boolean }>(`/tasks/${taskId}/image/confirm`, { method: 'POST', body: JSON.stringify({ imageKey }) }, token),
  },
};
