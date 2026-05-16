import { extractTaskIdFromKey, handler } from './handler';
import { Readable } from 'stream';

// Shared mock functions — must use jest.fn() inline in factory closures,
// captured here via module-level vars that are assigned in beforeEach.
let mockS3Send: jest.Mock;
let mockDynamoSend: jest.Mock;

jest.mock('@aws-sdk/client-s3', () => {
  const send = jest.fn();
  (global as any).__mockS3Send = send;
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send })),
    GetObjectCommand: jest.fn((input: unknown) => input),
    PutObjectCommand: jest.fn((input: unknown) => input),
  };
});

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
  const send = jest.fn();
  (global as any).__mockDynamoSend = send;
  return {
    DynamoDBDocumentClient: { from: jest.fn().mockImplementation(() => ({ send })) },
    UpdateCommand: jest.fn((input: unknown) => input),
  };
});

jest.mock('sharp', () =>
  jest.fn().mockImplementation(() => ({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('fake-thumbnail')),
  })),
);

function makeS3Event(bucket: string, key: string) {
  return {
    Records: [
      {
        s3: {
          bucket: { name: bucket },
          object: { key: encodeURIComponent(key).replace(/%2F/g, '/') },
        },
      },
    ],
  } as any;
}

describe('extractTaskIdFromKey', () => {
  it('extracts taskId from S3 key', () => {
    const key = 'originals/task-abc-123/current/1234567890-photo.jpg';
    expect(extractTaskIdFromKey(key)).toBe('task-abc-123');
  });

  it('returns null for malformed key', () => {
    expect(extractTaskIdFromKey('bad-key')).toBeNull();
  });
});

describe('handler', () => {
  beforeEach(() => {
    mockS3Send = (global as any).__mockS3Send;
    mockDynamoSend = (global as any).__mockDynamoSend;
    mockS3Send.mockReset();
    mockDynamoSend.mockReset();
    process.env.S3_RESIZED_BUCKET = 'test-resized';
    process.env.DYNAMO_TASKS_TABLE = 'mini-jira-tasks';
  });

  it('skips non-task keys without calling S3 get', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await handler(makeS3Event('test-originals', 'bad-key'));
    expect(mockS3Send).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('skips records with empty S3 body', async () => {
    mockS3Send.mockResolvedValueOnce({ Body: undefined });
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await handler(makeS3Event('test-originals', 'originals/task-1/current/photo.jpg'));
    expect(mockDynamoSend).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('logs error and continues on failure without throwing', async () => {
    mockS3Send.mockRejectedValueOnce(new Error('S3 error'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      handler(makeS3Event('test-originals', 'originals/task-1/current/photo.jpg')),
    ).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process key'),
      expect.any(Error),
    );
    errorSpy.mockRestore();
  });

  it('resizes image, uploads thumbnail, and updates DynamoDB', async () => {
    const fakeStream = Readable.from([Buffer.from('fake-image')]);
    mockS3Send
      .mockResolvedValueOnce({ Body: fakeStream })
      .mockResolvedValueOnce({});
    mockDynamoSend.mockResolvedValueOnce({});

    await handler(makeS3Event('test-originals', 'originals/task-42/current/photo.jpg'));

    expect(mockS3Send).toHaveBeenCalledTimes(2);
    expect(mockDynamoSend).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { taskId: 'task-42' },
        ConditionExpression: 'attribute_exists(taskId)',
      }),
    );
  });
});
