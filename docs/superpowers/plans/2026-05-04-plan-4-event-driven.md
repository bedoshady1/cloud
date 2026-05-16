# Event-Driven Layer (SNS + SQS + Assignment Worker Lambda) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a manager assigns a task, publish an SNS event that fans out to an email notification to the assignee and an SQS queue drained by a Lambda that writes an activity log entry and publishes a CloudWatch metric.

**Architecture:** NestJS `TasksService.create()` publishes to `TaskAssignedTopic` (SNS) after saving the task. SNS fans out to: (a) an email subscription for direct assignee notification, (b) `TaskAssignedQueue` (SQS). The Assignment Worker Lambda is triggered by the SQS queue, writes an `AuditLog` entry, and calls `CloudWatch.putMetricData` with `TasksAssigned` dimension `teamId`.

**Tech Stack:** AWS SNS, AWS SQS, AWS Lambda (Node.js 20.x), `@aws-sdk/client-sns`, `@aws-sdk/client-cloudwatch`, NestJS NotificationsModule, Jest

**Prerequisite:** Plan 2 (Core CRUD API) must be complete.

---

## File Map

```
apps/backend/src/
└── notifications/
    ├── notifications.module.ts
    ├── notifications.service.ts      # publishes to SNS
    └── notifications.service.spec.ts

lambdas/assignment-worker/
├── package.json
├── tsconfig.json
├── src/
│   ├── handler.ts                    # SQS trigger, AuditLog write, CW metric
│   └── handler.spec.ts
```

---

### Task 1: SNS Topic + SQS Queue Setup (AWS Console)

- [ ] **Step 1: Create SNS topic**

SNS → Create topic:
- Type: Standard
- Name: `mini-jira-task-assigned`
- Note the Topic ARN — you'll need it

- [ ] **Step 2: Add email subscription**

SNS → Topic → Create subscription:
- Protocol: Email
- Endpoint: (use a test email address for now; in production each assignee is subscribed dynamically or use a single ops email)
- Confirm the subscription from the email inbox

- [ ] **Step 3: Create SQS queue**

SQS → Create queue:
- Type: Standard
- Name: `mini-jira-task-assigned-queue`
- Visibility timeout: 30 seconds

- [ ] **Step 4: Create SQS Dead Letter Queue**

SQS → Create queue:
- Name: `mini-jira-task-assigned-dlq`
- Set as DLQ for `mini-jira-task-assigned-queue` with maxReceiveCount: 3

- [ ] **Step 5: Subscribe SQS to SNS**

SNS → Topic → Create subscription:
- Protocol: SQS
- Endpoint: ARN of `mini-jira-task-assigned-queue`

Grant SNS permission to send to SQS — SQS → Access Policy → Add:

```json
{
  "Effect": "Allow",
  "Principal": { "Service": "sns.amazonaws.com" },
  "Action": "sqs:SendMessage",
  "Resource": "<sqs-arn>",
  "Condition": { "ArnEquals": { "aws:SourceArn": "<sns-arn>" } }
}
```

- [ ] **Step 6: Add ARNs to backend `.env`**

```bash
SNS_TASK_ASSIGNED_TOPIC_ARN=arn:aws:sns:us-east-1:<account>:mini-jira-task-assigned
```

---

### Task 2: NotificationsService (NestJS)

**Files:**
- Create: `apps/backend/src/notifications/notifications.service.ts`
- Create: `apps/backend/src/notifications/notifications.service.spec.ts`
- Create: `apps/backend/src/notifications/notifications.module.ts`

- [ ] **Step 1: Install SNS SDK**

```bash
cd apps/backend && npm install @aws-sdk/client-sns
```

- [ ] **Step 2: Write failing test**

`apps/backend/src/notifications/notifications.service.spec.ts`:

```typescript
import { NotificationsService } from './notifications.service';

const mockSns = { send: jest.fn().mockResolvedValue({}) };

jest.mock('@aws-sdk/client-sns', () => ({
  SNSClient: jest.fn(() => mockSns),
  PublishCommand: jest.fn((input) => input),
}));

describe('NotificationsService', () => {
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SNS_TASK_ASSIGNED_TOPIC_ARN = 'arn:aws:sns:us-east-1:123:test-topic';
    service = new NotificationsService();
  });

  it('publishes a task assigned event to SNS', async () => {
    await service.publishTaskAssigned({
      taskId: 't1',
      taskTitle: 'Fix bug',
      assigneeId: 'emp-1',
      assigneeEmail: 'sara@example.com',
      teamId: 'team-frontend',
      managerId: 'mgr-1',
    });
    expect(mockSns.send).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/backend && npx jest notifications.service.spec.ts --no-coverage
```

Expected: FAIL

- [ ] **Step 4: Create `apps/backend/src/notifications/notifications.service.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

export interface TaskAssignedPayload {
  taskId: string;
  taskTitle: string;
  assigneeId: string;
  assigneeEmail: string;
  teamId: string;
  managerId: string;
}

@Injectable()
export class NotificationsService {
  private readonly sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
  private readonly topicArn = process.env.SNS_TASK_ASSIGNED_TOPIC_ARN!;

  async publishTaskAssigned(payload: TaskAssignedPayload): Promise<void> {
    await this.sns.send(new PublishCommand({
      TopicArn: this.topicArn,
      Message: JSON.stringify({ ...payload, assignedAt: new Date().toISOString() }),
      Subject: `[Mini-Jira] New task assigned: ${payload.taskTitle}`,
    }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/backend && npx jest notifications.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 6: Create `apps/backend/src/notifications/notifications.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 7: Wire NotificationsService into TasksService**

Edit `apps/backend/src/tasks/tasks.module.ts` to import `NotificationsModule`:

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { FilesModule } from '../files/files.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [forwardRef(() => FilesModule), NotificationsModule, UsersModule],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
```

Edit `apps/backend/src/tasks/tasks.service.ts` — inject `NotificationsService` and `UsersService`, publish after task creation:

```typescript
// Add to constructor:
constructor(
  private readonly db: DynamodbService,
  private readonly files: FilesService,
  private readonly notifications: NotificationsService,
  private readonly users: UsersService,
) {}

// In create(), after db.put():
async create(dto: CreateTaskDto, managerId: string): Promise<Task> {
  // ... existing task creation code ...
  await this.db.put(this.table, task);

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
```

- [ ] **Step 8: Register NotificationsModule in AppModule**

Add `NotificationsModule` to `apps/backend/src/app.module.ts` imports.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/notifications apps/backend/src/tasks apps/backend/src/app.module.ts
git commit -m "feat: publish SNS event on task assignment via NotificationsService"
```

---

### Task 3: Assignment Worker Lambda

**Files:**
- Create: `lambdas/assignment-worker/package.json`
- Create: `lambdas/assignment-worker/tsconfig.json`
- Create: `lambdas/assignment-worker/src/handler.ts`
- Create: `lambdas/assignment-worker/src/handler.spec.ts`

- [ ] **Step 1: Create `lambdas/assignment-worker/package.json`**

```json
{
  "name": "assignment-worker-lambda",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "package": "npm run build && cd dist && zip -r ../function.zip ."
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0",
    "@aws-sdk/client-cloudwatch": "^3.0.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.0",
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.4.0"
  },
  "jest": { "preset": "ts-jest", "testEnvironment": "node" }
}
```

- [ ] **Step 2: Create `lambdas/assignment-worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

- [ ] **Step 3: Write failing test**

`lambdas/assignment-worker/src/handler.spec.ts`:

```typescript
import { parseMessage } from './handler';

describe('parseMessage', () => {
  it('parses a valid SNS-wrapped SQS message body', () => {
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
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd lambdas/assignment-worker && npm install && npx jest --no-coverage
```

Expected: FAIL

- [ ] **Step 5: Create `lambdas/assignment-worker/src/handler.ts`**

```typescript
import { SQSEvent } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

export interface AssignmentPayload {
  taskId: string;
  taskTitle: string;
  assigneeId: string;
  assigneeEmail: string;
  teamId: string;
  managerId: string;
  assignedAt: string;
}

export function parseMessage(body: string): AssignmentPayload {
  const parsed = JSON.parse(body);
  if (!parsed.taskId || !parsed.teamId) throw new Error('Invalid payload: missing taskId or teamId');
  return parsed as AssignmentPayload;
}

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const record of event.Records) {
    let payload: AssignmentPayload;
    try {
      const outerBody = JSON.parse(record.body);
      const messageBody = outerBody.Message ?? record.body;
      payload = parseMessage(messageBody);
    } catch (e) {
      console.error('Failed to parse message:', record.body, e);
      continue;
    }

    const auditEntry = {
      taskId: payload.taskId,
      timestamp: payload.assignedAt,
      event: 'ASSIGNED',
      actorId: payload.managerId,
      targetId: payload.assigneeId,
      teamId: payload.teamId,
    };

    await dynamo.send(new PutCommand({
      TableName: process.env.DYNAMO_AUDIT_LOG_TABLE!,
      Item: auditEntry,
    }));

    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'MiniJira',
      MetricData: [{
        MetricName: 'TasksAssigned',
        Dimensions: [{ Name: 'teamId', Value: payload.teamId }],
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date(payload.assignedAt),
      }],
    }));

    console.log(`Processed assignment for task ${payload.taskId}, team ${payload.teamId}`);
  }
};
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd lambdas/assignment-worker && npx jest --no-coverage
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lambdas/assignment-worker
git commit -m "feat: add assignment-worker Lambda — writes AuditLog and CloudWatch metric"
```

---

### Task 4: Deploy Assignment Worker Lambda (AWS Console)

- [ ] **Step 1: Build and zip**

```bash
cd lambdas/assignment-worker && npm install && npm run build
cd dist && zip -r ../function.zip . && cd ..
```

- [ ] **Step 2: Create Lambda**

Lambda → Create function:
- Name: `mini-jira-assignment-worker`
- Runtime: Node.js 20.x
- Execution role: Create `AssignmentWorkerLambdaRole`

- [ ] **Step 3: Upload zip and set env vars**

Environment variables:
```
DYNAMO_AUDIT_LOG_TABLE=mini-jira-audit-log
AWS_REGION=us-east-1
```

- [ ] **Step 4: Add SQS trigger**

Lambda → Add trigger → SQS:
- Queue: `mini-jira-task-assigned-queue`
- Batch size: 1

- [ ] **Step 5: Grant IAM permissions to `AssignmentWorkerLambdaRole`**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:us-east-1:<account>:mini-jira-task-assigned-queue"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:PutItem"],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/mini-jira-audit-log"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudwatch:PutMetricData"],
      "Resource": "*"
    }
  ]
}
```

- [ ] **Step 6: End-to-end test**

1. Call `POST /api/tasks` as Manager Ali to create and assign a task
2. Check email inbox for assignment notification
3. Check DynamoDB `mini-jira-audit-log` — should have an `ASSIGNED` entry
4. Check CloudWatch → Metrics → MiniJira → `TasksAssigned` — should have a data point

- [ ] **Step 7: Commit**

```bash
git commit --allow-empty -m "chore: event-driven layer deployed and tested end-to-end"
```
