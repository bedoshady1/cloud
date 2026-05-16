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

# Pull app from S3 artifact
aws s3 cp s3://mini-jira-deploy-artifacts-797793344799/app.tar.gz /tmp/app.tar.gz
tar -xzf /tmp/app.tar.gz -C /home/ec2-user/mini-jira

# Install dependencies
npm install --workspaces --include-workspace-root

# Build shared package
cd packages/shared && npm run build && cd ../..

# Build backend
cd apps/backend && npm run build && cd ../..

# Build frontend
cd apps/frontend && npm run build && cd ../..

# Load env vars from SSM Parameter Store into /home/ec2-user/.env
aws ssm get-parameters-by-path \
  --path /mini-jira/ \
  --with-decryption \
  --region us-east-1 \
  --query 'Parameters[*].[Name,Value]' \
  --output text | while IFS=$'\t' read -r name value; do
    key=$(echo "$name" | sed 's|/mini-jira/||')
    echo "export $key=\"$value\"" >> /home/ec2-user/.env
  done

source /home/ec2-user/.env

# Start with PM2
cd /home/ec2-user/mini-jira
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user

# Configure CloudWatch agent to ship PM2 logs
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<'CWCONFIG'
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
CWCONFIG

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
