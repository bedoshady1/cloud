'use client';
import { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Task, TaskPriority, TaskStatus, Team, User } from '@mini-jira/shared';
import { useCreateTask, useUploadTaskImage } from '@/hooks/use-tasks';

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  token: string;
  projectId: string;
  teams: Team[];
  users: User[];
}

const selectClass = 'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';

export function CreateTaskModal({ open, onClose, token, projectId, teams, users }: CreateTaskModalProps) {
  const createTask = useCreateTask(token);
  const uploadImage = useUploadTaskImage(token);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(TaskPriority.Medium);
  const [deadline, setDeadline] = useState('');
  const [teamId, setTeamId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const teamMembers = users.filter((u) => u.teamId === teamId);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const reset = () => {
    setTitle(''); setDescription(''); setDeadline('');
    setTeamId(''); setAssigneeId('');
    setImageFile(null); setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamId || !assigneeId) return;
    const body: Partial<Task> = {
      title, description, priority,
      deadline: new Date(deadline).toISOString(),
      teamId, assigneeId, projectId,
      status: TaskStatus.ToDo,
    };
    createTask.mutate(body, {
      onSuccess: (task) => {
        if (imageFile && task?.taskId) {
          uploadImage.mutate({ taskId: task.taskId, file: imageFile }, {
            onSettled: () => { reset(); onClose(); },
          });
        } else {
          reset(); onClose();
        }
      },
    });
  };

  const isPending = createTask.isPending || uploadImage.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={selectClass}
              placeholder="Task title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={selectClass}
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} className={selectClass}>
                {Object.values(TaskPriority).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
              <input
                required
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className={selectClass}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign to Team</label>
            <select
              value={teamId}
              onChange={(e) => { setTeamId(e.target.value); setAssigneeId(''); }}
              className={selectClass}
              required
            >
              <option value="">Select team...</option>
              {teams.map((t) => <option key={t.teamId} value={t.teamId}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className={selectClass}
              required
              disabled={!teamId}
            >
              <option value="">{teamId ? 'Select assignee...' : 'Select team first'}</option>
              {teamMembers.map((u) => <option key={u.userId} value={u.userId}>{u.email}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Attach Image <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <div
              className="flex items-center gap-3 rounded-lg border border-dashed border-gray-300 p-3 cursor-pointer hover:border-blue-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {imagePreview ? (
                <>
                  <img src={imagePreview} alt="preview" className="h-14 w-14 rounded object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 truncate">{imageFile?.name}</p>
                    <p className="text-xs text-gray-400">{imageFile ? (imageFile.size / 1024).toFixed(1) + ' KB' : ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setImageFile(null); setImagePreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="text-gray-400 hover:text-red-500 text-lg leading-none flex-shrink-0"
                  >
                    ×
                  </button>
                </>
              ) : (
                <span className="text-sm text-gray-400 w-full text-center py-1">Click to select an image</span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {createTask.isPending ? 'Creating...' : uploadImage.isPending ? 'Uploading image...' : 'Create Task'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-lg border px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
