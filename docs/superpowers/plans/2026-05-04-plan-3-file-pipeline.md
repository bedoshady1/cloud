# File Pipeline (S3 + Lambda Image Resize) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement S3 image upload (presigned URLs), image version retention on update, deletion on task delete, and a Lambda that auto-resizes uploads to 400×400 thumbnails.

**Architecture:** NestJS generates presigned S3 PUT URLs — the browser uploads directly to `mini-jira-originals`. An S3 event notification triggers the `image-resize` Lambda which uses `sharp` to write a thumbnail to `mini-jira-resized` and updates the Task record in DynamoDB. Old image versions are retained under a history prefix.

**Tech Stack:** AWS S3, AWS Lambda (Node.js 20.x), `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `sharp`, NestJS FilesModule, Jest

**Prerequisite:** Plan 2 (Core CRUD API) must be complete.

---

## File Map

```
apps/backend/src/
└── files/
    ├── files.module.ts
    ├── files.service.ts             # presign, delete, list versions
    ├── files.controller.ts          # POST /tasks/:id/image, DELETE /tasks/:id/image
    └── files.service.spec.ts

lambdas/image-resize/
├── package.json
├── tsconfig.json
├── src/
│   ├── handler.ts                   # Lambda entry point
│   └── handler.spec.ts
└── dist/                            # compiled output (zipped for deployment)
```

---

### Task 1: S3 Bucket Setup (AWS Console)

- [ ] **Step 1: Create originals bucket**

S3 → Create bucket:
- Name: `mini-jira-originals-<your-account-id>` (must be globally unique)
- Region: `us-east-1`
- Block all public access: ON
- Versioning: OFF (we handle versions manually via key prefixes)

- [ ] **Step 2: Create resized bucket**

- Name: `mini-jira-resized-<your-account-id>`
- Region: `us-east-1`
- Block all public access: ON

- [ ] **Step 3: Add CORS to originals bucket**

S3 → originals bucket → Permissions → CORS:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT"],
    "AllowedOrigins": ["http://localhost:3000", "https://<cloudfront-domain>"],
    "ExposeHeaders": []
  }
]
```

- [ ] **Step 4: Add bucket names to backend `.env`**

```bash
S3_ORIGINALS_BUCKET=mini-jira-originals-<account-id>
S3_RESIZED_BUCKET=mini-jira-resized-<account-id>
```

- [ ] **Step 5: Grant EC2 instance role S3 permissions**

IAM → Role `EC2InstanceRole` → Add inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::mini-jira-originals-<account-id>",
        "arn:aws:s3:::mini-jira-originals-<account-id>/*"
      ]
    }
  ]
}
```

---

### Task 2: FilesService (NestJS)

**Files:**
- Create: `apps/backend/src/files/files.service.ts`
- Create: `apps/backend/src/files/files.service.spec.ts`

- [ ] **Step 1: Install S3 SDK packages**

```bash
cd apps/backend && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: Write failing test**

`apps/backend/src/files/files.service.spec.ts`:

```typescript
import { FilesService } from './files.service';

const mockS3 = { send: jest.fn() };
const mockDynamo = { update: jest.fn(), get: jest.fn() };

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => mockS3),
  PutObjectCommand: jest.fn((input) => input),
  DeleteObjectCommand: jest.fn((input) => input),
  ListObjectsV2Command: jest.fn((input) => input),
  DeleteObjectsCommand: jest.fn((input) => input),
  CopyObjectCommand: jest.fn((input) => input),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

describe('FilesService', () => {
  let service: FilesService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.S3_ORIGINALS_BUCKET = 'test-originals';
    process.env.S3_RESIZED_BUCKET = 'test-resized';
    process.env.DYNAMO_TASKS_TABLE = 'mini-jira-tasks';
    service = new FilesService(mockDynamo as any);
  });

  it('generates a presigned upload URL', async () => {
    const result = await service.getPresignedUploadUrl('task-1', 'image.jpg');
    expect(result.uploadUrl).toContain('presigned-url');
    expect(result.key).toContain('task-1');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd apps/backend && npx jest files.service.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './files.service'`

- [ ] **Step 4: Create `apps/backend/src/files/files.service.ts`**

```typescript
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

    await this.db.update(this.tasksTable, { taskId }, {
      imageKey: null,
      resizedImageKey: null,
      updatedAt: new Date().toISOString(),
    });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd apps/backend && npx jest files.service.spec.ts --no-coverage
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/files/files.service.ts apps/backend/src/files/files.service.spec.ts
git commit -m "feat: add FilesService with presigned S3 URLs and image version retention"
```

---

### Task 3: FilesController

**Files:**
- Create: `apps/backend/src/files/files.controller.ts`
- Create: `apps/backend/src/files/files.module.ts`

- [ ] **Step 1: Create `apps/backend/src/files/files.controller.ts`**

```typescript
import { Body, Controller, Delete, Param, Post } from '@nestjs/common';
import { FilesService } from './files.service';
import { TasksService } from '../tasks/tasks.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { ManagerOnly } from '../auth/team.guard';
import { CognitoUser } from '@mini-jira/shared';
import { IsString } from 'class-validator';

class ConfirmUploadDto {
  @IsString() imageKey: string;
  @IsString() filename: string;
}

@Controller('tasks/:taskId/image')
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    private readonly tasksService: TasksService,
  ) {}

  @Post()
  @ManagerOnly()
  async getUploadUrl(
    @Param('taskId') taskId: string,
    @Body() dto: ConfirmUploadDto,
    @CurrentUser() user: CognitoUser,
  ) {
    const task = await this.tasksService.findOne(taskId, user);
    if (task.imageKey) {
      return this.filesService.replaceImage(taskId, dto.filename, task.imageKey);
    }
    return this.filesService.getPresignedUploadUrl(taskId, dto.filename);
  }

  @Post('confirm')
  @ManagerOnly()
  async confirmUpload(
    @Param('taskId') taskId: string,
    @Body() dto: ConfirmUploadDto,
  ) {
    await this.filesService.confirmUpload(taskId, dto.imageKey);
    return { success: true };
  }

  @Delete()
  @ManagerOnly()
  async deleteImage(@Param('taskId') taskId: string) {
    await this.filesService.deleteTaskImages(taskId);
    return { success: true };
  }
}
```

- [ ] **Step 2: Create `apps/backend/src/files/files.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [TasksModule],
  controllers: [FilesController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
```

- [ ] **Step 3: Register in AppModule**

Add `FilesModule` to `apps/backend/src/app.module.ts` imports array alongside existing modules.

- [ ] **Step 4: Hook task deletion to image cleanup**

Edit `apps/backend/src/tasks/tasks.service.ts` — inject `FilesService` and call `deleteTaskImages` in `remove`:

```typescript
// Add to constructor:
constructor(private readonly db: DynamodbService, private readonly files: FilesService) {}

// Update remove():
async remove(taskId: string): Promise<void> {
  const task = await this.db.get(this.table, { taskId });
  if (!task) throw new NotFoundException(`Task ${taskId} not found`);
  if (task.imageKey) await this.files.deleteTaskImages(taskId);
  await this.db.delete(this.table, { taskId });
}
```

Add `FilesModule` to `TasksModule` imports to resolve the circular dependency via `forwardRef` if needed:

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [forwardRef(() => FilesModule)],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
```

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/files apps/backend/src/tasks apps/backend/src/app.module.ts
git commit -m "feat: add FilesController and wire image cleanup into task deletion"
```

---

### Task 4: Image Resize Lambda

**Files:**
- Create: `lambdas/image-resize/package.json`
- Create: `lambdas/image-resize/tsconfig.json`
- Create: `lambdas/image-resize/src/handler.ts`
- Create: `lambdas/image-resize/src/handler.spec.ts`

- [ ] **Step 1: Create `lambdas/image-resize/package.json`**

```json
{
  "name": "image-resize-lambda",
  "version": "1.0.0",
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "package": "npm run build && cd dist && zip -r ../function.zip ."
  },
  "dependencies": {
    "@aws-sdk/client-dynamodb": "^3.0.0",
    "@aws-sdk/lib-dynamodb": "^3.0.0",
    "@aws-sdk/client-s3": "^3.0.0",
    "sharp": "^0.33.0"
  },
  "devDependencies": {
    "@types/aws-lambda": "^8.10.0",
    "@types/jest": "^29.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.4.0"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 2: Create `lambdas/image-resize/tsconfig.json`**

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

`lambdas/image-resize/src/handler.spec.ts`:

```typescript
import { extractTaskIdFromKey } from './handler';

describe('extractTaskIdFromKey', () => {
  it('extracts taskId from S3 key', () => {
    const key = 'originals/task-abc-123/current/1234567890-photo.jpg';
    expect(extractTaskIdFromKey(key)).toBe('task-abc-123');
  });

  it('returns null for malformed key', () => {
    expect(extractTaskIdFromKey('bad-key')).toBeNull();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
cd lambdas/image-resize && npm install && npx jest --no-coverage
```

Expected: FAIL — `extractTaskIdFromKey is not exported`

- [ ] **Step 5: Create `lambdas/image-resize/src/handler.ts`**

```typescript
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
```

- [ ] **Step 6: Run test to verify it passes**

```bash
cd lambdas/image-resize && npx jest --no-coverage
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lambdas/image-resize
git commit -m "feat: add image-resize Lambda with sharp, S3 trigger, DynamoDB update"
```

---

### Task 5: Deploy Image Resize Lambda (AWS Console)

- [ ] **Step 1: Build and zip the Lambda**

```bash
cd lambdas/image-resize
npm install
npm run build
cd dist && zip -r ../function.zip . && cd ..
```

- [ ] **Step 2: Create Lambda in AWS Console**

Lambda → Create function:
- Name: `mini-jira-image-resize`
- Runtime: Node.js 20.x
- Architecture: x86_64
- Execution role: Create new role `ImageResizeLambdaRole`

- [ ] **Step 3: Upload the zip**

Lambda → Code → Upload from .zip file → upload `lambdas/image-resize/function.zip`

- [ ] **Step 4: Set environment variables in Lambda**

Lambda → Configuration → Environment variables:
```
AWS_REGION=us-east-1
S3_RESIZED_BUCKET=mini-jira-resized-<account-id>
DYNAMO_TASKS_TABLE=mini-jira-tasks
```

- [ ] **Step 5: Add S3 trigger**

Lambda → Configuration → Triggers → Add trigger:
- Source: S3
- Bucket: `mini-jira-originals-<account-id>`
- Event type: `PUT`
- Prefix: `originals/`
- Suffix: (leave empty)

- [ ] **Step 6: Grant Lambda IAM permissions**

IAM → Role `ImageResizeLambdaRole` → Add inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject"],
      "Resource": "arn:aws:s3:::mini-jira-originals-<account-id>/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::mini-jira-resized-<account-id>/*"
    },
    {
      "Effect": "Allow",
      "Action": ["dynamodb:UpdateItem"],
      "Resource": "arn:aws:dynamodb:us-east-1:*:table/mini-jira-tasks"
    }
  ]
}
```

- [ ] **Step 7: Test the pipeline end-to-end**

1. Use the backend API to get a presigned URL: `POST /api/tasks/<id>/image` with body `{"filename":"test.jpg"}`
2. Upload a JPEG to the presigned URL using curl: `curl -X PUT -T test.jpg "<presigned-url>"`
3. Check `mini-jira-resized` bucket for the thumbnail
4. Check DynamoDB Tasks table — `resizedImageKey` should be populated

- [ ] **Step 8: Commit**

```bash
git commit --allow-empty -m "chore: image resize Lambda deployed and tested end-to-end"
```
