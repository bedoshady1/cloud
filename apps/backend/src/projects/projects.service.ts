import { Injectable, NotFoundException } from '@nestjs/common';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from '@mini-jira/shared';
import { randomUUID } from 'crypto';

@Injectable()
export class ProjectsService {
  private readonly table = process.env.DYNAMO_PROJECTS_TABLE!;

  constructor(private readonly db: DynamodbService) {}

  async create(dto: CreateProjectDto, managerId: string): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      projectId: randomUUID(),
      title: dto.title,
      description: dto.description ?? '',
      managerId,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.put(this.table, project as unknown as Record<string, unknown>);
    return project;
  }

  async findAll(limit = 20, lastEvaluatedKey?: Record<string, unknown>) {
    return this.db.scan({ TableName: this.table, Limit: limit, ExclusiveStartKey: lastEvaluatedKey });
  }

  async findOne(projectId: string): Promise<Project> {
    const item = await this.db.get(this.table, { projectId });
    if (!item) throw new NotFoundException(`Project ${projectId} not found`);
    return item as Project;
  }

  async update(projectId: string, dto: UpdateProjectDto): Promise<void> {
    await this.findOne(projectId);
    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (dto.title) updates.title = dto.title;
    if (dto.description) updates.description = dto.description;
    await this.db.update(this.table, { projectId }, updates);
  }

  async remove(projectId: string): Promise<void> {
    await this.findOne(projectId);
    await this.db.delete(this.table, { projectId });
  }
}
