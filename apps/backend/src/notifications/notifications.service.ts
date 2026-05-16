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
