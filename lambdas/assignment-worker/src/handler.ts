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
