# Scheduled Jobs (EventBridge + Daily Digest Lambda) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a Lambda triggered daily at 9:00 AM UTC by EventBridge that scans tasks due today, sends each assignee a digest email via SNS, and publishes a CloudWatch `OverdueTasks` metric used by the alarm.

**Architecture:** EventBridge scheduled rule (`cron(0 9 * * ? *)`) → `daily-digest` Lambda → scans DynamoDB Tasks table with filter on `deadline == today AND status != Done` → groups by assigneeId → fetches emails from Users table → publishes one SNS email per assignee → publishes CloudWatch metrics `DailyDigestSent` and `OverdueTasks`.

**Tech Stack:** AWS EventBridge, AWS Lambda (Node.js 20.x), AWS SNS, `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-sns`, `@aws-sdk/client-cloudwatch`, Jest

**Prerequisite:** Plan 2 (Core CRUD API) must be complete.

---

## File Map

```
lambdas/daily-digest/
├── package.json
├── tsconfig.json
├── src/
│   ├── handler.ts
│   └── handler.spec.ts
```

---

### Task 1: Create SNS Digest Topic (AWS Console)

- [ ] **Step 1: Create SNS topic for digest emails**

SNS → Create topic:
- Type: Standard
- Name: `mini-jira-daily-digest`
- Note the Topic ARN

- [ ] **Step 2: Create SNS topic for alerts**

SNS → Create topic:
- Type: Standard
- Name: `mini-jira-alerts`
- Add email subscription with your manager email address
- Confirm from inbox

---

### Task 2: Daily Digest Lambda

**Files:**
- Create: `lambdas/daily-digest/package.json`
- Create: `lambdas/daily-digest/tsconfig.json`
- Create: `lambdas/daily-digest/src/handler.ts`
- Create: `lambdas/daily-digest/src/handler.spec.ts`

- [ ] **Step 1: Create `lambdas/daily-digest/package.json`**

```json
{
  "name": "daily-digest-lambda",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "package": "npm run build && cd dist && zip -r ../function.zip ."
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0",
    "@aws-sdk/client-sns": "^3.0.0",
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

- [ ] **Step 2: Create `lambdas/daily-digest/tsconfig.json`**

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

- [ ] **Step 3: Write failing tests**

`lambdas/daily-digest/src/handler.spec.ts`:

```typescript
import { getTodayDateString, groupTasksByAssignee, buildDigestEmail } from './handler';

describe('getTodayDateString', () => {
  it('returns a date string in YYYY-MM-DD format', () => {
    const result = getTodayDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('groupTasksByAssignee', () => {
  it('groups tasks by assigneeId', () => {
    const tasks = [
      { taskId: 't1', assigneeId: 'emp-1', title: 'Task A', priority: 'High', status: 'ToDo' },
      { taskId: 't2', assigneeId: 'emp-1', title: 'Task B', priority: 'Low', status: 'InProgress' },
      { taskId: 't3', assigneeId: 'emp-2', title: 'Task C', priority: 'Medium', status: 'ToDo' },
    ];
    const grouped = groupTasksByAssignee(tasks as any[]);
    expect(grouped['emp-1']).toHaveLength(2);
    expect(grouped['emp-2']).toHaveLength(1);
  });

  it('returns empty object for no tasks', () => {
    expect(groupTasksByAssignee([])).toEqual({});
  });
});

describe('buildDigestEmail', () => {
  it('builds an email with task list', () => {
    const tasks = [
      { title: 'Fix login', priority: 'High', status: 'ToDo' },
    ];
    const email = buildDigestEmail('Sara', tasks as any[], '2026-05-04');
    expect(email.subject).toBe('[Mini-Jira] Your tasks due today — 2026-05-04');
    expect(email.body).toContain('Fix login');
    expect(email.body).toContain('High');
    expect(email.body).toContain('Sara');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd lambdas/daily-digest && npm install && npx jest --no-coverage
```

Expected: FAIL — module not found

- [ ] **Step 5: Create `lambdas/daily-digest/src/handler.ts`**

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface TaskItem {
  taskId: string;
  title: string;
  priority: string;
  status: string;
  assigneeId: string;
  deadline: string;
  teamId?: string;
}

interface UserItem {
  userId: string;
  email: string;
  displayName: string;
}

export function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0];
}

export function groupTasksByAssignee(tasks: TaskItem[]): Record<string, TaskItem[]> {
  return tasks.reduce<Record<string, TaskItem[]>>((acc, task) => {
    if (!acc[task.assigneeId]) acc[task.assigneeId] = [];
    acc[task.assigneeId].push(task);
    return acc;
  }, {});
}

export function buildDigestEmail(displayName: string, tasks: TaskItem[], date: string): { subject: string; body: string } {
  const taskList = tasks
    .map((t) => `• ${t.title} [${t.priority}] — ${t.status}`)
    .join('\n');

  const body = `Hi ${displayName},\nYou have ${tasks.length} task${tasks.length !== 1 ? 's' : ''} due today:\n${taskList}\n\nLog in at ${process.env.APP_URL || 'https://your-app.cloudfront.net'} to update your tasks.`;

  return {
    subject: `[Mini-Jira] Your tasks due today — ${date}`,
    body,
  };
}

export const handler = async (): Promise<void> => {
  const today = getTodayDateString();
  const tasksTable = process.env.DYNAMO_TASKS_TABLE!;
  const usersTable = process.env.DYNAMO_USERS_TABLE!;
  const digestTopicArn = process.env.SNS_DIGEST_TOPIC_ARN!;

  const scanResult = await dynamo.send(new ScanCommand({
    TableName: tasksTable,
    FilterExpression: 'deadline = :today AND #st <> :done',
    ExpressionAttributeNames: { '#st': 'status' },
    ExpressionAttributeValues: { ':today': today, ':done': 'Done' },
  }));

  const tasks = (scanResult.Items ?? []) as TaskItem[];

  if (tasks.length === 0) {
    console.log(`No tasks due today (${today}). Exiting.`);
    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'MiniJira',
      MetricData: [{ MetricName: 'OverdueTasks', Value: 0, Unit: 'Count', Timestamp: new Date() }],
    }));
    return;
  }

  const overdueTasks = tasks.filter((t) => t.deadline < today);
  await cloudwatch.send(new PutMetricDataCommand({
    Namespace: 'MiniJira',
    MetricData: [
      { MetricName: 'OverdueTasks', Value: overdueTasks.length, Unit: 'Count', Timestamp: new Date() },
      { MetricName: 'DailyDigestSent', Dimensions: [{ Name: 'date', Value: today }], Value: 1, Unit: 'Count', Timestamp: new Date() },
    ],
  }));

  const grouped = groupTasksByAssignee(tasks);

  for (const [assigneeId, assigneeTasks] of Object.entries(grouped)) {
    let user: UserItem;
    try {
      const result = await dynamo.send(new GetCommand({ TableName: usersTable, Key: { userId: assigneeId } }));
      if (!result.Item) { console.warn(`User ${assigneeId} not found, skipping`); continue; }
      user = result.Item as UserItem;
    } catch (e) {
      console.warn(`Error fetching user ${assigneeId}:`, e);
      continue;
    }

    const { subject, body } = buildDigestEmail(user.displayName, assigneeTasks, today);

    await sns.send(new PublishCommand({
      TopicArn: digestTopicArn,
      Subject: subject,
      Message: body,
    }));

    console.log(`Sent digest to ${user.email} for ${assigneeTasks.length} tasks`);
  }
};
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd lambdas/daily-digest && npx jest --no-coverage
```

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add lambdas/daily-digest
git commit -m "feat: add daily-digest Lambda with email digest and CloudWatch OverdueTasks metric"
```

---

### Task 3: Deploy Daily Digest Lambda + EventBridge Rule (AWS Console)

- [ ] **Step 1: Build and zip**

```bash
cd lambdas/daily-digest && npm run build
cd dist && zip -r ../function.zip . && cd ..
```

- [ ] **Step 2: Create Lambda**

Lambda → Create function:
- Name: `mini-jira-daily-digest`
- Runtime: Node.js 20.x
- Execution role: Create `DailyDigestLambdaRole`

- [ ] **Step 3: Upload zip and set env vars**

```
DYNAMO_TASKS_TABLE=mini-jira-tasks
DYNAMO_USERS_TABLE=mini-jira-users
SNS_DIGEST_TOPIC_ARN=arn:aws:sns:us-east-1:<account>:mini-jira-daily-digest
APP_URL=https://<your-cloudfront-domain>
AWS_REGION=us-east-1
```

Timeout: 5 minutes (300 seconds)

- [ ] **Step 4: Grant IAM permissions to `DailyDigestLambdaRole`**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:Scan"],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/mini-jira-tasks"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem"],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/mini-jira-users"
    },
    {
      "Effect": "Allow",
      "Action": ["sns:Publish"],
      "Resource": "arn:aws:sns:us-east-1:<account>:mini-jira-daily-digest"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudwatch:PutMetricData"],
      "Resource": "*"
    }
  ]
}
```

- [ ] **Step 5: Create EventBridge scheduled rule**

EventBridge → Rules → Create rule:
- Name: `mini-jira-daily-digest-rule`
- Schedule: `cron(0 9 * * ? *)`
- Target: Lambda function `mini-jira-daily-digest`

- [ ] **Step 6: Create CloudWatch Alarm for OverdueTasks**

CloudWatch → Alarms → Create alarm:
- Metric: `MiniJira` namespace → `OverdueTasks`
- Threshold: `> 10` for 1 evaluation period (1 day)
- Alarm name: `OverdueTasksAlarm`
- Action: Send notification to `mini-jira-alerts` SNS topic

- [ ] **Step 7: Test manually**

Lambda → Test → Create test event with empty payload `{}` → Invoke.
Check CloudWatch Logs for the Lambda output. If tasks exist with today's deadline, check email inbox.

- [ ] **Step 8: Commit**

```bash
git commit --allow-empty -m "chore: daily-digest Lambda deployed with EventBridge rule and CloudWatch alarm"
```
