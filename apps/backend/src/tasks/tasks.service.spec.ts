import { TasksService } from './tasks.service';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { UserRole, TaskStatus, TaskPriority } from '@mini-jira/shared';

const mockDynamo = {
  put: jest.fn(),
  get: jest.fn(),
  query: jest.fn().mockResolvedValue({ items: [], lastEvaluatedKey: undefined }),
  update: jest.fn(),
  delete: jest.fn(),
  scan: jest.fn().mockResolvedValue({ items: [], lastEvaluatedKey: undefined }),
};

const manager = { userId: 'mgr-1', role: UserRole.Manager, teamId: '', email: 'mgr@test.com', displayName: 'Manager' };
const employee = { userId: 'emp-1', role: UserRole.Employee, teamId: 'team-frontend', email: 'emp@test.com', displayName: 'Employee' };

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TasksService(mockDynamo as unknown as DynamodbService);
  });

  it('creates a task with ToDo status', async () => {
    const dto = { title: 'Fix bug', priority: TaskPriority.High, deadline: '2026-05-20', assigneeId: 'emp-1', teamId: 'team-frontend', projectId: 'proj-1' };
    const result = await service.create(dto, manager.userId);
    expect(mockDynamo.put).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(TaskStatus.ToDo);
    expect(result.teamId).toBe('team-frontend');
    expect(result.taskId).toBeDefined();
  });

  it('queries by teamId GSI when caller is Employee', async () => {
    await service.findAll(employee);
    expect(mockDynamo.query).toHaveBeenCalledWith(
      expect.objectContaining({ IndexName: 'teamId-createdAt-index' }),
    );
  });

  it('does not query by teamId GSI when caller is Manager', async () => {
    // Manager uses scan, not teamId-indexed query
    await service.findAll(manager);
    expect(mockDynamo.query).not.toHaveBeenCalled();
  });

  it('findOne throws ForbiddenException when Employee accesses another team task', async () => {
    mockDynamo.get.mockResolvedValue({ taskId: 't1', teamId: 'team-backend' });
    await expect(service.findOne('t1', employee)).rejects.toThrow('Access denied');
  });

  it('findOne throws NotFoundException when task does not exist', async () => {
    mockDynamo.get.mockResolvedValue(null);
    await expect(service.findOne('nope', manager)).rejects.toThrow('Task nope not found');
  });
});
