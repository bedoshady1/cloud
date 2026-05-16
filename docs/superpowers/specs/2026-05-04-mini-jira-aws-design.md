# Mini-Jira on AWS — Full System Design

**Course:** Software Cloud Computing 2026 — Dr. John Zaki  
**Team:** Mohamed Abdelsatar, Jessica Ehab, Donia Ali  
**Deadline:** 22/5/2026 at 11:59 PM  
**Date written:** 2026-05-04

---

## 1. Repository & Project Structure

**Approach:** Monorepo with npm workspaces + Turborepo.

```
mini-jira/
├── apps/
│   ├── backend/          # NestJS app (port 3001)
│   └── frontend/         # Next.js app (port 3000)
├── packages/
│   └── shared/           # Shared TypeScript types & enums
├── lambdas/
│   ├── image-resize/     # S3-triggered resize Lambda
│   ├── assignment-worker/ # SQS-draining worker Lambda
│   └── daily-digest/     # EventBridge-triggered digest Lambda
├── docs/
│   └── superpowers/specs/
├── package.json          # npm workspaces root
└── turbo.json            # Turborepo config
```

**Backend NestJS modules:** `auth`, `users`, `teams`, `projects`, `tasks`, `comments`, `files`, `notifications`

**Shared types package exports:** `TaskStatus`, `UserRole`, `Task`, `Project`, `Team`, `Comment`, `User`, `AuditLogEntry` — imported by both apps and all Lambdas.

**Tech stack:**
- Backend: NestJS (TypeScript), Node.js, PM2
- Frontend: Next.js (TypeScript), Tailwind CSS, shadcn/ui
- Database: DynamoDB (multi-table)
- Auth: AWS Cognito
- Process manager: PM2 (both apps on same EC2 instances)

---

## 2. Authentication & Authorization

### Cognito Setup
- One User Pool, two app clients: server-side (backend) and public (frontend)
- Custom attributes: `custom:role` (`Manager` | `Employee`), `custom:teamId`
- No self-registration — Admin/Manager creates users via Cognito Admin API and sets role + teamId at creation
- Cognito issues JWT access tokens validated by backend using `aws-jwt-verify`

### NestJS Guard Stack
- `JwtAuthGuard` — validates Cognito JWT on every protected route (applied globally)
- `RolesGuard` — checks `custom:role` claim from decoded token
- `TeamGuard` — for Employee requests, enforces that the resource's `teamId` matches `custom:teamId` from the token

### Access Control Matrix

| Role | Projects | Tasks | Comments | Teams/Users |
|------|----------|-------|----------|-------------|
| Manager | Full CRUD | Full CRUD, all teams | Read/Create | Read all |
| Employee | Read all (projects are not team-scoped) | Read/Update own team's only | Read/Create on own team's tasks | None |

### Team Isolation Rule
Every Task query in `TasksService` checks the caller's role. If `Employee`, a `teamId` filter is appended to the DynamoDB query using GSI-1. This is enforced server-side — an Employee cannot fetch a task from another team even by guessing its ID.

### Frontend Auth Flow
Cognito Hosted UI → tokens returned → stored in httpOnly cookies → Next.js middleware validates token on every page request → redirects to `/login` if invalid or expired.

---

## 3. DynamoDB Table Design

### Users Table
- PK: `userId`
- Attributes: `email`, `displayName`, `role`, `teamId`, `createdAt`

### Teams Table
- PK: `teamId`
- Attributes: `name`, `createdAt`

### Projects Table
- PK: `projectId`
- Attributes: `title`, `description`, `managerId`, `createdAt`, `updatedAt`

### Tasks Table
- PK: `taskId`
- Attributes: `title`, `description`, `status`, `priority`, `deadline`, `assigneeId`, `teamId`, `projectId`, `imageKey`, `resizedImageKey`, `createdAt`, `updatedAt`
- **GSI-1:** PK=`teamId`, SK=`createdAt` — team-scoped task queries (Employee access)
- **GSI-2:** PK=`assigneeId`, SK=`createdAt` — assignee-scoped queries (daily digest, "my tasks" view)

**Status enum:** `ToDo | InProgress | InReview | Done`  
**Priority enum:** `Low | Medium | High`

### Comments Table
- PK: `taskId`, SK: `commentId` (composite key)
- Attributes: `authorId`, `body`, `createdAt`

### AuditLog Table
- PK: `taskId`, SK: `timestamp`
- Attributes: `changedBy`, `fromStatus`, `toStatus`, `event`, `actorId`, `targetId`, `teamId`

---

## 4. Core REST API (NestJS)

**Base URL:** `https://<cloudfront-domain>/api`  
**Auth:** All endpoints require `Authorization: Bearer <cognito-jwt>` header (enforced by `JwtAuthGuard`)

### Projects
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/projects` | All | List projects |
| POST | `/projects` | Manager | Create project |
| PATCH | `/projects/:id` | Manager | Update project |
| DELETE | `/projects/:id` | Manager | Delete project |

### Tasks
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/tasks` | All | List tasks (team-filtered for Employee via GSI-1) |
| POST | `/tasks` | Manager | Create task + publish SNS assignment event |
| GET | `/tasks/:id` | All | Get task detail (TeamGuard enforced) |
| PATCH | `/tasks/:id` | All | Update task + write audit log entry |
| DELETE | `/tasks/:id` | Manager | Delete task + delete S3 images |

### Comments
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/tasks/:id/comments` | All | List comments (TeamGuard enforced) |
| POST | `/tasks/:id/comments` | All | Add comment |

### Files
| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/tasks/:id/image` | Manager | Get presigned S3 PUT URL for image upload |
| DELETE | `/tasks/:id/image` | Manager | Delete current image |

### Teams & Users (Manager only)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/teams` | List all teams |
| POST | `/teams` | Create team |
| GET | `/users` | List all users |

### Image Upload Flow
1. Frontend calls `POST /tasks/:id/image` → NestJS returns presigned S3 PUT URL (expires in 5 min)
2. Frontend uploads file directly to `mini-jira-originals` S3 bucket (bypasses EC2)
3. NestJS updates Task record with the new `imageKey`
4. S3 PUT event triggers image-resize Lambda automatically

**Pagination:** All list endpoints accept `limit` (default 20) and `lastEvaluatedKey` query params (DynamoDB cursor-based pagination).

---

## 5. File Pipeline (S3 + Lambda Image Resize)

### Two S3 Buckets
- `mini-jira-originals` — raw uploads from users
- `mini-jira-resized` — thumbnails generated by Lambda

### Image Resize Lambda
- **Trigger:** S3 PUT event on `mini-jira-originals` bucket
- **Runtime:** Node.js 20.x, `sharp` library for resizing
- **Resize target:** 400×400 max, preserve aspect ratio, JPEG output
- **Output:** writes thumbnail to `mini-jira-resized` with same key
- **Post-resize:** updates Task record in DynamoDB with `resizedImageKey`

### Image Replacement (Update)
- Old original moved to `originals/<taskId>/history/<timestamp>-<filename>` (retained)
- Old resized thumbnail overwritten with new thumbnail
- DynamoDB `imageKey` and `resizedImageKey` updated to new values

### Image Deletion (Task Delete)
- NestJS lists all objects under `originals/<taskId>/` prefix and bulk-deletes them
- Deletes current resized thumbnail from `mini-jira-resized`
- DynamoDB `imageKey` and `resizedImageKey` cleared

### IAM Permissions
- Image Resize Lambda: `s3:GetObject` on originals, `s3:PutObject` on resized, `dynamodb:UpdateItem` on Tasks
- EC2 instance role: `s3:PutObject` presign on originals only

---

## 6. Event-Driven Layer (SNS + SQS + Assignment Worker Lambda)

### Assignment Event Flow
```
POST /tasks (Manager assigns task)
  → NestJS publishes to SNS topic: TaskAssignedTopic
      → Email subscription: direct email to assignee
      → SQS subscription: TaskAssignedQueue
          → triggers Assignment Worker Lambda
              → writes AuditLog entry
              → publishes CloudWatch metric: TasksAssigned (dim: teamId)
```

### SNS Message Payload
```json
{
  "taskId": "string",
  "taskTitle": "string",
  "assigneeId": "string",
  "assigneeEmail": "string",
  "teamId": "string",
  "managerId": "string",
  "assignedAt": "ISO8601 timestamp"
}
```

### SQS Queue Config
- Type: Standard queue (ordering not required)
- Visibility timeout: 30 seconds
- Dead-letter queue: after 3 failed processing attempts

### Assignment Worker Lambda
- **Trigger:** SQS (batch size 1)
- Writes to AuditLog: `{ taskId, event: "ASSIGNED", actorId: managerId, targetId: assigneeId, teamId, timestamp }`
- Calls `CloudWatch.putMetricData`: metric `TasksAssigned`, namespace `MiniJira`, dimension `{ teamId }`

### IAM Permissions
- Worker Lambda: `sqs:ReceiveMessage` + `sqs:DeleteMessage` on TaskAssignedQueue, `dynamodb:PutItem` on AuditLog, `cloudwatch:PutMetricData`

---

## 7. Scheduled Jobs (EventBridge + Daily Digest Lambda)

### EventBridge Rule
- Schedule: `cron(0 9 * * ? *)` — every day at 9:00 AM UTC
- Target: `daily-digest` Lambda

### Daily Digest Lambda Flow
1. Scan Tasks table using GSI-2 (assigneeId index), filter `deadline == today` AND `status != Done`
2. Group due tasks by `assigneeId`
3. Fetch each assignee's email from Users table
4. Publish one SNS email per assignee with task digest
5. Publish CloudWatch metric `DailyDigestSent` with dimension `{ date }`
6. Publish CloudWatch metric `OverdueTasks` (count of tasks past deadline and not Done)

### Email Template
```
Subject: [Mini-Jira] Your tasks due today — <date>

Hi <name>,
You have <N> tasks due today:
• <title> [<priority>] — <project> — <status>
...

Log in at https://<cloudfront-url> to update your tasks.
```

### Edge Cases
- No tasks due today → early exit, no emails, no error
- Assignee email not found → log warning to CloudWatch Logs, skip that assignee
- Lambda timeout: 5 minutes

### IAM Permissions
- Daily Digest Lambda: `dynamodb:Scan` on Tasks, `dynamodb:GetItem` on Users, `sns:Publish` on digest topic, `cloudwatch:PutMetricData`

---

## 8. CloudWatch Monitoring

### Dashboard: `MiniJira-Dashboard`

| Widget | Type | Metric Source |
|--------|------|---------------|
| Tasks Created Per Day | Line chart | Custom: `MiniJira/TaskCreated` |
| Tasks Closed Per Day Per Team | Grouped bar | Custom: `MiniJira/TaskClosed` (dim: teamId) |
| Average Time-to-Close | Line chart | Custom: `MiniJira/TaskTimeToClose` (hours) |
| EC2 CPU Utilization | Line chart | `AWS/EC2` (dim: AutoScalingGroupName) |

### Custom Metrics (published by NestJS via AWS SDK)
- `TaskCreated` — on every `POST /tasks`
- `TaskClosed` — on every status transition to `Done`, dimension `{ teamId }`
- `TaskTimeToClose` — hours between `createdAt` and `Done` timestamp

### CloudWatch Alarm
- Name: `OverdueTasksAlarm`
- Metric: `MiniJira/OverdueTasks` (published by daily digest Lambda)
- Threshold: `> 10` overdue tasks → ALARM
- Action: publish to `AlertsSNSTopic` → email to manager

### Log Groups
- `/mini-jira/backend` — NestJS app logs via CloudWatch agent on EC2
- `/aws/lambda/image-resize` — automatic Lambda logs
- `/aws/lambda/assignment-worker` — automatic Lambda logs
- `/aws/lambda/daily-digest` — automatic Lambda logs

---

## 9. Frontend (Next.js + Tailwind + shadcn/ui)

### App Router Structure
```
apps/frontend/app/
├── (auth)/
│   ├── login/page.tsx
│   └── signup/page.tsx         # Admin-only user creation
├── (app)/
│   ├── dashboard/page.tsx      # Manager: all-teams overview with metrics
│   ├── projects/
│   │   ├── page.tsx            # Project list
│   │   └── [id]/page.tsx       # Project detail + Kanban board
│   ├── tasks/
│   │   └── [id]/page.tsx       # Task detail (deep-linkable)
│   └── teams/page.tsx          # Manager: team & user management
├── layout.tsx
└── middleware.ts               # Route protection via Cognito token check
```

### Key UI Components
- **Kanban Board** — 4 columns (To Do / In Progress / In Review / Done), drag-and-drop via `@dnd-kit/core`, cards show title, priority badge, assignee avatar, deadline chip
- **Task Detail Modal** — full task details, comments thread, image attachment preview (resized thumbnail), audit log timeline, status dropdown
- **Team Filter** — Manager sees team selector above board; Employee board is pre-filtered to their team (no selector shown)
- **Toast Notifications** — `sonner` library for success/error feedback on all mutations
- **Loading States** — skeleton cards during data fetch
- **Empty States** — illustrated empty state per column when no tasks exist

### API Client
Typed wrapper in `packages/shared` using `fetch`. All API calls go through this wrapper — no raw `fetch` in components. Server components call the API directly; client components use React Query for mutations and cache invalidation.

### Role-Based UI Rules
- Manager sees: team filter, "Create Task" button, "Create Project" button, all tasks across teams
- Employee sees: their team's tasks only, "Update Status" and "Add Comment" actions only, no delete or create task controls

---

## 10. AWS Infrastructure & High Availability

### VPC Layout
```
VPC (10.0.0.0/16)
├── Public Subnets (AZ-a, AZ-b)   — ALB, NAT Gateway
└── Private Subnets (AZ-a, AZ-b)  — EC2 Auto Scaling Group
```

### Service Topology
```
Users → CloudFront → ALB (public subnets)
                      → EC2 ASG (private subnets, AZ-a + AZ-b)
                           → NestJS :3001
                           → Next.js :3000
                      → DynamoDB (managed, no VPC attachment needed)
                      → S3 (via VPC endpoint or NAT Gateway)
                      → Cognito (via NAT Gateway)
```

### ALB Routing Rules
- `/api/*` → forward to NestJS target group (port 3001)
- `/*` → forward to Next.js target group (port 3000)
- Both target groups point to the same EC2 instances (different ports)

### Auto Scaling Group
- Min: 2 instances (one per AZ), Max: 4
- Launch template: Amazon Linux 2023, t2.micro (free tier)
- User-data script: installs Node.js 20, PM2, pulls app from S3 artifact or CodeDeploy
- Health check: ALB health check on `/api/health` (NestJS) and `/` (Next.js)

### CloudFront Distribution
- Origin: ALB DNS name
- Cache behaviors: static assets cached, API routes (`/api/*`) not cached (TTL=0)
- HTTPS only

### IAM Roles (least-privilege)
- `EC2InstanceRole` — DynamoDB CRUD on app tables, S3 presign on originals bucket, SNS publish, CloudWatch PutMetricData, CloudWatch Logs
- `ImageResizeLambdaRole` — S3 read originals, S3 write resized, DynamoDB UpdateItem Tasks
- `AssignmentWorkerLambdaRole` — SQS receive/delete, DynamoDB PutItem AuditLog, CloudWatch PutMetricData
- `DailyDigestLambdaRole` — DynamoDB Scan Tasks + GetItem Users, SNS Publish, CloudWatch PutMetricData

### Free Tier Awareness
- EC2: t2.micro × 2 = 1,460 hours/month used; free tier gives 750 hours/month per account — stop instances when not in use
- ALB: 750 hours/month free — same constraint, stop when not demoing
- DynamoDB: 25 GB storage + 25 WCU/RCU free — well within limits for this project
- S3: 5 GB free storage
- Lambda: 1M free requests/month — well within limits
- CloudFront: 1 TB data transfer free

---

## 11. Demo Scenario Verification

The required demo scenario must work without code changes:

1. Manager Ali logs in → creates Task A, assigns to Sara (Frontend team) → creates Task B, assigns to Omar (Backend team)
2. Sara logs in → sees only Task A (TeamGuard filters by `teamId=frontend` on GSI-1)
3. Omar logs in → sees only Task B (TeamGuard filters by `teamId=backend` on GSI-1)
4. Ali logs back in → sees both tasks, uses team filter dropdown to switch between Frontend/Backend views

This scenario is enforced server-side at the DynamoDB query level, not UI-level hiding.

---

## 12. Subsection Build Order

| # | Section | Depends On |
|---|---------|------------|
| 1 | Auth & Cognito setup | Nothing |
| 2 | Core CRUD API (NestJS + DynamoDB) | Auth |
| 3 | File Pipeline (S3 + Lambda resize) | Core API |
| 4 | Event-Driven Layer (SNS + SQS + Worker Lambda) | Core API |
| 5 | Scheduled Jobs (EventBridge + Digest Lambda) | Core API |
| 6 | Frontend (Next.js + Kanban UI) | Core API |
| 7 | Infrastructure (VPC + ALB + ASG + CloudFront) | All above |
