# Real Swarm Execution Examples

## Table of Contents
1. [Development Examples](#development-examples)
2. [Research Examples](#research-examples)
3. [Analysis Examples](#analysis-examples)
4. [Integration Examples](#integration-examples)
5. [Advanced Patterns](#advanced-patterns)

## Development Examples

### 1. Full-Stack Application
```bash
claude-flow swarm \
  "Build a full-stack task management application with React frontend, Node.js backend, PostgreSQL database, real-time updates via WebSockets, and user authentication" \
  --strategy development \
  --executor
```

**Expected Output:**
- Frontend React component structure
- Backend API design with Express.js
- Database schema with migrations
- WebSocket implementation for real-time updates
- JWT authentication implementation
- Docker configuration files
- Deployment instructions

### 2. Microservice Architecture
```bash
claude-flow swarm \
  "Design and implement a microservices architecture for an e-commerce platform with services for users, products, orders, payments, and notifications" \
  --strategy development \
  --executor \
  --max-agents 8
```

**Tasks Generated:**
1. Design service boundaries and API contracts
2. Implement user service with authentication
3. Create product catalog service
4. Build order management service
5. Develop payment processing service
6. Set up notification service
7. Implement API gateway
8. Create service discovery and configuration

### 3. Mobile App Development
```bash
claude-flow swarm \
  "Create a React Native mobile app for fitness tracking with offline support, GPS tracking, workout plans, and progress analytics" \
  --strategy development \
  --executor
```

**Output Includes:**
- React Native project structure
- Offline data sync strategy
- GPS tracking implementation
- Local database schema
- Analytics dashboard components
- Push notification setup

### 4. CLI Tool Development
```bash
claude-flow swarm \
  "Build a CLI tool in Python for automated code quality checks including linting, security scanning, dependency auditing, and test coverage reporting" \
  --strategy development \
  --executor \
  --output-file cli-tool-implementation.md
```

## Research Examples

### 1. Technology Comparison
```bash
claude-flow swarm \
  "Research and compare Kubernetes, Docker Swarm, and Nomad for container orchestration including features, performance, ecosystem, and use cases" \
  --strategy research \
  --executor
```

**Research Output:**
- Feature comparison matrix
- Performance benchmarks analysis
- Ecosystem evaluation
- Use case recommendations
- Migration considerations
- Cost analysis

### 2. Market Analysis
```bash
claude-flow swarm \
  "Analyze the current state and future trends of edge computing in IoT applications including key players, technologies, challenges, and opportunities" \
  --strategy research \
  --executor \
  --output-format json
```

### 3. Best Practices Research
```bash
claude-flow swarm \
  "Research best practices for implementing zero-trust security architecture in cloud-native applications" \
  --strategy research \
  --executor
```

**Deliverables:**
- Security principles overview
- Implementation strategies
- Tool recommendations
- Case studies analysis
- Common pitfalls
- Compliance considerations

### 4. Technology Stack Evaluation
```bash
claude-flow swarm \
  "Evaluate modern JavaScript frameworks for building enterprise SaaS applications considering performance, scalability, developer experience, and ecosystem" \
  --strategy research \
  --executor \
  --max-agents 5
```

## Analysis Examples

### 1. Security Audit
```bash
claude-flow swarm \
  "Perform a comprehensive security analysis of a web application including OWASP top 10 vulnerabilities, authentication flows, data encryption, and API security" \
  --strategy analysis \
  --executor
```

**Analysis Includes:**
- Vulnerability assessment
- Authentication analysis
- Encryption evaluation
- API security review
- Compliance check
- Remediation recommendations

### 2. Performance Analysis
```bash
claude-flow swarm \
  "Analyze application performance bottlenecks including database queries, API response times, frontend rendering, and resource utilization" \
  --strategy analysis \
  --executor \
  --output-file performance-report.md
```

### 3. Code Quality Review
```bash
claude-flow swarm \
  "Review codebase for quality issues including design patterns, SOLID principles, test coverage, documentation, and maintainability" \
  --strategy analysis \
  --executor
```

### 4. Architecture Review
```bash
claude-flow swarm \
  "Analyze system architecture for scalability, reliability, maintainability, and identify areas for improvement" \
  --strategy analysis \
  --executor \
  --timeout 10
```

## Integration Examples

### 1. GitHub Actions Workflow
```yaml
# .github/workflows/ai-pr-review.yml
name: AI Pull Request Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
      with:
        fetch-depth: 0
    
    - name: Get Changed Files
      id: changed-files
      run: |
        echo "files=$(git diff --name-only origin/main...HEAD | tr '\n' ' ')" >> $GITHUB_OUTPUT
    
    - name: AI Code Review
      env:
        ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      run: |
        npx claude-flow@latest swarm \
          "Review the changed files for code quality, potential bugs, security issues, and suggest improvements: ${{ steps.changed-files.outputs.files }}" \
          --strategy analysis \
          --executor \
          --output-format json > review.json
    
    - name: Post Review Comment
      uses: actions/github-script@v6
      with:
        script: |
          const fs = require('fs');
          const review = JSON.parse(fs.readFileSync('review.json', 'utf8'));
          
          const comment = `## 🤖 AI Code Review
          
          ${review.synthesis}
          
          <details>
          <summary>Detailed Analysis</summary>
          
          ${review.results.output}
          </details>`;
          
          github.rest.issues.createComment({
            ...context.repo,
            issue_number: context.issue.number,
            body: comment
          });
```

### 2. GitLab CI Pipeline
```yaml
# .gitlab-ci.yml
stages:
  - analysis
  - review

security-analysis:
  stage: analysis
  image: node:18
  script:
    - npm install -g claude-flow@latest
    - |
      claude-flow swarm \
        "Analyze codebase for security vulnerabilities and generate SAST report" \
        --strategy analysis \
        --executor \
        --output-file security-report.md
  artifacts:
    reports:
      sast: security-report.md
  only:
    - merge_requests

ai-documentation:
  stage: review
  image: node:18
  script:
    - npm install -g claude-flow@latest
    - |
      claude-flow swarm \
        "Generate comprehensive API documentation from source code" \
        --strategy development \
        --executor \
        --output-file api-docs.md
  artifacts:
    paths:
      - api-docs.md
  only:
    - main
```

### 3. Jenkins Pipeline
```groovy
pipeline {
    agent any
    
    environment {
        ANTHROPIC_API_KEY = credentials('anthropic-api-key')
    }
    
    stages {
        stage('AI Analysis') {
            steps {
                script {
                    sh '''
                        npm install -g claude-flow@latest
                        
                        claude-flow swarm \
                          "Analyze build artifacts for quality metrics and generate report" \
                          --strategy analysis \
                          --executor \
                          --output-format json > analysis.json
                    '''
                    
                    def analysis = readJSON file: 'analysis.json'
                    
                    if (analysis.success) {
                        echo "Analysis completed successfully"
                        publishHTML target: [
                            allowMissing: false,
                            alwaysLinkToLastBuild: true,
                            keepAll: true,
                            reportDir: 'swarm-runs',
                            reportFiles: '*/report.md',
                            reportName: 'AI Analysis Report'
                        ]
                    }
                }
            }
        }
    }
}
```

### 4. Docker Compose Setup
```yaml
# docker-compose.yml
version: '3.8'

services:
  claude-flow-executor:
    image: node:18-alpine
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - CLAUDE_FLOW_HEADLESS=true
    volumes:
      - ./output:/app/swarm-runs
      - ./objectives.txt:/app/objectives.txt
    working_dir: /app
    command: |
      sh -c "
        npm install -g claude-flow@latest &&
        while IFS= read -r objective; do
          echo \"Processing: $$objective\"
          claude-flow swarm \"$$objective\" --executor --strategy auto
          sleep 30
        done < objectives.txt
      "

  result-processor:
    image: python:3.9-slim
    depends_on:
      - claude-flow-executor
    volumes:
      - ./output:/output
      - ./scripts:/scripts
    command: python /scripts/process_results.py
```

### 5. Kubernetes CronJob
```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: weekly-architecture-review
spec:
  schedule: "0 9 * * 1"  # Every Monday at 9 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: ai-reviewer
            image: your-registry/claude-flow:latest
            env:
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: claude-secrets
                  key: api-key
            - name: CLAUDE_FLOW_HEADLESS
              value: "true"
            command:
            - /bin/sh
            - -c
            - |
              claude-flow swarm \
                "Review system architecture for improvements, security issues, and optimization opportunities" \
                --strategy analysis \
                --executor \
                --output-file /reports/weekly-review-$(date +%Y%m%d).md
            volumeMounts:
            - name: reports
              mountPath: /reports
          volumes:
          - name: reports
            persistentVolumeClaim:
              claimName: architecture-reports-pvc
          restartPolicy: OnFailure
```

## Advanced Patterns

### 1. Multi-Stage Pipeline
```bash
#!/bin/bash
# multi-stage-development.sh

# Stage 1: Research
echo "🔍 Stage 1: Research"
claude-flow swarm \
  "Research best practices for building scalable microservices" \
  --strategy research \
  --executor \
  --output-file research.md

# Stage 2: Architecture
echo "🏗️ Stage 2: Architecture"
claude-flow swarm \
  "Design microservice architecture based on research findings in research.md" \
  --strategy development \
  --executor \
  --output-file architecture.md

# Stage 3: Implementation
echo "💻 Stage 3: Implementation"
claude-flow swarm \
  "Implement core microservices based on architecture in architecture.md" \
  --strategy development \
  --executor \
  --output-file implementation.md

# Stage 4: Testing
echo "🧪 Stage 4: Testing"
claude-flow swarm \
  "Create comprehensive test suite for implementation in implementation.md" \
  --strategy development \
  --executor \
  --output-file tests.md
```

### 2. Conditional Execution
```bash
#!/bin/bash
# conditional-swarm.sh

# Analyze first
OUTPUT=$(claude-flow swarm \
  "Analyze codebase complexity and identify areas needing refactoring" \
  --strategy analysis \
  --executor \
  --output-format json)

COMPLEXITY=$(echo $OUTPUT | jq -r '.synthesis' | grep -o 'complexity: [0-9]*' | grep -o '[0-9]*')

if [ "$COMPLEXITY" -gt 7 ]; then
  echo "High complexity detected. Running refactoring swarm..."
  claude-flow swarm \
    "Refactor complex code sections to improve maintainability" \
    --strategy development \
    --executor
fi
```

### 3. Parallel Swarm Execution
```bash
#!/bin/bash
# parallel-swarms.sh

# Run multiple swarms in parallel
(
  claude-flow swarm "Design user authentication system" --executor --output-file auth.md &
  claude-flow swarm "Design payment processing system" --executor --output-file payment.md &
  claude-flow swarm "Design notification system" --executor --output-file notification.md &
  wait
)

echo "All swarms completed. Synthesizing results..."

# Combine results
claude-flow swarm \
  "Synthesize the authentication, payment, and notification designs into a cohesive system architecture" \
  --executor \
  --output-file final-architecture.md
```

### 4. Iterative Refinement
```bash
#!/bin/bash
# iterative-refinement.sh

OBJECTIVE="Build a recommendation engine"
ITERATIONS=3

for i in $(seq 1 $ITERATIONS); do
  echo "Iteration $i of $ITERATIONS"
  
  if [ $i -eq 1 ]; then
    # Initial implementation
    claude-flow swarm "$OBJECTIVE" \
      --strategy development \
      --executor \
      --output-file "iteration-$i.md"
  else
    # Refine based on previous iteration
    claude-flow swarm \
      "Improve and refine the implementation in iteration-$((i-1)).md addressing performance and accuracy" \
      --strategy development \
      --executor \
      --output-file "iteration-$i.md"
  fi
  
  sleep 30  # Rate limiting
done
```

### 5. Custom Strategy Patterns
```javascript
// custom-strategy.js
import { RealSwarmExecutor } from 'claude-flow/headless';

// Custom agent configuration for specific domain
const customAgents = [
  { name: 'Security Expert', type: 'analyst', focus: 'security' },
  { name: 'Performance Engineer', type: 'developer', focus: 'optimization' },
  { name: 'UX Designer', type: 'architect', focus: 'user-experience' },
  { name: 'Data Scientist', type: 'researcher', focus: 'analytics' },
  { name: 'DevOps Engineer', type: 'developer', focus: 'infrastructure' }
];

async function executeCustomSwarm(objective) {
  const executor = new RealSwarmExecutor({
    apiKey: process.env.ANTHROPIC_API_KEY,
    strategy: 'custom',
    agents: customAgents,
    maxConcurrent: 3,
    outputDir: './custom-swarm-output'
  });
  
  return await executor.execute(objective);
}

// Usage
executeCustomSwarm("Design a secure, high-performance analytics platform")
  .then(result => console.log('Custom swarm completed:', result.swarmId))
  .catch(error => console.error('Custom swarm failed:', error));
```

## Output Processing Examples

### 1. JSON Processing with jq
```bash
# Extract synthesis from JSON output
claude-flow swarm "Analyze code quality" --executor --output-format json | \
  jq -r '.synthesis'

# Extract all task descriptions
claude-flow swarm "Build feature" --executor --output-format json | \
  jq -r '.tasks[].description'

# Get execution metrics
claude-flow swarm "Research topic" --executor --output-format json | \
  jq '{duration: .duration, tokens: .tokensUsed, cost: (.tokensUsed * 0.00001)}'
```

### 2. Markdown to HTML Conversion
```bash
# Convert report to HTML
claude-flow swarm "Create documentation" --executor
pandoc swarm-runs/*/report.md -o documentation.html --standalone --toc
```

### 3. Result Aggregation
```python
#!/usr/bin/env python3
# aggregate_results.py

import json
import glob
from datetime import datetime

results = []
for file in glob.glob('swarm-runs/*/summary.json'):
    with open(file) as f:
        data = json.load(f)
        results.append({
            'date': data['timestamp'],
            'objective': data['objective'],
            'duration': data['duration'],
            'tokens': data.get('tokensUsed', 0),
            'success': data['success']
        })

# Generate report
total_tokens = sum(r['tokens'] for r in results)
total_cost = total_tokens * 0.00001
success_rate = sum(1 for r in results if r['success']) / len(results) * 100

print(f"Total Swarms: {len(results)}")
print(f"Success Rate: {success_rate:.1f}%")
print(f"Total Tokens: {total_tokens:,}")
print(f"Estimated Cost: ${total_cost:.2f}")
```

## Best Practices from Examples

1. **Be Specific**: More detailed objectives produce better results
2. **Choose Right Strategy**: Match strategy to task type
3. **Control Costs**: Use --max-agents and --timeout appropriately
4. **Process Outputs**: Use tools like jq, pandoc for post-processing
5. **Rate Limit**: Add delays between multiple swarms
6. **Error Handling**: Always check success status
7. **Version Control**: Save important outputs to git
8. **Monitor Usage**: Track tokens and costs
9. **Iterate**: Use outputs as inputs for refinement
10. **Document**: Keep records of successful patterns