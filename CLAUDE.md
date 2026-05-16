# Mini-Jira on AWS — Project Context

**Course:** Software Cloud Computing 2026 — Dr. John Zaki
**Team:** Mohamed Abdelsatar, Jessica Ehab, Donia Ali
**Deadline:** 22 May 2026 at 11:59 PM
**Design doc:** `docs/superpowers/specs/2026-05-04-mini-jira-aws-design.md`
**Implementation plans:** `docs/superpowers/plans/` (7 plans, Plan 1 currently in progress)

---

## What This Project Is

A full-stack task management app (think Jira-lite) deployed on AWS. The key demo scenario: Manager Ali creates tasks and assigns them to Sara (Frontend team) and Omar (Backend team). Sara sees only her team's tasks; Omar sees only his. Team isolation is enforced server-side at the DynamoDB query level via a GSI — not just hidden in the UI.

---

## Repository Layout

```
cloudproject/                   ← working directory (this repo)
├── apps/
│   ├── backend/                # NestJS on port 3001
│   └── frontend/               # Next.js 14 on port 3000
├── packages/
│   └── shared/                 # Shared TypeScript types & enums
├── lambdas/
│   ├── image-resize/           # S3-triggered resize Lambda
│   ├── assignment-worker/      # SQS-draining worker Lambda
│   └── daily-digest/           # EventBridge cron digest Lambda
├── docs/
│   └── superpowers/
│       ├── specs/              # Full system design doc
│       └── plans/              # 7 implementation plans
├── package.json                # npm workspaces root
├── turbo.json                  # Turborepo pipeline
└── CLAUDE.md                   # This file
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS (TypeScript), Node.js 20, PM2 |
| Frontend | Next.js 14 App Router (TypeScript), Tailwind CSS, shadcn/ui |
| Database | DynamoDB (multi-table design) |
| Auth | AWS Cognito — JWT access tokens, `aws-jwt-verify` on backend |
| File storage | S3 (`mini-jira-originals` + `mini-jira-resized`) |
| Messaging | SNS + SQS + Lambda (assignment events) |
| Scheduling | EventBridge + Lambda (daily digest at 9 AM UTC) |
| Monitoring | CloudWatch custom metrics + dashboard + alarms |
| Infrastructure | VPC, ALB, EC2 Auto Scaling Group (t2.micro × 2), CloudFront |
| Monorepo | npm workspaces + Turborepo |
| Process manager | PM2 (both apps on same EC2 instances) |

---

## Authentication & Authorization

- Cognito User Pool `mini-jira-pool`, two app clients: backend (server-side) and frontend (public)
- Custom attributes on every user: `custom:role` (`Manager` | `Employee`), `custom:teamId`
- No self-registration — admin creates users via Cognito console or Admin API
- NestJS guard stack (applied globally, in order):
  1. `JwtAuthGuard` — validates Cognito JWT using `aws-jwt-verify`
  2. `RolesGuard` — checks `custom:role` claim
  3. `TeamGuard` — for Employee requests, enforces `teamId` matches resource

### Access Control
| Role | Projects | Tasks | Comments | Teams/Users |
|------|----------|-------|----------|-------------|
| Manager | Full CRUD | Full CRUD (all teams) | Read/Create | Read all |
| Employee | Read all | Read/Update own team only | Read/Create on own team | None |

### Frontend Auth Flow
Cognito Hosted UI → tokens in httpOnly cookies → Next.js middleware validates on every request → redirect to `/login` if invalid

---

## DynamoDB Tables

| Table | PK | SK | Notable GSIs |
|-------|----|----|-------------|
| Users | `userId` | — | — |
| Teams | `teamId` | — | — |
| Projects | `projectId` | — | — |
| Tasks | `taskId` | — | GSI-1: PK=`teamId` SK=`createdAt`; GSI-2: PK=`assigneeId` SK=`createdAt` |
| Comments | `taskId` | `commentId` | — |
| AuditLog | `taskId` | `timestamp` | — |

GSI-1 is the team isolation query index. GSI-2 powers "my tasks" and daily digest.

---

## REST API Summary (base: `/api`)

All endpoints require `Authorization: Bearer <cognito-jwt>` except `GET /api/health`.

- `GET /api/health` — public health check (no auth)
- `GET/POST /api/projects` — list / create projects
- `PATCH/DELETE /api/projects/:id` — update / delete (Manager only)
- `GET/POST /api/tasks` — list (team-filtered for Employee) / create (Manager)
- `GET/PATCH/DELETE /api/tasks/:id` — task detail / update / delete
- `GET/POST /api/tasks/:id/comments` — list / add comments
- `POST/DELETE /api/tasks/:id/image` — presigned S3 URL / delete image (Manager)
- `GET/POST /api/teams` — list / create teams (Manager)
- `GET /api/users` — list users (Manager)

All list endpoints support `limit` (default 20) and `lastEvaluatedKey` pagination params.

---

## Event-Driven Layer

```
POST /tasks (Manager assigns)
  → NestJS publishes SNS: TaskAssignedTopic
      → Email to assignee (direct SNS subscription)
      → SQS: TaskAssignedQueue (batch=1)
          → Assignment Worker Lambda
              → Writes AuditLog entry
              → CloudWatch metric: MiniJira/TasksAssigned (dim: teamId)
```

---

## File Pipeline

```
Frontend → POST /tasks/:id/image → NestJS returns presigned S3 PUT URL
Frontend uploads directly to mini-jira-originals S3 bucket
S3 PUT event → Image Resize Lambda (sharp, 400×400, JPEG)
Lambda writes thumbnail to mini-jira-resized
Lambda updates Task.resizedImageKey in DynamoDB
```

---

## CloudWatch Monitoring

Dashboard: `MiniJira-Dashboard`

Custom metrics published by NestJS:
- `MiniJira/TaskCreated` — on every POST /tasks
- `MiniJira/TaskClosed` — on every → Done transition (dim: teamId)
- `MiniJira/TaskTimeToClose` — hours from createdAt to Done

CloudWatch Alarm: `OverdueTasksAlarm` — `MiniJira/OverdueTasks > 10` → SNS email to manager

---

## Infrastructure

```
Users → CloudFront → ALB (public subnets, 2 AZs)
                      → EC2 ASG t2.micro × 2 (private subnets)
                           → NestJS :3001  (ALB rule: /api/*)
                           → Next.js :3000 (ALB rule: /*)
```

ASG: min 2 / max 4, Amazon Linux 2023, Node.js 20, PM2. Health check: `/api/health`.
**Free tier note:** Stop EC2 + ALB when not demoing (750 hours/month free tier).

---

## Implementation Plans Progress

| Plan | Title | Status |
|------|-------|--------|
| Plan 1 | Auth & Cognito Setup | **Complete** |
| Plan 2 | Core CRUD API (NestJS + DynamoDB) | **Tasks 1–8 complete; Task 9 (smoke test, AWS-dependent) pending** |
| Plan 3 | File Pipeline (S3 + Lambda resize) | **Code complete (Tasks 2–4 done); AWS Console steps deferred** |
| Plan 4 | Event-Driven Layer (SNS + SQS + Worker) | Pending |
| Plan 5 | Scheduled Jobs (EventBridge + Digest Lambda) | Pending |
| Plan 6 | Frontend (Next.js + Kanban UI) | Pending |
| Plan 7 | Infrastructure (VPC + ALB + ASG + CloudFront) | Pending |

---

## Deferred AWS Console Steps

All code is written and tested. These AWS Console steps must be completed **before the smoke test / demo**. Do them all in one session just before Plan 7 (Infrastructure) goes live.

### From Plan 3 — File Pipeline

**S3 Buckets (Plan 3, Task 1)**
- Create bucket `mini-jira-originals-<account-id>` — region `us-east-1`, block all public access, versioning OFF
- Create bucket `mini-jira-resized-<account-id>` — region `us-east-1`, block all public access
- Add CORS to originals bucket: AllowedMethods `[PUT]`, AllowedOrigins `[http://localhost:3000, https://<cloudfront-domain>]`, AllowedHeaders `[*]`
- Add to `apps/backend/.env`: `S3_ORIGINALS_BUCKET=mini-jira-originals-<account-id>` and `S3_RESIZED_BUCKET=mini-jira-resized-<account-id>`
- IAM → Role `EC2InstanceRole` → inline policy: `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:ListBucket` on both bucket ARNs

**Image Resize Lambda (Plan 3, Task 5)**
- Build + zip: `cd lambdas/image-resize && npm install && npm run build && cd dist && zip -r ../function.zip .`
- Lambda → Create function: name `mini-jira-image-resize`, runtime Node.js 20.x, x86_64, new role `ImageResizeLambdaRole`
- Upload `lambdas/image-resize/function.zip`
- Lambda env vars: `AWS_REGION=us-east-1`, `S3_RESIZED_BUCKET=mini-jira-resized-<account-id>`, `DYNAMO_TASKS_TABLE=mini-jira-tasks`
- S3 trigger: bucket `mini-jira-originals-<account-id>`, event type `PUT`, prefix `originals/`
- IAM → `ImageResizeLambdaRole` → inline policy: `s3:GetObject` on originals, `s3:PutObject` on resized, `dynamodb:UpdateItem` on tasks table

---

## Current State (Plan 3 code complete — 29 backend + 8 Lambda tests passing)

**Done:**
- Monorepo root scaffolded: `package.json`, `turbo.json`, `.gitignore`
- `packages/shared/` with all TypeScript types
- Plan 1 (Auth & Cognito): NestJS backend scaffolded, JwtAuthGuard, RolesGuard, health endpoint, Cognito configured (`eu-central-1_KxmWvTWiA`)
- Plan 2 Task 1: DynamoDB tables created in AWS + `.env` vars set
- Plan 2 Task 2: `DynamodbService` (global module, AWS SDK v3 DocumentClient) — also has `removeAttributes` for REMOVE expressions
- Plan 2 Task 3: `TeamGuard` + `ManagerOnly()` decorator
- Plan 2 Task 4: Projects CRUD module (Manager-only create/update/delete)
- Plan 2 Task 5: Tasks CRUD module with server-side team isolation via GSI, audit log
- Plan 2 Task 6: Comments module with team-access enforcement via TasksService
- Plan 2 Task 7: Teams + Users modules (Manager-only)
- Plan 2 Task 8: MetricsService — publishes TaskCreated, TaskClosed (teamId dim), TaskTimeToClose to CloudWatch; CloudWatch failures isolated with try/catch
- Plan 3 Task 2: `FilesService` — presigned S3 PUT URLs, version retention (history/ prefix), bulk delete, DynamoDB cleanup
- Plan 3 Task 3: `FilesController` — POST/confirm/DELETE on `/api/tasks/:id/image`; task deletion auto-cleans images via forwardRef injection
- Plan 3 Task 4: `image-resize` Lambda — sharp 400×400 JPEG, per-record error isolation, body undefined guard, DynamoDB condition check

**Up next:** Plan 4 — Event-Driven Layer (SNS + SQS + Assignment Worker Lambda)

---

## Key Decisions & Conventions

- **Port convention:** Backend always 3001, frontend always 3000
- **API prefix:** All NestJS routes are prefixed with `/api` via `app.setGlobalPrefix('api')`
- **JWT validation:** `aws-jwt-verify` library, NOT `passport-jwt` — no Passport dependency
- **Health endpoint is public:** `GET /api/health` is exempted from `JwtAuthGuard`
- **Team isolation is server-side:** Employee task queries always append a `teamId` filter at the DynamoDB level
- **No self-registration:** Users are created by admin/manager via Cognito console
- **Shared types path alias:** Both apps resolve `@mini-jira/shared` to `../../packages/shared/src/index.ts` in dev (TypeScript paths), to the compiled `dist/` in production
- **Environment files:** Never commit `.env`, `.env.*`, or `*.env` files — all are gitignored
- **No `@nestjs/passport`:** Auth guard uses `aws-jwt-verify` directly for Cognito token verification
- **Pagination:** DynamoDB cursor-based — `limit` + `lastEvaluatedKey` query params on all list endpoints

---

## Environment Variables

### `apps/backend/.env`
```
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=<backend-app-client-id>
FRONTEND_URL=http://localhost:3000
AWS_REGION=us-east-1
```

### `apps/frontend/.env.local`
```
NEXT_PUBLIC_COGNITO_DOMAIN=https://mini-jira-auth.auth.us-east-1.amazoncognito.com
NEXT_PUBLIC_COGNITO_CLIENT_ID=<frontend-app-client-id>
NEXT_PUBLIC_APP_URL=http://localhost:3000
BACKEND_URL=http://localhost:3001
```

---

## Running Locally

```bash
# Install all dependencies (from repo root)
npm install

# Build shared package first
cd packages/shared && npm run build && cd ../..

# Start backend (terminal 1)
cd apps/backend && npm run dev

# Start frontend (terminal 2)
cd apps/frontend && npm run dev
```

Backend: http://localhost:3001/api/health
Frontend: http://localhost:3000 (redirects to /login if no token)
