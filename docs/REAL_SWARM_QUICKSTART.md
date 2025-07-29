# Real Swarm Execution Quick Start Guide

## 5-Minute Setup

### 1. Get Your API Key
Visit https://console.anthropic.com/ and create an API key.

### 2. Install Claude-Flow
```bash
npm install -g claude-flow@latest
```

### 3. Set Your API Key
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-YOUR-KEY-HERE
```

### 4. Run Your First Swarm
```bash
claude-flow swarm "Create a hello world REST API" --executor
```

## What Just Happened?

You just orchestrated an AI swarm that:
1. **Analyzed** your objective
2. **Created** 5-7 specific tasks
3. **Assigned** tasks to specialized AI agents
4. **Executed** tasks in parallel
5. **Synthesized** results into a cohesive solution

## Common Commands

### Development Tasks
```bash
# Build features
claude-flow swarm "Build user authentication with OAuth" --executor

# Create APIs
claude-flow swarm "Design REST API for e-commerce platform" --executor

# Write tests
claude-flow swarm "Create comprehensive test suite for payment system" --executor
```

### Research Tasks
```bash
# Technology research
claude-flow swarm "Compare React vs Vue for enterprise applications" --strategy research --executor

# Market analysis
claude-flow swarm "Analyze cloud storage providers pricing and features" --strategy research --executor
```

### Code Analysis
```bash
# Security audit
claude-flow swarm "Analyze codebase for security vulnerabilities" --strategy analysis --executor

# Performance review
claude-flow swarm "Identify performance bottlenecks in the application" --strategy analysis --executor
```

## Output Location

Your results are saved in:
```
./swarm-runs/
└── exec_[timestamp]/
    └── swarm_[id]/
        ├── report.md      # Human-readable report
        ├── summary.json   # Quick overview
        └── results.json   # Detailed results
```

## Quick Tips

### Save API Key Permanently
```bash
# Add to your shell profile
echo 'export ANTHROPIC_API_KEY=sk-ant-api03-...' >> ~/.bashrc
source ~/.bashrc
```

### Use .env File
```bash
# Create .env in your project
echo "ANTHROPIC_API_KEY=sk-ant-api03-..." > .env

# Load before running
source .env && claude-flow swarm "Your task" --executor
```

### Headless Execution (CI/CD)
```bash
# For Docker/CI environments
CLAUDE_FLOW_HEADLESS=true claude-flow swarm "Task" --executor
```

### Control Costs
```bash
# Limit agents to reduce cost
claude-flow swarm "Task" --max-agents 3 --executor

# Preview without executing
claude-flow swarm "Task" --executor --dry-run
```

## Cost Estimates

| Task Type | Typical Cost |
|-----------|--------------|
| Simple task | $0.02-0.05 |
| Medium complexity | $0.05-0.15 |
| Complex research | $0.15-0.30 |

## Troubleshooting

### "API Key Not Found"
```bash
# Check if key is set
echo $ANTHROPIC_API_KEY

# Set it again
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

### "Rate Limit Error"
```bash
# Reduce concurrent calls
claude-flow swarm "Task" --max-agents 2 --executor
```

### "Timeout Error"
```bash
# Increase timeout (minutes)
claude-flow swarm "Complex task" --timeout 10 --executor
```

## Next Steps

1. **Explore Strategies**
   - `--strategy development` for coding
   - `--strategy research` for analysis
   - `--strategy analysis` for reviews

2. **Read Full Documentation**
   - [Complete Guide](./REAL_SWARM_EXECUTION.md)
   - [API Reference](./REAL_SWARM_EXECUTION.md#api-reference)
   - [Examples](./REAL_SWARM_EXECUTION.md#examples)

3. **Join Community**
   - Report issues: https://github.com/anthropics/claude-flow/issues
   - Share experiences and get help

## Example Output

When you run:
```bash
claude-flow swarm "Create a todo list API" --executor
```

You'll see:
```
🚀 Starting REAL swarm execution: swarm_abc123
📋 Objective: Create a todo list API
🎯 Strategy: auto

📌 Phase 1: Initializing agents...
  ✅ Initialized 5 agents

📌 Phase 2: Decomposing objective into tasks...
  ✅ Decomposed into 6 tasks

📌 Phase 3: Executing tasks with AI agents...
  ⚡ Executing 6 tasks with 5 agents...

📌 Phase 4: Synthesizing results...
  ✅ Synthesis completed

✅ Swarm execution completed in 45.2 seconds
📊 Total API calls: 8
💰 Estimated tokens used: 8,234
```

Your `report.md` will contain:
- API endpoint designs
- Database schemas
- Implementation code
- Test cases
- Documentation
- Deployment instructions

Happy swarming! 🐝