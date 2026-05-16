import { parseMessage } from './handler';

describe('parseMessage', () => {
  it('parses a valid SNS-wrapped SQS message body', () => {
    const snsEnvelope = JSON.stringify({
      taskId: 't1',
      taskTitle: 'Fix bug',
      assigneeId: 'emp-1',
      assigneeEmail: 'sara@test.com',
      teamId: 'team-frontend',
      managerId: 'mgr-1',
      assignedAt: '2026-05-04T09:00:00Z',
    });
    const result = parseMessage(snsEnvelope);
    expect(result.taskId).toBe('t1');
    expect(result.teamId).toBe('team-frontend');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseMessage('not-json')).toThrow();
  });
});
