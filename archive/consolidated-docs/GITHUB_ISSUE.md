# Issue: Swarm Command Fails with "basicSwarmNew is not defined" and Only Runs Mock Execution

## Problem Description

The `claude-flow swarm` command is currently broken with two critical issues:

1. **Crash on Execution**: Running any swarm command results in a fatal error:
   ```
   ReferenceError: basicSwarmNew is not defined
   at Object.swarmCommand [as handler] (file:///usr/local/lib/node_modules/claude-flow/src/cli/simple-commands/swarm.js:810:20)
   ```

2. **Mock Execution Only**: Even when the error is bypassed, the swarm system only runs mock/simulated execution without making real AI agent calls, making it unsuitable for production use.

## Current Behavior

```bash
$ claude-flow swarm "Build a REST API"
🐝 Claude Flow Advanced Swarm System
❌ Error: basicSwarmNew is not defined
```

When examining the codebase:
- The `basicSwarmNew` function is referenced but never defined
- `SwarmCoordinator.ts` contains comments like "// In real implementation, this would spawn actual Claude instances"
- Execution completes in 1-2 seconds with no real work performed

## Expected Behavior

The swarm command should:
1. Execute without errors
2. Make real API calls to Claude for AI agent execution
3. Support headless execution for CI/CD and containerized environments
4. Exit gracefully when complete (not hang)
5. Produce actual AI-generated outputs

## Impact

- **Severity**: Critical - Core feature is completely broken
- **Affected Users**: Anyone trying to use swarm functionality
- **Use Cases Blocked**: 
  - Automated development workflows
  - AI-assisted code generation
  - Research and analysis tasks
  - CI/CD integration

## Requirements for Fix

1. **Fix undefined function error**: Implement the missing `basicSwarmNew` function
2. **Real AI execution**: Replace mock execution with actual Claude API calls
3. **Headless support**: Enable execution in non-interactive environments
4. **Graceful shutdown**: Ensure processes exit cleanly
5. **Documentation**: Provide setup and usage guides

## Environment

- claude-flow version: Latest
- Node.js version: 18+
- Environment: Both interactive and headless (Docker, CI/CD)

## Reproduction Steps

1. Install claude-flow: `npm install -g claude-flow@latest`
2. Run any swarm command: `claude-flow swarm "any objective"`
3. Observe the "basicSwarmNew is not defined" error
4. If error is bypassed, observe mock execution completing in seconds with no real output