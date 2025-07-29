# Claude-Flow Headless Mode - Quick Start Templates

## Overview

This document provides ready-to-use templates for deploying Claude-Flow in headless mode across various environments. Copy and customize these templates for your specific use case.

---

## 🐳 Docker Quick Start

### Basic Docker Deployment
```bash
# 1. Create environment file
cat > .env << 'EOF'
CLAUDE_FLOW_HEADLESS=true
ANTHROPIC_API_KEY=your-api-key-here
CLAUDE_FLOW_MAX_AGENTS=5
CLAUDE_FLOW_PORT=3000
NODE_ENV=production
EOF

# 2. Run container
docker run -d \
  --name claude-flow-headless \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  --memory=2g \
  --cpus="2" \
  claude-flow:headless

# 3. Test deployment
curl http://localhost:3000/health
curl -X POST http://localhost:3000/api/swarms \
  -H "Content-Type: application/json" \
  -d '{"objective": "Test deployment"}'
```

### Docker Compose Production Setup
```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  claude-flow:
    image: claude-flow:headless
    ports:
      - "3000:3000"
    environment:
      - CLAUDE_FLOW_HEADLESS=true
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CLAUDE_FLOW_MAX_AGENTS=8
      - NODE_ENV=production
      - CLAUDE_FLOW_LOG_LEVEL=info
    volumes:
      - logs:/app/logs
      - tmp:/app/tmp
    restart: unless-stopped
    deploy:
      resources:
        limits:
          memory: 4G
          cpus: '2'
        reservations:
          memory: 2G
          cpus: '1'
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/ssl:ro
    depends_on:
      - claude-flow
    restart: unless-stopped

volumes:
  logs:
  tmp:
```

---

## ☁️ AWS Batch Fargate Quick Start

### 1. CloudFormation Stack (One-Click Deploy)
```yaml
# claude-flow-batch.yml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'Claude-Flow Headless on AWS Batch Fargate'

Parameters:
  AnthropicApiKey:
    Type: String
    NoEcho: true
    Description: Your Anthropic API key
  
  ImageURI:
    Type: String
    Default: !Sub "${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/claude-flow:headless"
    Description: ECR URI for Claude-Flow image
  
  SubnetIds:
    Type: CommaDelimitedList
    Description: Subnet IDs for Fargate tasks (use default VPC subnets)

Resources:
  # Quick deployment with minimal configuration
  BatchComputeEnvironment:
    Type: AWS::Batch::ComputeEnvironment
    Properties:
      ComputeEnvironmentName: !Sub "${AWS::StackName}-fargate"
      Type: MANAGED
      State: ENABLED
      ComputeResources:
        Type: FARGATE
        Subnets: !Ref SubnetIds
        SecurityGroupIds: [!Ref SecurityGroup]

  JobQueue:
    Type: AWS::Batch::JobQueue
    Properties:
      JobQueueName: !Sub "${AWS::StackName}-queue"
      State: ENABLED
      Priority: 100
      ComputeEnvironmentOrder:
        - Order: 1
          ComputeEnvironment: !Ref BatchComputeEnvironment

  JobDefinition:
    Type: AWS::Batch::JobDefinition
    Properties:
      JobDefinitionName: !Sub "${AWS::StackName}-job"
      Type: container
      PlatformCapabilities: [FARGATE]
      ContainerProperties:
        Image: !Ref ImageURI
        ResourceRequirements:
          - Type: VCPU
            Value: "2"
          - Type: MEMORY
            Value: "4096"
        ExecutionRoleArn: !GetAtt ExecutionRole.Arn
        Environment:
          - Name: CLAUDE_FLOW_HEADLESS
            Value: "true"
          - Name: ANTHROPIC_API_KEY
            Value: !Ref AnthropicApiKey
        NetworkConfiguration:
          AssignPublicIp: ENABLED

  SecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Security group for Claude-Flow Batch
      VpcId: !Ref AWS::NoValue  # Uses default VPC
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0

  ExecutionRole:
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

Outputs:
  JobQueueArn:
    Value: !Ref JobQueue
  JobDefinitionArn:
    Value: !Ref JobDefinition
  SubmitJobCommand:
    Value: !Sub |
      aws batch submit-job \
        --job-name claude-flow-$(date +%s) \
        --job-queue ${JobQueue} \
        --job-definition ${JobDefinition} \
        --parameters '{"objective":"Your task here"}'
```

### 2. Deploy Commands
```bash
# Deploy stack
aws cloudformation create-stack \
  --stack-name claude-flow-batch \
  --template-body file://claude-flow-batch.yml \
  --parameters ParameterKey=AnthropicApiKey,ParameterValue=your-api-key \
               ParameterKey=SubnetIds,ParameterValue=subnet-abc123,subnet-def456 \
  --capabilities CAPABILITY_IAM

# Submit test job
aws batch submit-job \
  --job-name claude-flow-test-$(date +%s) \
  --job-queue claude-flow-batch-queue \
  --job-definition claude-flow-batch-job \
  --parameters '{"objective":"Test Batch Fargate deployment"}'
```

---

## 🖥️ EC2 Standalone Quick Start

### 1. Terraform Quick Deploy
```hcl
# main.tf - Minimal EC2 deployment
terraform {
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

variable "aws_region" {
  default = "us-east-1"
}

variable "anthropic_api_key" {
  description = "Anthropic API key"
  type        = string
  sensitive   = true
}

variable "key_pair_name" {
  description = "EC2 Key Pair name"
  type        = string
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

# Security Group
resource "aws_security_group" "claude_flow" {
  name_prefix = "claude-flow-"
  description = "Claude-Flow security group"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 3000
    to_port     = 3000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# EC2 Instance
resource "aws_instance" "claude_flow" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = "t3.medium"
  key_name              = var.key_pair_name
  vpc_security_group_ids = [aws_security_group.claude_flow.id]

  user_data = base64encode(templatefile("${path.module}/user-data.sh", {
    anthropic_api_key = var.anthropic_api_key
  }))

  tags = {
    Name = "claude-flow-headless"
  }
}

output "public_ip" {
  value = aws_instance.claude_flow.public_ip
}

output "api_endpoint" {
  value = "http://${aws_instance.claude_flow.public_ip}:3000"
}
```

### 2. User Data Script
```bash
#!/bin/bash
# user-data.sh - EC2 initialization

# Update system
yum update -y

# Install Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
yum install -y nodejs git

# Create application directory
mkdir -p /opt/claude-flow
cd /opt/claude-flow

# Download and setup Claude-Flow
curl -L -o claude-flow.tar.gz https://github.com/your-org/claude-flow/archive/main.tar.gz
tar -xzf claude-flow.tar.gz --strip-components=1
npm install --production

# Create environment file
cat > .env << 'EOF'
CLAUDE_FLOW_HEADLESS=true
ANTHROPIC_API_KEY=${anthropic_api_key}
CLAUDE_FLOW_MAX_AGENTS=5
CLAUDE_FLOW_PORT=3000
NODE_ENV=production
EOF

# Create systemd service
cat > /etc/systemd/system/claude-flow.service << 'EOF'
[Unit]
Description=Claude-Flow Headless Service
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/opt/claude-flow
EnvironmentFile=/opt/claude-flow/.env
ExecStart=/usr/bin/node src/headless/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Set permissions and start service
chown -R ec2-user:ec2-user /opt/claude-flow
systemctl daemon-reload
systemctl enable claude-flow
systemctl start claude-flow

# Verify service is running
sleep 10
systemctl status claude-flow
```

### 3. Deploy Commands
```bash
# Deploy with Terraform
terraform init
terraform apply \
  -var="anthropic_api_key=your-api-key" \
  -var="key_pair_name=your-key-pair"

# Test deployment
INSTANCE_IP=$(terraform output -raw public_ip)
echo "Testing deployment at http://$INSTANCE_IP:3000"

# Wait for service to start
sleep 60

# Health check
curl http://$INSTANCE_IP:3000/health

# Test swarm creation
curl -X POST http://$INSTANCE_IP:3000/api/swarms \
  -H "Content-Type: application/json" \
  -d '{"objective": "Test EC2 deployment"}'
```

---

## 🚀 Kubernetes Quick Start

### 1. Kubernetes Manifests
```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: claude-flow

---
# k8s/secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: claude-flow-secrets
  namespace: claude-flow
type: Opaque
stringData:
  ANTHROPIC_API_KEY: "your-api-key-here"

---
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-flow
  namespace: claude-flow
  labels:
    app: claude-flow
spec:
  replicas: 2
  selector:
    matchLabels:
      app: claude-flow
  template:
    metadata:
      labels:
        app: claude-flow
    spec:
      containers:
      - name: claude-flow
        image: claude-flow:headless
        ports:
        - containerPort: 3000
        env:
        - name: CLAUDE_FLOW_HEADLESS
          value: "true"
        - name: CLAUDE_FLOW_MAX_AGENTS
          value: "5"
        - name: NODE_ENV
          value: "production"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: claude-flow-secrets
              key: ANTHROPIC_API_KEY
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
# k8s/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: claude-flow-service
  namespace: claude-flow
spec:
  selector:
    app: claude-flow
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: ClusterIP

---
# k8s/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: claude-flow-ingress
  namespace: claude-flow
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: claude-flow.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: claude-flow-service
            port:
              number: 80
```

### 2. Deploy Commands
```bash
# Apply all manifests
kubectl apply -f k8s/

# Check deployment status
kubectl get pods -n claude-flow
kubectl get svc -n claude-flow

# Test the service
kubectl port-forward -n claude-flow svc/claude-flow-service 3000:80

# Test in another terminal
curl http://localhost:3000/health
```

---

## 🔧 Environment-Specific Configurations

### Development Environment
```bash
# .env.development
CLAUDE_FLOW_HEADLESS=true
ANTHROPIC_API_KEY=your-dev-api-key
CLAUDE_FLOW_MAX_AGENTS=3
CLAUDE_FLOW_TIMEOUT=60000
CLAUDE_FLOW_LOG_LEVEL=debug
NODE_ENV=development
```

### Staging Environment
```bash
# .env.staging
CLAUDE_FLOW_HEADLESS=true
ANTHROPIC_API_KEY=your-staging-api-key
CLAUDE_FLOW_MAX_AGENTS=5
CLAUDE_FLOW_TIMEOUT=180000
CLAUDE_FLOW_LOG_LEVEL=info
NODE_ENV=staging
METRICS_ENABLED=true
```

### Production Environment
```bash
# .env.production
CLAUDE_FLOW_HEADLESS=true
ANTHROPIC_API_KEY=your-prod-api-key
CLAUDE_FLOW_MAX_AGENTS=8
CLAUDE_FLOW_TIMEOUT=300000
CLAUDE_FLOW_LOG_LEVEL=warn
NODE_ENV=production
METRICS_ENABLED=true
HEALTH_CHECK_ENABLED=true
```

---

## 📊 Monitoring Quick Setup

### 1. Prometheus + Grafana
```yaml
# monitoring/docker-compose.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-storage:/var/lib/grafana

volumes:
  grafana-storage:
```

### 2. Prometheus Configuration
```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 30s

scrape_configs:
  - job_name: 'claude-flow'
    static_configs:
      - targets: ['claude-flow:3000']
    metrics_path: '/metrics'
    scrape_interval: 30s
```

---

## 🚦 Quick Testing Scripts

### Basic Functionality Test
```bash
#!/bin/bash
# test-deployment.sh

CLAUDE_FLOW_URL=${1:-"http://localhost:3000"}
echo "Testing Claude-Flow at $CLAUDE_FLOW_URL"

# Test health
echo "1. Health check..."
curl -f "$CLAUDE_FLOW_URL/health" && echo " ✅" || echo " ❌"

# Test API
echo "2. API availability..."
curl -f "$CLAUDE_FLOW_URL/api" && echo " ✅" || echo " ❌"

# Test swarm creation
echo "3. Swarm creation..."
RESPONSE=$(curl -s -X POST "$CLAUDE_FLOW_URL/api/swarms" \
  -H "Content-Type: application/json" \
  -d '{"objective": "Test deployment", "timeout": 15000}')

if echo "$RESPONSE" | grep -q '"success":true'; then
  echo " ✅ Swarm created successfully"
  SWARM_ID=$(echo "$RESPONSE" | grep -o '"swarmId":"[^"]*"' | cut -d'"' -f4)
  echo "   Swarm ID: $SWARM_ID"
else
  echo " ❌ Swarm creation failed"
  echo "   Response: $RESPONSE"
fi

echo "Test completed!"
```

### Load Test Script
```bash
#!/bin/bash
# load-test.sh

CLAUDE_FLOW_URL=${1:-"http://localhost:3000"}
CONCURRENT_REQUESTS=${2:-5}
TOTAL_REQUESTS=${3:-20}

echo "Load testing Claude-Flow"
echo "URL: $CLAUDE_FLOW_URL"
echo "Concurrent: $CONCURRENT_REQUESTS"
echo "Total: $TOTAL_REQUESTS"

# Create test data
cat > test-request.json << 'EOF'
{
  "objective": "Load test swarm execution",
  "strategy": "development",
  "max-agents": 3,
  "timeout": 30000
}
EOF

# Run load test with Apache Bench
ab -n $TOTAL_REQUESTS -c $CONCURRENT_REQUESTS \
   -p test-request.json \
   -T application/json \
   "$CLAUDE_FLOW_URL/api/swarms"

# Cleanup
rm test-request.json
```

---

## 🎯 Deployment Checklist

### Pre-Deployment
- [ ] Anthropic API key configured
- [ ] Environment variables set correctly
- [ ] Container image built and tagged
- [ ] Network ports accessible
- [ ] Resource limits configured

### Post-Deployment
- [ ] Health check endpoint responding
- [ ] API endpoints accessible
- [ ] Swarm creation working
- [ ] Logs being generated properly
- [ ] Monitoring configured (if applicable)
- [ ] Security settings verified

### Production Readiness
- [ ] SSL/TLS certificates configured
- [ ] Authentication enabled
- [ ] Rate limiting configured
- [ ] Backup procedures established
- [ ] Monitoring and alerting active
- [ ] Documentation updated

Copy and customize these templates for your specific deployment needs. Each template provides a working baseline that can be extended with additional features and security configurations as required.