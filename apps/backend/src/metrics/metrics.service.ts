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
