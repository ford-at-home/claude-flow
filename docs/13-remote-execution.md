# Claude-Flow Remote Execution Guide

## Table of Contents

1. [Introduction and Overview](#introduction-and-overview)
2. [Prerequisites and Requirements](#prerequisites-and-requirements)
3. [Installation and Setup](#installation-and-setup)
4. [Configuration Options](#configuration-options)
5. [API Reference](#api-reference)
6. [Usage Examples and Tutorials](#usage-examples-and-tutorials)
7. [Advanced Features](#advanced-features)
8. [Troubleshooting Guide](#troubleshooting-guide)
9. [Security Best Practices](#security-best-practices)
10. [Performance Considerations](#performance-considerations)

---

## Introduction and Overview

Claude-Flow's remote execution system provides comprehensive headless API capabilities for running swarm coordination tasks in distributed environments. The system is built on three core components working in parallel:

### System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client App    │────│  API Gateway    │────│   API Server    │
│   (Frontend)    │    │   (Optional)    │    │ (REST + WS)     │
└─────────────────┘    └─────────────────┘    └─────────┬───────┘
                                                        │
                                                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Execution      │────│   Headless      │────│  External       │
│   Bridge        │    │  Coordinator    │    │  Services       │
│ (Task Runner)   │    │ (Agent Pool)    │    │ (Optional)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Core Components

1. **API Server** (`api-server.ts`)
   - RESTful endpoints for swarm management
   - WebSocket integration for real-time updates
   - Authentication, rate limiting, and security
   - Health monitoring and metrics collection

2. **Execution Bridge** (`execution-bridge.ts`)
   - Environment detection and compatibility
   - Async/await handling with timeout protection
   - Task queue management with retry logic
   - Integration with existing swarm executors

3. **Headless Coordinator** (`headless-coordinator.ts`)
   - Agent pool management and lifecycle
   - Task orchestration and assignment
   - Resource monitoring and optimization
   - Swarm execution coordination

### Key Features

- **Multiple Deployment Options**: Docker, AWS Lambda, EC2, Kubernetes
- **Real-time Communication**: WebSocket support for live updates
- **Scalable Architecture**: Horizontal scaling with load balancing
- **Security**: API key authentication, rate limiting, CORS
- **Monitoring**: Comprehensive logging, metrics, and health checks
- **Fault Tolerance**: Retry logic, circuit breakers, graceful degradation

---

## Prerequisites and Requirements

### System Requirements

#### Minimum Requirements
- **Node.js**: Version 18.x or higher (20.x recommended)
- **Memory**: 2GB RAM (4GB recommended for production)
- **CPU**: 2+ vCPUs for multi-agent coordination
- **Storage**: 10GB+ for logs and temporary files
- **Network**: Outbound HTTPS access to Claude API endpoints

#### Recommended Production Setup
- **Memory**: 8GB+ RAM
- **CPU**: 4+ vCPUs
- **Storage**: 50GB+ SSD storage
- **Network**: Dedicated bandwidth for API calls

### Environment Dependencies

#### Required Environment Variables
```bash
# Core Configuration
ANTHROPIC_API_KEY=sk-ant-your-api-key-here  # Required
NODE_ENV=production                          # development|production
PORT=3000                                   # API server port
HOST=0.0.0.0                               # API server host

# Execution Settings
CLAUDE_FLOW_HEADLESS=true                   # Enable headless mode
CLAUDE_FLOW_MAX_AGENTS=10                   # Maximum concurrent agents
CLAUDE_FLOW_TIMEOUT=300000                  # Task timeout (5 minutes)
CLAUDE_FLOW_LOG_LEVEL=info                  # debug|info|warn|error
```

#### Optional Configuration
```bash
# Security
AUTH_ENABLED=true
API_KEYS=key1,key2,key3
JWT_SECRET=your-jwt-secret
CORS_ORIGINS=https://your-domain.com,http://localhost:3000

# Features
WS_ENABLED=true                             # Enable WebSocket
RESOURCE_MONITORING=true                    # Enable resource monitoring
ENABLE_METRICS=true                         # Enable metrics collection

# Performance
MAX_CONCURRENT_TASKS=10
TASK_TIMEOUT_MINUTES=10
MEMORY_THRESHOLD=1073741824                 # 1GB
CPU_THRESHOLD=0.8                           # 80%
```

### Platform Support

| Platform | Status | Notes |
|----------|--------|-------|
| Linux (Ubuntu/CentOS) | ✅ Full Support | Primary deployment target |
| macOS | ✅ Full Support | Development environment |
| Windows | ✅ Partial Support | Limited testing |
| Docker | ✅ Full Support | Recommended deployment |
| AWS Lambda | ✅ Full Support | Serverless deployment |
| Kubernetes | ✅ Full Support | Container orchestration |

---

## Installation and Setup

### Method 1: NPM Installation

```bash
# Install claude-flow globally
npm install -g claude-flow

# Or install locally in your project
npm install claude-flow

# Verify installation
claude-flow --version
```

### Method 2: Docker Deployment

#### Quick Start with Docker
```bash
# Pull the latest image
docker pull claude-flow:headless

# Run with environment variables
docker run -d \
  --name claude-flow-headless \
  -p 3000:3000 \
  -e CLAUDE_FLOW_HEADLESS=true \
  -e ANTHROPIC_API_KEY=your-api-key \
  -e PORT=3000 \
  claude-flow:headless
```

#### Production Docker Setup
```dockerfile
# Dockerfile
FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache dumb-init curl

# Create app user
RUN addgroup -g 1001 -S claudeflow && \
    adduser -S claudeflow -u 1001

WORKDIR /app

# Copy application files
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY src/ ./src/
COPY bin/ ./bin/

# Set permissions
RUN chown -R claudeflow:claudeflow /app
USER claudeflow

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/api/health || exit 1

# Environment defaults
ENV NODE_ENV=production
ENV CLAUDE_FLOW_HEADLESS=true
ENV PORT=3000

EXPOSE 3000

# Start with proper signal handling
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/headless/index.js"]
```

#### Docker Compose Setup
```yaml
# docker-compose.yml
version: '3.8'

services:
  claude-flow:
    build: .
    ports:
      - "3000:3000"
    environment:
      - CLAUDE_FLOW_HEADLESS=true
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - NODE_ENV=production
      - LOG_LEVEL=info
    volumes:
      - ./logs:/app/logs
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  # Optional: Redis for caching
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### Method 3: AWS Lambda Deployment

#### Serverless Framework Configuration
```yaml
# serverless.yml
service: claude-flow-headless

provider:
  name: aws
  runtime: nodejs20.x
  region: us-east-1
  timeout: 900
  memorySize: 3008
  environment:
    ANTHROPIC_API_KEY: ${env:ANTHROPIC_API_KEY}
    CLAUDE_FLOW_HEADLESS: true
    NODE_ENV: production

functions:
  api:
    handler: src/headless/lambda.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
          cors: true

plugins:
  - serverless-webpack
  - serverless-offline

custom:
  webpack:
    webpackConfig: ./webpack.config.js
    includeModules: true
```

#### Lambda Handler
```javascript
// src/headless/lambda.js
import { createDefaultConfig, HeadlessSystem } from './index.js';

let system;

export async function handler(event, context) {
  // Initialize system on cold start
  if (!system) {
    const config = createDefaultConfig();
    system = new HeadlessSystem(config);
    await system.start();
  }

  // Handle API Gateway events
  const { httpMethod, path, body, headers } = event;
  
  // Route to appropriate handler
  // Implementation details in API Reference section
  
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ message: 'Success' })
  };
}
```

### Method 4: Kubernetes Deployment

#### Deployment Configuration
```yaml
# k8s/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-flow-headless
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-flow-headless
  template:
    metadata:
      labels:
        app: claude-flow-headless
    spec:
      containers:
      - name: claude-flow
        image: claude-flow:headless
        ports:
        - containerPort: 3000
        env:
        - name: CLAUDE_FLOW_HEADLESS
          value: "true"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: claude-flow-secrets
              key: anthropic-api-key
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/health
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: claude-flow-service
spec:
  selector:
    app: claude-flow-headless
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: LoadBalancer
```

---

## Configuration Options

### Configuration File Structure

The system uses a hierarchical configuration structure:

```typescript
interface HeadlessConfig {
  api: ApiServerConfig;
  bridge: ExecutionConfig;
  coordinator: CoordinatorConfig;
  environment: EnvironmentConfig;
}
```

### API Server Configuration

```typescript
interface ApiServerConfig {
  port: number;                    // Server port (default: 3000)
  host: string;                    // Server host (default: '0.0.0.0')
  corsOrigins: string[];           // Allowed CORS origins
  rateLimit: {
    windowMs: number;              // Rate limit window (15 minutes)
    max: number;                   // Max requests per window (100)
  };
  authentication: {
    enabled: boolean;              // Enable authentication
    jwtSecret?: string;            // JWT secret key
    apiKeys?: string[];            // Valid API keys
  };
  websocket: {
    enabled: boolean;              // Enable WebSocket support
    heartbeatInterval: number;     // Heartbeat interval (30s)
  };
  logging: {
    level: string;                 // Log level (info)
    format: string;                // Log format (combined|dev)
  };
}
```

### Execution Bridge Configuration

```typescript
interface ExecutionConfig {
  runtime: 'node' | 'deno' | 'browser';
  enableFallbacks: boolean;        // Enable fallback mechanisms
  asyncTimeout: number;            // Async operation timeout (2 minutes)
  maxRetries: number;              // Maximum retry attempts (3)
  retryDelay: number;              // Delay between retries (1s)
  useSimpleExecutor: boolean;      // Use simple swarm executor
  useAdvancedExecutor: boolean;    // Use advanced task executor
  enableTaskQueue: boolean;        // Enable task queuing
  maxConcurrentTasks: number;      // Max concurrent tasks (10)
  taskTimeout: number;             // Task timeout (5 minutes)
  memoryLimit: number;             // Memory limit per task (512MB)
}
```

### Coordinator Configuration

```typescript
interface CoordinatorConfig {
  maxSwarms: number;               // Maximum concurrent swarms (50)
  maxAgentsPerSwarm: number;       // Max agents per swarm (20)
  defaultAgentTimeout: number;     // Agent timeout (30s)
  taskTimeoutMinutes: number;      // Task timeout (10 minutes)
  enableResourceMonitoring: boolean; // Monitor resources
  enableAutoScaling: boolean;      // Enable auto-scaling
  enableFailover: boolean;         // Enable failover
  memoryThreshold: number;         // Memory threshold (1GB)
  cpuThreshold: number;            // CPU threshold (80%)
}
```

### Environment-Based Configuration

```javascript
// Create configuration from environment variables
export function createEnvironmentConfig(): HeadlessConfig {
  return {
    api: {
      port: parseInt(process.env.PORT || '3000'),
      host: process.env.HOST || '0.0.0.0',
      corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
        max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
      },
      authentication: {
        enabled: process.env.AUTH_ENABLED === 'true',
        jwtSecret: process.env.JWT_SECRET,
        apiKeys: process.env.API_KEYS?.split(','),
      },
      websocket: {
        enabled: process.env.WS_ENABLED !== 'false',
        heartbeatInterval: parseInt(process.env.WS_HEARTBEAT || '30000'),
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
      },
    },
    // ... other configurations
  };
}
```

### Configuration Validation

```javascript
// Validate configuration before starting
export function validateConfig(config: HeadlessConfig): string[] {
  const errors: string[] = [];

  // Required fields
  if (!process.env.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY is required');
  }

  // Port validation
  if (config.api.port < 1 || config.api.port > 65535) {
    errors.push('Port must be between 1 and 65535');
  }

  // Memory validation
  if (config.coordinator.memoryThreshold < 100 * 1024 * 1024) {
    errors.push('Memory threshold too low (minimum 100MB)');
  }

  // Agent limits
  if (config.coordinator.maxAgentsPerSwarm > 100) {
    errors.push('Too many agents per swarm (maximum 100)');
  }

  return errors;
}
```

---

## API Reference

### Authentication

All API endpoints require authentication via API key or JWT token:

```bash
# API Key Authentication
curl -H "X-API-Key: your-api-key" \
     -H "Content-Type: application/json" \
     https://your-server/api/swarm/create
```

### Core Endpoints

#### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "claude-flow-headless-api",
  "version": "1.0.0",
  "timestamp": "2024-01-28T10:30:00Z",
  "uptime": 3600,
  "environment": "production"
}
```

#### System Status
```http
GET /api/system/stats
```

**Response:**
```json
{
  "system": {
    "nodeVersion": "v20.10.0",
    "platform": "linux",
    "architecture": "x64",
    "uptime": 86400,
    "memory": {
      "rss": 134217728,
      "heapTotal": 67108864,
      "heapUsed": 33554432
    }
  },
  "server": {
    "activeSwarms": 5,
    "connectedClients": 12
  }
}
```

### Swarm Management

#### Create Swarm
```http
POST /api/swarm/create
Content-Type: application/json
```

**Request:**
```json
{
  "objective": "Build a REST API for user management",
  "strategy": "development",
  "mode": "centralized",
  "maxAgents": 5,
  "timeout": 300000,
  "parallel": false,
  "options": {
    "includeTests": true,
    "verbosity": "normal"
  }
}
```

**Response:**
```json
{
  "swarmId": "swarm_mdnsk2o1_4ixwmn7rj",
  "status": "planning",
  "message": "Swarm created successfully",
  "data": {
    "objective": "Build a REST API for user management",
    "strategy": "development",
    "mode": "centralized",
    "maxAgents": 5
  },
  "timestamp": "2024-01-28T10:30:00Z"
}
```

#### Get Swarm Details
```http
GET /api/swarm/{swarmId}
```

**Response:**
```json
{
  "swarmId": "swarm_123",
  "data": {
    "id": "swarm_123",
    "name": "User Management API Swarm",
    "description": "Build a REST API for user management",
    "status": "executing",
    "strategy": "development",
    "progress": {
      "totalTasks": 6,
      "completedTasks": 3,
      "percentComplete": 50
    },
    "createdAt": "2024-01-28T10:30:00Z"
  }
}
```

#### Start Swarm Execution
```http
POST /api/swarm/{swarmId}/start
```

**Response:**
```json
{
  "swarmId": "swarm_123",
  "status": "executing",
  "message": "Swarm started successfully",
  "timestamp": "2024-01-28T10:31:00Z"
}
```

#### Pause/Resume Swarm
```http
POST /api/swarm/{swarmId}/pause
POST /api/swarm/{swarmId}/resume
```

#### Stop Swarm
```http
POST /api/swarm/{swarmId}/stop
```

#### Delete Swarm
```http
DELETE /api/swarm/{swarmId}
```

### Agent Management

#### List Agents
```http
GET /api/swarm/{swarmId}/agents
```

**Response:**
```json
{
  "swarmId": "swarm_123",
  "agents": [
    {
      "id": {
        "id": "agent_001",
        "swarmId": "swarm_123",
        "type": "architect",
        "instance": 1
      },
      "name": "system-architect",
      "type": "architect",
      "status": "busy",
      "capabilities": {
        "codeGeneration": false,
        "codeReview": false,
        "testing": false,
        "documentation": true,
        "research": true,
        "analysis": true
      },
      "metrics": {
        "tasksCompleted": 2,
        "successRate": 1.0,
        "averageExecutionTime": 45000
      }
    }
  ],
  "count": 1
}
```

#### Spawn New Agent
```http
POST /api/swarm/{swarmId}/agents
Content-Type: application/json
```

**Request:**
```json
{
  "type": "coder",
  "name": "backend-developer",
  "capabilities": {
    "languages": ["javascript", "typescript"],
    "frameworks": ["express", "fastify"]
  }
}
```

#### Get Agent Details
```http
GET /api/swarm/{swarmId}/agents/{agentId}
```

#### Terminate Agent
```http
DELETE /api/swarm/{swarmId}/agents/{agentId}
```

### Task Management

#### List Tasks
```http
GET /api/swarm/{swarmId}/tasks
```

**Response:**
```json
{
  "swarmId": "swarm_123",
  "tasks": [
    {
      "id": {
        "id": "task_001",
        "swarmId": "swarm_123",
        "sequence": 1,
        "priority": 3
      },
      "name": "System Architecture",
      "description": "Design system architecture for user management API",
      "type": "system-design",
      "status": "completed",
      "assignedTo": {
        "id": "agent_001"
      },
      "result": {
        "output": "## System Architecture Design\n...",
        "quality": 0.95,
        "executionTime": 45000
      }
    }
  ],
  "count": 1
}
```

#### Create Task
```http
POST /api/swarm/{swarmId}/tasks
Content-Type: application/json
```

**Request:**
```json
{
  "name": "Implement Authentication",
  "description": "Implement JWT authentication system",
  "type": "coding",
  "priority": "high",
  "requirements": {
    "capabilities": ["codeGeneration"],
    "tools": ["git", "npm"],
    "permissions": ["read", "write", "execute"]
  }
}
```

#### Assign Task to Agent
```http
POST /api/swarm/{swarmId}/tasks/{taskId}/assign
Content-Type: application/json
```

**Request:**
```json
{
  "agentId": "agent_002"
}
```

### Results and Monitoring

#### Get Swarm Results
```http
GET /api/swarm/{swarmId}/results
```

**Response:**
```json
{
  "swarmId": "swarm_123",
  "results": {
    "outputs": {
      "task_001": "## System Architecture\n...",
      "task_002": "// User authentication implementation\n..."
    },
    "artifacts": {
      "task_001": {
        "diagrams": ["architecture.png"],
        "documents": ["spec.md"]
      }
    },
    "overallQuality": 0.92,
    "totalExecutionTime": 180000,
    "efficiency": 0.85
  }
}
```

#### Get Performance Metrics
```http
GET /api/swarm/{swarmId}/metrics
```

**Response:**
```json
{
  "swarmId": "swarm_123",
  "metrics": {
    "throughput": 0.5,
    "latency": 2500,
    "efficiency": 0.85,
    "reliability": 0.95,
    "averageQuality": 0.90,
    "resourceUtilization": {
      "memory": 536870912,
      "cpu": 1.5
    },
    "agentUtilization": 0.8
  }
}
```

#### Get Execution Logs
```http
GET /api/swarm/{swarmId}/logs?limit=100&level=info
```

**Response:**
```json
{
  "swarmId": "swarm_123",
  "logs": [
    {
      "timestamp": "2024-01-28T10:30:00Z",
      "level": "info",
      "source": "HeadlessCoordinator",
      "message": "Creating swarm: swarm_123",
      "swarmId": "swarm_123"
    }
  ],
  "count": 1
}
```

### WebSocket Events

Connect to WebSocket endpoint for real-time updates:

```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

// Subscribe to swarm events
ws.send(JSON.stringify({
  type: 'subscribe',
  swarmId: 'swarm_123'
}));

// Listen for events
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Event:', data);
};
```

**Event Types:**
- `swarm.created` - Swarm created
- `swarm.started` - Swarm execution started
- `swarm.completed` - Swarm execution completed
- `agent.spawned` - New agent spawned
- `agent.terminated` - Agent terminated
- `task.created` - New task created
- `task.assigned` - Task assigned to agent
- `task.completed` - Task completed

---

## Usage Examples and Tutorials

### Basic Usage Example

```javascript
// basic-usage.js
import { HeadlessSystem, createDefaultConfig } from 'claude-flow/headless';

async function basicExample() {
  // Create and start the system
  const config = createDefaultConfig();
  const system = new HeadlessSystem(config);
  
  await system.start();
  console.log('System started on http://localhost:3000');
  
  // The system is now ready to accept API requests
  // Use curl or your preferred HTTP client to interact
}

basicExample().catch(console.error);
```

### Frontend Integration Example

```javascript
// frontend-client.js
class ClaudeFlowClient {
  constructor(baseUrl = 'http://localhost:3000', apiKey = null) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async createSwarm(objective, options = {}) {
    const headers = {
      'Content-Type': 'application/json'
    };
    
    if (this.apiKey) {
      headers['X-API-Key'] = this.apiKey;
    }

    const response = await fetch(`${this.baseUrl}/api/swarm/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        objective,
        ...options
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  }

  async waitForCompletion(swarmId, pollInterval = 5000) {
    while (true) {
      const status = await this.getSwarmStatus(swarmId);
      
      if (status.data.status === 'completed' || status.data.status === 'failed') {
        return await this.getResults(swarmId);
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  async getSwarmStatus(swarmId) {
    const headers = {};
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    const response = await fetch(`${this.baseUrl}/api/swarm/${swarmId}`, {
      headers
    });
    
    return await response.json();
  }

  async getResults(swarmId) {
    const headers = {};
    if (this.apiKey) headers['X-API-Key'] = this.apiKey;

    const response = await fetch(`${this.baseUrl}/api/swarm/${swarmId}/results`, {
      headers
    });
    
    return await response.json();
  }
}

// Usage
async function frontendExample() {
  const client = new ClaudeFlowClient('http://localhost:3000');
  
  // Create a swarm
  const swarm = await client.createSwarm(
    'Build a REST API for a blog platform',
    {
      strategy: 'development',
      maxAgents: 5,
      options: {
        includeTests: true,
        includeDocumentation: true
      }
    }
  );
  
  console.log('Swarm created:', swarm.swarmId);
  
  // Start the swarm
  await fetch(`http://localhost:3000/api/swarm/${swarm.swarmId}/start`, {
    method: 'POST'
  });
  
  // Wait for completion
  const results = await client.waitForCompletion(swarm.swarmId);
  console.log('Results:', results);
}
```

### Real-time Monitoring Example

```javascript
// real-time-monitoring.js
class SwarmMonitor {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
    this.ws = null;
    this.subscriptions = new Set();
  }

  connect() {
    const wsUrl = this.baseUrl.replace('http', 'ws') + '/ws';
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleEvent(data);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      // Reconnect after delay
      setTimeout(() => this.connect(), 5000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  subscribe(swarmId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        swarmId
      }));
      this.subscriptions.add(swarmId);
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case 'swarm_event':
        console.log(`Swarm ${event.swarmId}: ${event.eventType}`, event.data);
        break;
      case 'connected':
        console.log('Connected to WebSocket server:', event.clientId);
        // Re-subscribe to all swarms
        this.subscriptions.forEach(swarmId => this.subscribe(swarmId));
        break;
      default:
        console.log('Unknown event:', event);
    }
  }
}

// Usage
const monitor = new SwarmMonitor();
monitor.connect();

// Subscribe to a specific swarm
monitor.subscribe('swarm_123');
```

### Advanced Configuration Example

```javascript
// advanced-config.js
import { HeadlessSystem } from 'claude-flow/headless';

function createAdvancedConfig() {
  return {
    api: {
      port: 8080,
      host: '0.0.0.0',
      corsOrigins: ['https://myapp.com', 'https://admin.myapp.com'],
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 200 // Allow 200 requests per window
      },
      authentication: {
        enabled: true,
        apiKeys: [
          process.env.FRONTEND_API_KEY,
          process.env.ADMIN_API_KEY
        ]
      },
      websocket: {
        enabled: true,
        heartbeatInterval: 30000
      },
      logging: {
        level: 'info',
        format: 'combined'
      }
    },
    bridge: {
      runtime: 'node',
      enableFallbacks: true,
      asyncTimeout: 180000, // 3 minutes
      maxRetries: 5,
      retryDelay: 2000,
      useSimpleExecutor: true,
      useAdvancedExecutor: true,
      enableTaskQueue: true,
      maxConcurrentTasks: 15,
      taskTimeout: 600000, // 10 minutes
      memoryLimit: 1024 * 1024 * 1024 // 1GB
    },
    coordinator: {
      maxSwarms: 100,
      maxAgentsPerSwarm: 30,
      defaultAgentTimeout: 60000, // 1 minute
      taskTimeoutMinutes: 15,
      enableResourceMonitoring: true,
      enableAutoScaling: true,
      enableFailover: true,
      memoryThreshold: 2 * 1024 * 1024 * 1024, // 2GB
      cpuThreshold: 0.85 // 85%
    },
    environment: {
      nodeEnv: 'production',
      logLevel: 'info',
      enableMetrics: true
    }
  };
}

async function advancedExample() {
  const config = createAdvancedConfig();
  
  // Validate configuration
  const errors = validateConfig(config);
  if (errors.length > 0) {
    console.error('Configuration errors:', errors);
    process.exit(1);
  }
  
  const system = new HeadlessSystem(config);
  
  // Setup graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await system.stop();
    process.exit(0);
  });
  
  await system.start();
  console.log('Advanced system configuration started');
}
```

### Load Testing Example

```javascript
// load-test.js
import { ClaudeFlowClient } from './frontend-client.js';

async function loadTest() {
  const client = new ClaudeFlowClient('http://localhost:3000');
  const concurrentSwarms = 10;
  const objectives = [
    'Create a simple calculator app',
    'Build a todo list application',
    'Design a user authentication system',
    'Implement a chat application',
    'Create a blog platform'
  ];

  console.log(`Starting load test with ${concurrentSwarms} concurrent swarms`);

  const promises = [];
  for (let i = 0; i < concurrentSwarms; i++) {
    const objective = objectives[i % objectives.length];
    
    const promise = client.createSwarm(objective, {
      strategy: 'development',
      maxAgents: 3,
      timeout: 120000 // 2 minutes
    }).then(async (swarm) => {
      console.log(`Created swarm ${i + 1}: ${swarm.swarmId}`);
      
      // Start the swarm
      await fetch(`http://localhost:3000/api/swarm/${swarm.swarmId}/start`, {
        method: 'POST'
      });
      
      return client.waitForCompletion(swarm.swarmId);
    }).then((results) => {
      console.log(`Swarm ${i + 1} completed`);
      return results;
    }).catch((error) => {
      console.error(`Swarm ${i + 1} failed:`, error.message);
      return null;
    });

    promises.push(promise);
  }

  // Wait for all swarms to complete
  const results = await Promise.allSettled(promises);
  
  const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
  const failed = concurrentSwarms - successful;
  
  console.log(`Load test completed: ${successful} successful, ${failed} failed`);
}
```

---

## Advanced Features

### Custom Agent Types

```javascript
// custom-agents.js
import { HeadlessCoordinator } from 'claude-flow/headless';

class CustomCoordinator extends HeadlessCoordinator {
  async spawnCustomAgent(swarmId, agentType, config) {
    const customAgentTypes = {
      'security-auditor': {
        capabilities: {
          securityAnalysis: true,
          vulnerabilityScanning: true,
          penetrationTesting: true
        }
      },
      'performance-optimizer': {
        capabilities: {
          performanceAnalysis: true,
          codeOptimization: true,
          benchmarking: true
        }
      },
      'documentation-specialist': {
        capabilities: {
          documentation: true,
          technicalWriting: true,
          diagramGeneration: true
        }
      }
    };

    if (customAgentTypes[agentType]) {
      return await this.spawnAgent(swarmId, {
        type: agentType,
        ...customAgentTypes[agentType],
        ...config
      });
    }

    throw new Error(`Unknown custom agent type: ${agentType}`);
  }
}
```

### Plugin System

```javascript
// plugin-system.js
class PluginManager {
  constructor() {
    this.plugins = new Map();
    this.hooks = new Map();
  }

  registerPlugin(name, plugin) {
    this.plugins.set(name, plugin);
    
    // Register plugin hooks
    if (plugin.hooks) {
      Object.entries(plugin.hooks).forEach(([hookName, handler]) => {
        if (!this.hooks.has(hookName)) {
          this.hooks.set(hookName, []);
        }
        this.hooks.get(hookName).push(handler);
      });
    }
  }

  async executeHook(hookName, ...args) {
    const handlers = this.hooks.get(hookName) || [];
    
    for (const handler of handlers) {
      try {
        await handler(...args);
      } catch (error) {
        console.error(`Plugin hook error (${hookName}):`, error);
      }
    }
  }
}

// Example plugin
const loggingPlugin = {
  name: 'advanced-logging',
  hooks: {
    'swarm.created': async (swarmId, objective) => {
      console.log(`[PLUGIN] Swarm created: ${swarmId}`);
      // Send to external logging service
      await sendToLogService('swarm.created', { swarmId, objective });
    },
    'task.completed': async (swarmId, taskId, result) => {
      console.log(`[PLUGIN] Task completed: ${taskId}`);
      // Store metrics
      await storeTaskMetrics(swarmId, taskId, result);
    }
  }
};

// Usage
const pluginManager = new PluginManager();
pluginManager.registerPlugin('logging', loggingPlugin);
```

### Custom Strategies

```javascript
// custom-strategies.js
export class CustomStrategyManager {
  constructor(coordinator) {
    this.coordinator = coordinator;
    this.strategies = new Map();
    
    // Register default strategies
    this.registerStrategy('microservices', this.microservicesStrategy.bind(this));
    this.registerStrategy('ai-training', this.aiTrainingStrategy.bind(this));
    this.registerStrategy('security-audit', this.securityAuditStrategy.bind(this));
  }

  registerStrategy(name, strategyFunction) {
    this.strategies.set(name, strategyFunction);
  }

  async executeStrategy(swarmId, strategyName, objective) {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown strategy: ${strategyName}`);
    }

    return await strategy(swarmId, objective);
  }

  async microservicesStrategy(swarmId, objective) {
    // Spawn specialized agents for microservices architecture
    const agents = await Promise.all([
      this.coordinator.spawnAgent(swarmId, { type: 'architect', name: 'microservices-architect' }),
      this.coordinator.spawnAgent(swarmId, { type: 'coder', name: 'api-developer' }),
      this.coordinator.spawnAgent(swarmId, { type: 'coder', name: 'service-developer' }),
      this.coordinator.spawnAgent(swarmId, { type: 'specialist', name: 'docker-specialist' }),
      this.coordinator.spawnAgent(swarmId, { type: 'tester', name: 'integration-tester' })
    ]);

    // Create microservices-specific tasks
    const tasks = [
      {
        name: 'Service Architecture Design',
        description: 'Design microservices architecture and service boundaries',
        type: 'system-design',
        requirements: { capabilities: ['architecture'] }
      },
      {
        name: 'API Gateway Implementation',
        description: 'Implement API gateway for service routing',
        type: 'coding',
        requirements: { capabilities: ['codeGeneration'] }
      },
      {
        name: 'Service Mesh Configuration',
        description: 'Configure service mesh for inter-service communication',
        type: 'configuration',
        requirements: { capabilities: ['docker', 'kubernetes'] }
      },
      {
        name: 'Integration Testing',
        description: 'Create comprehensive integration tests',
        type: 'testing',
        requirements: { capabilities: ['testing'] }
      }
    ];

    // Create tasks
    for (const taskDef of tasks) {
      await this.coordinator.createTask(swarmId, taskDef);
    }

    return {
      strategy: 'microservices',
      agents: agents.length,
      tasks: tasks.length
    };
  }

  async aiTrainingStrategy(swarmId, objective) {
    // AI/ML training pipeline strategy
    const agents = await Promise.all([
      this.coordinator.spawnAgent(swarmId, { type: 'researcher', name: 'data-scientist' }),
      this.coordinator.spawnAgent(swarmId, { type: 'coder', name: 'ml-engineer' }),
      this.coordinator.spawnAgent(swarmId, { type: 'analyst', name: 'model-validator' }),
      this.coordinator.spawnAgent(swarmId, { type: 'specialist', name: 'deployment-engineer' })
    ]);

    const tasks = [
      {
        name: 'Data Collection & Preprocessing',
        description: 'Collect and preprocess training data',
        type: 'data-processing'
      },
      {
        name: 'Model Architecture Design',
        description: 'Design neural network architecture',
        type: 'model-design'
      },
      {
        name: 'Training Pipeline Implementation',
        description: 'Implement training pipeline with monitoring',
        type: 'coding'
      },
      {
        name: 'Model Validation & Testing',
        description: 'Validate model performance and accuracy',
        type: 'validation'
      },
      {
        name: 'Model Deployment',
        description: 'Deploy model to production environment',
        type: 'deployment'
      }
    ];

    for (const taskDef of tasks) {
      await this.coordinator.createTask(swarmId, taskDef);
    }

    return {
      strategy: 'ai-training',
      agents: agents.length,
      tasks: tasks.length
    };
  }
}
```

### Metrics and Analytics

```javascript
// metrics-system.js
export class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.timers = new Map();
  }

  startTimer(id) {
    this.timers.set(id, Date.now());
  }

  endTimer(id) {
    const startTime = this.timers.get(id);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.timers.delete(id);
      return duration;
    }
    return 0;
  }

  recordMetric(name, value, tags = {}) {
    const metric = {
      name,
      value,
      tags,
      timestamp: Date.now()
    };

    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    
    this.metrics.get(name).push(metric);
  }

  getMetrics(name) {
    return this.metrics.get(name) || [];
  }

  exportPrometheusMetrics() {
    let output = '';
    
    this.metrics.forEach((metrics, name) => {
      // Calculate statistics
      const values = metrics.map(m => m.value);
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      output += `# HELP ${name} Metric description\n`;
      output += `# TYPE ${name} gauge\n`;
      output += `${name}_avg ${avg}\n`;
      output += `${name}_min ${min}\n`;
      output += `${name}_max ${max}\n`;
      output += `${name}_count ${values.length}\n`;
    });
    
    return output;
  }
}

// Integration with headless system
class MetricsEnabledCoordinator extends HeadlessCoordinator {
  constructor(config, bridge) {
    super(config, bridge);
    this.metrics = new MetricsCollector();
  }

  async createSwarm(objective) {
    this.metrics.startTimer(`swarm_creation_${objective.id}`);
    
    try {
      const result = await super.createSwarm(objective);
      
      const duration = this.metrics.endTimer(`swarm_creation_${objective.id}`);
      this.metrics.recordMetric('swarm_creation_duration', duration, {
        strategy: objective.strategy
      });
      
      return result;
    } catch (error) {
      this.metrics.recordMetric('swarm_creation_errors', 1, {
        error: error.message
      });
      throw error;
    }
  }

  async executeTask(swarmId, taskId) {
    this.metrics.startTimer(`task_execution_${taskId}`);
    
    try {
      const result = await super.executeTask(swarmId, taskId);
      
      const duration = this.metrics.endTimer(`task_execution_${taskId}`);
      this.metrics.recordMetric('task_execution_duration', duration, {
        swarmId,
        taskId
      });
      
      return result;
    } catch (error) {
      this.metrics.recordMetric('task_execution_errors', 1, {
        swarmId,
        taskId,
        error: error.message
      });
      throw error;
    }
  }
}
```

---

## Troubleshooting Guide

### Common Issues

#### 1. API Server Won't Start

**Symptoms:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solutions:**
```bash
# Check what's using the port
sudo netstat -tlnp | grep :3000
# or
sudo lsof -i :3000

# Kill the process using the port
sudo kill -9 <PID>

# Or use a different port
export PORT=3001
```

#### 2. Authentication Failures

**Symptoms:**
```json
{
  "error": "Authentication required",
  "message": "Provide valid API key or JWT token"
}
```

**Solutions:**
```bash
# Check if authentication is enabled
curl -v http://localhost:3000/api/health

# If auth is enabled, provide API key
curl -H "X-API-Key: your-api-key" http://localhost:3000/api/health

# Check environment variables
echo $API_KEYS
echo $AUTH_ENABLED
```

#### 3. Memory Issues

**Symptoms:**
```
<--- Last few GCs --->
[1234:0x123456]    12345 ms: Mark-Sweep 2048.0 (2096.5) -> 2048.0 (2080.5) MB, 123.4 / 0.0 ms
```

**Solutions:**
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"

# Monitor memory usage
docker stats claude-flow-container

# Check for memory leaks
curl http://localhost:3000/api/system/stats
```

#### 4. Task Execution Timeouts

**Symptoms:**
```json
{
  "error": "Task execution timeout",
  "taskId": "task_123"
}
```

**Solutions:**
```bash
# Increase task timeout
export TASK_TIMEOUT_MINUTES=20

# Check system resources
top
free -h
df -h

# Reduce concurrent tasks
export MAX_CONCURRENT_TASKS=5
```

#### 5. WebSocket Connection Issues

**Symptoms:**
```
WebSocket connection failed: Error during WebSocket handshake
```

**Solutions:**
```bash
# Check if WebSocket is enabled
export WS_ENABLED=true

# Test WebSocket connection
wscat -c ws://localhost:3000/ws

# Check firewall/proxy settings
curl -H "Upgrade: websocket" -H "Connection: Upgrade" http://localhost:3000/ws
```

### Diagnostic Tools

#### Health Check Script
```bash
#!/bin/bash
# health-check.sh

CLAUDE_FLOW_URL=${CLAUDE_FLOW_URL:-"http://localhost:3000"}
API_KEY=${API_KEY:-""}

echo "🏥 Claude Flow Health Check"
echo "=========================="
echo "URL: $CLAUDE_FLOW_URL"
echo "Time: $(date)"
echo ""

# Test 1: Basic connectivity
echo "1. Testing connectivity..."
if curl -s -f "$CLAUDE_FLOW_URL/api/health" > /dev/null; then
  echo "   ✅ Server responding"
else
  echo "   ❌ Server not responding"
  exit 1
fi

# Test 2: Health endpoint
echo "2. Checking health status..."
HEALTH=$(curl -s "$CLAUDE_FLOW_URL/api/health")
echo "   Response: $HEALTH"

# Test 3: System stats
echo "3. Checking system stats..."
if [ -n "$API_KEY" ]; then
  STATS=$(curl -s -H "X-API-Key: $API_KEY" "$CLAUDE_FLOW_URL/api/system/stats")
  echo "   Stats: $STATS"
else
  echo "   ⚠️ No API key provided, skipping system stats"
fi

# Test 4: WebSocket
echo "4. Testing WebSocket..."
if command -v wscat >/dev/null 2>&1; then
  timeout 5 wscat -c "${CLAUDE_FLOW_URL/http/ws}/ws" -x '{"type":"ping"}' && echo "   ✅ WebSocket working" || echo "   ❌ WebSocket failed"
else
  echo "   ⚠️ wscat not available, skipping WebSocket test"
fi

echo ""
echo "🎉 Health check completed"
```

#### Log Analysis Script
```bash
#!/bin/bash
# log-analysis.sh

LOG_FILE=${1:-"logs/combined.log"}

if [ ! -f "$LOG_FILE" ]; then
  echo "Log file not found: $LOG_FILE"
  exit 1
fi

echo "📊 Log Analysis Report"
echo "====================="
echo "File: $LOG_FILE"
echo "Size: $(du -h "$LOG_FILE" | cut -f1)"
echo ""

# Error analysis
echo "🔴 Errors in last 1000 lines:"
tail -n 1000 "$LOG_FILE" | grep -i error | head -10

echo ""
echo "⚠️ Warnings in last 1000 lines:"
tail -n 1000 "$LOG_FILE" | grep -i warn | head -5

echo ""
echo "📈 Request patterns:"
tail -n 1000 "$LOG_FILE" | grep -E "(POST|GET|PUT|DELETE)" | awk '{print $7}' | sort | uniq -c | sort -nr | head -10

echo ""
echo "🕐 Recent activity (last 10 entries):"
tail -n 10 "$LOG_FILE"
```

#### Performance Monitor
```javascript
// performance-monitor.js
import { EventEmitter } from 'events';

export class PerformanceMonitor extends EventEmitter {
  constructor(interval = 10000) {
    super();
    this.interval = interval;
    this.monitoring = false;
    this.baseline = null;
  }

  start() {
    if (this.monitoring) return;
    
    this.monitoring = true;
    this.baseline = this.getSystemMetrics();
    
    this.monitorInterval = setInterval(() => {
      this.checkPerformance();
    }, this.interval);
    
    console.log('Performance monitoring started');
  }

  stop() {
    if (!this.monitoring) return;
    
    this.monitoring = false;
    clearInterval(this.monitorInterval);
    console.log('Performance monitoring stopped');
  }

  getSystemMetrics() {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    
    return {
      timestamp: Date.now(),
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external
      },
      cpu: {
        user: cpu.user,
        system: cpu.system
      },
      uptime: process.uptime()
    };
  }

  checkPerformance() {
    const current = this.getSystemMetrics();
    
    // Memory usage check
    const memoryUsageMB = current.memory.heapUsed / 1024 / 1024;
    if (memoryUsageMB > 1024) { // 1GB threshold
      this.emit('alert', {
        type: 'memory',
        level: 'warning',
        message: `High memory usage: ${memoryUsageMB.toFixed(2)}MB`,
        value: memoryUsageMB
      });
    }

    // Memory leak detection
    if (this.baseline) {
      const memoryIncrease = current.memory.heapUsed - this.baseline.memory.heapUsed;
      const timeElapsed = current.timestamp - this.baseline.timestamp;
      
      if (memoryIncrease > 100 * 1024 * 1024 && timeElapsed > 300000) { // 100MB increase in 5 minutes
        this.emit('alert', {
          type: 'memory-leak',
          level: 'critical',
          message: `Potential memory leak detected: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB increase`,
          value: memoryIncrease
        });
      }
    }

    // Emit metrics for external monitoring
    this.emit('metrics', current);
  }
}

// Usage
const monitor = new PerformanceMonitor(5000); // Check every 5 seconds

monitor.on('alert', (alert) => {
  console.error('🚨 Performance Alert:', alert);
  // Send to external monitoring service
});

monitor.on('metrics', (metrics) => {
  console.log('📊 System Metrics:', {
    memory: `${(metrics.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
    uptime: `${Math.floor(metrics.uptime / 60)}m`
  });
});

monitor.start();
```

### Error Recovery

#### Automatic Recovery Script
```javascript
// auto-recovery.js
export class AutoRecovery {
  constructor(system) {
    this.system = system;
    this.recoveryAttempts = new Map();
    this.maxRetries = 3;
    this.backoffDelay = 5000;
  }

  async handleSystemError(error, context) {
    const errorKey = `${error.name}-${context.swarmId || 'system'}`;
    const attempts = this.recoveryAttempts.get(errorKey) || 0;

    if (attempts >= this.maxRetries) {
      console.error('Max recovery attempts reached:', errorKey);
      this.notifyAdministrator(error, context);
      return false;
    }

    console.log(`Recovery attempt ${attempts + 1} for:`, errorKey);
    this.recoveryAttempts.set(errorKey, attempts + 1);

    try {
      switch (error.name) {
        case 'MemoryError':
          return await this.recoverFromMemoryError(context);
        
        case 'TimeoutError':
          return await this.recoverFromTimeout(context);
        
        case 'ConnectionError':
          return await this.recoverFromConnectionError(context);
        
        default:
          return await this.genericRecovery(error, context);
      }
    } catch (recoveryError) {
      console.error('Recovery failed:', recoveryError);
      return false;
    }
  }

  async recoverFromMemoryError(context) {
    console.log('Recovering from memory error...');
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }

    // Pause new swarm creation temporarily
    this.system.pauseNewOperations();

    // Wait for memory to stabilize
    await new Promise(resolve => setTimeout(resolve, this.backoffDelay));

    // Resume operations
    this.system.resumeOperations();
    
    return true;
  }

  async recoverFromTimeout(context) {
    console.log('Recovering from timeout error...');
    
    if (context.swarmId) {
      // Cancel the problematic swarm
      await this.system.coordinator.stopSwarm(context.swarmId);
      
      // Wait before allowing new operations
      await new Promise(resolve => setTimeout(resolve, this.backoffDelay));
    }
    
    return true;
  }

  async recoverFromConnectionError(context) {
    console.log('Recovering from connection error...');
    
    // Test connectivity
    const isConnected = await this.testConnectivity();
    if (!isConnected) {
      console.error('Network connectivity lost');
      return false;
    }

    // Restart affected components
    await this.system.bridge.shutdown();
    await new Promise(resolve => setTimeout(resolve, this.backoffDelay));
    
    // Reinitialize bridge
    this.system.bridge = new ExecutionBridge(this.system.config.bridge);
    
    return true;
  }

  async genericRecovery(error, context) {
    console.log('Attempting generic recovery...');
    
    // Wait with exponential backoff
    const delay = this.backoffDelay * Math.pow(2, this.recoveryAttempts.get(`${error.name}-${context.swarmId || 'system'}`) || 0);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return true;
  }

  async testConnectivity() {
    try {
      const response = await fetch('https://api.anthropic.com', { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  notifyAdministrator(error, context) {
    // Implementation depends on your notification system
    console.error('ADMIN ALERT: System requires manual intervention', {
      error: error.message,
      context,
      timestamp: new Date().toISOString()
    });
  }
}
```

---

## Security Best Practices

### Authentication and Authorization

#### API Key Management
```javascript
// secure-auth.js
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export class SecureAuthManager {
  constructor(config) {
    this.apiKeys = new Map();
    this.jwtSecret = config.jwtSecret || crypto.randomBytes(64).toString('hex');
    this.rateLimiter = new Map();
  }

  // Generate secure API keys
  generateApiKey(userId, permissions = []) {
    const keyData = {
      id: crypto.randomUUID(),
      userId,
      permissions,
      createdAt: Date.now(),
      lastUsed: null,
      usageCount: 0
    };

    const apiKey = `cf_${crypto.randomBytes(32).toString('hex')}`;
    this.apiKeys.set(apiKey, keyData);
    
    return { apiKey, keyData };
  }

  // Validate API key with rate limiting
  async validateApiKey(apiKey, requiredPermission = null) {
    const keyData = this.apiKeys.get(apiKey);
    if (!keyData) {
      return { valid: false, error: 'Invalid API key' };
    }

    // Check rate limiting
    const rateLimitKey = keyData.userId;
    const now = Date.now();
    const windowStart = now - (15 * 60 * 1000); // 15 minutes

    if (!this.rateLimiter.has(rateLimitKey)) {
      this.rateLimiter.set(rateLimitKey, []);
    }

    const requests = this.rateLimiter.get(rateLimitKey);
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);

    if (recentRequests.length >= 100) { // 100 requests per 15 minutes
      return { valid: false, error: 'Rate limit exceeded' };
    }

    // Check permissions
    if (requiredPermission && !keyData.permissions.includes(requiredPermission)) {
      return { valid: false, error: 'Insufficient permissions' };
    }

    // Update usage
    keyData.lastUsed = now;
    keyData.usageCount++;
    recentRequests.push(now);
    this.rateLimiter.set(rateLimitKey, recentRequests);

    return { valid: true, keyData };
  }

  // Generate JWT tokens for session-based auth
  generateJWT(payload, expiresIn = '1h') {
    return jwt.sign(payload, this.jwtSecret, { expiresIn });
  }

  // Validate JWT tokens
  validateJWT(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      return null;
    }
  }

  // Revoke API key
  revokeApiKey(apiKey) {
    return this.apiKeys.delete(apiKey);
  }

  // List API keys for a user (without exposing the key)
  getUserApiKeys(userId) {
    const userKeys = [];
    for (const [_, keyData] of this.apiKeys) {
      if (keyData.userId === userId) {
        userKeys.push({
          id: keyData.id,
          permissions: keyData.permissions,
          createdAt: keyData.createdAt,
          lastUsed: keyData.lastUsed,
          usageCount: keyData.usageCount
        });
      }
    }
    return userKeys;
  }
}
```

#### Input Validation and Sanitization
```javascript
// input-validation.js
import Joi from 'joi';
import DOMPurify from 'isomorphic-dompurify';

export const validationSchemas = {
  swarmCreation: Joi.object({
    objective: Joi.string()
      .min(10)
      .max(2000)
      .required()
      .pattern(/^[a-zA-Z0-9\s\-.,!?()_&]+$/)
      .messages({
        'string.pattern.base': 'Objective contains invalid characters',
        'string.min': 'Objective must be at least 10 characters',
        'string.max': 'Objective must not exceed 2000 characters'
      }),
    
    strategy: Joi.string()
      .valid('auto', 'research', 'development', 'analysis', 'testing', 'review')
      .default('auto'),
    
    mode: Joi.string()
      .valid('centralized', 'distributed', 'hierarchical')
      .default('centralized'),
    
    maxAgents: Joi.number()
      .integer()
      .min(1)
      .max(50)
      .default(5),
    
    timeout: Joi.number()
      .integer()
      .min(30000)     // 30 seconds minimum
      .max(3600000)   // 1 hour maximum
      .default(300000), // 5 minutes default

    options: Joi.object().unknown(true).optional()
  }),

  agentCreation: Joi.object({
    type: Joi.string()
      .valid('coordinator', 'coder', 'reviewer', 'tester', 'researcher', 'analyst', 'architect', 'specialist')
      .required(),
    
    name: Joi.string()
      .alphanum()
      .min(3)
      .max(50)
      .optional(),
    
    capabilities: Joi.object().unknown(true).optional()
  }),

  taskCreation: Joi.object({
    name: Joi.string()
      .min(3)
      .max(200)
      .required(),
    
    description: Joi.string()
      .min(10)
      .max(1000)
      .required(),
    
    type: Joi.string()
      .valid('research', 'coding', 'testing', 'review', 'analysis', 'design', 'custom')
      .required(),
    
    priority: Joi.string()
      .valid('low', 'normal', 'high', 'critical')
      .default('normal'),
    
    requirements: Joi.object({
      capabilities: Joi.array().items(Joi.string()).default([]),
      tools: Joi.array().items(Joi.string()).default([]),
      permissions: Joi.array().items(Joi.string().valid('read', 'write', 'execute')).default(['read'])
    }).default({})
  })
};

export function validateAndSanitize(schema, data) {
  // First, sanitize string inputs
  const sanitizedData = sanitizeObject(data);
  
  // Then validate against schema
  const { error, value } = schema.validate(sanitizedData, {
    abortEarly: false,
    stripUnknown: true,
    convert: true
  });

  if (error) {
    const details = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));
    
    throw new ValidationError('Validation failed', details);
  }

  return value;
}

function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Remove HTML/script content
      sanitized[key] = DOMPurify.sanitize(value, {
        ALLOWED_TAGS: [],
        ALLOWED_ATTR: []
      }).trim();
      
      // Normalize whitespace
      sanitized[key] = sanitized[key].replace(/\s+/g, ' ');
      
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

export class ValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

// SQL injection prevention
export function preventSQLInjection(input) {
  if (typeof input !== 'string') return input;
  
  const dangerousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(;|\-\-|\/\*|\*\/|xp_|sp_)/gi,
    /'.*'|".*"/gi,
    /(\b(OR|AND)\s+\w+\s*=\s*\w+)/gi
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(input)) {
      throw new Error('Potentially malicious input detected');
    }
  }
  
  return input;
}
```

#### HTTPS and SSL Configuration
```javascript
// https-config.js
import https from 'https';
import fs from 'fs';
import path from 'path';

export function createHTTPSServer(app, config) {
  const sslOptions = {
    key: fs.readFileSync(config.ssl.keyPath),
    cert: fs.readFileSync(config.ssl.certPath),
    
    // Security options
    secureProtocol: 'TLSv1_2_method',
    ciphers: [
      'ECDHE-RSA-AES256-GCM-SHA512',
      'DHE-RSA-AES256-GCM-SHA512',
      'ECDHE-RSA-AES256-GCM-SHA384',
      'DHE-RSA-AES256-GCM-SHA384',
      'ECDHE-RSA-AES256-SHA384'
    ].join(':'),
    honorCipherOrder: true,
    
    // HSTS
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  };

  // Add intermediate certificate if available
  if (config.ssl.caPath) {
    sslOptions.ca = fs.readFileSync(config.ssl.caPath);
  }

  return https.createServer(sslOptions, app);
}

// Security headers middleware
export function securityHeaders(req, res, next) {
  // HSTS
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self' wss: https:; " +
    "font-src 'self'; " +
    "object-src 'none'; " +
    "media-src 'self'; " +
    "frame-src 'none';"
  );
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Content Type Options
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Frame Options
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Feature Policy
  res.setHeader('Feature-Policy', 
    "camera 'none'; " +
    "microphone 'none'; " +
    "geolocation 'none'; " +
    "payment 'none';"
  );

  next();
}
```

### Network Security

#### Firewall Configuration
```bash
#!/bin/bash
# firewall-setup.sh

# Basic UFW configuration for Claude Flow
ufw --force reset

# Default policies
ufw default deny incoming
ufw default allow outgoing

# SSH (adjust port as needed)
ufw allow 22/tcp

# Claude Flow API
ufw allow 3000/tcp

# HTTPS (if using SSL termination)
ufw allow 443/tcp

# Allow specific IP ranges (example for corporate network)
# ufw allow from 192.168.1.0/24 to any port 3000

# Enable logging
ufw logging on

# Enable firewall
ufw --force enable

echo "Firewall configured for Claude Flow"
ufw status verbose
```

#### Rate Limiting and DDoS Protection
```javascript
// rate-limiting.js
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import RedisStore from 'rate-limit-redis';
import Redis from 'redis';

export function createRateLimiters(redisClient) {
  // General API rate limiting
  const generalLimiter = rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:general:'
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests',
      retryAfter: Math.ceil(15 * 60), // seconds
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use API key if available, otherwise IP
      return req.headers['x-api-key'] || req.ip;
    }
  });

  // Stricter limiting for resource-intensive operations
  const swarmLimiter = rateLimit({
    store: new RedisStore({
      client: redisClient,
      prefix: 'rl:swarm:'
    }),
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // limit to 10 swarm creations per hour
    message: {
      error: 'Swarm creation rate limit exceeded',
      retryAfter: Math.ceil(60 * 60),
    },
    keyGenerator: (req) => req.headers['x-api-key'] || req.ip
  });

  // Progressive delay for rapid requests
  const speedLimiter = slowDown({
    store: new RedisStore({
      client: redisClient,
      prefix: 'sd:'
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50, // allow 50 requests per windowMs without delay
    delayMs: 500, // add 500ms of delay per request after delayAfter
    maxDelayMs: 20000, // maximum delay of 20 seconds
  });

  // Burst protection
  const burstLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 5, // max 5 requests per second
    skipSuccessfulRequests: true,
    message: {
      error: 'Too many requests in short time',
      retryAfter: 1,
    }
  });

  return {
    general: generalLimiter,
    swarm: swarmLimiter,
    speed: speedLimiter,
    burst: burstLimiter
  };
}

// DDoS protection middleware
export function ddosProtection(req, res, next) {
  const suspiciousPatterns = [
    /(\.\./){3,}/, // Directory traversal
    /(union|select|insert|delete|update|drop)/i, // SQL injection
    /<script|javascript:|onclick=/i, // XSS attempts
    /\0|%00/, // Null byte injection
  ];

  const userAgent = req.get('User-Agent') || '';
  const suspicious = suspiciousPatterns.some(pattern => 
    pattern.test(req.url) || 
    pattern.test(JSON.stringify(req.body)) || 
    pattern.test(userAgent)
  );

  if (suspicious) {
    console.warn('Suspicious request detected:', {
      ip: req.ip,
      url: req.url,
      userAgent,
      body: req.body
    });
    
    return res.status(400).json({
      error: 'Bad request',
      message: 'Request blocked by security filter'
    });
  }

  next();
}
```

---

## Performance Considerations

### Optimization Strategies

#### Memory Management
```javascript
// memory-optimization.js
export class MemoryOptimizer {
  constructor(options = {}) {
    this.maxHeapSize = options.maxHeapSize || 2048; // MB
    this.gcThreshold = options.gcThreshold || 0.8; // 80% of max heap
    this.checkInterval = options.checkInterval || 30000; // 30 seconds
    
    this.startMonitoring();
  }

  startMonitoring() {
    this.monitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkInterval);

    // Monitor for memory leaks
    this.leakDetection();
  }

  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    
    const usagePercent = heapUsedMB / this.maxHeapSize;
    
    if (usagePercent > this.gcThreshold) {
      console.warn(`High memory usage: ${heapUsedMB}MB (${(usagePercent * 100).toFixed(1)}%)`);
      this.performGarbageCollection();
    }

    // Clear old objects periodically
    this.clearExpiredData();
  }

  performGarbageCollection() {
    if (global.gc) {
      const before = process.memoryUsage().heapUsed;
      global.gc();
      const after = process.memoryUsage().heapUsed;
      const freed = Math.round((before - after) / 1024 / 1024);
      console.log(`Garbage collection freed ${freed}MB`);
    }
  }

  clearExpiredData() {
    // Implementation depends on your data structures
    // Clear caches, completed tasks, old logs, etc.
  }

  leakDetection() {
    let baseline = process.memoryUsage();
    
    setInterval(() => {
      const current = process.memoryUsage();
      const increase = current.heapUsed - baseline.heapUsed;
      const timePassed = Date.now() - baseline.timestamp;
      
      // If memory increased by more than 50MB in 5 minutes without GC
      if (increase > 50 * 1024 * 1024 && timePassed > 5 * 60 * 1000) {
        console.warn('Potential memory leak detected:', {
          increase: Math.round(increase / 1024 / 1024) + 'MB',
          duration: Math.round(timePassed / 1000) + 's'
        });
        
        // Update baseline after warning
        baseline = { ...current, timestamp: Date.now() };
      }
    }, 5 * 60 * 1000); // Check every 5 minutes
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
  }
}

// Object pooling for frequently created objects
export class ObjectPool {
  constructor(createFn, resetFn, initialSize = 10) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.pool = [];
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }

  acquire() {
    if (this.pool.length > 0) {
      return this.pool.pop();
    }
    return this.createFn();
  }

  release(obj) {
    if (this.resetFn) {
      this.resetFn(obj);
    }
    this.pool.push(obj);
    
    // Prevent pool from growing too large
    if (this.pool.length > 100) {
      this.pool.length = 50;
    }
  }
}
```

#### Connection Pooling
```javascript
// connection-pool.js
export class ConnectionPool {
  constructor(options = {}) {
    this.minConnections = options.min || 2;
    this.maxConnections = options.max || 10;
    this.acquireTimeout = options.acquireTimeout || 30000;
    this.idleTimeout = options.idleTimeout || 300000;
    this.createConnection = options.create;
    this.validateConnection = options.validate;
    this.destroyConnection = options.destroy;
    
    this.pool = [];
    this.waiting = [];
    this.activeConnections = 0;
    
    this.initialize();
  }

  async initialize() {
    // Create minimum connections
    const promises = [];
    for (let i = 0; i < this.minConnections; i++) {
      promises.push(this.createPooledConnection());
    }
    
    await Promise.all(promises);
    this.startCleanupTimer();
  }

  async createPooledConnection() {
    const connection = await this.createConnection();
    const pooledConnection = {
      connection,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      inUse: false,
      id: Math.random().toString(36).substr(2, 9)
    };
    
    this.pool.push(pooledConnection);
    return pooledConnection;
  }

  async acquire() {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection acquire timeout'));
      }, this.acquireTimeout);

      try {
        // Try to find available connection
        const available = this.pool.find(conn => !conn.inUse);
        
        if (available) {
          // Validate connection before use
          if (await this.isConnectionValid(available)) {
            available.inUse = true;
            available.lastUsed = Date.now();
            this.activeConnections++;
            clearTimeout(timeout);
            resolve(available.connection);
            return;
          } else {
            // Remove invalid connection
            await this.removeConnection(available);
          }
        }

        // Create new connection if under limit
        if (this.pool.length < this.maxConnections) {
          const pooledConnection = await this.createPooledConnection();
          pooledConnection.inUse = true;
          this.activeConnections++;
          clearTimeout(timeout);
          resolve(pooledConnection.connection);
          return;
        }

        // Wait for connection to become available
        this.waiting.push({ resolve, reject, timeout });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async release(connection) {
    const pooledConnection = this.pool.find(pc => pc.connection === connection);
    
    if (pooledConnection) {
      pooledConnection.inUse = false;
      pooledConnection.lastUsed = Date.now();
      this.activeConnections--;
      
      // Serve waiting requests
      if (this.waiting.length > 0) {
        const waiter = this.waiting.shift();
        clearTimeout(waiter.timeout);
        
        if (await this.isConnectionValid(pooledConnection)) {
          pooledConnection.inUse = true;
          this.activeConnections++;
          waiter.resolve(connection);
        } else {
          await this.removeConnection(pooledConnection);
          waiter.reject(new Error('Connection no longer valid'));
        }
      }
    }
  }

  async isConnectionValid(pooledConnection) {
    if (!this.validateConnection) return true;
    
    try {
      return await this.validateConnection(pooledConnection.connection);
    } catch {
      return false;
    }
  }

  async removeConnection(pooledConnection) {
    const index = this.pool.indexOf(pooledConnection);
    if (index > -1) {
      this.pool.splice(index, 1);
      
      if (this.destroyConnection) {
        try {
          await this.destroyConnection(pooledConnection.connection);
        } catch (error) {
          console.error('Error destroying connection:', error);
        }
      }
    }
  }

  startCleanupTimer() {
    setInterval(async () => {
      await this.cleanup();
    }, 60000); // Cleanup every minute
  }

  async cleanup() {
    const now = Date.now();
    const toRemove = [];
    
    for (const pooledConnection of this.pool) {
      // Remove idle connections that exceed timeout
      if (!pooledConnection.inUse && 
          (now - pooledConnection.lastUsed) > this.idleTimeout &&
          this.pool.length > this.minConnections) {
        toRemove.push(pooledConnection);
      }
    }
    
    for (const pooledConnection of toRemove) {
      await this.removeConnection(pooledConnection);
    }
    
    // Ensure minimum connections
    while (this.pool.length < this.minConnections) {
      try {
        await this.createPooledConnection();
      } catch (error) {
        console.error('Error creating minimum connections:', error);
        break;
      }
    }
  }

  getStats() {
    return {
      total: this.pool.length,
      active: this.activeConnections,
      idle: this.pool.length - this.activeConnections,
      waiting: this.waiting.length
    };
  }

  async destroy() {
    // Clear waiting requests
    this.waiting.forEach(waiter => {
      clearTimeout(waiter.timeout);
      waiter.reject(new Error('Pool destroyed'));
    });
    this.waiting = [];

    // Destroy all connections
    const destroyPromises = this.pool.map(pc => this.removeConnection(pc));
    await Promise.all(destroyPromises);
    
    this.pool = [];
    this.activeConnections = 0;
  }
}
```

#### Caching Strategies
```javascript
// caching-system.js
import Redis from 'redis';
import LRU from 'lru-cache';

export class MultiTierCache {
  constructor(options = {}) {
    // L1 Cache: In-memory LRU
    this.memoryCache = new LRU({
      max: options.memoryMax || 1000,
      ttl: options.memoryTTL || 5 * 60 * 1000 // 5 minutes
    });

    // L2 Cache: Redis
    if (options.redisUrl) {
      this.redisClient = Redis.createClient({ url: options.redisUrl });
      this.redisClient.on('error', err => console.error('Redis error:', err));
      this.redisClient.connect();
    }

    this.defaultTTL = options.defaultTTL || 3600; // 1 hour
  }

  async get(key) {
    // Try L1 cache first
    let value = this.memoryCache.get(key);
    if (value !== undefined) {
      return value;
    }

    // Try L2 cache (Redis)
    if (this.redisClient) {
      try {
        const redisValue = await this.redisClient.get(key);
        if (redisValue !== null) {
          value = JSON.parse(redisValue);
          // Promote to L1 cache
          this.memoryCache.set(key, value);
          return value;
        }
      } catch (error) {
        console.error('Redis get error:', error);
      }
    }

    return null;
  }

  async set(key, value, ttl = this.defaultTTL) {
    // Set in L1 cache
    this.memoryCache.set(key, value);

    // Set in L2 cache (Redis)
    if (this.redisClient) {
      try {
        await this.redisClient.setEx(key, ttl, JSON.stringify(value));
      } catch (error) {
        console.error('Redis set error:', error);
      }
    }
  }

  async delete(key) {
    // Remove from L1 cache
    this.memoryCache.delete(key);

    // Remove from L2 cache
    if (this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (error) {
        console.error('Redis delete error:', error);
      }
    }
  }

  async clear() {
    this.memoryCache.clear();
    
    if (this.redisClient) {
      try {
        await this.redisClient.flushDb();
      } catch (error) {
        console.error('Redis clear error:', error);
      }
    }
  }

  // Cache-aside pattern helper
  async getOrSet(key, fetchFunction, ttl) {
    let value = await this.get(key);
    
    if (value === null) {
      value = await fetchFunction();
      if (value !== null && value !== undefined) {
        await this.set(key, value, ttl);
      }
    }
    
    return value;
  }

  // Specialized caching methods
  async cacheSwarmResult(swarmId, result, ttl = 86400) {
    await this.set(`swarm:result:${swarmId}`, result, ttl);
  }

  async getCachedSwarmResult(swarmId) {
    return await this.get(`swarm:result:${swarmId}`);
  }

  async cacheAgentPool(swarmId, agents, ttl = 3600) {
    await this.set(`swarm:agents:${swarmId}`, agents, ttl);
  }

  async getCachedAgentPool(swarmId) {
    return await this.get(`swarm:agents:${swarmId}`);
  }

  getStats() {
    return {
      memory: {
        size: this.memoryCache.size,
        max: this.memoryCache.max
      },
      redis: this.redisClient ? 'connected' : 'disabled'
    };
  }

  async close() {
    if (this.redisClient) {
      await this.redisClient.disconnect();
    }
  }
}

// Usage example
const cache = new MultiTierCache({
  memoryMax: 1000,
  memoryTTL: 5 * 60 * 1000,
  redisUrl: process.env.REDIS_URL,
  defaultTTL: 3600
});

// Cache swarm results
await cache.cacheSwarmResult('swarm_123', results);

// Get cached result with fallback
const result = await cache.getOrSet(
  'expensive_operation',
  async () => await performExpensiveOperation(),
  1800 // 30 minutes
);
```

### Monitoring and Metrics

```javascript
// performance-metrics.js
import { EventEmitter } from 'events';

export class PerformanceCollector extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.timers = new Map();
    this.counters = new Map();
    this.histograms = new Map();
  }

  // Timer operations
  startTimer(name, labels = {}) {
    const key = this.createKey(name, labels);
    this.timers.set(key, {
      startTime: process.hrtime.bigint(),
      labels
    });
  }

  endTimer(name, labels = {}) {
    const key = this.createKey(name, labels);
    const timer = this.timers.get(key);
    
    if (timer) {
      const duration = Number(process.hrtime.bigint() - timer.startTime) / 1e6; // Convert to milliseconds
      this.timers.delete(key);
      
      this.recordHistogram(name, duration, labels);
      return duration;
    }
    
    return 0;
  }

  // Counter operations
  incrementCounter(name, value = 1, labels = {}) {
    const key = this.createKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);
  }

  // Histogram operations
  recordHistogram(name, value, labels = {}) {
    const key = this.createKey(name, labels);
    
    if (!this.histograms.has(key)) {
      this.histograms.set(key, {
        values: [],
        labels,
        sum: 0,
        count: 0
      });
    }
    
    const histogram = this.histograms.get(key);
    histogram.values.push(value);
    histogram.sum += value;
    histogram.count++;
    
    // Keep only last 1000 values to prevent memory growth
    if (histogram.values.length > 1000) {
      histogram.values = histogram.values.slice(-1000);
    }
  }

  // Gauge operations
  setGauge(name, value, labels = {}) {
    const key = this.createKey(name, labels);
    this.metrics.set(key, { value, labels, timestamp: Date.now() });
  }

  // Utility methods
  createKey(name, labels) {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  getHistogramStats(name, labels = {}) {
    const key = this.createKey(name, labels);
    const histogram = this.histograms.get(key);
    
    if (!histogram || histogram.values.length === 0) {
      return null;
    }
    
    const sorted = [...histogram.values].sort((a, b) => a - b);
    const count = sorted.length;
    
    return {
      count: histogram.count,
      sum: histogram.sum,
      avg: histogram.sum / histogram.count,
      min: Math.min(...sorted),
      max: Math.max(...sorted),
      p50: sorted[Math.floor(count * 0.5)],
      p90: sorted[Math.floor(count * 0.9)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)]
    };
  }

  // Export metrics in Prometheus format
  exportPrometheus() {
    let output = '';
    
    // Counters
    for (const [key, value] of this.counters) {
      const [name] = key.split('{');
      output += `# TYPE ${name} counter\n`;
      output += `${key} ${value}\n`;
    }
    
    // Gauges
    for (const [key, metric] of this.metrics) {
      const [name] = key.split('{');
      output += `# TYPE ${name} gauge\n`;
      output += `${key} ${metric.value}\n`;
    }
    
    // Histograms
    for (const [key, histogram] of this.histograms) {
      const [name] = key.split('{');
      const stats = this.getHistogramStats(name, histogram.labels);
      
      if (stats) {
        output += `# TYPE ${name} histogram\n`;
        output += `${key.replace('}', ',quantile="0.5"}')} ${stats.p50}\n`;
        output += `${key.replace('}', ',quantile="0.9"}')} ${stats.p90}\n`;
        output += `${key.replace('}', ',quantile="0.95"}')} ${stats.p95}\n`;
        output += `${key.replace('}', ',quantile="0.99"}')} ${stats.p99}\n`;
        output += `${key}_sum ${stats.sum}\n`;
        output += `${key}_count ${stats.count}\n`;
      }
    }
    
    return output;
  }

  reset() {
    this.metrics.clear();
    this.timers.clear();
    this.counters.clear();
    this.histograms.clear();
  }
}

// Integrate with HeadlessSystem
export function instrumentHeadlessSystem(system) {
  const metrics = new PerformanceCollector();
  
  // Monitor swarm operations
  const originalCreateSwarm = system.coordinator.createSwarm.bind(system.coordinator);
  system.coordinator.createSwarm = async function(objective) {
    metrics.startTimer('swarm_creation_duration', { strategy: objective.strategy });
    metrics.incrementCounter('swarm_creation_total', 1, { strategy: objective.strategy });
    
    try {
      const result = await originalCreateSwarm(objective);
      metrics.endTimer('swarm_creation_duration', { strategy: objective.strategy });
      metrics.incrementCounter('swarm_creation_success', 1, { strategy: objective.strategy });
      return result;
    } catch (error) {
      metrics.endTimer('swarm_creation_duration', { strategy: objective.strategy });
      metrics.incrementCounter('swarm_creation_errors', 1, { 
        strategy: objective.strategy,
        error: error.constructor.name 
      });
      throw error;
    }
  };
  
  // Add metrics endpoint to API server
  system.apiServer.app.get('/metrics', (req, res) => {
    res.set('Content-Type', 'text/plain');
    res.send(metrics.exportPrometheus());
  });
  
  return metrics;
}
```

This comprehensive Remote Execution Guide provides developers and system administrators with everything they need to successfully deploy, configure, and operate Claude-Flow's headless capabilities in production environments. The guide covers all major deployment scenarios, security considerations, performance optimization strategies, and troubleshooting procedures.