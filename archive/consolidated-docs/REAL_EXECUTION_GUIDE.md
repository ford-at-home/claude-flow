# Claude-Flow Real Execution Guide

## Overview

This guide documents how to use Claude-Flow with **real AI agent execution** via the Claude API, replacing mock/simulated execution with actual AI-powered swarms.

## Prerequisites

### 1. Valid Anthropic API Key
```bash
# Get your API key from https://console.anthropic.com/
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 2. Verify Installation
```bash
# Ensure Claude-Flow is installed
npm install -g claude-flow@latest

# Or use locally
npx claude-flow --version
```

## Real Execution Architecture

### Components

1. **ClaudeAPIExecutor** (`/src/headless/claude-api-executor.js`)
   - Makes actual API calls to Claude
   - Manages agent personalities
   - Handles rate limiting

2. **RealSwarmExecutor** (`/src/headless/real-swarm-executor.js`)
   - Orchestrates multi-agent swarms
   - Decomposes objectives into tasks
   - Synthesizes results

3. **ExecutionBridge** (`/src/headless/execution-bridge.js`)
   - Routes execution to appropriate handlers
   - Manages headless/remote execution
   - Handles graceful shutdown

## Usage Examples

### Basic Swarm Execution

```bash
# Execute a development swarm
export ANTHROPIC_API_KEY=your-key
claude-flow swarm "Build a REST API for user management" --executor

# Output:
🚀 Starting REAL swarm execution: swarm_abc123
📋 Objective: Build a REST API for user management
🎯 Strategy: auto
🤖 Using Claude API for actual AI execution

📌 Phase 1: Initializing agents...
  ✅ Initialized 5 agents:
    🤖 Coordinator (coordinator)
    🤖 Architect (architect)
    🤖 Developer (developer)
    🤖 Analyst (analyst)
    🤖 Tester (tester)

📌 Phase 2: Decomposing objective into tasks...
  🔍 Analyzing objective with coordinator agent...
  ✅ Decomposed into 6 tasks:
    1. Design REST API endpoints and data models
    2. Implement user model and database schema
    3. Create authentication and authorization logic
    4. Build CRUD endpoints for user management
    5. Add input validation and error handling
    6. Write comprehensive tests

📌 Phase 3: Executing tasks with AI agents...
  ⚡ Executing 6 tasks with 5 agents...

📦 Executing batch 1/2
  🤖 Agent Architect executing task task_xyz789
  🤖 Agent Developer executing task task_abc456
  🤖 Agent Analyst executing task task_def123
  ✅ Task task_xyz789 completed by Architect in 3521ms
  ✅ Task task_abc456 completed by Developer in 4102ms
  ✅ Task task_def123 completed by Analyst in 3876ms
  ⏳ Rate limit delay...

📦 Executing batch 2/2
  🤖 Agent Tester executing task task_ghi789
  🤖 Agent Coordinator executing task task_jkl012
  🤖 Agent Architect executing task task_mno345
  ✅ Task task_ghi789 completed by Tester in 2987ms
  ✅ Task task_jkl012 completed by Coordinator in 3156ms
  ✅ Task task_mno345 completed by Architect in 3412ms
  ✅ Completed 6/6 tasks successfully

📌 Phase 4: Synthesizing results...
  🔄 Synthesizing results from all agents...
  ✅ Synthesis completed

📌 Phase 5: Generating output...
  ✅ Output saved to: ./swarm-runs/swarm_abc123

✅ Swarm execution completed in 25.3 seconds
📊 Total API calls: 8
💰 Estimated tokens used: 12,543
```

### Headless/Remote Execution

```bash
# Docker container
docker run -e ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY \
  claude-flow:latest \
  swarm "Analyze security vulnerabilities" --executor

# AWS Batch
aws batch submit-job \
  --job-name "security-analysis" \
  --job-queue claude-flow-queue \
  --job-definition claude-flow-headless \
  --parameters '{"objective":"Analyze security vulnerabilities","executor":true}'

# Direct headless
CLAUDE_FLOW_HEADLESS=true claude-flow swarm "Research AI trends" --executor
```

### Strategy-Specific Execution

```bash
# Development strategy (5 specialized agents)
claude-flow swarm "Build authentication system" --strategy development --executor

# Research strategy (3 research-focused agents)
claude-flow swarm "Research quantum computing applications" --strategy research --executor

# Analysis strategy (3 analyst agents)
claude-flow swarm "Analyze market trends" --strategy analysis --executor

# Auto strategy (5 mixed agents)
claude-flow swarm "Improve application performance" --executor
```

### Output Structure

Real execution creates structured output:

```
./swarm-runs/swarm_abc123/
├── summary.json       # Swarm metadata and overview
├── results.json       # Detailed API responses
└── report.md         # Human-readable report
```

#### summary.json
```json
{
  "swarmId": "swarm_abc123",
  "objective": "Build a REST API for user management",
  "strategy": "auto",
  "timestamp": "2024-01-28T10:30:00Z",
  "agents": [...],
  "tasks": [...],
  "synthesis": "Comprehensive solution..."
}
```

#### report.md
```markdown
# Swarm Execution Results

**Objective:** Build a REST API for user management
**Strategy:** auto
**Swarm ID:** swarm_abc123
**Date:** 2024-01-28T10:30:00Z

## Agents
- **Coordinator** (coordinator)
- **Architect** (architect)
- **Developer** (developer)
- **Analyst** (analyst)
- **Tester** (tester)

## Tasks
1. Design REST API endpoints and data models - completed
2. Implement user model and database schema - completed
...

## Synthesis
[Integrated solution from all agents]

## Individual Task Results
[Detailed outputs from each agent]
```

## Cost Estimation

### Token Usage by Strategy

| Strategy | Agents | Avg Tasks | Estimated Tokens | Est. Cost |
|----------|--------|-----------|------------------|-----------|
| Auto | 5 | 5-7 | 10,000-15,000 | $0.10-0.15 |
| Development | 5 | 4-6 | 8,000-12,000 | $0.08-0.12 |
| Research | 3 | 3-4 | 6,000-8,000 | $0.06-0.08 |
| Analysis | 3 | 3-5 | 5,000-10,000 | $0.05-0.10 |

### Factors Affecting Cost
- Objective complexity
- Number of agents
- Task count
- Response length
- Synthesis depth

## Performance Optimization

### 1. Batch Size Configuration
```javascript
// Adjust batch size for rate limits
const executor = new RealSwarmExecutor({
  batchSize: 3  // Max parallel API calls
});
```

### 2. Agent Limiting
```bash
# Reduce agents to lower costs
claude-flow swarm "objective" --max-agents 3 --executor
```

### 3. Timeout Configuration
```bash
# Set execution timeout (default: 5 minutes)
claude-flow swarm "objective" --timeout 10 --executor
```

## Troubleshooting

### Invalid API Key
```
❌ Error: Real agent execution requires a valid ANTHROPIC_API_KEY
Solution: export ANTHROPIC_API_KEY=sk-ant-api03-...
```

### Rate Limit Errors
```
❌ Error: Claude API error: 429 - Rate limit exceeded
Solution: Reduce batch size or add delays between calls
```

### Timeout Errors
```
❌ Error: Swarm execution timed out
Solution: Increase timeout with --timeout flag
```

### Network Issues
```
❌ Error: fetch failed
Solution: Check internet connection and firewall settings
```

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-api03-...

# Optional
CLAUDE_FLOW_HEADLESS=true           # Force headless mode
CLAUDE_FLOW_EXIT_ON_COMPLETE=true   # Exit after completion
CLAUDE_API_ENDPOINT=https://...     # Custom API endpoint
CLAUDE_MODEL=claude-3-5-sonnet-20241022  # Model selection
```

## Security Considerations

1. **API Key Protection**
   - Never commit API keys to repositories
   - Use environment variables or secrets management
   - Rotate keys regularly

2. **Output Sanitization**
   - Review generated code before execution
   - Validate API responses
   - Implement security scanning

3. **Cost Controls**
   - Set usage alerts in Anthropic console
   - Monitor token usage
   - Implement spending limits

## Best Practices

1. **Start Small**
   - Test with simple objectives first
   - Gradually increase complexity
   - Monitor costs closely

2. **Clear Objectives**
   - Be specific in your objectives
   - Break down complex tasks
   - Provide context when needed

3. **Output Review**
   - Always review generated outputs
   - Verify code quality
   - Test implementations

4. **Resource Management**
   - Clean up output directories
   - Archive completed swarms
   - Monitor disk usage

## Integration Examples

### CI/CD Pipeline
```yaml
# GitHub Actions
- name: Run Claude Swarm Analysis
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
  run: |
    npx claude-flow swarm "Analyze code quality" \
      --strategy analysis \
      --executor \
      --output-format json
```

### Scheduled Tasks
```bash
# Cron job for weekly analysis
0 9 * * 1 ANTHROPIC_API_KEY=$KEY claude-flow swarm \
  "Weekly security audit" --executor >> /var/log/swarm.log
```

### Programmatic Usage
```javascript
import { RealSwarmExecutor } from 'claude-flow/headless';

const executor = new RealSwarmExecutor({
  apiKey: process.env.ANTHROPIC_API_KEY,
  strategy: 'development',
  maxAgents: 5
});

const result = await executor.execute('Build user authentication');
console.log('Output:', result.output.directory);
```

## Conclusion

Real execution transforms Claude-Flow from a mock system into a powerful AI-orchestrated development tool. With proper API configuration, you can execute complex multi-agent swarms that produce real, actionable results.

Remember:
- **Real API calls cost money** - monitor usage carefully
- **Results are AI-generated** - always review outputs
- **Execution takes time** - be patient with complex objectives
- **Graceful shutdown works** - processes exit cleanly in headless mode

For support or issues, please refer to the main Claude-Flow documentation.