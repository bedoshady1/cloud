import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }));
const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
const cloudwatch = new CloudWatchClient({ region: process.env.AWS_REGION || 'us-east-1' });

interface TaskItem {
  taskId: string;
  title: string;
  priority: string;
  status: string;
  assigneeId: string;
  deadline: string;
  projectId?: string;
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

export function buildDigestEmail(displayName: string, tasks: TaskItem[], date: string, appUrl: string): { subject: string; body: string } {
  const taskList = tasks
    .map((t) => `• ${t.title} [${t.priority}] — ${t.projectId ?? 'N/A'} — ${t.status}`)
    .join('\n');

  const body = `Hi ${displayName},\nYou have ${tasks.length} task${tasks.length !== 1 ? 's' : ''} due or overdue today (${date}):\n${taskList}\n\nLog in at ${appUrl} to update your tasks.`;

  return {
    subject: `[Mini-Jira] Your tasks due today — ${date}`,
    body,
  };
}

export const handler = async (): Promise<void> => {
  const today = getTodayDateString();
  const tasksTable = process.env.DYNAMO_TASKS_TABLE;
  const usersTable = process.env.DYNAMO_USERS_TABLE;
  const digestTopicArn = process.env.SNS_DIGEST_TOPIC_ARN;
  const appUrl = process.env.APP_URL || 'https://your-app.cloudfront.net';

  for (const [name, val] of [['DYNAMO_TASKS_TABLE', tasksTable], ['DYNAMO_USERS_TABLE', usersTable], ['SNS_DIGEST_TOPIC_ARN', digestTopicArn]] as [string, string | undefined][]) {
    if (!val) throw new Error(`Missing required env var: ${name}`);
  }

  // Paginated scan: deadline <= today AND status != Done
  let items: TaskItem[] = [];
  let lastKey: Record<string, any> | undefined;
  try {
    do {
      const scanResult = await dynamo.send(new ScanCommand({
        TableName: tasksTable,
        FilterExpression: 'deadline <= :today AND #st <> :done',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':today': today, ':done': 'Done' },
        ExclusiveStartKey: lastKey,
      }));
      items.push(...((scanResult.Items ?? []) as TaskItem[]));
      lastKey = scanResult.LastEvaluatedKey as Record<string, any> | undefined;
    } while (lastKey);
  } catch (e) {
    console.error('Failed to scan Tasks table:', e);
    throw e;
  }

  if (items.length === 0) {
    console.log(`No tasks due today (${today}). Exiting.`);
    try {
      await cloudwatch.send(new PutMetricDataCommand({
        Namespace: 'MiniJira',
        MetricData: [{ MetricName: 'OverdueTasks', Value: 0, Unit: 'Count', Timestamp: new Date() }],
      }));
    } catch (e) {
      console.error('Failed to publish OverdueTasks=0 CloudWatch metric:', e);
    }
    return;
  }

  // Overdue = deadline strictly before today; today's tasks are not overdue
  const overdueTasks = items.filter((t) => t.deadline < today);
  try {
    await cloudwatch.send(new PutMetricDataCommand({
      Namespace: 'MiniJira',
      MetricData: [
        { MetricName: 'OverdueTasks', Value: overdueTasks.length, Unit: 'Count', Timestamp: new Date() },
        { MetricName: 'DailyDigestSent', Dimensions: [{ Name: 'date', Value: today }], Value: 1, Unit: 'Count', Timestamp: new Date() },
      ],
    }));
  } catch (e) {
    console.error('Failed to publish CloudWatch metrics:', e);
  }

  const grouped = groupTasksByAssignee(items);

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

    const { subject, body } = buildDigestEmail(user.displayName, assigneeTasks, today, appUrl);

    try {
      await sns.send(new PublishCommand({
        TopicArn: digestTopicArn,
        Subject: subject,
        Message: body,
      }));
      console.log(`Sent digest to ${user.email} for ${assigneeTasks.length} tasks`);
    } catch (e) {
      console.error(`Failed to send digest to ${user.email}:`, e);
    }
  }
};
