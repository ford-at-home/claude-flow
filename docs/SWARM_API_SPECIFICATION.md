# Claude-Flow Swarm API Specification

## Overview

This specification defines the API interface for external frontends (like Sita) to interact with Claude-Flow's real swarm execution system via Lambda or direct HTTP endpoints.

## Architecture

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│  External       │  HTTPS  │   API Gateway   │  Invoke │    Lambda       │
│  Frontend       │────────▶│   / Lambda      │────────▶│   Function      │
│  (Sita)         │         │   Endpoint      │         │                 │
└─────────────────┘         └─────────────────┘         └────────┬────────┘
                                                                  │
                                                                  ▼
                                                        ┌─────────────────┐
                                                        │ ExecutionBridge │
                                                        │  (API Mode)     │
                                                        └────────┬────────┘
                                                                  │
                                                                  ▼
                                                        ┌─────────────────┐
                                                        │ RealSwarmExecutor│
                                                        │ (Claude API)    │
                                                        └─────────────────┘
```

## API Endpoints

### 1. Execute Swarm

**POST** `/api/v1/swarm/execute`

Initiates a new swarm execution with the specified objective and configuration.

#### Request

```json
{
  "objective": "Create a REST API for user management",
  "config": {
    "strategy": "development",
    "maxAgents": 5,
    "timeout": 300000,
    "outputFormat": "json",
    "options": {
      "includeCode": true,
      "includeTests": true,
      "verbosity": "normal"
    }
  },
  "metadata": {
    "userId": "user-123",
    "projectId": "project-456",
    "sessionId": "session-789",
    "tags": ["api", "backend", "urgent"]
  }
}
```

#### Response

```json
{
  "executionId": "exec_mdnsk2o1_4ixwmn7rj",
  "status": "initiated",
  "estimatedDuration": 45000,
  "estimatedTokens": 8000,
  "estimatedCost": 0.08,
  "webhook": "https://api.claude-flow.com/v1/swarm/status/exec_mdnsk2o1_4ixwmn7rj"
}
```

### 2. Get Swarm Status

**GET** `/api/v1/swarm/status/{executionId}`

Retrieves the current status of a swarm execution.

#### Response

```json
{
  "executionId": "exec_mdnsk2o1_4ixwmn7rj",
  "status": "in_progress",
  "progress": {
    "phase": "executing_tasks",
    "completedTasks": 3,
    "totalTasks": 6,
    "percentage": 50
  },
  "agents": [
    {
      "id": "agent_001",
      "name": "Architect",
      "status": "active",
      "currentTask": "Design API endpoints"
    }
  ],
  "startTime": "2024-01-28T10:30:00Z",
  "elapsedTime": 23000,
  "tokensUsed": 4523
}
```

### 3. Get Swarm Results

**GET** `/api/v1/swarm/results/{executionId}`

Retrieves the complete results of a finished swarm execution.

#### Response

```json
{
  "executionId": "exec_mdnsk2o1_4ixwmn7rj",
  "status": "completed",
  "success": true,
  "objective": "Create a REST API for user management",
  "strategy": "development",
  "duration": 45200,
  "tokensUsed": 8234,
  "cost": 0.082,
  "synthesis": "# Complete User Management API\n\n## Overview\n...",
  "tasks": [
    {
      "id": "task_001",
      "description": "Design REST API endpoints",
      "status": "completed",
      "agent": "Architect",
      "output": "## API Endpoints Design\n\n### Users\n- POST /api/users\n- GET /api/users\n...",
      "duration": 5234,
      "tokensUsed": 1200
    }
  ],
  "artifacts": {
    "code": {
      "language": "javascript",
      "files": [
        {
          "path": "src/controllers/userController.js",
          "content": "const User = require('../models/User');\n\nclass UserController {\n..."
        }
      ]
    },
    "tests": {
      "framework": "jest",
      "files": [
        {
          "path": "tests/user.test.js",
          "content": "describe('User API', () => {\n..."
        }
      ]
    },
    "documentation": {
      "openapi": "3.0.0",
      "content": {
        "openapi": "3.0.0",
        "info": {
          "title": "User Management API",
          "version": "1.0.0"
        }
      }
    }
  },
  "metadata": {
    "userId": "user-123",
    "projectId": "project-456",
    "sessionId": "session-789",
    "tags": ["api", "backend", "urgent"]
  }
}
```

### 4. Cancel Swarm Execution

**POST** `/api/v1/swarm/cancel/{executionId}`

Cancels an in-progress swarm execution.

#### Response

```json
{
  "executionId": "exec_mdnsk2o1_4ixwmn7rj",
  "status": "cancelled",
  "message": "Swarm execution cancelled successfully",
  "refund": {
    "tokensUsed": 2500,
    "cost": 0.025,
    "refundable": false
  }
}
```

### 5. List Swarm Executions

**GET** `/api/v1/swarm/list`

Lists swarm executions with filtering and pagination.

#### Query Parameters
- `userId`: Filter by user ID
- `projectId`: Filter by project ID
- `status`: Filter by status (pending, in_progress, completed, failed)
- `strategy`: Filter by strategy
- `startDate`: ISO date string
- `endDate`: ISO date string
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)

#### Response

```json
{
  "executions": [
    {
      "executionId": "exec_mdnsk2o1_4ixwmn7rj",
      "objective": "Create a REST API for user management",
      "status": "completed",
      "strategy": "development",
      "startTime": "2024-01-28T10:30:00Z",
      "duration": 45200,
      "tokensUsed": 8234,
      "cost": 0.082
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 156,
    "pages": 8
  }
}
```

### 6. Estimate Swarm Cost

**POST** `/api/v1/swarm/estimate`

Estimates the cost and duration for a swarm execution without running it.

#### Request

```json
{
  "objective": "Build a complex microservices architecture",
  "strategy": "development",
  "complexity": "high"
}
```

#### Response

```json
{
  "estimation": {
    "tokens": {
      "min": 15000,
      "max": 25000,
      "likely": 20000
    },
    "cost": {
      "min": 0.15,
      "max": 0.25,
      "likely": 0.20
    },
    "duration": {
      "min": 60000,
      "max": 90000,
      "likely": 75000
    },
    "agents": 5,
    "tasks": {
      "min": 8,
      "max": 12,
      "likely": 10
    }
  },
  "factors": [
    "High complexity objective",
    "Development strategy selected",
    "Microservices require multiple components"
  ]
}
```

## Lambda Implementation

### Handler Function

```javascript
// lambda/swarmHandler.js
import { ExecutionBridge } from '../src/headless/execution-bridge.js';
import { validateApiKey, rateLimiter, cors } from './middleware.js';

export async function handler(event, context) {
  // Apply CORS headers
  const headers = cors();
  
  try {
    // Parse request
    const { httpMethod, path, body, headers: reqHeaders } = event;
    const apiKey = reqHeaders['x-api-key'];
    
    // Validate API key
    const user = await validateApiKey(apiKey);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid API key' })
      };
    }
    
    // Rate limiting
    const rateLimitOk = await rateLimiter.check(user.id);
    if (!rateLimitOk) {
      return {
        statusCode: 429,
        headers,
        body: JSON.stringify({ error: 'Rate limit exceeded' })
      };
    }
    
    // Route request
    const route = `${httpMethod} ${path}`;
    
    switch (route) {
      case 'POST /api/v1/swarm/execute':
        return await executeSwarm(JSON.parse(body), user);
        
      case 'GET /api/v1/swarm/status/*':
        const statusId = path.split('/').pop();
        return await getSwarmStatus(statusId, user);
        
      case 'GET /api/v1/swarm/results/*':
        const resultsId = path.split('/').pop();
        return await getSwarmResults(resultsId, user);
        
      case 'POST /api/v1/swarm/cancel/*':
        const cancelId = path.split('/').pop();
        return await cancelSwarm(cancelId, user);
        
      case 'GET /api/v1/swarm/list':
        return await listSwarms(event.queryStringParameters, user);
        
      case 'POST /api/v1/swarm/estimate':
        return await estimateSwarm(JSON.parse(body), user);
        
      default:
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Route not found' })
        };
    }
  } catch (error) {
    console.error('Lambda error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
}

async function executeSwarm(request, user) {
  const { objective, config = {}, metadata = {} } = request;
  
  // Create execution bridge
  const bridge = new ExecutionBridge({
    headless: true,
    claudeApiKey: process.env.ANTHROPIC_API_KEY,
    ...config
  });
  
  // Generate execution ID
  const executionId = generateExecutionId();
  
  // Store execution metadata
  await storeExecution({
    executionId,
    userId: user.id,
    objective,
    config,
    metadata,
    status: 'initiated',
    startTime: new Date().toISOString()
  });
  
  // Execute asynchronously
  executeAsync(bridge, objective, config, executionId, user);
  
  // Return immediate response
  const estimation = estimateExecution(objective, config);
  
  return {
    statusCode: 202,
    headers,
    body: JSON.stringify({
      executionId,
      status: 'initiated',
      estimatedDuration: estimation.duration,
      estimatedTokens: estimation.tokens,
      estimatedCost: estimation.cost,
      webhook: `${process.env.API_BASE_URL}/v1/swarm/status/${executionId}`
    })
  };
}

async function executeAsync(bridge, objective, config, executionId, user) {
  try {
    // Update status
    await updateExecutionStatus(executionId, 'in_progress');
    
    // Execute swarm
    const result = await bridge.executeSwarm(objective, {
      ...config,
      executor: true,
      outputFormat: 'json'
    });
    
    // Store results
    await storeExecutionResults(executionId, {
      ...result,
      status: 'completed',
      endTime: new Date().toISOString()
    });
    
    // Send webhook if configured
    if (user.webhookUrl) {
      await sendWebhook(user.webhookUrl, {
        executionId,
        status: 'completed',
        success: result.success
      });
    }
  } catch (error) {
    console.error('Async execution error:', error);
    
    await updateExecutionStatus(executionId, 'failed', error.message);
    
    if (user.webhookUrl) {
      await sendWebhook(user.webhookUrl, {
        executionId,
        status: 'failed',
        error: error.message
      });
    }
  }
}
```

### API Gateway Configuration

```yaml
# serverless.yml
service: claude-flow-api

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  environment:
    ANTHROPIC_API_KEY: ${env:ANTHROPIC_API_KEY}
    DYNAMODB_TABLE: ${self:service}-${self:provider.stage}
    API_BASE_URL: https://api.claude-flow.com

functions:
  swarmHandler:
    handler: lambda/swarmHandler.handler
    timeout: 900
    memorySize: 3008
    events:
      - http:
          path: /api/v1/swarm/{proxy+}
          method: ANY
          cors: true
          authorizer:
            type: REQUEST
            authorizerUri: arn:aws:apigateway:region:lambda:path/2015-03-31/functions/arn:aws:lambda:region:account:function:authorizer/invocations

resources:
  Resources:
    ExecutionsTable:
      Type: AWS::DynamoDB::Table
      Properties:
        TableName: ${self:provider.environment.DYNAMODB_TABLE}
        AttributeDefinitions:
          - AttributeName: executionId
            AttributeType: S
          - AttributeName: userId
            AttributeType: S
        KeySchema:
          - AttributeName: executionId
            KeyType: HASH
        GlobalSecondaryIndexes:
          - IndexName: UserIdIndex
            KeySchema:
              - AttributeName: userId
                KeyType: HASH
            Projection:
              ProjectionType: ALL
```

## SDK Examples

### JavaScript/TypeScript

```typescript
// claude-flow-sdk.ts
export class ClaudeFlowClient {
  constructor(private apiKey: string, private baseUrl = 'https://api.claude-flow.com') {}
  
  async executeSwarm(objective: string, config?: SwarmConfig): Promise<SwarmExecution> {
    const response = await fetch(`${this.baseUrl}/api/v1/swarm/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      body: JSON.stringify({ objective, config })
    });
    
    return response.json();
  }
  
  async getStatus(executionId: string): Promise<SwarmStatus> {
    const response = await fetch(`${this.baseUrl}/api/v1/swarm/status/${executionId}`, {
      headers: { 'x-api-key': this.apiKey }
    });
    
    return response.json();
  }
  
  async getResults(executionId: string): Promise<SwarmResults> {
    const response = await fetch(`${this.baseUrl}/api/v1/swarm/results/${executionId}`, {
      headers: { 'x-api-key': this.apiKey }
    });
    
    return response.json();
  }
  
  async waitForCompletion(executionId: string, pollInterval = 5000): Promise<SwarmResults> {
    while (true) {
      const status = await this.getStatus(executionId);
      
      if (status.status === 'completed' || status.status === 'failed') {
        return await this.getResults(executionId);
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }
}

// Usage
const client = new ClaudeFlowClient('your-api-key');

const execution = await client.executeSwarm('Build a REST API', {
  strategy: 'development',
  maxAgents: 5
});

console.log('Execution started:', execution.executionId);

const results = await client.waitForCompletion(execution.executionId);
console.log('Results:', results.synthesis);
```

### Python

```python
# claude_flow_sdk.py
import requests
import time
from typing import Dict, Optional

class ClaudeFlowClient:
    def __init__(self, api_key: str, base_url: str = "https://api.claude-flow.com"):
        self.api_key = api_key
        self.base_url = base_url
        self.headers = {"x-api-key": api_key}
    
    def execute_swarm(self, objective: str, config: Optional[Dict] = None) -> Dict:
        response = requests.post(
            f"{self.base_url}/api/v1/swarm/execute",
            headers={**self.headers, "Content-Type": "application/json"},
            json={"objective": objective, "config": config or {}}
        )
        response.raise_for_status()
        return response.json()
    
    def get_status(self, execution_id: str) -> Dict:
        response = requests.get(
            f"{self.base_url}/api/v1/swarm/status/{execution_id}",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def get_results(self, execution_id: str) -> Dict:
        response = requests.get(
            f"{self.base_url}/api/v1/swarm/results/{execution_id}",
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()
    
    def wait_for_completion(self, execution_id: str, poll_interval: int = 5) -> Dict:
        while True:
            status = self.get_status(execution_id)
            
            if status["status"] in ["completed", "failed"]:
                return self.get_results(execution_id)
            
            time.sleep(poll_interval)

# Usage
client = ClaudeFlowClient("your-api-key")

execution = client.execute_swarm("Build a REST API", {
    "strategy": "development",
    "maxAgents": 5
})

print(f"Execution started: {execution['executionId']}")

results = client.wait_for_completion(execution['executionId'])
print(f"Results: {results['synthesis']}")
```

## Authentication & Security

### API Key Management
- API keys are issued per user/organization
- Keys can be scoped to specific operations
- Rate limiting applied per key
- Keys can be rotated without downtime

### Request Signing (Optional)
```javascript
// HMAC signature for additional security
const crypto = require('crypto');

function signRequest(method, path, body, secret) {
  const timestamp = Date.now();
  const message = `${method}${path}${timestamp}${body}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');
  
  return {
    'x-timestamp': timestamp,
    'x-signature': signature
  };
}
```

## Rate Limits

| Tier | Requests/min | Concurrent | Max Tokens/day |
|------|--------------|------------|----------------|
| Free | 2 | 1 | 50,000 |
| Basic | 10 | 3 | 500,000 |
| Pro | 30 | 10 | 2,000,000 |
| Enterprise | Custom | Custom | Custom |

## Error Responses

```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "API rate limit exceeded",
  "details": {
    "limit": 10,
    "window": "1m",
    "retryAfter": 45
  }
}
```

Error codes:
- `INVALID_API_KEY`: Invalid or missing API key
- `RATE_LIMIT_EXCEEDED`: Rate limit exceeded
- `INVALID_OBJECTIVE`: Objective validation failed
- `EXECUTION_NOT_FOUND`: Execution ID not found
- `INSUFFICIENT_CREDITS`: Account credits exhausted
- `INTERNAL_ERROR`: Internal server error

## Webhooks

Register webhooks to receive real-time updates:

```json
{
  "event": "swarm.completed",
  "executionId": "exec_123",
  "timestamp": "2024-01-28T10:45:00Z",
  "data": {
    "success": true,
    "duration": 45000,
    "tokensUsed": 8234,
    "cost": 0.082
  }
}
```

Events:
- `swarm.started`: Execution started
- `swarm.progress`: Progress update
- `swarm.completed`: Execution completed
- `swarm.failed`: Execution failed
- `swarm.cancelled`: Execution cancelled

## Frontend Integration Example (Sita)

```javascript
// Frontend code example
async function runSwarmAnalysis(projectCode) {
  try {
    // Start execution
    const execution = await claudeFlowAPI.executeSwarm(
      `Analyze security vulnerabilities in project: ${projectCode}`,
      {
        strategy: 'analysis',
        outputFormat: 'json',
        options: {
          includeRecommendations: true,
          severityThreshold: 'medium'
        }
      }
    );
    
    // Show progress
    updateUI('Analysis started...', execution.executionId);
    
    // Poll for results
    const results = await claudeFlowAPI.waitForCompletion(execution.executionId);
    
    // Display results
    displaySecurityReport(results);
    
  } catch (error) {
    handleError(error);
  }
}
```

This API specification provides a complete interface for external frontends to interact with Claude-Flow's real swarm execution system, whether through Lambda, direct HTTP, or SDK integration.