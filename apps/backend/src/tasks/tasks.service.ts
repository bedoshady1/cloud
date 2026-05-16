import { forwardRef, Inject, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { MetricsService } from '../metrics/metrics.service';
import { FilesService } from '../files/files.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task, TaskStatus, UserRole, CognitoUser, AuditLogEntry } from '@mini-jira/shared';

@Injectable()
export class TasksService {
  private readonly table = process.env.DYNAMO_TASKS_TABLE!;
  private readonly auditTable = process.env.DYNAMO_AUDIT_LOG_TABLE!;
  private readonly teamGsi = process.env.TASKS_TEAM_GSI || 'teamId-createdAt-index';

  constructor(
    private readonly db: DynamodbService,
    private readonly metrics: MetricsService,
    @Inject(forwardRef(() => FilesService)) private readonly files: FilesService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersService,
  ) {}

  async create(dto: CreateTaskDto, managerId: string): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      taskId: crypto.randomUUID(),
      title: dto.title,
      description: dto.description ?? '',
      status: dto.status ?? TaskStatus.ToDo,
      priority: dto.priority,
      deadline: dto.deadline,
      assigneeId: dto.assigneeId,
      teamId: dto.teamId,
      projectId: dto.projectId,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.put(this.table, task as unknown as Record<string, unknown>);
    try {
      await this.metrics.taskCreated();
    } catch (err) {
      console.warn('[MetricsService] taskCreated failed', err);
    }
    const assignee = await this.users.findOne(dto.assigneeId).catch(() => null);
    if (assignee) {
      await this.notifications.publishTaskAssigned({
        taskId: task.taskId,
        taskTitle: task.title,
        assigneeId: dto.assigneeId,
        assigneeEmail: assignee.email,
        teamId: dto.teamId,
        managerId,
      });
    }
    return task;
  }

  async findAll(caller: CognitoUser, limit = 20, lastEvaluatedKey?: Record<string, unknown>) {
    if (caller.role === UserRole.Manager) {
      return this.db.scan({ TableName: this.table, Limit: limit, ExclusiveStartKey: lastEvaluatedKey as Record<string, any> | undefined });
    }
    return this.db.query({
      TableName: this.table,
      IndexName: this.teamGsi,
      KeyConditionExpression: 'teamId = :tid',
      ExpressionAttributeValues: { ':tid': caller.teamId },
      Limit: limit,
      ExclusiveStartKey: lastEvaluatedKey as Record<string, any> | undefined,
    });
  }

  async findOne(taskId: string, caller: CognitoUser): Promise<Task> {
    const item = await this.db.get(this.table, { taskId });
    if (!item) throw new NotFoundException(`Task ${taskId} not found`);
    const task = item as Task;
    if (caller.role === UserRole.Employee && task.teamId !== caller.teamId) {
      throw new ForbiddenException('Access denied');
    }
    return task;
  }

  async update(taskId: string, dto: UpdateTaskDto, caller: CognitoUser): Promise<void> {
    const task = await this.findOne(taskId, caller);
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {};
    if (dto.status !== undefined) updates.status = dto.status;
    if (dto.priority !== undefined) updates.priority = dto.priority;
    if (dto.title !== undefined) updates.title = dto.title;
    if (dto.description !== undefined) updates.description = dto.description;
    if (dto.deadline !== undefined) updates.deadline = dto.deadline;
    if (dto.assigneeId !== undefined && caller.role === UserRole.Manager) updates.assigneeId = dto.assigneeId;
    if (Object.keys(updates).length === 0) return;
    updates.updatedAt = now;
    await this.db.update(this.table, { taskId }, updates);

    if (dto.status !== undefined && dto.status !== task.status) {
      const entry: AuditLogEntry = {
        taskId,
        timestamp: now,
        event: 'STATUS_CHANGED',
        actorId: caller.userId,
        fromStatus: task.status,
        toStatus: dto.status,
        teamId: task.teamId,
      };
      await this.db.put(this.auditTable, entry as unknown as Record<string, unknown>);
      if (dto.status === TaskStatus.Done) {
        try {
          await this.metrics.taskClosed(task.teamId, task.createdAt);
        } catch (err) {
          console.warn('[MetricsService] taskClosed failed', err);
        }
      }
    }
  }

  async remove(taskId: string, caller: CognitoUser): Promise<void> {
    const task = await this.findOne(taskId, caller);
    if (task.imageKey) await this.files.deleteTaskImages(taskId);
    await this.db.delete(this.table, { taskId });
  }

  async getAuditLog(taskId: string, caller: CognitoUser) {
    await this.findOne(taskId, caller);
    return this.db.query({
      TableName: this.auditTable,
      KeyConditionExpression: 'taskId = :tid',
      ExpressionAttributeValues: { ':tid': taskId },
    });
  }
}
