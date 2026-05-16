import { FilesService } from './files.service';

const mockS3 = { send: jest.fn() };
const mockDynamo = { update: jest.fn(), get: jest.fn() };

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => mockS3),
  PutObjectCommand: jest.fn((input) => input),
  DeleteObjectCommand: jest.fn((input) => input),
  ListObjectsV2Command: jest.fn((input) => input),
  DeleteObjectsCommand: jest.fn((input) => input),
  CopyObjectCommand: jest.fn((input) => input),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.S3_ORIGINALS_BUCKET = 'test-originals';
    process.env.S3_RESIZED_BUCKET = 'test-resized';
    process.env.DYNAMO_TASKS_TABLE = 'mini-jira-tasks';
    service = new FilesService(mockDynamo as any);
  });

  it('generates a presigned upload URL', async () => {
    const result = await service.getPresignedUploadUrl('task-1', 'image.jpg');
    expect(result.uploadUrl).toContain('presigned-url');
    expect(result.key).toContain('task-1');
  });
});
