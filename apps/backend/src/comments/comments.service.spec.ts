import { CommentsService } from './comments.service';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { TasksService } from '../tasks/tasks.service';
import { UserRole } from '@mini-jira/shared';

const mockDynamo = { put: jest.fn(), query: jest.fn().mockResolvedValue({ items: [] }) };
const mockTasks = { findOne: jest.fn().mockResolvedValue({ taskId: 't1', teamId: 'team-a' }) };
const caller = { userId: 'emp-1', role: UserRole.Employee, teamId: 'team-a', email: 'emp@test.com', displayName: 'Employee' };

describe('CommentsService', () => {
  let service: CommentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DYNAMO_COMMENTS_TABLE = 'Comments';
    service = new CommentsService(mockDynamo as unknown as DynamodbService, mockTasks as unknown as TasksService);
  });

  it('creates a comment with authorId and taskId', async () => {
    const result = await service.create('t1', { body: 'Hello' }, caller);
    expect(mockDynamo.put).toHaveBeenCalledTimes(1);
    expect(result.body).toBe('Hello');
    expect(result.authorId).toBe('emp-1');
    expect(result.taskId).toBe('t1');
  });

  it('lists comments for a task', async () => {
    await service.findAll('t1', caller);
    expect(mockDynamo.query).toHaveBeenCalledWith(expect.objectContaining({ TableName: expect.any(String) }));
  });
});
