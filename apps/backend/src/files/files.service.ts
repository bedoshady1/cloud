import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamodbService } from '../dynamodb/dynamodb.service';

@Injectable()
export class FilesService {
  private readonly s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  private readonly originBucket = process.env.S3_ORIGINALS_BUCKET!;
  private readonly resizedBucket = process.env.S3_RESIZED_BUCKET!;
  private readonly tasksTable = process.env.DYNAMO_TASKS_TABLE!;

  constructor(private readonly db: DynamodbService) {}

  async getPresignedUploadUrl(taskId: string, filename: string): Promise<{ uploadUrl: string; key: string }> {
    const key = `originals/${taskId}/current/${Date.now()}-${filename}`;
    const command = new PutObjectCommand({ Bucket: this.originBucket, Key: key });
    const uploadUrl = await getSignedUrl(this.s3, command, { expiresIn: 300 });
    return { uploadUrl, key };
  }

  async confirmUpload(taskId: string, imageKey: string): Promise<void> {
    await this.db.update(this.tasksTable, { taskId }, { imageKey, updatedAt: new Date().toISOString() });
  }

  async replaceImage(taskId: string, newFilename: string, oldKey: string): Promise<{ uploadUrl: string; key: string }> {
    const timestamp = Date.now();
    const historyKey = oldKey.replace('current/', `history/${timestamp}-`);
    await this.s3.send(new CopyObjectCommand({
      Bucket: this.originBucket,
      CopySource: `${this.originBucket}/${oldKey}`,
      Key: historyKey,
    }));
    return this.getPresignedUploadUrl(taskId, newFilename);
  }

  async deleteTaskImages(taskId: string): Promise<void> {
    const listResult = await this.s3.send(new ListObjectsV2Command({
      Bucket: this.originBucket,
      Prefix: `originals/${taskId}/`,
    }));

    if (listResult.Contents && listResult.Contents.length > 0) {
      await this.s3.send(new DeleteObjectsCommand({
        Bucket: this.originBucket,
        Delete: { Objects: listResult.Contents.map((o) => ({ Key: o.Key! })) },
      }));
    }

    await this.s3.send(new DeleteObjectCommand({
      Bucket: this.resizedBucket,
      Key: `originals/${taskId}/current/thumbnail.jpg`,
    })).catch(() => {});

    await Promise.all([
      this.db.update(this.tasksTable, { taskId }, { updatedAt: new Date().toISOString() }),
      this.db.removeAttributes(this.tasksTable, { taskId }, ['imageKey', 'resizedImageKey']),
    ]);
  }
}
