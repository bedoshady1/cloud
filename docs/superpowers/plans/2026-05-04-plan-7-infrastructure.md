# Infrastructure & High Availability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the full system to AWS with high availability: VPC across two AZs, private EC2 Auto Scaling Group, Application Load Balancer routing `/api/*` to NestJS and `/*` to Next.js, CloudFront distribution in front of the ALB, and a CloudWatch monitoring dashboard with 4 widgets and 1 alarm.

**Architecture:** Public subnets hold the ALB and NAT Gateway. Private subnets hold the EC2 ASG (min 2, max 4, t2.micro). Both apps run on each EC2 instance managed by PM2. CloudFront caches static assets and bypasses cache for `/api/*`. IAM roles enforce least-privilege for EC2, each Lambda, and Cognito.

**Tech Stack:** AWS VPC, EC2 (Auto Scaling Group), Application Load Balancer, CloudFront, PM2, Amazon Linux 2023, IAM, CloudWatch, AWS Systems Manager Parameter Store (for secrets)

**Prerequisite:** All previous plans (1-6) must be complete and tested locally.

---

## File Map

```
mini-jira/
├── scripts/
│   └── user-data.sh           # EC2 launch template bootstrap script
├── ecosystem.config.js        # PM2 config (both apps)
└── .github/
    └── workflows/
        └── deploy.yml         # optional: CI/CD pipeline
```

---

### Task 1: VPC Setup (AWS Console)

- [ ] **Step 1: Create VPC**

VPC → Create VPC:
- Name: `mini-jira-vpc`
- IPv4 CIDR: `10.0.0.0/16`
- Tenancy: Default

- [ ] **Step 2: Create public subnets**

VPC → Subnets → Create subnet (repeat twice):
- Subnet 1: Name `mini-jira-public-a`, AZ `us-east-1a`, CIDR `10.0.1.0/24`
- Subnet 2: Name `mini-jira-public-b`, AZ `us-east-1b`, CIDR `10.0.2.0/24`
- For both: Actions → Enable auto-assign public IPv4

- [ ] **Step 3: Create private subnets**

- Subnet 3: Name `mini-jira-private-a`, AZ `us-east-1a`, CIDR `10.0.11.0/24`
- Subnet 4: Name `mini-jira-private-b`, AZ `us-east-1b`, CIDR `10.0.12.0/24`

- [ ] **Step 4: Create Internet Gateway**

VPC → Internet Gateways → Create → Name: `mini-jira-igw`
Attach to `mini-jira-vpc`

- [ ] **Step 5: Create NAT Gateway**

VPC → NAT Gateways → Create:
- Name: `mini-jira-nat`
- Subnet: `mini-jira-public-a`
- Allocate Elastic IP → Create

- [ ] **Step 6: Create route tables**

Public route table:
- Name: `mini-jira-public-rt`
- Associate with: `mini-jira-public-a`, `mini-jira-public-b`
- Route: `0.0.0.0/0` → Internet Gateway

Private route table:
- Name: `mini-jira-private-rt`
- Associate with: `mini-jira-private-a`, `mini-jira-private-b`
- Route: `0.0.0.0/0` → NAT Gateway

---

### Task 2: Security Groups

- [ ] **Step 1: Create ALB Security Group**

EC2 → Security Groups → Create:
- Name: `mini-jira-alb-sg`
- VPC: `mini-jira-vpc`
- Inbound: HTTP (80) from `0.0.0.0/0`, HTTPS (443) from `0.0.0.0/0`
- Outbound: All traffic

- [ ] **Step 2: Create EC2 Security Group**

EC2 → Security Groups → Create:
- Name: `mini-jira-ec2-sg`
- VPC: `mini-jira-vpc`
- Inbound: Port 3000 from `mini-jira-alb-sg`, Port 3001 from `mini-jira-alb-sg`
- Inbound: SSH (22) from your IP only (for initial setup)
- Outbound: All traffic (for NAT Gateway egress to AWS services)

---

### Task 3: IAM Role for EC2

- [ ] **Step 1: Create EC2 instance role**

IAM → Roles → Create role:
- Trusted entity: AWS service → EC2
- Name: `mini-jira-ec2-role`

- [ ] **Step 2: Attach managed policies**

- `CloudWatchAgentServerPolicy`
- `AmazonSSMManagedInstanceCore` (for Session Manager access — no SSH keys needed)

- [ ] **Step 3: Add inline policy for app permissions**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan"],
      "Resource": [
        "arn:aws:dynamodb:us-east-1:*:table/mini-jira-*",
        "arn:aws:dynamodb:us-east-1:*:table/mini-jira-*/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject", "s3:ListBucket"],
      "Resource": [
        "arn:aws:s3:::mini-jira-originals-*",
        "arn:aws:s3:::mini-jira-originals-*/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": ["sns:Publish"],
      "Resource": "arn:aws:sns:us-east-1:*:mini-jira-*"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudwatch:PutMetricData"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:us-east-1:*:log-group:/mini-jira/*:*"
    },
    {
      "Effect": "Allow",
      "Action": ["cognito-idp:AdminGetUser"],
      "Resource": "arn:aws:cognito-idp:us-east-1:*:userpool/*"
    }
  ]
}
```

- [ ] **Step 4: Create instance profile**

IAM → Instance profiles → Create → Name: `mini-jira-ec2-profile` → attach `mini-jira-ec2-role`

---

### Task 4: PM2 Config + User Data Script

**Files:**
- Create: `ecosystem.config.js`
- Create: `scripts/user-data.sh`

- [ ] **Step 1: Create `ecosystem.config.js` at repo root**

```javascript
module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: '/home/ec2-user/mini-jira/apps/backend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '300M',
    },
    {
      name: 'frontend',
      cwd: '/home/ec2-user/mini-jira/apps/frontend',
      script: 'npm',
      args: 'run start',
      env: {
        NODE_ENV: 'production',
        PORT: '3000',
      },
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
    },
  ],
};
```

- [ ] **Step 2: Create `scripts/user-data.sh`**

```bash
#!/bin/bash
set -e

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs git

# Install PM2
npm install -g pm2

# Install CloudWatch agent
yum install -y amazon-cloudwatch-agent

# Create app directory
mkdir -p /home/ec2-user/mini-jira
cd /home/ec2-user/mini-jira

# Pull app from S3 artifact (replace with your bucket and key)
aws s3 cp s3://mini-jira-deploy-artifacts/app.tar.gz /tmp/app.tar.gz
tar -xzf /tmp/app.tar.gz -C /home/ec2-user/mini-jira

# Install dependencies
npm install --workspaces --include-workspace-root

# Build shared package
cd packages/shared && npm run build && cd ../..

# Build backend
cd apps/backend && npm run build && cd ../..

# Build frontend
cd apps/frontend && npm run build && cd ../..

# Load env vars from SSM Parameter Store
aws ssm get-parameters-by-path \
  --path /mini-jira/ \
  --with-decryption \
  --region us-east-1 \
  --query 'Parameters[*].[Name,Value]' \
  --output text | while read name value; do
    key=$(echo $name | sed 's|/mini-jira/||')
    echo "export $key=$value" >> /home/ec2-user/.env
  done

source /home/ec2-user/.env

# Start with PM2
cd /home/ec2-user/mini-jira
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Configure CloudWatch agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'EOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/home/ec2-user/.pm2/logs/backend-out.log",
            "log_group_name": "/mini-jira/backend",
            "log_stream_name": "{instance_id}"
          },
          {
            "file_path": "/home/ec2-user/.pm2/logs/backend-error.log",
            "log_group_name": "/mini-jira/backend-errors",
            "log_stream_name": "{instance_id}"
          }
        ]
      }
    }
  }
}
EOF

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
```

- [ ] **Step 3: Store environment variables in SSM Parameter Store**

SSM → Parameter Store → Create parameter for each env var:
- `/mini-jira/COGNITO_USER_POOL_ID` → SecureString
- `/mini-jira/COGNITO_CLIENT_ID` → SecureString
- `/mini-jira/AWS_REGION` → String → `us-east-1`
- `/mini-jira/DYNAMO_TASKS_TABLE` → String → `mini-jira-tasks`
- `/mini-jira/DYNAMO_USERS_TABLE` → String → `mini-jira-users`
- `/mini-jira/DYNAMO_TEAMS_TABLE` → String → `mini-jira-teams`
- `/mini-jira/DYNAMO_PROJECTS_TABLE` → String → `mini-jira-projects`
- `/mini-jira/DYNAMO_COMMENTS_TABLE` → String → `mini-jira-comments`
- `/mini-jira/DYNAMO_AUDIT_LOG_TABLE` → String → `mini-jira-audit-log`
- `/mini-jira/TASKS_TEAM_GSI` → String → `teamId-createdAt-index`
- `/mini-jira/TASKS_ASSIGNEE_GSI` → String → `assigneeId-createdAt-index`
- `/mini-jira/S3_ORIGINALS_BUCKET` → String → `mini-jira-originals-<account-id>`
- `/mini-jira/S3_RESIZED_BUCKET` → String → `mini-jira-resized-<account-id>`
- `/mini-jira/SNS_TASK_ASSIGNED_TOPIC_ARN` → String → `<arn>`
- `/mini-jira/FRONTEND_URL` → String → `https://<cloudfront-domain>`
- `/mini-jira/NEXT_PUBLIC_COGNITO_DOMAIN` → String → `https://mini-jira-auth.auth.us-east-1.amazoncognito.com`
- `/mini-jira/NEXT_PUBLIC_COGNITO_CLIENT_ID` → String → `<frontend-client-id>`
- `/mini-jira/NEXT_PUBLIC_APP_URL` → String → `https://<cloudfront-domain>`

- [ ] **Step 4: Commit**

```bash
git add ecosystem.config.js scripts/
git commit -m "chore: add PM2 ecosystem config and EC2 user-data bootstrap script"
```

---

### Task 5: Application Load Balancer

- [ ] **Step 1: Create target groups**

EC2 → Target Groups → Create:

Target group 1 (NestJS):
- Name: `mini-jira-backend-tg`
- Target type: Instance
- Protocol: HTTP, Port: 3001
- VPC: `mini-jira-vpc`
- Health check: `GET /api/health`, healthy threshold: 2, interval: 30s

Target group 2 (Next.js):
- Name: `mini-jira-frontend-tg`
- Target type: Instance
- Protocol: HTTP, Port: 3000
- Health check: `GET /`, healthy threshold: 2, interval: 30s

- [ ] **Step 2: Create Application Load Balancer**

EC2 → Load Balancers → Create → Application Load Balancer:
- Name: `mini-jira-alb`
- Scheme: Internet-facing
- VPC: `mini-jira-vpc`
- Subnets: `mini-jira-public-a`, `mini-jira-public-b`
- Security group: `mini-jira-alb-sg`

- [ ] **Step 3: Configure listeners and rules**

Listener HTTP:80 → Default action: redirect to HTTPS (or forward to frontend TG if no HTTPS cert)

Add listener rule:
- Condition: Path pattern `/api/*`
- Action: Forward to `mini-jira-backend-tg`

Default rule: Forward to `mini-jira-frontend-tg`

---

### Task 6: Auto Scaling Group

- [ ] **Step 1: Create a deployment artifact**

On your local machine, after building both apps:

```bash
cd /path/to/mini-jira
tar -czf app.tar.gz apps/backend/dist apps/frontend/.next apps/frontend/public packages/shared/dist ecosystem.config.js package.json package-lock.json apps/backend/package.json apps/frontend/package.json packages/shared/package.json
aws s3 cp app.tar.gz s3://mini-jira-deploy-artifacts/app.tar.gz
```

Create S3 bucket `mini-jira-deploy-artifacts` first if it doesn't exist.

- [ ] **Step 2: Create Launch Template**

EC2 → Launch Templates → Create:
- Name: `mini-jira-lt`
- AMI: Amazon Linux 2023 (latest, x86_64)
- Instance type: `t2.micro`
- Key pair: (optional — use SSM Session Manager instead)
- Network: Don't include in launch template (ASG handles it)
- Security groups: `mini-jira-ec2-sg`
- IAM instance profile: `mini-jira-ec2-profile`
- User data: paste contents of `scripts/user-data.sh`

- [ ] **Step 3: Create Auto Scaling Group**

EC2 → Auto Scaling Groups → Create:
- Name: `mini-jira-asg`
- Launch template: `mini-jira-lt`
- VPC: `mini-jira-vpc`
- Subnets: `mini-jira-private-a`, `mini-jira-private-b`
- Load balancing: attach to `mini-jira-backend-tg` and `mini-jira-frontend-tg`
- Min: 2, Desired: 2, Max: 4
- Health check type: ELB (uses ALB health checks)
- Health check grace period: 300 seconds

- [ ] **Step 4: Wait for instances to be healthy**

EC2 → Target Groups → `mini-jira-backend-tg` → Targets → wait for both instances to show `healthy`.

- [ ] **Step 5: Test via ALB DNS**

```bash
curl http://<alb-dns-name>/api/health
```

Expected: `{"status":"ok"}`

---

### Task 7: CloudFront Distribution

- [ ] **Step 1: Create distribution**

CloudFront → Create distribution:
- Origin domain: `<alb-dns-name>`
- Protocol: HTTP only (or HTTPS if you have a cert)
- Origin path: (empty)
- Name: `mini-jira-alb-origin`

- [ ] **Step 2: Configure cache behaviors**

Default behavior (`/*`):
- Cache policy: `CachingOptimized`
- Origin request policy: `AllViewer`
- Allowed methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE

Add behavior `/api/*`:
- Cache policy: `CachingDisabled`
- Origin request policy: `AllViewer`
- Allowed methods: GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE

- [ ] **Step 3: Note the CloudFront domain**

CloudFront → Distributions → copy the `*.cloudfront.net` domain.

- [ ] **Step 4: Update Cognito Callback URL**

Cognito → App clients → frontend client → Callback URLs → add `https://<cloudfront-domain>/auth/callback`

- [ ] **Step 5: Update SSM parameters with CloudFront domain**

Update `/mini-jira/NEXT_PUBLIC_APP_URL` and `/mini-jira/FRONTEND_URL` to `https://<cloudfront-domain>`

- [ ] **Step 6: Test via CloudFront domain**

Open `https://<cloudfront-domain>` in browser. Expected: Login page loads.

- [ ] **Step 7: Commit**

```bash
git commit --allow-empty -m "chore: CloudFront distribution deployed and tested"
```

---

### Task 8: CloudWatch Dashboard

- [ ] **Step 1: Create dashboard**

CloudWatch → Dashboards → Create dashboard → Name: `MiniJira-Dashboard`

- [ ] **Step 2: Add Widget 1 — Tasks Created Per Day**

Add widget → Line:
- Metrics → Custom namespaces → MiniJira → `TaskCreated`
- Period: 1 day, Statistic: Sum
- Title: "Tasks Created Per Day"

- [ ] **Step 3: Add Widget 2 — Tasks Closed Per Day Per Team**

Add widget → Bar:
- Metrics → MiniJira → `TaskClosed` → grouped by `teamId`
- Period: 1 day, Statistic: Sum
- Title: "Tasks Closed Per Day Per Team"

- [ ] **Step 4: Add Widget 3 — Average Time to Close**

Add widget → Line:
- Metrics → MiniJira → `TaskTimeToClose`
- Period: 1 day, Statistic: Average
- Title: "Avg Time-to-Close (hours)"

- [ ] **Step 5: Add Widget 4 — EC2 CPU Utilization**

Add widget → Line:
- Metrics → AWS/EC2 → `CPUUtilization` → filter by AutoScalingGroupName = `mini-jira-asg`
- Period: 5 min, Statistic: Average
- Title: "EC2 CPU Utilization"

- [ ] **Step 6: Save dashboard**

Click "Save dashboard"

---

### Task 9: Final Smoke Test (Demo Scenario)

- [ ] **Step 1: Log in as Ali (Manager) via CloudFront URL**

Open `https://<cloudfront-domain>` → sign in → should land on Dashboard.

- [ ] **Step 2: Create Task A for Sara**

Navigate to a project → Create task:
- Title: "Task A"
- Assignee: Sara
- Team: Frontend
- Priority: High
- Deadline: tomorrow

Expected: task appears in "To Do" column. Sara receives email notification.

- [ ] **Step 3: Create Task B for Omar**

- Title: "Task B"
- Assignee: Omar
- Team: Backend

Expected: task appears in board.

- [ ] **Step 4: Log out. Log in as Sara**

Expected: only Task A visible on Kanban board. Task B is not visible.

- [ ] **Step 5: Log in as Omar**

Expected: only Task B visible. Task A is not visible.

- [ ] **Step 6: Log back in as Ali**

Expected: both Task A and Task B visible. Team filter dropdown functional.

- [ ] **Step 7: Verify CloudWatch dashboard has data**

CloudWatch → Dashboards → MiniJira-Dashboard → confirm widgets show data points.

- [ ] **Step 8: Final commit**

```bash
git add .
git commit -m "chore: full system deployed and demo scenario verified"
```

---

### Task 10: Free Tier Reminder

- [ ] **After every session — stop EC2 instances:**

EC2 → Instances → select both instances → Instance state → Stop

- [ ] **Stop the ALB when not demoing:**

EC2 → Load Balancers → Actions → there is no "stop" for ALB — it runs 24/7. Monitor hours.
If close to 750h limit: delete ALB and recreate before demo day.

- [ ] **Keep Lambda, DynamoDB, S3, SNS, SQS, CloudFront running:**

These are serverless/managed — no hourly billing until you exceed free tier thresholds. Safe to leave running.
