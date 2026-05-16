import { getTodayDateString, groupTasksByAssignee, buildDigestEmail, handler } from './handler';

// Shared mock functions captured via global refs set in factory closures
let mockDynamoSend: jest.Mock;
let mockSnsSend: jest.Mock;
let mockCloudWatchSend: jest.Mock;

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const send = jest.fn();
  (global as any).__mockDynamoSend = send;
  return {
    DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send })) },
    ScanCommand: jest.fn((input: unknown) => input),
    GetCommand: jest.fn((input: unknown) => input),
  };
});

jest.mock('@aws-sdk/client-sns', () => {
  const send = jest.fn();
  (global as any).__mockSnsSend = send;
  return {
    SNSClient: jest.fn().mockImplementation(() => ({ send })),
    PublishCommand: jest.fn((input: unknown) => input),
  };
});

jest.mock('@aws-sdk/client-cloudwatch', () => {
  const send = jest.fn();
  (global as any).__mockCloudWatchSend = send;
  return {
    CloudWatchClient: jest.fn().mockImplementation(() => ({ send })),
    PutMetricDataCommand: jest.fn((input: unknown) => input),
  };
});

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
      { title: 'Fix login', priority: 'High', status: 'ToDo', projectId: 'proj-1' },
    ];
    const email = buildDigestEmail('Sara', tasks as any[], '2026-05-04', 'https://example.com');
    expect(email.subject).toBe('[Mini-Jira] Your tasks due today — 2026-05-04');
    expect(email.body).toContain('Fix login');
    expect(email.body).toContain('High');
    expect(email.body).toContain('Sara');
    expect(email.body).toContain('proj-1');
  });
});

describe('handler', () => {
  const TODAY = '2026-05-16';

  beforeEach(() => {
    mockDynamoSend = (global as any).__mockDynamoSend;
    mockSnsSend = (global as any).__mockSnsSend;
    mockCloudWatchSend = (global as any).__mockCloudWatchSend;
    mockDynamoSend.mockReset();
    mockSnsSend.mockReset();
    mockCloudWatchSend.mockReset();

    process.env.DYNAMO_TASKS_TABLE = 'mini-jira-tasks';
    process.env.DYNAMO_USERS_TABLE = 'mini-jira-users';
    process.env.SNS_DIGEST_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:mini-jira-digest';
    process.env.AWS_REGION = 'us-east-1';

    // Fix "today" so overdue detection is deterministic
    jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(`${TODAY}T09:00:00.000Z`);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('happy path: scan returns tasks for two assignees → SNS and CloudWatch called', async () => {
    const tasks = [
      { taskId: 't1', title: 'Fix login', priority: 'High', status: 'ToDo', assigneeId: 'emp-1', deadline: TODAY, teamId: 'team-frontend' },
      { taskId: 't2', title: 'Write tests', priority: 'Medium', status: 'InProgress', assigneeId: 'emp-2', deadline: '2026-05-15', teamId: 'team-backend' },
    ];
    // First scan page — no LastEvaluatedKey means single page
    mockDynamoSend
      .mockResolvedValueOnce({ Items: tasks, LastEvaluatedKey: undefined }) // ScanCommand
      .mockResolvedValueOnce({ Item: { userId: 'emp-1', email: 'sara@test.com', displayName: 'Sara' } }) // GetCommand emp-1
      .mockResolvedValueOnce({ Item: { userId: 'emp-2', email: 'omar@test.com', displayName: 'Omar' } }); // GetCommand emp-2

    mockCloudWatchSend.mockResolvedValue({});
    mockSnsSend.mockResolvedValue({});

    await handler();

    // CloudWatch called once with overdue count (t2 deadline < today) and DailyDigestSent
    expect(mockCloudWatchSend).toHaveBeenCalledTimes(1);
    expect(mockCloudWatchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Namespace: 'MiniJira',
        MetricData: expect.arrayContaining([
          expect.objectContaining({ MetricName: 'OverdueTasks', Value: 1 }),
          expect.objectContaining({ MetricName: 'DailyDigestSent' }),
        ]),
      }),
    );

    // SNS called once per assignee
    expect(mockSnsSend).toHaveBeenCalledTimes(2);
    expect(mockSnsSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TopicArn: 'arn:aws:sns:us-east-1:123456789012:mini-jira-digest',
        Subject: expect.stringContaining('[Mini-Jira]'),
        Message: expect.stringContaining('Sara'),
      }),
    );
  });

  it('empty scan: no tasks → publishes OverdueTasks=0, SNS not called', async () => {
    mockDynamoSend.mockResolvedValueOnce({ Items: [], LastEvaluatedKey: undefined });
    mockCloudWatchSend.mockResolvedValue({});

    await handler();

    expect(mockCloudWatchSend).toHaveBeenCalledTimes(1);
    expect(mockCloudWatchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Namespace: 'MiniJira',
        MetricData: expect.arrayContaining([
          expect.objectContaining({ MetricName: 'OverdueTasks', Value: 0 }),
        ]),
      }),
    );
    expect(mockSnsSend).not.toHaveBeenCalled();
  });

  it('user fetch error: one assignee throws → that assignee skipped, other processed', async () => {
    const tasks = [
      { taskId: 't1', title: 'Task A', priority: 'High', status: 'ToDo', assigneeId: 'emp-1', deadline: TODAY },
      { taskId: 't2', title: 'Task B', priority: 'Low', status: 'ToDo', assigneeId: 'emp-2', deadline: TODAY },
    ];
    mockDynamoSend
      .mockResolvedValueOnce({ Items: tasks, LastEvaluatedKey: undefined }) // ScanCommand
      .mockRejectedValueOnce(new Error('DynamoDB unavailable'))             // GetCommand emp-1 throws
      .mockResolvedValueOnce({ Item: { userId: 'emp-2', email: 'omar@test.com', displayName: 'Omar' } }); // GetCommand emp-2

    mockCloudWatchSend.mockResolvedValue({});
    mockSnsSend.mockResolvedValue({});

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(handler()).resolves.toBeUndefined();

    // emp-1 skipped, emp-2 gets the email
    expect(mockSnsSend).toHaveBeenCalledTimes(1);
    expect(mockSnsSend).toHaveBeenCalledWith(
      expect.objectContaining({ Message: expect.stringContaining('Omar') }),
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('emp-1'), expect.any(Error));
    warnSpy.mockRestore();
  });

  it('SNS failure for one assignee: handler continues for second assignee and does not throw', async () => {
    const tasks = [
      { taskId: 't1', title: 'Task A', priority: 'High', status: 'ToDo', assigneeId: 'emp-1', deadline: TODAY },
      { taskId: 't2', title: 'Task B', priority: 'Low', status: 'ToDo', assigneeId: 'emp-2', deadline: TODAY },
    ];
    mockDynamoSend
      .mockResolvedValueOnce({ Items: tasks, LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Item: { userId: 'emp-1', email: 'sara@test.com', displayName: 'Sara' } })
      .mockResolvedValueOnce({ Item: { userId: 'emp-2', email: 'omar@test.com', displayName: 'Omar' } });

    mockCloudWatchSend.mockResolvedValue({});
    mockSnsSend
      .mockRejectedValueOnce(new Error('SNS unavailable')) // emp-1 fails
      .mockResolvedValueOnce({});                          // emp-2 succeeds

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handler()).resolves.toBeUndefined();

    // Both SNS sends were attempted
    expect(mockSnsSend).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to send digest to sara@test.com'),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('CloudWatch failure does not abort email sending', async () => {
    const tasks = [
      { taskId: 't1', title: 'Task A', priority: 'High', status: 'ToDo', assigneeId: 'emp-1', deadline: TODAY },
    ];
    mockDynamoSend
      .mockResolvedValueOnce({ Items: tasks, LastEvaluatedKey: undefined })
      .mockResolvedValueOnce({ Item: { userId: 'emp-1', email: 'sara@test.com', displayName: 'Sara' } });

    mockCloudWatchSend.mockRejectedValueOnce(new Error('CloudWatch unavailable'));
    mockSnsSend.mockResolvedValue({});

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(handler()).resolves.toBeUndefined();

    // SNS still called despite CloudWatch failure
    expect(mockSnsSend).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to publish CloudWatch metrics'),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('paginated scan: accumulates items across multiple pages', async () => {
    const page1Tasks = [
      { taskId: 't1', title: 'Task A', priority: 'High', status: 'ToDo', assigneeId: 'emp-1', deadline: TODAY },
    ];
    const page2Tasks = [
      { taskId: 't2', title: 'Task B', priority: 'Low', status: 'ToDo', assigneeId: 'emp-1', deadline: TODAY },
    ];
    mockDynamoSend
      .mockResolvedValueOnce({ Items: page1Tasks, LastEvaluatedKey: { taskId: 't1' } }) // page 1
      .mockResolvedValueOnce({ Items: page2Tasks, LastEvaluatedKey: undefined })         // page 2
      .mockResolvedValueOnce({ Item: { userId: 'emp-1', email: 'sara@test.com', displayName: 'Sara' } });

    mockCloudWatchSend.mockResolvedValue({});
    mockSnsSend.mockResolvedValue({});

    await handler();

    // mockDynamoSend: 2 ScanCommand pages + 1 GetCommand = 3 total calls
    expect(mockDynamoSend).toHaveBeenCalledTimes(3);

    // Both tasks grouped under emp-1, one SNS send
    expect(mockSnsSend).toHaveBeenCalledTimes(1);
    expect(mockSnsSend).toHaveBeenCalledWith(
      expect.objectContaining({ Message: expect.stringContaining('Sara') }),
    );
  });
});
