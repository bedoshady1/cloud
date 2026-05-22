# Task Interactions Design

**Date:** 2026-05-22
**Scope:** Task detail view, delete on card, and comments read/write

---

## Summary

Three features requested by the user:

1. Click a task card to view its details
2. Manager can delete a task directly from the kanban card (hover trash icon)
3. Comments can be written and read on a task (already implemented, exposed via task detail modal)

---

## Current State

- `TaskCard` already accepts an `onClick` prop and calls it — wired through `KanbanColumn` → `KanbanBoard` → `KanbanBoardClient` → opens `TaskDetailModal`
- `TaskDetailModal` already renders `CommentsThread` which handles full comments read/write
- `useDeleteTask` hook exists in `hooks/use-tasks.ts` and `apiClient.tasks.delete` is implemented
- The detail modal click flow works end-to-end; the missing pieces are the delete UI and a drag/click conflict fix

---

## Features

### 1. Task Click → View Detail

**Problem:** `TaskCard` spreads dnd-kit `{...listeners}` on the same element as `onClick`. On pointer devices this works but the events can conflict. Use a drag-distance guard: track `pointerdown` position, and on `pointerup` only fire `onClick` if pointer moved < 5px. This ensures drags don't accidentally open the modal.

**No new components needed.** The modal and comments are already wired.

### 2. Delete Task (Manager only, on card hover)

- `TaskCard` receives two new props: `isManager: boolean` and `token: string`
- When `isManager` is true, render a `Trash2` icon button in the top-right corner of the card
- Button styled with `opacity-0 group-hover:opacity-100 transition-opacity` on a `group`-classed wrapper
- On click: call `window.confirm('Delete this task?')`, then `useDeleteTask(token).mutate(task.taskId)`
- `event.stopPropagation()` on the button click so it does not also open the detail modal
- `useDeleteTask` is already implemented with optimistic invalidation and toast feedback

**Prop threading:**
- `KanbanBoard` derives `isManager = user.role === UserRole.Manager` and passes `isManager` + `token` to `KanbanColumn`
- `KanbanColumn` passes `isManager` + `token` to `TaskCard`

### 3. Comments (Read + Write)

Already fully implemented. `CommentsThread` inside `TaskDetailModal`:
- Fetches comments via `GET /api/tasks/:id/comments`
- Renders each comment with body and timestamp
- Compose box + Send button calls `POST /api/tasks/:id/comments`
- Invalidates query on success, shows toast

**No new work needed.** Feature is complete once task click is confirmed working.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/frontend/components/kanban/task-card.tsx` | Add drag-distance guard; add `isManager` + `token` props; render hover delete button |
| `apps/frontend/components/kanban/kanban-column.tsx` | Thread `isManager` + `token` props to `TaskCard` |
| `apps/frontend/components/kanban/kanban-board.tsx` | Derive `isManager`, pass `isManager` + `token` to `KanbanColumn` |

No new files. No backend changes.

---

## Non-Goals

- Delete confirmation modal (using `window.confirm` is sufficient for a course demo)
- Inline editing of task fields in the modal (status-change dropdown already covers this)
- Pagination of comments (list is small, no pagination needed)
