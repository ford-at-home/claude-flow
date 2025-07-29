# Claude-Flow Headless Mode Deployment Guide

## Overview

This comprehensive guide covers deploying Claude-Flow in headless mode across various AWS environments, including Batch Fargate, EC2 standalone, and other production scenarios. The headless mode enables Claude-Flow to run without GUI dependencies, making it perfect for server environments, containers, and automated workflows.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Docker Containerization](#docker-containerization)
3. [AWS Batch Fargate Deployment](#aws-batch-fargate-deployment)
4. [EC2 Standalone Deployment](#ec2-standalone-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Monitoring and Logging](#monitoring-and-logging)
7. [Performance Optimization](#performance-optimization)
8. [Security Configuration](#security-configuration)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements
- **Node.js**: Version 20.x or higher
- **Memory**: Minimum 2GB RAM (4GB recommended for production)
- **CPU**: 2+ vCPUs recommended for multi-agent coordination
- **Storage**: 10GB+ for logs and temporary files
- **Network**: Outbound HTTPS access to Claude API endpoints

### Required Environment Variables
```bash
# Essential Configuration
CLAUDE_FLOW_HEADLESS=true                    # Enable headless mode
ANTHROPIC_API_KEY=sk-ant-...                 # Claude API access
CLAUDE_API_ENDPOINT=https://api.anthropic.com

# Optional Configuration
CLAUDE_FLOW_EXECUTION_MODE=api               # api|gui|auto
CLAUDE_FLOW_MAX_AGENTS=5                     # Maximum concurrent agents
CLAUDE_FLOW_TIMEOUT=300000                   # Execution timeout (5 minutes)
CLAUDE_FLOW_LOG_LEVEL=info                   # debug|info|warn|error
CLAUDE_FLOW_REAL_EXECUTION=true              # Enable real agent execution
```

### AWS IAM Permissions
For AWS deployments, ensure your execution role has these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "ssm:GetParameter",
        "ssm:GetParameters",
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## Docker Containerization

### Production Dockerfile

Create a production-ready Docker image:

```dockerfile
# Multi-stage build for optimized production image
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY bin/ ./bin/

# Build the application (if TypeScript compilation is fixed)
RUN npm run build || echo "Build step skipped - using JavaScript directly"

# Production stage
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    ca-certificates \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S claudeflow && \
    adduser -S claudeflow -u 1001

WORKDIR /app

# Copy built application
COPY --from=builder --chown=claudeflow:claudeflow /app/node_modules ./node_modules
COPY --from=builder --chown=claudeflow:claudeflow /app/src ./src
COPY --from=builder --chown=claudeflow:claudeflow /app/bin ./bin
COPY --from=builder --chown=claudeflow:claudeflow /app/package*.json ./

# Create necessary directories
RUN mkdir -p /app/logs /app/tmp && \
    chown -R claudeflow:claudeflow /app/logs /app/tmp

# Switch to non-root user
USER claudeflow

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${CLAUDE_FLOW_PORT:-3000}/health || exit 1

# Environment defaults
ENV NODE_ENV=production
ENV CLAUDE_FLOW_HEADLESS=true
ENV CLAUDE_FLOW_PORT=3000
ENV CLAUDE_FLOW_HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Use dumb-init for proper signal handling
ENTRYPOINT ["dumb-init", "--"]

# Start the headless server
CMD ["node", "src/headless/index.js"]
```

### Docker Compose for Development

```yaml
version: '3.8'

services:
  claude-flow:
    build: .
    ports:
      - "3000:3000"
    environment:
      - CLAUDE_FLOW_HEADLESS=true
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CLAUDE_FLOW_LOG_LEVEL=debug
      - CLAUDE_FLOW_MAX_AGENTS=3
    volumes:
      - ./logs:/app/logs
      - ./tmp:/app/tmp
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: Add Redis for task queue
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### Build and Test Docker Image

```bash
# Build the image
docker build -t claude-flow:headless .

# Test locally
docker run -d \
  --name claude-flow-test \
  -p 3000:3000 \
  -e CLAUDE_FLOW_HEADLESS=true \
  -e ANTHROPIC_API_KEY=your-api-key \
  claude-flow:headless

# Test health check
curl http://localhost:3000/health

# Test swarm execution
curl -X POST http://localhost:3000/api/swarms \
  -H "Content-Type: application/json" \
  -d '{"objective": "Test headless deployment", "strategy": "development"}'

# Clean up
docker stop claude-flow-test && docker rm claude-flow-test
```

---

## AWS Batch Fargate Deployment

AWS Batch with Fargate provides serverless container execution, perfect for on-demand Claude-Flow swarm processing.

### 1. Create Job Definition

```json
{
  "jobDefinitionName": "claude-flow-headless",
  "type": "container",
  "platformCapabilities": ["FARGATE"],
  "containerProperties": {
    "image": "your-account.dkr.ecr.region.amazonaws.com/claude-flow:headless",
    "resourceRequirements": [
      {
        "type": "VCPU",
        "value": "2"
      },
      {
        "type": "MEMORY",
        "value": "4096"
      }
    ],
    "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
    "jobRoleArn": "arn:aws:iam::account:role/ClaudeFlowBatchRole",
    "environment": [
      {
        "name": "CLAUDE_FLOW_HEADLESS",
        "value": "true"
      },
      {
        "name": "CLAUDE_FLOW_EXECUTION_MODE",
        "value": "api"
      },
      {
        "name": "CLAUDE_FLOW_MAX_AGENTS",
        "value": "5"
      },
      {
        "name": "NODE_ENV",
        "value": "production"
      }
    ],
    "secrets": [
      {
        "name": "ANTHROPIC_API_KEY",
        "valueFrom": "arn:aws:secretsmanager:region:account:secret:claude-flow/api-key"
      }
    ],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/aws/batch/claude-flow",
        "awslogs-region": "us-east-1",
        "awslogs-stream-prefix": "headless"
      }
    },
    "networkConfiguration": {
      "assignPublicIp": "ENABLED"
    }
  },
  "timeout": {
    "attemptDurationSeconds": 3600
  },
  "retryStrategy": {
    "attempts": 2
  }
}
```

### 2. Create Compute Environment

```bash
# Create Fargate compute environment
aws batch create-compute-environment \
  --compute-environment-name claude-flow-fargate \
  --type MANAGED \
  --state ENABLED \
  --compute-resources '{
    "type": "FARGATE",
    "subnets": ["subnet-12345", "subnet-67890"],
    "securityGroupIds": ["sg-abcdef"],
    "tags": {
      "Project": "claude-flow",
      "Environment": "production"
    }
  }'
```

### 3. Create Job Queue

```bash
# Create job queue
aws batch create-job-queue \
  --job-queue-name claude-flow-queue \
  --state ENABLED \
  --priority 100 \
  --compute-environment-order '[
    {
      "order": 1,
      "computeEnvironment": "claude-flow-fargate"
    }
  ]'
```

### 4. Submit Jobs

#### Single Job Submission
```bash
# Submit a single swarm job
aws batch submit-job \
  --job-name claude-flow-research-$(date +%s) \
  --job-queue claude-flow-queue \
  --job-definition claude-flow-headless \
  --parameters '{
    "objective": "Research AI market trends for Q1 2024",
    "strategy": "research",
    "maxAgents": "8",
    "timeout": "1800"
  }'
```

#### Batch Job Submission Script
```bash
#!/bin/bash
# batch-submit-swarms.sh

OBJECTIVES=(
  "Analyze customer feedback for product improvements"
  "Research competitor pricing strategies"
  "Generate technical documentation for API endpoints"
  "Audit codebase for security vulnerabilities"
  "Create market analysis for new product launch"
)

for objective in "${OBJECTIVES[@]}"; do
  echo "Submitting job: $objective"
  
  aws batch submit-job \
    --job-name "claude-flow-$(echo "$objective" | tr ' ' '-' | tr '[:upper:]' '[:lower:]')-$(date +%s)" \
    --job-queue claude-flow-queue \
    --job-definition claude-flow-headless \
    --parameters "{
      \"objective\": \"$objective\",
      \"strategy\": \"auto\",
      \"maxAgents\": \"5\",
      \"timeout\": \"1200\"
    }"
  
  sleep 2  # Avoid rate limiting
done

echo "All jobs submitted successfully"
```

### 5. CloudFormation Template

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Claude-Flow Headless Batch Environment'

Parameters:
  ImageURI:
    Type: String
    Description: ECR URI for Claude-Flow image
    Default: !Sub "${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/claude-flow:headless"
  
  SubnetIds:
    Type: CommaDelimitedList
    Description: Subnet IDs for Fargate tasks
  
  SecurityGroupId:
    Type: String
    Description: Security Group ID for Fargate tasks

Resources:
  # IAM Roles
  BatchExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: ecs-tasks.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
      Policies:
        - PolicyName: SecretsManagerAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - secretsmanager:GetSecretValue
                Resource: !Ref AnthropicAPIKeySecret

  BatchJobRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: ecs-tasks.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: ClaudeFlowPolicy
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                  - ssm:GetParameter
                Resource: "*"

  # Secrets
  AnthropicAPIKeySecret:
    Type: AWS::SecretsManager::Secret
    Properties:
      Name: claude-flow/api-key
      Description: Anthropic API key for Claude-Flow
      SecretString: !Sub |
        {
          "ANTHROPIC_API_KEY": "your-api-key-here"
        }

  # CloudWatch Log Group
  LogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: /aws/batch/claude-flow
      RetentionInDays: 30

  # Batch Resources
  ComputeEnvironment:
    Type: AWS::Batch::ComputeEnvironment
    Properties:
      ComputeEnvironmentName: claude-flow-fargate
      Type: MANAGED
      State: ENABLED
      ComputeResources:
        Type: FARGATE
        Subnets: !Ref SubnetIds
        SecurityGroupIds:
          - !Ref SecurityGroupId
        Tags:
          Project: claude-flow
          Environment: production

  JobQueue:
    Type: AWS::Batch::JobQueue
    Properties:
      JobQueueName: claude-flow-queue
      State: ENABLED
      Priority: 100
      ComputeEnvironmentOrder:
        - Order: 1
          ComputeEnvironment: !Ref ComputeEnvironment

  JobDefinition:
    Type: AWS::Batch::JobDefinition
    Properties:
      JobDefinitionName: claude-flow-headless
      Type: container
      PlatformCapabilities:
        - FARGATE
      ContainerProperties:
        Image: !Ref ImageURI
        ResourceRequirements:
          - Type: VCPU
            Value: "2"
          - Type: MEMORY
            Value: "4096"
        ExecutionRoleArn: !GetAtt BatchExecutionRole.Arn
        JobRoleArn: !GetAtt BatchJobRole.Arn
        Environment:
          - Name: CLAUDE_FLOW_HEADLESS
            Value: "true"
          - Name: CLAUDE_FLOW_EXECUTION_MODE
            Value: "api"
          - Name: NODE_ENV
            Value: "production"
        Secrets:
          - Name: ANTHROPIC_API_KEY
            ValueFrom: !Ref AnthropicAPIKeySecret
        LogConfiguration:
          LogDriver: awslogs
          Options:
            awslogs-group: !Ref LogGroup
            awslogs-region: !Ref AWS::Region
            awslogs-stream-prefix: headless
        NetworkConfiguration:
          AssignPublicIp: ENABLED
      Timeout:
        AttemptDurationSeconds: 3600
      RetryStrategy:
        Attempts: 2

Outputs:
  JobQueueArn:
    Description: ARN of the Batch job queue
    Value: !Ref JobQueue
    Export:
      Name: !Sub "${AWS::StackName}-JobQueue"
  
  JobDefinitionArn:
    Description: ARN of the Batch job definition
    Value: !Ref JobDefinition
    Export:
      Name: !Sub "${AWS::StackName}-JobDefinition"
```

### 6. Monitoring Batch Jobs

```bash
# List jobs in queue
aws batch list-jobs --job-queue claude-flow-queue --job-status RUNNING

# Describe specific job
aws batch describe-jobs --jobs $JOB_ID

# View logs
aws logs get-log-events \
  --log-group-name /aws/batch/claude-flow \
  --log-stream-name headless/$JOB_ID \
  --start-time $(date -d '1 hour ago' +%s)000
```

---

## EC2 Standalone Deployment

For long-running services or when you need persistent infrastructure, EC2 provides full control over the deployment environment.

### 1. Launch EC2 Instance

#### User Data Script
```bash
#!/bin/bash
# EC2 User Data for Claude-Flow Headless Setup

# Update system
yum update -y
yum install -y docker git curl

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs

# Start Docker
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Create application directory
mkdir -p /opt/claude-flow
cd /opt/claude-flow

# Clone and setup Claude-Flow (replace with your repository)
git clone https://github.com/your-org/claude-flow.git .
npm install

# Create systemd service
cat > /etc/systemd/system/claude-flow.service << 'EOF'
[Unit]
Description=Claude-Flow Headless Service
After=network.target
Wants=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/claude-flow
Environment=NODE_ENV=production
Environment=CLAUDE_FLOW_HEADLESS=true
Environment=CLAUDE_FLOW_PORT=3000
Environment=CLAUDE_FLOW_HOST=0.0.0.0
EnvironmentFile=-/opt/claude-flow/.env
ExecStart=/usr/bin/node src/headless/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=claude-flow

[Install]
WantedBy=multi-user.target
EOF

# Create environment file
cat > /opt/claude-flow/.env << 'EOF'
CLAUDE_FLOW_HEADLESS=true
CLAUDE_FLOW_EXECUTION_MODE=api
CLAUDE_FLOW_MAX_AGENTS=5
CLAUDE_FLOW_TIMEOUT=300000
CLAUDE_FLOW_LOG_LEVEL=info
ANTHROPIC_API_KEY=REPLACE_WITH_ACTUAL_KEY
EOF

# Set permissions
chown -R ec2-user:ec2-user /opt/claude-flow
chmod 600 /opt/claude-flow/.env

# Enable and start service
systemctl daemon-reload
systemctl enable claude-flow
systemctl start claude-flow

# Install CloudWatch agent
wget https://s3.amazonaws.com/amazoncloudwatch-agent/amazon_linux/amd64/latest/amazon-cloudwatch-agent.rpm
rpm -U ./amazon-cloudwatch-agent.rpm

# Configure CloudWatch agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'EOF'
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "/var/log/messages",
            "log_group_name": "/aws/ec2/claude-flow/system",
            "log_stream_name": "{instance_id}/messages"
          }
        ]
      },
      "journal": {
        "log_group_name": "/aws/ec2/claude-flow/application",
        "log_stream_name": "{instance_id}/claude-flow"
      }
    }
  },
  "metrics": {
    "namespace": "Claude-Flow/EC2",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          "cpu_usage_idle",
          "cpu_usage_iowait",
          "cpu_usage_user",
          "cpu_usage_system"
        ],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": [
          "used_percent"
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "*"
        ]
      },
      "mem": {
        "measurement": [
          "mem_used_percent"
        ],
        "metrics_collection_interval": 60
      }
    }
  }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json \
  -s
```

### 2. Terraform Configuration

```hcl
# main.tf
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

# Variables
variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "key_pair_name" {
  description = "EC2 Key Pair name"
  type        = string
}

variable "anthropic_api_key" {
  description = "Anthropic API key"
  type        = string
  sensitive   = true
}

# Data sources
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]
  
  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# Security Group
resource "aws_security_group" "claude_flow" {
  name_prefix = "claude-flow-"
  description = "Security group for Claude-Flow EC2 instance"
  vpc_id      = data.aws_vpc.default.id

  # SSH access
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Restrict this in production
  }

  # HTTP API access
  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]  # Restrict this in production
  }

  # Outbound access
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "claude-flow-sg"
  }
}

# IAM Role for EC2
resource "aws_iam_role" "claude_flow_ec2" {
  name = "claude-flow-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })
}

# IAM Policy for CloudWatch and SSM
resource "aws_iam_role_policy" "claude_flow_policy" {
  name = "claude-flow-policy"
  role = aws_iam_role.claude_flow_ec2.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
          "cloudwatch:PutMetricData",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:PutParameter",
          "secretsmanager:GetSecretValue"
        ]
        Resource = "*"
      }
    ]
  })
}

# Instance Profile
resource "aws_iam_instance_profile" "claude_flow" {
  name = "claude-flow-instance-profile"
  role = aws_iam_role.claude_flow_ec2.name
}

# Secrets Manager for API Key
resource "aws_secretsmanager_secret" "anthropic_api_key" {
  name        = "claude-flow/anthropic-api-key"
  description = "Anthropic API key for Claude-Flow"
}

resource "aws_secretsmanager_secret_version" "anthropic_api_key" {
  secret_id     = aws_secretsmanager_secret.anthropic_api_key.id
  secret_string = var.anthropic_api_key
}

# User Data Template
locals {
  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    secret_arn = aws_secretsmanager_secret.anthropic_api_key.arn
    region     = var.aws_region
  }))
}

# EC2 Instance
resource "aws_instance" "claude_flow" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = var.instance_type
  key_name              = var.key_pair_name
  vpc_security_group_ids = [aws_security_group.claude_flow.id]
  iam_instance_profile   = aws_iam_instance_profile.claude_flow.name
  user_data             = local.user_data

  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = true
  }

  tags = {
    Name        = "claude-flow-headless"
    Environment = "production"
    Project     = "claude-flow"
  }
}

# Elastic IP (optional)
resource "aws_eip" "claude_flow" {
  instance = aws_instance.claude_flow.id
  domain   = "vpc"

  tags = {
    Name = "claude-flow-eip"
  }
}

# Outputs
output "instance_id" {
  description = "ID of the EC2 instance"
  value       = aws_instance.claude_flow.id
}

output "public_ip" {
  description = "Public IP address of the instance"
  value       = aws_eip.claude_flow.public_ip
}

output "api_endpoint" {
  description = "Claude-Flow API endpoint"
  value       = "http://${aws_eip.claude_flow.public_ip}:3000"
}

output "health_check_url" {
  description = "Health check URL"
  value       = "http://${aws_eip.claude_flow.public_ip}:3000/health"
}
```

### 3. Application Load Balancer Setup

```hcl
# alb.tf
# Application Load Balancer for high availability

resource "aws_lb" "claude_flow" {
  name               = "claude-flow-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets           = data.aws_subnets.default.ids

  enable_deletion_protection = false

  tags = {
    Name = "claude-flow-alb"
  }
}

resource "aws_security_group" "alb" {
  name_prefix = "claude-flow-alb-"
  description = "Security group for Claude-Flow ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "claude-flow-alb-sg"
  }
}

resource "aws_lb_target_group" "claude_flow" {
  name     = "claude-flow-tg"
  port     = 3000
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 2
    timeout             = 5
    interval            = 30
    path                = "/health"
    matcher             = "200"
    port                = "traffic-port"
    protocol            = "HTTP"
  }

  tags = {
    Name = "claude-flow-tg"
  }
}

resource "aws_lb_target_group_attachment" "claude_flow" {
  target_group_arn = aws_lb_target_group.claude_flow.arn
  target_id        = aws_instance.claude_flow.id
  port             = 3000
}

resource "aws_lb_listener" "claude_flow" {
  load_balancer_arn = aws_lb.claude_flow.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.claude_flow.arn
  }
}
```

### 4. Deployment Commands

```bash
# Deploy with Terraform
terraform init
terraform plan -var="key_pair_name=your-key-pair" \
               -var="anthropic_api_key=your-api-key"
terraform apply

# Verify deployment
INSTANCE_IP=$(terraform output -raw public_ip)
curl http://$INSTANCE_IP:3000/health

# Test swarm execution
curl -X POST http://$INSTANCE_IP:3000/api/swarms \
  -H "Content-Type: application/json" \
  -d '{"objective": "Test EC2 deployment", "strategy": "development"}'

# SSH to instance for troubleshooting
ssh -i your-key.pem ec2-user@$INSTANCE_IP

# Check service status
sudo systemctl status claude-flow
sudo journalctl -u claude-flow -f
```

### 5. Auto Scaling Group (Optional)

```hcl
# asg.tf
# Auto Scaling Group for horizontal scaling

resource "aws_launch_template" "claude_flow" {
  name_prefix   = "claude-flow-"
  image_id      = data.aws_ami.amazon_linux.id
  instance_type = var.instance_type
  key_name      = var.key_pair_name

  vpc_security_group_ids = [aws_security_group.claude_flow.id]
  iam_instance_profile {
    name = aws_iam_instance_profile.claude_flow.name
  }

  user_data = local.user_data

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size = 20
      volume_type = "gp3"
      encrypted   = true
    }
  }

  tag_specifications {
    resource_type = "instance"
    tags = {
      Name = "claude-flow-asg-instance"
    }
  }
}

resource "aws_autoscaling_group" "claude_flow" {
  name                = "claude-flow-asg"
  vpc_zone_identifier = data.aws_subnets.default.ids
  target_group_arns   = [aws_lb_target_group.claude_flow.arn]
  health_check_type   = "ELB"
  health_check_grace_period = 300

  min_size         = 1
  max_size         = 5
  desired_capacity = 2

  launch_template {
    id      = aws_launch_template.claude_flow.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "claude-flow-asg"
    propagate_at_launch = false
  }
}

# Auto Scaling Policies
resource "aws_autoscaling_policy" "scale_up" {
  name                   = "claude-flow-scale-up"
  scaling_adjustment     = 1
  adjustment_type        = "ChangeInCapacity"
  cooldown              = 300
  autoscaling_group_name = aws_autoscaling_group.claude_flow.name
}

resource "aws_autoscaling_policy" "scale_down" {
  name                   = "claude-flow-scale-down"
  scaling_adjustment     = -1
  adjustment_type        = "ChangeInCapacity"
  cooldown              = 300
  autoscaling_group_name = aws_autoscaling_group.claude_flow.name
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "high_cpu" {
  alarm_name          = "claude-flow-high-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "120"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors ec2 cpu utilization"
  alarm_actions       = [aws_autoscaling_policy.scale_up.arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.claude_flow.name
  }
}

resource "aws_cloudwatch_metric_alarm" "low_cpu" {
  alarm_name          = "claude-flow-low-cpu"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = "120"
  statistic           = "Average"
  threshold           = "20"
  alarm_description   = "This metric monitors ec2 cpu utilization"
  alarm_actions       = [aws_autoscaling_policy.scale_down.arn]

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.claude_flow.name
  }
}
```

---

## Environment Configuration

### Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_FLOW_HEADLESS` | `false` | Enable headless mode |
| `ANTHROPIC_API_KEY` | - | **Required** Claude API key |
| `CLAUDE_API_ENDPOINT` | `https://api.anthropic.com` | Claude API endpoint |
| `CLAUDE_FLOW_EXECUTION_MODE` | `auto` | Execution mode: `api`, `gui`, `auto` |
| `CLAUDE_FLOW_MAX_AGENTS` | `5` | Maximum concurrent agents |
| `CLAUDE_FLOW_TIMEOUT` | `300000` | Task timeout in milliseconds |
| `CLAUDE_FLOW_PORT` | `3000` | API server port |
| `CLAUDE_FLOW_HOST` | `0.0.0.0` | API server host |
| `CLAUDE_FLOW_LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `CLAUDE_FLOW_REAL_EXECUTION` | `true` | Enable real agent execution |
| `NODE_ENV` | `development` | Node.js environment |

### Configuration Files

#### `.env` File Template
```bash
# Core Configuration
CLAUDE_FLOW_HEADLESS=true
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
CLAUDE_API_ENDPOINT=https://api.anthropic.com

# Execution Settings
CLAUDE_FLOW_EXECUTION_MODE=api
CLAUDE_FLOW_MAX_AGENTS=5
CLAUDE_FLOW_TIMEOUT=300000
CLAUDE_FLOW_REAL_EXECUTION=true

# Server Configuration
CLAUDE_FLOW_PORT=3000
CLAUDE_FLOW_HOST=0.0.0.0

# Logging
CLAUDE_FLOW_LOG_LEVEL=info
NODE_ENV=production

# Optional: Task Queue Configuration
REDIS_URL=redis://localhost:6379
TASK_QUEUE_ENABLED=false

# Optional: Database Configuration
DATABASE_URL=sqlite:///tmp/claude-flow.db

# Optional: Monitoring
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true
```

#### Configuration Validation Script
```javascript
// validate-config.js
import { getEnvironmentConfig, isHeadless } from './src/utils/helpers.js';

function validateConfiguration() {
  console.log('🔍 Validating Claude-Flow Configuration...\n');
  
  const config = getEnvironmentConfig();
  const issues = [];
  const warnings = [];
  
  // Required configuration
  if (!config.claudeApiKey) {
    issues.push('ANTHROPIC_API_KEY is required for API execution');
  }
  
  if (!config.headless && process.env.NODE_ENV === 'production') {
    warnings.push('Headless mode recommended for production environments');
  }
  
  // Performance warnings
  if (config.maxAgents > 10) {
    warnings.push(`High agent count (${config.maxAgents}) may impact performance`);
  }
  
  if (config.timeout > 600000) { // 10 minutes
    warnings.push(`Long timeout (${config.timeout}ms) may cause resource issues`);
  }
  
  // Environment-specific checks
  if (isHeadless() && !config.claudeApiKey) {
    issues.push('Headless mode requires ANTHROPIC_API_KEY for API execution');
  }
  
  // Display results
  console.log('📋 Configuration Summary:');
  console.log(`   Headless Mode: ${config.headless ? '✅' : '❌'}`);
  console.log(`   API Key: ${config.claudeApiKey ? '✅ Set' : '❌ Missing'}`);
  console.log(`   Max Agents: ${config.maxAgents}`);
  console.log(`   Timeout: ${config.timeout}ms`);
  console.log(`   Log Level: ${process.env.CLAUDE_FLOW_LOG_LEVEL || 'info'}`);
  console.log(`   Port: ${process.env.CLAUDE_FLOW_PORT || 3000}`);
  
  if (warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(warning => console.log(`   • ${warning}`));
  }
  
  if (issues.length > 0) {
    console.log('\n❌ Issues:');
    issues.forEach(issue => console.log(`   • ${issue}`));
    console.log('\n🚫 Configuration validation failed!');
    process.exit(1);
  }
  
  console.log('\n✅ Configuration validation passed!');
}

validateConfiguration();
```

---

This is the first part of the comprehensive headless deployment guide. The documentation covers Docker containerization, AWS Batch Fargate deployment, EC2 standalone deployment, and environment configuration. Would you like me to continue with the remaining sections covering monitoring, performance optimization, security, and troubleshooting?