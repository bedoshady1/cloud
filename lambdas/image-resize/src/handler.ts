import { S3Event } from 'aws-lambda';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import sharp from 'sharp';
import { Readable } from 'stream';

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export function extractTaskIdFromKey(key: string): string | null {
  const match = key.match(/^originals\/([^/]+)\/current\//);
  return match ? match[1] : null;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

export const handler = async (event: S3Event): Promise<void> => {
  for (const record of event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    const taskId = extractTaskIdFromKey(key);
    if (!taskId) {
      console.warn(`Skipping non-task key: ${key}`);
      continue;
    }

    const getResult = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const buffer = await streamToBuffer(getResult.Body as Readable);

    const resized = await sharp(buffer)
      .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const resizedKey = `originals/${taskId}/current/thumbnail.jpg`;
    const resizedBucket = process.env.S3_RESIZED_BUCKET!;

    await s3.send(new PutObjectCommand({
      Bucket: resizedBucket,
      Key: resizedKey,
      Body: resized,
      ContentType: 'image/jpeg',
    }));

    await dynamo.send(new UpdateCommand({
      TableName: process.env.DYNAMO_TASKS_TABLE!,
      Key: { taskId },
      UpdateExpression: 'SET resizedImageKey = :rk, updatedAt = :ua',
      ExpressionAttributeValues: {
        ':rk': resizedKey,
        ':ua': new Date().toISOString(),
      },
    }));

    console.log(`Resized image for task ${taskId} → ${resizedKey}`);
  }
};
