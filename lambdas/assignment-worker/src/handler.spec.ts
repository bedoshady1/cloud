import { parseMessage, handler } from './handler';
import { SQSEvent } from 'aws-lambda';

// Shared mock functions captured via global refs set in factory closures
let mockDynamoSend: jest.Mock;
let mockCloudWatchSend: jest.Mock;

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const send = jest.fn();
  (global as any).__mockDynamoSend = send;
  return {
    DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send })) },
    PutCommand: jest.fn((input: unknown) => input),
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

describe('parseMessage', () => {
  it('parses a valid assignment payload string', () => {
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

  it('throws when required fields are missing', () => {
    expect(() => parseMessage(JSON.stringify({ taskId: 't1', teamId: 'team-a' }))).toThrow('missing required fields');
    expect(() => parseMessage(JSON.stringify({ taskId: 't1', teamId: 'team-a', assignedAt: 'x', assigneeId: 'e1' }))).toThrow('missing required fields');
  });
});

describe('handler', () => {
  beforeEach(() => {
    mockDynamoSend = (global as any).__mockDynamoSend;
    mockCloudWatchSend = (global as any).__mockCloudWatchSend;
    mockDynamoSend.mockReset();
    mockCloudWatchSend.mockReset();
    process.env.DYNAMO_AUDIT_LOG_TABLE = 'mini-jira-audit-log';
    process.env.AWS_REGION = 'us-east-1';
  });

  function makeSqsEvent(body: string): SQSEvent {
    return {
      Records: [
        {
          messageId: 'msg-1',
          receiptHandle: 'receipt-1',
          body,
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: '',
          eventSource: 'aws:sqs',
          eventSourceARN: 'arn:aws:sqs:us-east-1:123456789012:TestQueue',
          awsRegion: 'us-east-1',
        },
      ],
    };
  }

  it('unwraps SNS envelope and writes AuditLog + CloudWatch metric', async () => {
    mockDynamoSend.mockResolvedValueOnce({});
    mockCloudWatchSend.mockResolvedValueOnce({});

    const innerPayload = JSON.stringify({
      taskId: 't1',
      taskTitle: 'Fix bug',
      assigneeId: 'emp-1',
      assigneeEmail: 'sara@test.com',
      teamId: 'team-frontend',
      managerId: 'mgr-1',
      assignedAt: '2026-05-04T09:00:00Z',
    });
    const snsEnvelope = JSON.stringify({ Message: innerPayload });
    const event = makeSqsEvent(snsEnvelope);

    await handler(event);

    expect(mockDynamoSend).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'mini-jira-audit-log',
        Item: expect.objectContaining({ taskId: 't1', teamId: 'team-frontend' }),
      }),
    );
    expect(mockCloudWatchSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Namespace: 'MiniJira',
        MetricData: expect.arrayContaining([
          expect.objectContaining({
            MetricName: 'TasksAssigned',
            Dimensions: [{ Name: 'teamId', Value: 'team-frontend' }],
          }),
        ]),
      }),
    );
  });

  it('skips record and continues when message body is invalid JSON', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const event = makeSqsEvent('not-json-at-all');

    await expect(handler(event)).resolves.toBeUndefined();
    expect(mockDynamoSend).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('continues processing when DynamoDB throws', async () => {
    mockDynamoSend.mockRejectedValueOnce(new Error('DynamoDB unavailable'));
    mockCloudWatchSend.mockResolvedValueOnce({});

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const innerPayload = JSON.stringify({
      taskId: 't2',
      taskTitle: 'Another task',
      assigneeId: 'emp-2',
      assigneeEmail: 'omar@test.com',
      teamId: 'team-backend',
      managerId: 'mgr-1',
      assignedAt: '2026-05-04T10:00:00Z',
    });
    const event = makeSqsEvent(JSON.stringify({ Message: innerPayload }));

    await expect(handler(event)).resolves.toBeUndefined();
    expect(mockCloudWatchSend).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to write AuditLog for task',
      't2',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('continues processing when CloudWatch throws', async () => {
    mockDynamoSend.mockResolvedValueOnce({});
    mockCloudWatchSend.mockRejectedValueOnce(new Error('CloudWatch unavailable'));

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const innerPayload = JSON.stringify({
      taskId: 't3',
      taskTitle: 'Yet another task',
      assigneeId: 'emp-3',
      assigneeEmail: 'ali@test.com',
      teamId: 'team-frontend',
      managerId: 'mgr-1',
      assignedAt: '2026-05-04T11:00:00Z',
    });
    const event = makeSqsEvent(JSON.stringify({ Message: innerPayload }));

    await expect(handler(event)).resolves.toBeUndefined();
    expect(mockDynamoSend).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to publish CloudWatch metric for task',
      't3',
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });
});
