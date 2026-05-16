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
