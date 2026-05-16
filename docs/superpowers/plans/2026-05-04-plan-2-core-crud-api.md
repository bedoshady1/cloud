# Core CRUD API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full NestJS REST API for Projects, Tasks, Comments, Teams, and Users backed by DynamoDB, with server-side team isolation enforced on every Task query.

**Architecture:** Each domain gets its own NestJS module (projects, tasks, comments, teams, users). A shared `DynamodbService` wraps the AWS SDK v3 DynamoDB DocumentClient. Team isolation is enforced in `TasksService` by injecting the calling user's `teamId` into every DynamoDB query when the user is an Employee. The `TeamGuard` enforces this at the route level.

**Tech Stack:** NestJS, AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-cloudwatch`), `class-validator`, `class-transformer`, Jest, Supertest

**Prerequisite:** Plan 1 (Auth & Cognito) must be complete.

---

## File Map

```
apps/backend/src/
├── dynamodb/
│   ├── dynamodb.module.ts
│   └── dynamodb.service.ts          # thin wrapper around DocumentClient
├── auth/
│   └── team.guard.ts                # new: enforces teamId on task routes
├── projects/
│   ├── projects.module.ts
│   ├── projects.controller.ts
│   ├── projects.service.ts
│   ├── dto/
│   │   ├── create-project.dto.ts
│   │   └── update-project.dto.ts
│   └── projects.service.spec.ts
├── tasks/
│   ├── tasks.module.ts
│   ├── tasks.controller.ts
│   ├── tasks.service.ts
│   ├── dto/
│   │   ├── create-task.dto.ts
│   │   └── update-task.dto.ts
│   └── tasks.service.spec.ts
├── comments/
│   ├── comments.module.ts
│   ├── comments.controller.ts
│   ├── comments.service.ts
│   ├── dto/
│   │   └── create-comment.dto.ts
│   └── comments.service.spec.ts
├── teams/
│   ├── teams.module.ts
│   ├── teams.controller.ts
│   ├── teams.service.ts
│   └── dto/
│       └── create-team.dto.ts
└── users/
    ├── users.module.ts
    ├── users.controller.ts
    └── users.service.ts
```

---

### Task 1: DynamoDB Tables Setup (AWS Console)

**Files:** None (AWS Console)

- [ ] **Step 1: Create Users table**

DynamoDB → Create table:
- Table name: `mini-jira-users`
- Partition key: `userId` (String)
- Billing: On-demand (free tier)

- [ ] **Step 2: Create Teams table**

- Table name: `mini-jira-teams`
- Partition key: `teamId` (String)

- [ ] **Step 3: Create Projects table**

- Table name: `mini-jira-projects`
- Partition key: `projectId` (String)

- [ ] **Step 4: Create Tasks table with GSIs**

- Table name: `mini-jira-tasks`
- Partition key: `taskId` (String)
- After creation → Indexes → Create GSI:
  - GSI-1: PK=`teamId` (String), SK=`createdAt` (String), Name: `teamId-createdAt-index`
  - GSI-2: PK=`assigneeId` (String), SK=`createdAt` (String), Name: `assigneeId-createdAt-index`

- [ ] **Step 5: Create Comments table**

- Table name: `mini-jira-comments`
- Partition key: `taskId` (String)
- Sort key: `commentId` (String)

- [ ] **Step 6: Create AuditLog table**

- Table name: `mini-jira-audit-log`
- Partition key: `taskId` (String)
- Sort key: `timestamp` (String)

- [ ] **Step 7: Add table names to backend `.env`**

```bash
# append to apps/backend/.env
DYNAMO_USERS_TABLE=mini-jira-users
DYNAMO_TEAMS_TABLE=mini-jira-teams
DYNAMO_PROJECTS_TABLE=mini-jira-projects
DYNAMO_TASKS_TABLE=mini-jira-tasks
DYNAMO_COMMENTS_TABLE=mini-jira-comments
DYNAMO_AUDIT_LOG_TABLE=mini-jira-audit-log
TASKS_TEAM_GSI=teamId-createdAt-index
TASKS_ASSIGNEE_GSI=assigneeId-createdAt-index
```

---

### Task 2: DynamodbService

**Files:**
- Create: `apps/backend/src/dynamodb/dynamodb.module.ts`
- Create: `apps/backend/src/dynamodb/dynamodb.service.ts`

- [ ] **Step 1: Install AWS SDK v3**

```bash
cd apps/backend && npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
```

- [ ] **Step 2: Create `apps/backend/src/dynamodb/dynamodb.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  QueryCommandInput,
  ScanCommandInput,
} from '@aws-sdk/lib-dynamodb';

@Injectable()
export class DynamodbService {
  private readonly client: DynamoDBDocumentClient;

  constructor() {
    const base = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
    this.client = DynamoDBDocumentClient.from(base);
  }

  async get(table: string, key: Record<string, string>) {
    const result = await this.client.send(new GetCommand({ TableName: table, Key: key }));
    return result.Item ?? null;
  }

  async put(table: string, item: Record<string, unknown>) {
    await this.client.send(new PutCommand({ TableName: table, Item: item }));
  }

  async update(table: string, key: Record<string, string>, updates: Record<string, unknown>) {
    const entries = Object.entries(updates);
    const expression = 'SET ' + entries.map((_, i) => `#k${i} = :v${i}`).join(', ');
    const names = Object.fromEntries(entries.map(([k], i) => [`#k${i}`, k]));
    const values = Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v]));
    await this.client.send(
      new UpdateCommand({ TableName: table, Key: key, UpdateExpression: expression, ExpressionAttributeNames: names, ExpressionAttributeValues: values }),
    );
  }

  async delete(table: string, key: Record<string, string>) {
    await this.client.send(new DeleteCommand({ TableName: table, Key: key }));
  }

  async query(input: QueryCommandInput) {
    const result = await this.client.send(new QueryCommand(input));
    return { items: result.Items ?? [], lastEvaluatedKey: result.LastEvaluatedKey };
  }

  async scan(input: ScanCommandInput) {
    const result = await this.client.send(new ScanCommand(input));
    return { items: result.Items ?? [], lastEvaluatedKey: result.LastEvaluatedKey };
  }
}
```

- [ ] **Step 3: Create `apps/backend/src/dynamodb/dynamodb.module.ts`**

```typescript
import { Global, Module } from '@nestjs/common';
import { DynamodbService } from './dynamodb.service';

@Global()
@Module({
  providers: [DynamodbService],
  exports: [DynamodbService],
})
export class DynamodbModule {}
```

- [ ] **Step 4: Register DynamodbModule in AppModule**

Edit `apps/backend/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DynamodbModule } from './dynamodb/dynamodb.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule, DynamodbModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/dynamodb apps/backend/src/app.module.ts
git commit -m "feat: add global DynamodbService wrapping AWS SDK v3 DocumentClient"
```

---

### Task 3: TeamGuard

**Files:**
- Create: `apps/backend/src/auth/team.guard.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/auth/team.guard.spec.ts`:

```typescript
import { TeamGuard } from './team.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@mini-jira/shared';

function makeCtx(user: object, params: object = {}): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, params }) }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('TeamGuard', () => {
  const reflector = new Reflector();
  const guard = new TeamGuard(reflector);

  it('allows Manager through regardless of teamId', () => {
    const ctx = makeCtx({ role: UserRole.Manager, teamId: '' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows Employee when teamId matches resource teamId in request body', () => {
    const req = { user: { role: UserRole.Employee, teamId: 'team-a' }, body: { teamId: 'team-a' }, params: {} };
    const ctx = { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => ({}), getClass: () => ({}) } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks Employee when route is marked manager-only', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const ctx = makeCtx({ role: UserRole.Employee, teamId: 'team-a' });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/backend && npx jest team.guard.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './team.guard'`

- [ ] **Step 3: Create `apps/backend/src/auth/team.guard.ts`**

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@mini-jira/shared';
import { SetMetadata } from '@nestjs/common';

export const MANAGER_ONLY_KEY = 'managerOnly';
export const ManagerOnly = () => SetMetadata(MANAGER_ONLY_KEY, true);

@Injectable()
export class TeamGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.role === UserRole.Manager) return true;

    const managerOnly = this.reflector.getAllAndOverride<boolean>(MANAGER_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (managerOnly) throw new ForbiddenException('Manager only');

    return true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/backend && npx jest team.guard.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 5: Export TeamGuard from AuthModule**

Edit `apps/backend/src/auth/auth.module.ts` — add `TeamGuard` to providers and exports:

```typescript
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';
import { TeamGuard } from './team.guard';

@Module({
  providers: [
    JwtStrategy,
    TeamGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [JwtStrategy, TeamGuard],
})
export class AuthModule {}
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/auth
git commit -m "feat: add TeamGuard for manager-only route enforcement"
```

---

### Task 4: Projects Module

**Files:**
- Create: `apps/backend/src/projects/dto/create-project.dto.ts`
- Create: `apps/backend/src/projects/dto/update-project.dto.ts`
- Create: `apps/backend/src/projects/projects.service.ts`
- Create: `apps/backend/src/projects/projects.service.spec.ts`
- Create: `apps/backend/src/projects/projects.controller.ts`
- Create: `apps/backend/src/projects/projects.module.ts`

- [ ] **Step 1: Install class-validator**

```bash
cd apps/backend && npm install class-validator class-transformer uuid
npm install --save-dev @types/uuid
```

- [ ] **Step 2: Create DTOs**

`apps/backend/src/projects/dto/create-project.dto.ts`:

```typescript
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateProjectDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsOptional() description?: string;
}
```

`apps/backend/src/projects/dto/update-project.dto.ts`:

```typescript
import { IsString, IsOptional } from 'class-validator';

export class UpdateProjectDto {
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
}
```

- [ ] **Step 3: Write failing service test**

`apps/backend/src/projects/projects.service.spec.ts`:

```typescript
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
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd apps/backend && npx jest projects.service.spec.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 5: Create `apps/backend/src/projects/projects.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from '@mini-jira/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ProjectsService {
  private readonly table = process.env.DYNAMO_PROJECTS_TABLE!;

  constructor(private readonly db: DynamodbService) {}

  async create(dto: CreateProjectDto, managerId: string): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      projectId: uuidv4(),
      title: dto.title,
      description: dto.description ?? '',
      managerId,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.put(this.table, project);
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
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd apps/backend && npx jest projects.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 7: Create `apps/backend/src/projects/projects.controller.ts`**

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { ManagerOnly } from '../auth/team.guard';
import { CognitoUser } from '@mini-jira/shared';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ManagerOnly()
  create(@Body() dto: CreateProjectDto, @CurrentUser() user: CognitoUser) {
    return this.projectsService.create(dto, user.userId);
  }

  @Get()
  findAll(@Query('limit') limit?: string, @Query('lastKey') lastKey?: string) {
    return this.projectsService.findAll(limit ? parseInt(limit) : 20, lastKey ? JSON.parse(lastKey) : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.projectsService.findOne(id);
  }

  @Patch(':id')
  @ManagerOnly()
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projectsService.update(id, dto);
  }

  @Delete(':id')
  @ManagerOnly()
  remove(@Param('id') id: string) {
    return this.projectsService.remove(id);
  }
}
```

- [ ] **Step 8: Create `apps/backend/src/projects/projects.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
```

- [ ] **Step 9: Register in AppModule**

Edit `apps/backend/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DynamodbModule } from './dynamodb/dynamodb.module';
import { ProjectsModule } from './projects/projects.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule, DynamodbModule, ProjectsModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/projects apps/backend/src/app.module.ts
git commit -m "feat: add Projects CRUD module with DynamoDB"
```

---

### Task 5: Tasks Module (with team isolation)

**Files:**
- Create: `apps/backend/src/tasks/dto/create-task.dto.ts`
- Create: `apps/backend/src/tasks/dto/update-task.dto.ts`
- Create: `apps/backend/src/tasks/tasks.service.ts`
- Create: `apps/backend/src/tasks/tasks.service.spec.ts`
- Create: `apps/backend/src/tasks/tasks.controller.ts`
- Create: `apps/backend/src/tasks/tasks.module.ts`

- [ ] **Step 1: Create DTOs**

`apps/backend/src/tasks/dto/create-task.dto.ts`:

```typescript
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { TaskPriority, TaskStatus } from '@mini-jira/shared';

export class CreateTaskDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsOptional() description?: string;
  @IsEnum(TaskPriority) priority: TaskPriority;
  @IsDateString() deadline: string;
  @IsString() @IsNotEmpty() assigneeId: string;
  @IsString() @IsNotEmpty() teamId: string;
  @IsString() @IsNotEmpty() projectId: string;
  @IsEnum(TaskStatus) @IsOptional() status?: TaskStatus;
}
```

`apps/backend/src/tasks/dto/update-task.dto.ts`:

```typescript
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { TaskPriority, TaskStatus } from '@mini-jira/shared';

export class UpdateTaskDto {
  @IsEnum(TaskStatus) @IsOptional() status?: TaskStatus;
  @IsEnum(TaskPriority) @IsOptional() priority?: TaskPriority;
  @IsString() @IsOptional() title?: string;
  @IsString() @IsOptional() description?: string;
  @IsString() @IsOptional() deadline?: string;
  @IsString() @IsOptional() assigneeId?: string;
}
```

- [ ] **Step 2: Write failing service test**

`apps/backend/src/tasks/tasks.service.spec.ts`:

```typescript
import { TasksService } from './tasks.service';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { UserRole, TaskStatus, TaskPriority } from '@mini-jira/shared';

const mockDynamo = {
  put: jest.fn(),
  get: jest.fn(),
  query: jest.fn().mockResolvedValue({ items: [], lastEvaluatedKey: undefined }),
  update: jest.fn(),
  delete: jest.fn(),
};

const manager = { userId: 'mgr-1', role: UserRole.Manager, teamId: '' };
const employee = { userId: 'emp-1', role: UserRole.Employee, teamId: 'team-frontend' };

describe('TasksService', () => {
  let service: TasksService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TasksService(mockDynamo as unknown as DynamodbService);
  });

  it('creates a task', async () => {
    const dto = { title: 'Fix bug', priority: TaskPriority.High, deadline: '2026-05-10', assigneeId: 'emp-1', teamId: 'team-frontend', projectId: 'proj-1' };
    const result = await service.create(dto, manager.userId);
    expect(mockDynamo.put).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(TaskStatus.ToDo);
    expect(result.teamId).toBe('team-frontend');
  });

  it('queries by teamId when caller is Employee', async () => {
    await service.findAll(employee);
    expect(mockDynamo.query).toHaveBeenCalledWith(
      expect.objectContaining({ IndexName: process.env.TASKS_TEAM_GSI || 'teamId-createdAt-index' }),
    );
  });

  it('scans all when caller is Manager', async () => {
    mockDynamo.query.mockResolvedValue({ items: [{ taskId: 't1' }], lastEvaluatedKey: undefined });
    await service.findAll(manager);
    expect(mockDynamo.query).toHaveBeenCalledWith(expect.not.objectContaining({ IndexName: 'teamId-createdAt-index' }));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/backend && npx jest tasks.service.spec.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 4: Create `apps/backend/src/tasks/tasks.service.ts`**

```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { Task, TaskStatus, UserRole, CognitoUser, AuditLogEntry } from '@mini-jira/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class TasksService {
  private readonly table = process.env.DYNAMO_TASKS_TABLE!;
  private readonly auditTable = process.env.DYNAMO_AUDIT_LOG_TABLE!;
  private readonly teamGsi = process.env.TASKS_TEAM_GSI || 'teamId-createdAt-index';
  private readonly assigneeGsi = process.env.TASKS_ASSIGNEE_GSI || 'assigneeId-createdAt-index';

  constructor(private readonly db: DynamodbService) {}

  async create(dto: CreateTaskDto, managerId: string): Promise<Task> {
    const now = new Date().toISOString();
    const task: Task = {
      taskId: uuidv4(),
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
    await this.db.put(this.table, task);
    return task;
  }

  async findAll(caller: CognitoUser, limit = 20, lastEvaluatedKey?: Record<string, unknown>) {
    if (caller.role === UserRole.Manager) {
      return this.db.query({
        TableName: this.table,
        Limit: limit,
        ExclusiveStartKey: lastEvaluatedKey,
      } as any);
    }
    return this.db.query({
      TableName: this.table,
      IndexName: this.teamGsi,
      KeyConditionExpression: 'teamId = :tid',
      ExpressionAttributeValues: { ':tid': caller.teamId },
      Limit: limit,
      ExclusiveStartKey: lastEvaluatedKey,
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
    const updates: Record<string, unknown> = { updatedAt: now };
    if (dto.status) updates.status = dto.status;
    if (dto.priority) updates.priority = dto.priority;
    if (dto.title) updates.title = dto.title;
    if (dto.description) updates.description = dto.description;
    if (dto.deadline) updates.deadline = dto.deadline;
    if (dto.assigneeId && caller.role === UserRole.Manager) updates.assigneeId = dto.assigneeId;

    await this.db.update(this.table, { taskId }, updates);

    if (dto.status && dto.status !== task.status) {
      const entry: AuditLogEntry = {
        taskId,
        timestamp: now,
        event: 'STATUS_CHANGED',
        actorId: caller.userId,
        fromStatus: task.status,
        toStatus: dto.status,
        teamId: task.teamId,
      };
      await this.db.put(this.auditTable, entry);
    }
  }

  async remove(taskId: string): Promise<void> {
    const task = await this.db.get(this.table, { taskId });
    if (!task) throw new NotFoundException(`Task ${taskId} not found`);
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/backend && npx jest tasks.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 6: Create `apps/backend/src/tasks/tasks.controller.ts`**

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { ManagerOnly } from '../auth/team.guard';
import { CognitoUser } from '@mini-jira/shared';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @ManagerOnly()
  create(@Body() dto: CreateTaskDto, @CurrentUser() user: CognitoUser) {
    return this.tasksService.create(dto, user.userId);
  }

  @Get()
  findAll(@CurrentUser() user: CognitoUser, @Query('limit') limit?: string, @Query('lastKey') lastKey?: string) {
    return this.tasksService.findAll(user, limit ? parseInt(limit) : 20, lastKey ? JSON.parse(lastKey) : undefined);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: CognitoUser) {
    return this.tasksService.findOne(id, user);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTaskDto, @CurrentUser() user: CognitoUser) {
    return this.tasksService.update(id, dto, user);
  }

  @Delete(':id')
  @ManagerOnly()
  remove(@Param('id') id: string) {
    return this.tasksService.remove(id);
  }

  @Get(':id/audit')
  getAuditLog(@Param('id') id: string, @CurrentUser() user: CognitoUser) {
    return this.tasksService.getAuditLog(id, user);
  }
}
```

- [ ] **Step 7: Create `apps/backend/src/tasks/tasks.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
```

- [ ] **Step 8: Register in AppModule**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DynamodbModule } from './dynamodb/dynamodb.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule, DynamodbModule, ProjectsModule, TasksModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/tasks apps/backend/src/app.module.ts
git commit -m "feat: add Tasks CRUD module with server-side team isolation and audit log"
```

---

### Task 6: Comments Module

**Files:**
- Create: `apps/backend/src/comments/dto/create-comment.dto.ts`
- Create: `apps/backend/src/comments/comments.service.ts`
- Create: `apps/backend/src/comments/comments.service.spec.ts`
- Create: `apps/backend/src/comments/comments.controller.ts`
- Create: `apps/backend/src/comments/comments.module.ts`

- [ ] **Step 1: Create DTO**

`apps/backend/src/comments/dto/create-comment.dto.ts`:

```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateCommentDto {
  @IsString() @IsNotEmpty() body: string;
}
```

- [ ] **Step 2: Write failing test**

`apps/backend/src/comments/comments.service.spec.ts`:

```typescript
import { CommentsService } from './comments.service';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { TasksService } from '../tasks/tasks.service';
import { UserRole } from '@mini-jira/shared';

const mockDynamo = { put: jest.fn(), query: jest.fn().mockResolvedValue({ items: [] }) };
const mockTasks = { findOne: jest.fn().mockResolvedValue({ taskId: 't1', teamId: 'team-a' }) };
const caller = { userId: 'emp-1', role: UserRole.Employee, teamId: 'team-a' };

describe('CommentsService', () => {
  let service: CommentsService;

  beforeEach(() => {
    jest.clearAllMocks();
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
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/backend && npx jest comments.service.spec.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 4: Create `apps/backend/src/comments/comments.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { TasksService } from '../tasks/tasks.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { Comment, CognitoUser } from '@mini-jira/shared';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CommentsService {
  private readonly table = process.env.DYNAMO_COMMENTS_TABLE!;

  constructor(private readonly db: DynamodbService, private readonly tasks: TasksService) {}

  async create(taskId: string, dto: CreateCommentDto, caller: CognitoUser): Promise<Comment> {
    await this.tasks.findOne(taskId, caller);
    const comment: Comment = {
      taskId,
      commentId: uuidv4(),
      authorId: caller.userId,
      body: dto.body,
      createdAt: new Date().toISOString(),
    };
    await this.db.put(this.table, comment);
    return comment;
  }

  async findAll(taskId: string, caller: CognitoUser) {
    await this.tasks.findOne(taskId, caller);
    return this.db.query({
      TableName: this.table,
      KeyConditionExpression: 'taskId = :tid',
      ExpressionAttributeValues: { ':tid': taskId },
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/backend && npx jest comments.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 6: Create `apps/backend/src/comments/comments.controller.ts`**

```typescript
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { CognitoUser } from '@mini-jira/shared';

@Controller('tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  create(@Param('taskId') taskId: string, @Body() dto: CreateCommentDto, @CurrentUser() user: CognitoUser) {
    return this.commentsService.create(taskId, dto, user);
  }

  @Get()
  findAll(@Param('taskId') taskId: string, @CurrentUser() user: CognitoUser) {
    return this.commentsService.findAll(taskId, user);
  }
}
```

- [ ] **Step 7: Create `apps/backend/src/comments/comments.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
```

- [ ] **Step 8: Register in AppModule**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DynamodbModule } from './dynamodb/dynamodb.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { CommentsModule } from './comments/comments.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule, DynamodbModule, ProjectsModule, TasksModule, CommentsModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/comments apps/backend/src/app.module.ts
git commit -m "feat: add Comments module with team-access enforcement via TasksService"
```

---

### Task 7: Teams & Users Modules (Manager only)

**Files:**
- Create: `apps/backend/src/teams/dto/create-team.dto.ts`
- Create: `apps/backend/src/teams/teams.service.ts`
- Create: `apps/backend/src/teams/teams.controller.ts`
- Create: `apps/backend/src/teams/teams.module.ts`
- Create: `apps/backend/src/users/users.service.ts`
- Create: `apps/backend/src/users/users.controller.ts`
- Create: `apps/backend/src/users/users.module.ts`

- [ ] **Step 1: Create Teams DTO**

`apps/backend/src/teams/dto/create-team.dto.ts`:

```typescript
import { IsString, IsNotEmpty } from 'class-validator';

export class CreateTeamDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() teamId: string;
}
```

- [ ] **Step 2: Create `apps/backend/src/teams/teams.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { Team } from '@mini-jira/shared';

@Injectable()
export class TeamsService {
  private readonly table = process.env.DYNAMO_TEAMS_TABLE!;

  constructor(private readonly db: DynamodbService) {}

  async create(dto: CreateTeamDto): Promise<Team> {
    const team: Team = { teamId: dto.teamId, name: dto.name, createdAt: new Date().toISOString() };
    await this.db.put(this.table, team);
    return team;
  }

  async findAll() {
    return this.db.scan({ TableName: this.table });
  }

  async findOne(teamId: string): Promise<Team> {
    const item = await this.db.get(this.table, { teamId });
    if (!item) throw new NotFoundException(`Team ${teamId} not found`);
    return item as Team;
  }
}
```

- [ ] **Step 3: Create `apps/backend/src/teams/teams.controller.ts`**

```typescript
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { ManagerOnly } from '../auth/team.guard';

@Controller('teams')
@ManagerOnly()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post() create(@Body() dto: CreateTeamDto) { return this.teamsService.create(dto); }
  @Get() findAll() { return this.teamsService.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.teamsService.findOne(id); }
}
```

- [ ] **Step 4: Create `apps/backend/src/teams/teams.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

@Module({ controllers: [TeamsController], providers: [TeamsService], exports: [TeamsService] })
export class TeamsModule {}
```

- [ ] **Step 5: Create `apps/backend/src/users/users.service.ts`**

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { DynamodbService } from '../dynamodb/dynamodb.service';
import { User } from '@mini-jira/shared';

@Injectable()
export class UsersService {
  private readonly table = process.env.DYNAMO_USERS_TABLE!;

  constructor(private readonly db: DynamodbService) {}

  async upsert(user: User): Promise<void> {
    await this.db.put(this.table, user);
  }

  async findOne(userId: string): Promise<User> {
    const item = await this.db.get(this.table, { userId });
    if (!item) throw new NotFoundException(`User ${userId} not found`);
    return item as User;
  }

  async findAll() {
    return this.db.scan({ TableName: this.table });
  }
}
```

- [ ] **Step 6: Create `apps/backend/src/users/users.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { UsersService } from './users.service';
import { ManagerOnly } from '../auth/team.guard';

@Controller('users')
@ManagerOnly()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}
  @Get() findAll() { return this.usersService.findAll(); }
}
```

- [ ] **Step 7: Create `apps/backend/src/users/users.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ controllers: [UsersController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
```

- [ ] **Step 8: Register all new modules in AppModule**

```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DynamodbModule } from './dynamodb/dynamodb.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { CommentsModule } from './comments/comments.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AuthModule, DynamodbModule, ProjectsModule, TasksModule, CommentsModule, TeamsModule, UsersModule],
  controllers: [HealthController],
})
export class AppModule {}
```

- [ ] **Step 9: Run all tests**

```bash
cd apps/backend && npx jest --no-coverage
```

Expected: all PASS

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/teams apps/backend/src/users apps/backend/src/app.module.ts
git commit -m "feat: add Teams and Users modules (manager-only)"
```

---

### Task 8: CloudWatch Metrics Service (NestJS)

**Files:**
- Create: `apps/backend/src/metrics/metrics.service.ts`
- Create: `apps/backend/src/metrics/metrics.module.ts`

- [ ] **Step 1: Install CloudWatch SDK**

```bash
cd apps/backend && npm install @aws-sdk/client-cloudwatch
```

- [ ] **Step 2: Create `apps/backend/src/metrics/metrics.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

@Injectable()
export class MetricsService {
  private readonly cw = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });
  private readonly ns = 'MiniJira';

  async taskCreated(): Promise<void> {
    await this.cw.send(new PutMetricDataCommand({
      Namespace: this.ns,
      MetricData: [{ MetricName: 'TaskCreated', Value: 1, Unit: 'Count', Timestamp: new Date() }],
    }));
  }

  async taskClosed(teamId: string, createdAt: string): Promise<void> {
    const hoursToClose = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
    await this.cw.send(new PutMetricDataCommand({
      Namespace: this.ns,
      MetricData: [
        {
          MetricName: 'TaskClosed',
          Dimensions: [{ Name: 'teamId', Value: teamId }],
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date(),
        },
        {
          MetricName: 'TaskTimeToClose',
          Value: hoursToClose,
          Unit: 'None',
          Timestamp: new Date(),
        },
      ],
    }));
  }
}
```

- [ ] **Step 3: Create `apps/backend/src/metrics/metrics.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';

@Module({ providers: [MetricsService], exports: [MetricsService] })
export class MetricsModule {}
```

- [ ] **Step 4: Wire MetricsService into TasksService**

Edit `apps/backend/src/tasks/tasks.module.ts` — add `MetricsModule` to imports:

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [forwardRef(() => FilesModule), NotificationsModule, UsersModule, MetricsModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
```

Edit `apps/backend/src/tasks/tasks.service.ts` — inject `MetricsService` and call metrics in `create` and `update`:

```typescript
// Add to constructor:
constructor(
  private readonly db: DynamodbService,
  private readonly files: FilesService,
  private readonly notifications: NotificationsService,
  private readonly users: UsersService,
  private readonly metrics: MetricsService,
) {}

// In create(), after db.put():
await this.metrics.taskCreated();

// In update(), after status transition to Done:
if (dto.status === TaskStatus.Done) {
  await this.metrics.taskClosed(task.teamId, task.createdAt);
}
```

- [ ] **Step 5: Register MetricsModule in AppModule**

Add `MetricsModule` to `apps/backend/src/app.module.ts` imports.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/metrics apps/backend/src/tasks apps/backend/src/app.module.ts
git commit -m "feat: publish TaskCreated, TaskClosed, TaskTimeToClose CloudWatch metrics from NestJS"
```

---

### Task 9: Smoke Test Demo Scenario via API

- [ ] **Step 1: Start the backend**

```bash
cd apps/backend && npm run dev
```

- [ ] **Step 2: Get Ali's access token via Cognito Hosted UI**

Log in as Ali, copy the access token from the URL fragment.

- [ ] **Step 3: Create a team**

```bash
curl -X POST http://localhost:3001/api/teams \
  -H "Authorization: Bearer <ali-token>" \
  -H "Content-Type: application/json" \
  -d '{"teamId":"team-frontend","name":"Frontend"}'
```

Expected: `{"teamId":"team-frontend","name":"Frontend","createdAt":"..."}`

- [ ] **Step 4: Create Task A assigned to Sara**

```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Authorization: Bearer <ali-token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"Task A","priority":"High","deadline":"2026-05-20","assigneeId":"sara-user-id","teamId":"team-frontend","projectId":"proj-1"}'
```

Expected: task returned with `status: "ToDo"`

- [ ] **Step 5: Get Sara's token and fetch tasks**

Log in as Sara, copy access token.

```bash
curl http://localhost:3001/api/tasks \
  -H "Authorization: Bearer <sara-token>"
```

Expected: only Task A in results (team-frontend filter applied)

- [ ] **Step 6: Commit**

```bash
git commit --allow-empty -m "test: demo scenario verified — team isolation working"
```
