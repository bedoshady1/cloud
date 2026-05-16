import { NotificationsService } from './notifications.service';

const mockSns = { send: jest.fn().mockResolvedValue({}) };

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(() => mockSns),
  PublishCommand: jest.fn((input) => input),
}));

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SNS_TASK_ASSIGNED_TOPIC_ARN = 'arn:aws:sns:us-east-1:123:test-topic';
    service = new NotificationsService();
  });

  it('publishes a task assigned event to SNS', async () => {
    await service.publishTaskAssigned({
      taskId: 't1',
      taskTitle: 'Fix bug',
      assigneeId: 'emp-1',
      assigneeEmail: 'sara@example.com',
      teamId: 'team-frontend',
      managerId: 'mgr-1',
    });
    expect(mockSns.send).toHaveBeenCalledTimes(1);
    const callArg = mockSns.send.mock.calls[0][0];
    const parsed = JSON.parse(callArg.Message);
    expect(parsed.taskId).toBe('t1');
    expect(parsed.assigneeEmail).toBe('sara@example.com');
    expect(parsed.teamId).toBe('team-frontend');
    expect(parsed.managerId).toBe('mgr-1');
    expect(parsed.assignedAt).toBeDefined();
    expect(callArg.Subject).toBe('[Mini-Jira] New task assigned: Fix bug');
    expect(callArg.TopicArn).toBe('arn:aws:sns:us-east-1:123:test-topic');
  });
});
