import { ProjectsService } from './projects.service';
import { DynamodbService } from '../dynamodb/dynamodb.service';

const mockDynamo = {
  put: jest.fn(),
  get: jest.fn(),
  scan: jest.fn().mockResolvedValue({ items: [], lastEvaluatedKey: undefined }),
  update: jest.fn(),
  delete: jest.fn(),
};

describe('ProjectsService', () => {
  let service: ProjectsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProjectsService(mockDynamo as unknown as DynamodbService);
  });

  it('creates a project and returns it', async () => {
    const result = await service.create({ title: 'Proj A', description: 'Desc' }, 'manager-1');
    expect(mockDynamo.put).toHaveBeenCalledTimes(1);
    expect(result.title).toBe('Proj A');
    expect(result.managerId).toBe('manager-1');
    expect(result.projectId).toBeDefined();
  });

  it('lists all projects', async () => {
    mockDynamo.scan.mockResolvedValue({ items: [{ projectId: 'p1', title: 'P1' }], lastEvaluatedKey: undefined });
    const result = await service.findAll();
    expect(result.items).toHaveLength(1);
  });

  it('findOne throws NotFoundException when project does not exist', async () => {
    mockDynamo.get.mockResolvedValue(null);
    await expect(service.findOne('nonexistent')).rejects.toThrow('Project nonexistent not found');
  });

  it('update throws NotFoundException when project does not exist', async () => {
    mockDynamo.get.mockResolvedValue(null);
    await expect(service.update('nonexistent', { title: 'X' })).rejects.toThrow('Project nonexistent not found');
  });

  it('remove throws NotFoundException when project does not exist', async () => {
    mockDynamo.get.mockResolvedValue(null);
    await expect(service.remove('nonexistent')).rejects.toThrow('Project nonexistent not found');
  });

  it('update returns without writing when dto has no fields', async () => {
    mockDynamo.get.mockResolvedValue({ projectId: 'p1', title: 'P1' });
    await service.update('p1', {});
    expect(mockDynamo.update).not.toHaveBeenCalled();
  });
});
