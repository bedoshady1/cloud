import { getTodayDateString, groupTasksByAssignee, buildDigestEmail } from './handler';

describe('getTodayDateString', () => {
  it('returns a date string in YYYY-MM-DD format', () => {
    const result = getTodayDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('groupTasksByAssignee', () => {
  it('groups tasks by assigneeId', () => {
    const tasks = [
      { taskId: 't1', assigneeId: 'emp-1', title: 'Task A', priority: 'High', status: 'ToDo' },
      { taskId: 't2', assigneeId: 'emp-1', title: 'Task B', priority: 'Low', status: 'InProgress' },
      { taskId: 't3', assigneeId: 'emp-2', title: 'Task C', priority: 'Medium', status: 'ToDo' },
    ];
    const grouped = groupTasksByAssignee(tasks as any[]);
    expect(grouped['emp-1']).toHaveLength(2);
    expect(grouped['emp-2']).toHaveLength(1);
  });

  it('returns empty object for no tasks', () => {
    expect(groupTasksByAssignee([])).toEqual({});
  });
});

describe('buildDigestEmail', () => {
  it('builds an email with task list', () => {
    const tasks = [
      { title: 'Fix login', priority: 'High', status: 'ToDo' },
    ];
    const email = buildDigestEmail('Sara', tasks as any[], '2026-05-04');
    expect(email.subject).toBe('[Mini-Jira] Your tasks due today — 2026-05-04');
    expect(email.body).toContain('Fix login');
    expect(email.body).toContain('High');
    expect(email.body).toContain('Sara');
  });
});
