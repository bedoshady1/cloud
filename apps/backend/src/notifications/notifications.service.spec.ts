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
  });
});
