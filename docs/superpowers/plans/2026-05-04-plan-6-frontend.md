# Frontend (Next.js + Tailwind + shadcn/ui) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full Next.js frontend with a Kanban board (drag-and-drop), task detail modal, comments thread, role-based UI, loading/empty states, and toast notifications.

**Architecture:** Next.js 14 App Router. Server components fetch data directly from the NestJS API using a typed API client from `packages/shared`. Client components use React Query for mutations and optimistic updates. Drag-and-drop via `@dnd-kit/core`. UI primitives from shadcn/ui + Tailwind. Auth tokens read from httpOnly cookies and validated in Next.js middleware.

**Tech Stack:** Next.js 14, React 18, TypeScript, Tailwind CSS, shadcn/ui, `@dnd-kit/core`, `@tanstack/react-query`, `sonner` (toasts), Jest + React Testing Library

**Prerequisite:** Plan 1 (Auth) and Plan 2 (Core CRUD API) must be complete.

---

## File Map

```
apps/frontend/
├── lib/
│   ├── auth.ts                          # (from Plan 1) token helpers
│   └── api-client.ts                    # typed fetch wrapper
├── hooks/
│   ├── use-tasks.ts                     # React Query hooks for tasks
│   └── use-projects.ts
├── components/
│   ├── ui/                              # shadcn/ui primitives (auto-generated)
│   ├── kanban/
│   │   ├── kanban-board.tsx             # 4-column board with dnd-kit
│   │   ├── kanban-column.tsx            # single column + droppable zone
│   │   └── task-card.tsx               # draggable task card
│   ├── tasks/
│   │   ├── task-detail-modal.tsx        # full task view + comments + audit log
│   │   ├── create-task-form.tsx         # manager-only form
│   │   └── task-status-select.tsx       # status dropdown
│   ├── comments/
│   │   └── comments-thread.tsx          # comment list + add comment form
│   ├── layout/
│   │   ├── sidebar.tsx                  # nav sidebar
│   │   └── header.tsx                   # top bar with user info
│   └── shared/
│       ├── loading-skeleton.tsx
│       ├── empty-state.tsx
│       └── toast-provider.tsx
├── app/
│   ├── (auth)/login/page.tsx            # (from Plan 1)
│   ├── (app)/
│   │   ├── layout.tsx                   # app shell with sidebar + header
│   │   ├── dashboard/page.tsx
│   │   ├── projects/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx            # project detail + kanban board
│   │   └── teams/page.tsx               # manager only
│   └── auth/
│       └── callback/page.tsx            # handles Cognito redirect
└── middleware.ts                        # (from Plan 1)
```

---

### Task 1: Install UI Dependencies

- [ ] **Step 1: Install packages**

```bash
cd apps/frontend
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install @tanstack/react-query sonner
npm install class-variance-authority clsx tailwind-merge lucide-react
```

- [ ] **Step 2: Initialize shadcn/ui**

```bash
npx shadcn-ui@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

- [ ] **Step 3: Add required shadcn components**

```bash
npx shadcn-ui@latest add button card dialog badge select textarea input label separator skeleton
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend
git commit -m "chore: install dnd-kit, react-query, shadcn/ui, and sonner"
```

---

### Task 2: API Client

**Files:**
- Create: `apps/frontend/lib/api-client.ts`

- [ ] **Step 1: Create `apps/frontend/lib/api-client.ts`**

```typescript
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
  if (res.status === 204) return undefined as T;
  return res.json();
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
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/lib/api-client.ts
git commit -m "feat: add typed API client wrapper"
```

---

### Task 3: React Query Setup + Hooks

**Files:**
- Create: `apps/frontend/components/shared/query-provider.tsx`
- Create: `apps/frontend/hooks/use-tasks.ts`
- Create: `apps/frontend/hooks/use-projects.ts`

- [ ] **Step 1: Create `apps/frontend/components/shared/query-provider.tsx`**

```typescript
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
```

- [ ] **Step 2: Add QueryProvider and Toaster to root layout**

Edit `apps/frontend/app/layout.tsx`:

```typescript
import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/components/shared/query-provider';
import { Toaster } from 'sonner';

export const metadata: Metadata = { title: 'Mini-Jira', description: 'Team task management' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          {children}
          <Toaster richColors position="top-right" />
        </QueryProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Create `apps/frontend/hooks/use-tasks.ts`**

```typescript
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
```

- [ ] **Step 4: Create `apps/frontend/hooks/use-projects.ts`**

```typescript
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
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/components/shared/query-provider.tsx apps/frontend/hooks apps/frontend/app/layout.tsx
git commit -m "feat: add React Query provider and task/project hooks"
```

---

### Task 4: Layout Shell (Sidebar + Header)

**Files:**
- Create: `apps/frontend/components/layout/sidebar.tsx`
- Create: `apps/frontend/components/layout/header.tsx`
- Create: `apps/frontend/app/(app)/layout.tsx`

- [ ] **Step 1: Create `apps/frontend/components/layout/sidebar.tsx`**

```typescript
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FolderKanban, Users, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UserRole, CognitoUser } from '@mini-jira/shared';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
];

const managerItems = [{ href: '/teams', label: 'Teams', icon: Users }];

export function Sidebar({ user }: { user: CognitoUser }) {
  const pathname = usePathname();
  const items = user.role === UserRole.Manager ? [...navItems, ...managerItems] : navItems;

  return (
    <aside className="flex h-screen w-56 flex-col border-r bg-gray-50 px-3 py-4">
      <div className="mb-6 px-2 text-xl font-bold text-blue-600">Mini-Jira</div>
      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              pathname.startsWith(href) ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100',
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
      <button
        onClick={() => { document.cookie = 'access_token=; Max-Age=0; path=/'; window.location.href = '/login'; }}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-100"
      >
        <LogOut className="h-4 w-4" />
        Sign out
      </button>
    </aside>
  );
}
```

- [ ] **Step 2: Create `apps/frontend/components/layout/header.tsx`**

```typescript
import { CognitoUser } from '@mini-jira/shared';

export function Header({ user }: { user: CognitoUser }) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-white px-6">
      <div />
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white">
          {user.displayName.charAt(0).toUpperCase()}
        </div>
        <div className="text-sm">
          <p className="font-medium">{user.displayName}</p>
          <p className="text-xs text-gray-500">{user.role}</p>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create `apps/frontend/app/(app)/layout.tsx`**

```typescript
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTokenFromCookie, parseJwtPayload } from '@/lib/auth';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = cookies();
  const token = getTokenFromCookie(cookieStore.toString());
  const user = token ? parseJwtPayload(token) : null;
  if (!user) redirect('/login');

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header user={user} />
        <main className="flex-1 overflow-auto bg-gray-50 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/components/layout apps/frontend/app/\(app\)/layout.tsx
git commit -m "feat: add app shell layout with sidebar and header"
```

---

### Task 5: Kanban Board

**Files:**
- Create: `apps/frontend/components/kanban/task-card.tsx`
- Create: `apps/frontend/components/kanban/kanban-column.tsx`
- Create: `apps/frontend/components/kanban/kanban-board.tsx`
- Create: `apps/frontend/components/shared/empty-state.tsx`
- Create: `apps/frontend/components/shared/loading-skeleton.tsx`

- [ ] **Step 1: Create `apps/frontend/components/shared/empty-state.tsx`**

```typescript
export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-gray-400">
      <div className="text-4xl">📭</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/frontend/components/shared/loading-skeleton.tsx`**

```typescript
import { Skeleton } from '@/components/ui/skeleton';

export function KanbanSkeleton() {
  return (
    <div className="flex gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="w-64 space-y-3">
          <Skeleton className="h-6 w-32" />
          {[1, 2].map((j) => <Skeleton key={j} className="h-24 w-full rounded-lg" />)}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/frontend/components/kanban/task-card.tsx`**

```typescript
'use client';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Badge } from '@/components/ui/badge';
import { Task, TaskPriority } from '@mini-jira/shared';
import { CalendarDays } from 'lucide-react';

const priorityColors: Record<TaskPriority, string> = {
  High: 'bg-red-100 text-red-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Low: 'bg-green-100 text-green-700',
};

interface TaskCardProps {
  task: Task;
  onClick: (task: Task) => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.taskId });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      {...attributes}
      {...listeners}
      onClick={() => onClick(task)}
      className="cursor-pointer rounded-lg border bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
    >
      <p className="text-sm font-medium text-gray-900 mb-2 line-clamp-2">{task.title}</p>
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
```

- [ ] **Step 4: Create `apps/frontend/components/kanban/kanban-column.tsx`**

```typescript
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
```

- [ ] **Step 5: Create `apps/frontend/components/kanban/kanban-board.tsx`**

```typescript
'use client';
import { useState } from 'react';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { Task, TaskStatus, UserRole, CognitoUser } from '@mini-jira/shared';
import { KanbanColumn } from './kanban-column';
import { useUpdateTaskStatus } from '@/hooks/use-tasks';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ALL_STATUSES: TaskStatus[] = [TaskStatus.ToDo, TaskStatus.InProgress, TaskStatus.InReview, TaskStatus.Done];

interface KanbanBoardProps {
  tasks: Task[];
  teams: string[];
  user: CognitoUser;
  token: string;
  onTaskClick: (task: Task) => void;
}

export function KanbanBoard({ tasks, teams, user, token, onTaskClick }: KanbanBoardProps) {
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const updateStatus = useUpdateTaskStatus(token);

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
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All teams" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All teams</SelectItem>
              {teams.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
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
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/components/kanban apps/frontend/components/shared
git commit -m "feat: add Kanban board with dnd-kit drag-and-drop and team filter"
```

---

### Task 6: Task Detail Modal + Comments Thread

**Files:**
- Create: `apps/frontend/components/comments/comments-thread.tsx`
- Create: `apps/frontend/components/tasks/task-detail-modal.tsx`

- [ ] **Step 1: Create `apps/frontend/components/comments/comments-thread.tsx`**

```typescript
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
```

- [ ] **Step 2: Create `apps/frontend/components/tasks/task-detail-modal.tsx`**

```typescript
'use client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Task, TaskStatus, UserRole, CognitoUser } from '@mini-jira/shared';
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

export function TaskDetailModal({ task, open, onClose, user, token }: TaskDetailModalProps) {
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
            onValueChange={(v) => updateStatus.mutate({ taskId: task.taskId, status: v as TaskStatus })}
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
                    {new Date(entry.timestamp).toLocaleString()} — {entry.event === 'STATUS_CHANGED' ? `Status changed: ${entry.fromStatus} → ${entry.toStatus}` : entry.event}
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
```

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/components/comments apps/frontend/components/tasks
git commit -m "feat: add task detail modal with comments thread and audit log"
```

---

### Task 7: Projects Page + Kanban Integration

**Files:**
- Modify: `apps/frontend/app/(app)/projects/[id]/page.tsx`
- Create: `apps/frontend/app/(app)/projects/page.tsx`

- [ ] **Step 1: Create `apps/frontend/app/(app)/projects/page.tsx`**

```typescript
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTokenFromCookie, parseJwtPayload } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserRole } from '@mini-jira/shared';

export default async function ProjectsPage() {
  const cookieStore = cookies();
  const token = getTokenFromCookie(cookieStore.toString());
  if (!token) redirect('/login');
  const user = parseJwtPayload(token);
  if (!user) redirect('/login');

  const { items: projects } = await apiClient.projects.list(token);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        {user.role === UserRole.Manager && (
          <Button asChild size="sm">
            <Link href="/projects/new">New Project</Link>
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((p) => (
          <Link key={p.projectId} href={`/projects/${p.projectId}`}>
            <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer">
              <h2 className="font-semibold">{p.title}</h2>
              {p.description && <p className="text-sm text-gray-500 mt-1 line-clamp-2">{p.description}</p>}
              <p className="text-xs text-gray-400 mt-2">{new Date(p.createdAt).toLocaleDateString()}</p>
            </Card>
          </Link>
        ))}
        {projects.length === 0 && <p className="text-gray-400 text-sm">No projects yet.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/frontend/app/(app)/projects/[id]/page.tsx`**

```typescript
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTokenFromCookie, parseJwtPayload } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';
import { KanbanBoardClient } from './kanban-board-client';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies();
  const token = getTokenFromCookie(cookieStore.toString());
  if (!token) redirect('/login');
  const user = parseJwtPayload(token);
  if (!user) redirect('/login');

  const [project, tasksResult, teamsResult] = await Promise.all([
    apiClient.projects.get(params.id, token),
    apiClient.tasks.list(token),
    apiClient.teams.list(token).catch(() => ({ items: [] })),
  ]);

  const tasks = tasksResult.items.filter((t) => t.projectId === params.id);
  const teamNames = teamsResult.items.map((t) => t.teamId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{project.title}</h1>
        {project.description && <p className="text-gray-500 text-sm mt-1">{project.description}</p>}
      </div>
      <KanbanBoardClient initialTasks={tasks} teams={teamNames} user={user} token={token} />
    </div>
  );
}
```

- [ ] **Step 3: Create `apps/frontend/app/(app)/projects/[id]/kanban-board-client.tsx`**

```typescript
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
}

export function KanbanBoardClient({ initialTasks, teams, user, token }: KanbanBoardClientProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const { data } = useTasks(token);
  const tasks = data?.items ?? initialTasks;

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
```

- [ ] **Step 4: Commit**

```bash
git add "apps/frontend/app/(app)/projects"
git commit -m "feat: add projects list page and project detail page with Kanban board"
```

---

### Task 8: Auth Callback Handler

**Files:**
- Create: `apps/frontend/app/auth/callback/page.tsx`

- [ ] **Step 1: Create `apps/frontend/app/auth/callback/page.tsx`**

```typescript
'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    if (accessToken) {
      document.cookie = `access_token=${accessToken}; path=/; SameSite=Lax; Secure`;
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-gray-500">Signing you in...</p>
    </div>
  );
}
```

- [ ] **Step 2: Update dashboard page**

Edit `apps/frontend/app/(app)/dashboard/page.tsx`:

```typescript
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTokenFromCookie, parseJwtPayload } from '@/lib/auth';
import { UserRole } from '@mini-jira/shared';
import { apiClient } from '@/lib/api-client';

export default async function DashboardPage() {
  const cookieStore = cookies();
  const token = getTokenFromCookie(cookieStore.toString());
  if (!token) redirect('/login');
  const user = parseJwtPayload(token);
  if (!user) redirect('/login');

  const { items: tasks } = await apiClient.tasks.list(token);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'Done').length;
  const inProgress = tasks.filter((t) => t.status === 'InProgress').length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="text-gray-600">Welcome back, {user.displayName}!</p>
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Tasks', value: total },
          { label: 'In Progress', value: inProgress },
          { label: 'Completed', value: done },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run the frontend locally and verify end-to-end**

```bash
cd apps/frontend && npm run dev
```

1. Open `http://localhost:3000` → redirected to `/login`
2. Click "Sign in" → Cognito Hosted UI → log in as Ali
3. Redirected back to `/auth/callback` → cookie set → redirected to `/dashboard`
4. Navigate to `/projects` → see projects list
5. Click a project → Kanban board with task cards
6. Drag a task to another column → status updates via API

- [ ] **Step 4: Commit**

```bash
git add "apps/frontend/app/auth" "apps/frontend/app/(app)/dashboard"
git commit -m "feat: add auth callback handler and complete dashboard page"
```
