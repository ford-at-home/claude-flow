# Claude-Flow Swarm Executor Not Actually Executing Research Tasks

## Issue Summary
The claude-flow swarm command with `--executor` flag does not actually perform research or execute real agent tasks. Instead, it runs a mock implementation that completes in 1-2 seconds without doing any real work.

## Environment
- claude-flow version: 2.0.0-alpha.60 through 2.0.0-alpha.73
- Node.js version: v20.19.4
- OS: Linux 6.8.0-1029-aws
- Installation method: npm

## Current Behavior
When running a swarm command for research tasks:
```bash
CLAUDE_FLOW_NON_INTERACTIVE=true \
ANTHROPIC_API_KEY="sk-ant-..." \
node /path/to/claude-flow/src/cli/simple-cli.js swarm \
  "Research competitive landscape for real estate in Richmond VA" \
  --executor \
  --non-interactive \
  --yes \
  --json \
  --strategy development \
  --mode centralized \
  --max-agents 8 \
  --timeout 30000
```

The swarm:
1. Spawns agent objects (System Architect, Backend Developer, etc.)
2. Shows "Processing..." for ~1 second
3. Returns "Generic task completed"
4. Claims success without actually doing any research

## Expected Behavior
The swarm should:
- Actually execute research tasks using multiple agents
- Access internet resources for research
- Generate real research reports
- Take appropriate time based on task complexity
- Upload results to S3 (as specified in prompts)
- Produce meaningful output based on the objective

## Root Causes Identified

### 1. Missing `basicSwarmNew` Function
When trying to use advanced swarm features, the code fails with:
```
Swarm command error: ReferenceError: basicSwarmNew is not defined
    at Object.swarmCommand [as handler] (swarm.js:807:7)
```

### 2. Executor Mode Issues
- WITH `--executor` flag: Uses mock SwarmCoordinator that doesn't do real work
- WITHOUT `--executor` flag: Tries to spawn Claude GUI which hangs in headless environments

### 3. Missing Dependencies
The swarm-executor.js has missing imports:
```
Cannot find module '/path/to/claude-flow/src/utils/helpers.js'
```

## Impact
This makes the swarm functionality unusable for actual research or development tasks in headless/API environments. Users expecting multi-agent research capabilities get mock outputs instead of real results.

## Reproduction Steps
1. Install claude-flow: `npm install claude-flow@alpha`
2. Set environment variables for non-interactive mode
3. Run any swarm command with `--executor` flag
4. Observe that execution completes in 1-2 seconds with generic output
5. No actual research/work is performed

## Attempted Workarounds
1. Removing `--executor` flag causes interactive Claude spawn (hangs in headless)
2. Adding missing helpers.js allows SwarmCoordinator to run but it's still mock
3. Using `script` command for TTY allocation doesn't solve the core issue

## Suggested Solutions
1. Implement real agent execution in SwarmCoordinator
2. Fix the `basicSwarmNew` reference error
3. Add proper headless mode that actually executes tasks
4. Provide clear documentation on swarm limitations
5. Consider integrating with Claude API for actual agent execution

## Additional Context
We're trying to use claude-flow for automated research tasks via API bridge. The current implementation appears to be a placeholder that doesn't actually utilize Claude's capabilities for multi-agent coordination and research.

Is there a roadmap for implementing real swarm execution? Or are there undocumented flags/methods to enable actual agent work?

## Related Code
- `/src/cli/simple-commands/swarm.js` - Line 807 (basicSwarmNew error)
- `/src/cli/simple-commands/swarm-executor.js` - Mock implementation
- `/src/cli/simple-commands/swarm.js` - Lines 800-850 (fallback to createSwarmFiles)
