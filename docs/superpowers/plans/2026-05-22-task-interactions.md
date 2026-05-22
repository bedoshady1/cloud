# Task Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire task click → detail modal, add hover-delete button on task cards (Manager only), and confirm comments read/write works end-to-end.

**Architecture:** All changes are in three existing kanban components. `TaskCard` gets a drag-distance guard (so click and drag don't conflict) plus a hover trash button. `isManager` and `token` are threaded down from `KanbanBoard` → `KanbanColumn` → `TaskCard`. Comments are already fully implemented in `TaskDetailModal` via `CommentsThread` — no new work needed there.

**Tech Stack:** React, TypeScript, dnd-kit/sortable, Lucide icons, `useDeleteTask` hook (already exists in `hooks/use-tasks.ts`)

---

### Task 1: Thread `isManager` and `token` through KanbanBoard → KanbanColumn

**Files:**
- Modify: `apps/frontend/components/kanban/kanban-board.tsx`
- Modify: `apps/frontend/components/kanban/kanban-column.tsx`

- [ ] **Step 1: Update `KanbanColumnProps` to accept `isManager` and `token`**

Open `apps/frontend/components/kanban/kanban-column.tsx`. Change the interface and function signature:

```tsx
interface KanbanColumnProps {
  status: TaskStatus;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  isManager: boolean;
  token: string;
}

export function KanbanColumn({ status, tasks, onTaskClick, isManager, token }: KanbanColumnProps) {
```

Also update the `TaskCard` render call inside `KanbanColumn` (line 41) to pass the new props — you'll fill the actual prop names in Task 2, but add the props now so TypeScript errors guide you:

```tsx
tasks.map((task) => (
  <TaskCard
    key={task.taskId}
    task={task}
    onClick={onTaskClick}
    isManager={isManager}
    token={token}
  />
))
```

- [ ] **Step 2: Update `KanbanBoard` to derive `isManager` and pass it to `KanbanColumn`**

Open `apps/frontend/components/kanban/kanban-board.tsx`. Add `isManager` derivation and pass the two new props to `KanbanColumn`:

```tsx
export function KanbanBoard({ tasks, teams, user, token, onTaskClick }: KanbanBoardProps) {
  const [teamFilter, setTeamFilter] = useState<string>('all');
  const updateStatus = useUpdateTaskStatus(token);
  const isManager = user.role === UserRole.Manager;

  // ... existing filter and handleDragEnd logic unchanged ...

  return (
    <div className="flex flex-col gap-4">
      {/* ... existing team filter select unchanged ... */}
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
```

- [ ] **Step 3: Verify TypeScript compiles**

Run from repo root:
```bash
cd apps/frontend && npx tsc --noEmit
```
Expected: no errors related to `KanbanColumn` or `KanbanBoard` prop types. (There will be errors about `TaskCard` not yet accepting `isManager`/`token` — that's fine, fixed in Task 2.)

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/components/kanban/kanban-board.tsx apps/frontend/components/kanban/kanban-column.tsx
git commit -m "feat: thread isManager and token props through kanban column"
```

---

### Task 2: Add drag-distance guard and hover delete button to TaskCard

**Files:**
- Modify: `apps/frontend/components/kanban/task-card.tsx`

This is the main task. We need to:
1. Add `isManager` and `token` props
2. Add a drag-distance guard so clicking a card doesn't also register as a drag
3. Render a `Trash2` icon button (Manager only) that appears on hover and deletes the task

- [ ] **Step 1: Rewrite `task-card.tsx` with all three changes**

Replace the entire file content with:

```tsx
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
```

Key decisions in this code:
- `onPointerDown`/`onPointerUp` replace the old `onClick` — the card element no longer has a direct `onClick`, preventing dnd-kit listener conflicts
- `pr-5` on the title prevents text overlapping the delete button
- `group` class on the outer div + `group-hover:opacity-100` on the button = CSS-only hover reveal
- `e.stopPropagation()` in `handleDelete` prevents the pointer-up handler from also triggering `onClick`

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd apps/frontend && npx tsc --noEmit
```
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/components/kanban/task-card.tsx
git commit -m "feat: add hover delete button and drag-distance guard to TaskCard"
```

---

### Task 3: Verify end-to-end in the browser

**Files:** none — this is a manual smoke test

- [ ] **Step 1: Start the dev servers**

Terminal 1 (backend):
```bash
cd apps/backend && npm run dev
```

Terminal 2 (frontend):
```bash
cd apps/frontend && npm run dev
```

- [ ] **Step 2: Test task click → detail modal**

1. Open http://localhost:3000, log in
2. Navigate to any project with tasks
3. Click a task card (don't drag — just click)
4. Expected: `TaskDetailModal` opens showing the task title, priority, status dropdown, and a Comments section

- [ ] **Step 3: Test comments**

1. With the modal open, scroll to the Comments section
2. Type a comment in the text area and click Send
3. Expected: comment appears in the list, toast says "Comment added"
4. Close and reopen the modal — comment should still be there

- [ ] **Step 4: Test delete (Manager account)**

1. Log in as a Manager
2. Hover over a task card
3. Expected: red trash icon appears in top-right corner
4. Click the trash icon → confirm dialog appears
5. Click OK → task disappears from the board, toast says "Task deleted"

- [ ] **Step 5: Verify delete is hidden for Employee**

1. Log in as an Employee
2. Hover over any task card
3. Expected: no trash icon visible at all

- [ ] **Step 6: Verify drag still works**

1. As any user, drag a task card from one column to another
2. Expected: task moves to the new column, status updates, no modal opens

- [ ] **Step 7: Commit if any minor tweaks were made during testing**

```bash
git add -p
git commit -m "fix: minor task interaction tweaks from smoke test"
```
(Skip this step if no changes were needed.)
