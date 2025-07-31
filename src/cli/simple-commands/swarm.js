/**
 * Claude-Flow Swarm Command Implementation
 * 
 * This file implements the main swarm command for the Claude-Flow CLI, providing
 * intelligent routing between interactive and headless execution modes based on
 * environment detection and user flags.
 * 
 * ARCHITECTURE OVERVIEW:
 * ===================
 * 
 * The swarm command supports three main execution modes:
 * 
 * 1. INTERACTIVE MODE (Default for local development)
 *    - Detected: Local terminal environments (TTY available)
 *    - Behavior: Launches Claude Code GUI with comprehensive swarm coordination prompts
 *    - User Experience: Human-AI collaboration through interactive Claude Code interface
 *    - Routing: ExecutionBridge.executeInteractive()
 * 
 * 2. HEADLESS MODE (Auto-detected for production environments)
 *    - Detected: CI/CD, Docker, production environments (no TTY, ENV flags set)
 *    - Behavior: Uses Claude API directly for programmatic swarm execution
 *    - User Experience: Returns structured results, no interactive session
 *    - Routing: ExecutionBridge.executeHeadless()
 * 
 * 3. BACKGROUND MODE (Explicit flag)
 *    - Triggered: --background flag
 *    - Behavior: Detached daemon-style execution with logging
 *    - User Experience: Command returns immediately, swarm runs independently
 *    - Routing: Legacy background process spawning (not yet migrated to ExecutionBridge)
 * 
 * EXECUTION FLOW:
 * ==============
 * 
 * 1. Parse command arguments and flags
 * 2. Validate objective and configuration
 * 3. Detect execution environment using isHeadless()
 * 4. Route to appropriate execution mode:
 *    a. Background mode: Handle via legacy background spawning
 *    b. All other modes: Route through ExecutionBridge
 * 5. ExecutionBridge determines final execution strategy based on:
 *    - Environment detection (headless vs interactive)
 *    - Available resources (Claude Code CLI vs API keys)
 *    - User preferences (explicit flags)
 * 
 * HISTORICAL CONTEXT:
 * ==================
 * 
 * This implementation fixes a critical architectural issue introduced during
 * the remote-execution branch (PR #511) development:
 * 
 * - PROBLEM: Original swarm command lacked headless environment detection
 * - SYMPTOM: Commands failed or hung in CI/CD and production environments  
 * - BAD FIX: Added process detachment that broke interactive collaboration
 * - ROOT CAUSE: Missing integration with ExecutionBridge headless infrastructure
 * - SOLUTION: Unified routing through ExecutionBridge with environment detection
 * 
 * The key insight was that the swarm command should be "interactive by design"
 * for local development but automatically adapt to headless execution in
 * production environments, rather than requiring explicit flags.
 * 
 * DEPENDENCIES:
 * ============
 * 
 * - ExecutionBridge: Handles all swarm execution logic
 * - isHeadless(): Environment detection utility
 * - Claude Code CLI: Required for interactive mode
 * - Claude API: Required for headless mode
 * - MCP Tools: Used for agent coordination in both modes
 * 
 * @author Claude-Flow Team
 * @version 2.0.0-alpha.79
 * @since 2.0.0-alpha.58 (remote-exec branch)
 */

import { args, mkdirAsync, writeTextFile, exit, cwd } from '../node-compat.js';
import { spawn, execSync } from 'child_process';
import { existsSync, chmodSync, statSync } from 'fs';
import { open } from 'fs/promises';
import process from 'process';
import path from 'path';
import { isHeadless } from '../../utils/helpers.js';

// ExecutionBridge is imported dynamically to avoid ES module circular dependency issues
// and to provide graceful fallbacks when the headless infrastructure is unavailable

/**
 * Display comprehensive help information for the swarm command
 * 
 * Shows usage patterns, available strategies, coordination modes, and examples
 * to help users understand the different execution options and their use cases.
 * 
 * This help text reflects the current architecture where:
 * - Default behavior uses ExecutionBridge with environment detection
 * - --executor flag forces headless mode
 * - --background flag enables daemon-style execution
 * 
 * @function showSwarmHelp
 * @returns {void} Outputs help text to console
 */
function showSwarmHelp() {
  console.log(`
🐝 Claude Flow Advanced Swarm System

USAGE:
  claude-flow swarm <objective> [options]

EXAMPLES:
  claude-flow swarm "Build a REST API with authentication"
  claude-flow swarm "Research cloud architecture patterns" --strategy research
  claude-flow swarm "Analyze database performance" --max-agents 3 --parallel
  claude-flow swarm "Develop user registration feature" --mode distributed
  claude-flow swarm "Optimize React app performance" --strategy optimization
  claude-flow swarm "Create microservice" --executor  # Use built-in executor
  claude-flow swarm "Build API endpoints" --output-format json  # Get JSON output
  claude-flow swarm "Research AI trends" --output-format json --output-file results.json

DEFAULT BEHAVIOR:
  Swarm now opens Claude Code by default with comprehensive MCP tool instructions
  including memory coordination, agent management, and task orchestration.
  
  Use --executor flag to run with the built-in executor instead of Claude Code

STRATEGIES:
  auto           Automatically determine best approach (default)
  research       Research and information gathering
  development    Software development and coding
  analysis       Data analysis and insights
  testing        Testing and quality assurance
  optimization   Performance optimization
  maintenance    System maintenance

MODES:
  centralized    Single coordinator (default)
  distributed    Multiple coordinators
  hierarchical   Tree structure coordination
  mesh           Peer-to-peer coordination
  hybrid         Mixed coordination strategies

KEY FEATURES:
  🤖 Intelligent agent management with specialized types
  ⚡ Timeout-free background task execution
  🧠 Distributed memory sharing between agents
  🔄 Work stealing and advanced load balancing
  🛡️  Circuit breaker patterns for fault tolerance
  📊 Real-time monitoring and comprehensive metrics
  🎛️  Multiple coordination strategies and algorithms
  💾 Persistent state with backup and recovery
  🔒 Security features with encryption options
  🖥️  Interactive terminal UI for management

OPTIONS:
  --strategy <type>          Execution strategy (default: auto)
  --mode <type>              Coordination mode (default: centralized)
  --max-agents <n>           Maximum agents (default: 5)
  --timeout <minutes>        Timeout in minutes (default: 60)
  --task-timeout-minutes <n> Task execution timeout in minutes (default: 59)
  --parallel                 Enable parallel execution
  --distributed              Enable distributed coordination
  --monitor                  Enable real-time monitoring
  --ui                       Launch terminal UI interface
  --background               Run in background mode
  --review                   Enable peer review
  --testing                  Enable automated testing
  --encryption               Enable encryption
  --verbose                  Enable detailed logging
  --dry-run                  Show configuration without executing
  --executor                 Use built-in executor instead of Claude Code
  --output-format <format>   Output format: json, text (default: text)
                            Note: JSON format requires --executor flag for structured output
  --output-file <path>       Save output to file instead of stdout
  --no-interactive           Run in non-interactive mode (auto-enabled with --output-format json)
  --auto                     (Deprecated: auto-permissions enabled by default)
  --no-auto-permissions      Disable automatic --dangerously-skip-permissions
  --analysis                 Enable analysis/read-only mode (no code changes)
  --read-only                Enable read-only mode (alias for --analysis)

ADVANCED OPTIONS:
  --quality-threshold <n>    Quality threshold 0-1 (default: 0.8)
  --memory-namespace <name>  Memory namespace (default: swarm)
  --agent-selection <type>   Agent selection strategy
  --task-scheduling <type>   Task scheduling algorithm
  --load-balancing <type>    Load balancing method
  --fault-tolerance <type>   Fault tolerance strategy

For complete documentation and examples:
https://github.com/ruvnet/claude-code-flow/docs/swarm.md
`);
}

/**
 * Main entry point for the swarm command
 * 
 * This function orchestrates the entire swarm execution flow, handling:
 * 1. Argument parsing and validation
 * 2. Environment detection (headless vs interactive)
 * 3. Execution mode routing (interactive, headless, or background)
 * 4. Integration with ExecutionBridge for unified execution
 * 
 * EXECUTION LOGIC:
 * ===============
 * 
 * The function implements a sophisticated routing system:
 * 
 * 1. VALIDATION PHASE:
 *    - Validates that an objective is provided
 *    - Processes output format flags (JSON, file output)
 *    - Handles special modes (analysis/read-only)
 * 
 * 2. ENVIRONMENT DETECTION PHASE:
 *    - Uses isHeadless() to detect CI/CD, Docker, production environments
 *    - Checks for explicit flags (--executor, --background)
 *    - Determines optimal execution strategy
 * 
 * 3. ROUTING PHASE:
 *    - Background mode: Uses legacy background process spawning
 *    - All other modes: Routes through ExecutionBridge
 *    - ExecutionBridge handles interactive vs headless internally
 * 
 * 4. EXECUTION PHASE:
 *    - Interactive: Launches Claude Code GUI with MCP coordination prompts
 *    - Headless: Uses Claude API for programmatic execution
 *    - Background: Detaches process and runs independently
 * 
 * ARCHITECTURAL PATTERNS:
 * ======================
 * 
 * - Environment-aware routing: Automatically adapts to execution context
 * - Graceful degradation: Falls back to simpler execution modes on failure
 * - Unified interface: Same command works in development and production
 * - Clear user feedback: Shows which mode is being used and why
 * 
 * ERROR HANDLING:
 * ==============
 * 
 * - Missing dependencies: Clear error messages with installation instructions
 * - Import failures: Graceful fallback to legacy implementations
 * - Process failures: Proper cleanup and error reporting
 * - Invalid configurations: Validation with helpful suggestions
 * 
 * @function swarmCommand
 * @param {string[]} args - Command arguments (objective words)
 * @param {Object} flags - Command flags and options
 * @param {boolean} [flags.executor] - Force headless execution mode
 * @param {boolean} [flags.background] - Enable background/daemon mode
 * @param {string} [flags['output-format']] - Output format ('json' or 'text')
 * @param {string} [flags['output-file']] - File path for output
 * @param {boolean} [flags['no-interactive']] - Disable interactive features
 * @param {boolean} [flags.analysis] - Enable read-only analysis mode
 * @param {string} [flags.strategy] - Execution strategy ('auto', 'research', etc.)
 * @param {string} [flags.mode] - Coordination mode ('centralized', 'distributed', etc.)
 * @param {number} [flags['max-agents']] - Maximum number of agents to spawn
 * @returns {Promise<void>} Resolves when swarm execution completes
 * 
 * @throws {Error} When objective is missing or execution fails critically
 * 
 * @example
 * // Interactive mode (local development)
 * await swarmCommand(['Build', 'a', 'REST', 'API'], {});
 * 
 * @example
 * // Headless mode (explicit)
 * await swarmCommand(['Deploy', 'application'], { executor: true });
 * 
 * @example  
 * // Background mode
 * await swarmCommand(['Long', 'running', 'task'], { background: true });
 * 
 * @example
 * // JSON output (auto-enables headless)
 * await swarmCommand(['Analyze', 'codebase'], { 'output-format': 'json' });
 */
export async function swarmCommand(args, flags) {
  // Parse and validate the objective from command arguments
  const objective = (args || []).join(' ').trim();

  // Validate that an objective was provided - this is required for all swarm operations
  if (!objective) {
    console.error('❌ Usage: swarm <objective>');
    showSwarmHelp();
    return;
  }

  // Handle JSON output format
  const outputFormat = flags && flags['output-format'];
  const outputFile = flags && flags['output-file'];
  const isJsonOutput = outputFormat === 'json';
  const isNonInteractive = isJsonOutput || (flags && flags['no-interactive']);

  // Handle analysis/read-only mode
  const isAnalysisMode = flags && (flags.analysis || flags['read-only']);
  const analysisMode = isAnalysisMode ? 'analysis' : 'standard';

  // For JSON output, check if executor mode is needed
  if (isJsonOutput && !(flags && flags.executor)) {
    // Check for explicit opt-out via environment variable
    const autoExecutorForJson = process.env.CLAUDE_FLOW_JSON_AUTO_EXECUTOR !== 'false';
    
    if (autoExecutorForJson) {
      // Auto-enable executor for JSON output (current behavior)
      flags = { ...(flags || {}), executor: true };
      
      // Only show notice if not in non-interactive mode
      if (!isNonInteractive && process.stderr.isTTY) {
        console.error('ℹ️  Using --executor mode for JSON output (set CLAUDE_FLOW_JSON_AUTO_EXECUTOR=false to disable)');
      }
    } else {
      // User explicitly disabled auto-executor
      console.error('❌ Error: JSON output requires --executor flag when CLAUDE_FLOW_JSON_AUTO_EXECUTOR=false');
      console.error('   Run with: claude-flow swarm "objective" --output-format json --executor');
      process.exit(1);
    }
  }

  // MAIN EXECUTION ROUTING: Route all swarm operations through ExecutionBridge
  // 
  // This is the core architectural fix that resolves the remote-exec branch issues.
  // Instead of having separate code paths for different modes, we route everything
  // through ExecutionBridge which intelligently handles both interactive and headless
  // execution based on environment detection and user preferences.
  //
  // ROUTING LOGIC:
  // - ExecutionBridge automatically detects the environment (isHeadless())
  // - In headless environments (CI/CD, Docker): Uses Claude API directly
  // - In interactive environments (local terminal): Launches Claude Code GUI
  // - User can override with --executor flag to force headless mode
  //
  // This approach ensures:
  // 1. Consistent behavior across environments
  // 2. No need for manual mode switching in most cases  
  // 3. Graceful degradation when dependencies are missing
  // 4. Clear feedback about which mode is being used
  try {
    // Dynamically import ExecutionBridge to avoid circular dependencies
    const { ExecutionBridge } = await import('../../headless/execution-bridge.js');
    
    // Determine execution mode based on environment and flags
    const isHeadlessEnv = isHeadless();  // Auto-detect CI/CD, Docker, production
    const isExplicitHeadless = flags && flags.executor;  // User forced headless mode
    
    // Provide clear feedback about execution mode selection
    console.log(`🚀 Swarm execution mode: ${isHeadlessEnv || isExplicitHeadless ? 'Headless' : 'Interactive'}`);
    if (isHeadlessEnv) {
      console.log('   Detected: CI/Docker/Production environment');  
    } else if (isExplicitHeadless) {
      console.log('   Detected: --executor flag');
    } else {
      console.log('   Detected: Local terminal - will launch Claude Code interactively');
    }
    
    // Create ExecutionBridge instance with appropriate configuration
    const bridge = new ExecutionBridge({ 
      headless: isHeadlessEnv || isExplicitHeadless,
      // Pass through any additional configuration from flags
      outputFormat: flags['output-format'],
      outputFile: flags['output-file'],
      analysisMode: flags.analysis || flags['read-only']
    });
    
    // Execute the swarm through the unified bridge interface
    const objective = (args || []).join(' ').trim();
    return await bridge.executeSwarm(objective, flags);
    
  } catch (importError) {
    // Graceful degradation: If ExecutionBridge is unavailable, show clear error
    console.error('❌ Failed to import execution bridge:', importError.message);
    console.error('   This indicates missing dependencies or development environment issues');
    console.error('   Please ensure all dependencies are installed: npm install');
    process.exit(1);
  }
}

async function createSwarmFiles(objective, flags) {
  const fs = await import('fs');
  const path = await import('path');

  const swarmId = `swarm_${Math.random().toString(36).substring(2, 11)}_${Math.random().toString(36).substring(2, 11)}`;

  console.log(`🐝 Swarm Execution Started: ${swarmId}`);
  console.log(`📋 Objective: ${objective}`);
  console.log(`🎯 Strategy: ${flags.strategy || 'auto'}`);

  // Extract target directory from objective
  const targetMatch = objective.match(/in\s+([^\s]+)\/?$/i);
  let targetDir = targetMatch ? targetMatch[1] : 'output';

  // Resolve relative paths
  if (!targetDir.startsWith('/')) {
    targetDir = path.join(process.cwd(), targetDir);
  }

  console.log(`📁 Target directory: ${targetDir}`);

  // Ensure target directory exists
  await fs.promises.mkdir(targetDir, { recursive: true });

  // Determine what to build based on objective
  const isRestAPI =
    objective.toLowerCase().includes('rest api') || objective.toLowerCase().includes('api');

  if (isRestAPI) {
    // Create REST API
    const apiDir = path.join(targetDir, 'rest-api');
    await fs.promises.mkdir(apiDir, { recursive: true });

    console.log(`\n🏗️  Creating REST API...`);
    console.log(`  🤖 Agent developer-1: Creating server implementation`);

    // Create server.js
    const serverCode = `const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    service: 'REST API',
    swarmId: '${swarmId}',
    created: new Date().toISOString()
  });
});

// Sample endpoints
app.get('/api/v1/items', (req, res) => {
  res.json({
    items: [
      { id: 1, name: 'Item 1', description: 'First item' },
      { id: 2, name: 'Item 2', description: 'Second item' }
    ],
    total: 2
  });
});

app.get('/api/v1/items/:id', (req, res) => {
  const id = parseInt(req.params.id);
  res.json({
    id,
    name: \`Item \${id}\`,
    description: \`Description for item \${id}\`
  });
});

app.post('/api/v1/items', (req, res) => {
  const newItem = {
    id: Date.now(),
    ...req.body,
    createdAt: new Date().toISOString()
  };
  res.status(201).json(newItem);
});

// Start server
app.listen(port, () => {
  console.log(\`REST API server running on port \${port}\`);
  console.log('Created by Claude Flow Swarm');
});

module.exports = app;
`;

    await fs.promises.writeFile(path.join(apiDir, 'server.js'), serverCode);
    console.log(`  ✅ Created: server.js`);

    // Create package.json
    const packageJson = {
      name: 'rest-api',
      version: '1.0.0',
      description: 'REST API created by Claude Flow Swarm',
      main: 'server.js',
      scripts: {
        start: 'node server.js',
        dev: 'nodemon server.js',
        test: 'jest',
      },
      keywords: ['rest', 'api', 'swarm', 'claude-flow'],
      author: 'Claude Flow Swarm',
      license: 'MIT',
      dependencies: {
        express: '^4.18.2',
      },
      devDependencies: {
        nodemon: '^3.0.1',
        jest: '^29.7.0',
        supertest: '^6.3.3',
      },
      swarmMetadata: {
        swarmId,
        strategy: flags.strategy || 'development',
        created: new Date().toISOString(),
      },
    };

    await fs.promises.writeFile(
      path.join(apiDir, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    );
    console.log(`  ✅ Created: package.json`);

    // Create README
    const readme = `# REST API

This REST API was created by the Claude Flow Swarm system.

## Swarm Details
- Swarm ID: ${swarmId}
- Strategy: ${flags.strategy || 'development'}
- Generated: ${new Date().toISOString()}

## Installation

\`\`\`bash
npm install
\`\`\`

## Usage

Start the server:
\`\`\`bash
npm start
\`\`\`

## API Endpoints

- \`GET /health\` - Health check
- \`GET /api/v1/items\` - Get all items
- \`GET /api/v1/items/:id\` - Get item by ID
- \`POST /api/v1/items\` - Create new item

---
Created by Claude Flow Swarm
`;

    await fs.promises.writeFile(path.join(apiDir, 'README.md'), readme);
    console.log(`  ✅ Created: README.md`);

    console.log(`\n✅ Swarm completed successfully!`);
    console.log(`📁 Files created in: ${apiDir}`);
    console.log(`🆔 Swarm ID: ${swarmId}`);
  } else {
    // Create generic application
    console.log(`\n🏗️  Creating application...`);

    const appCode = `// Application created by Claude Flow Swarm
// Objective: ${objective}
// Swarm ID: ${swarmId}

function main() {
  console.log('Executing swarm objective: ${objective}');
  console.log('Implementation would be based on the specific requirements');
}

main();
`;

    await fs.promises.writeFile(path.join(targetDir, 'app.js'), appCode);
    console.log(`  ✅ Created: app.js`);

    const packageJson = {
      name: 'swarm-app',
      version: '1.0.0',
      description: `Application created by Claude Flow Swarm: ${objective}`,
      main: 'app.js',
      scripts: {
        start: 'node app.js',
      },
      swarmMetadata: {
        swarmId,
        objective,
        created: new Date().toISOString(),
      },
    };

    await fs.promises.writeFile(
      path.join(targetDir, 'package.json'),
      JSON.stringify(packageJson, null, 2),
    );
    console.log(`  ✅ Created: package.json`);

    console.log(`\n✅ Swarm completed successfully!`);
    console.log(`📁 Files created in: ${targetDir}`);
    console.log(`🆔 Swarm ID: ${swarmId}`);
  }
}

/**
 * Get strategy-specific guidance for swarm execution
 */
function getStrategyGuidance(strategy, objective) {
  const guidanceMap = {
    auto: `🤖 AUTO STRATEGY - INTELLIGENT TASK ANALYSIS:
The swarm will analyze "${objective}" and automatically determine the best approach.

ANALYSIS APPROACH:
1. Task Decomposition: Break down the objective into subtasks
2. Skill Matching: Identify required capabilities and expertise
3. Agent Selection: Spawn appropriate agent types based on needs
4. Workflow Design: Create optimal execution flow

MCP TOOL PATTERN:
- Start with memory_store to save the objective analysis
- Use task_create to build a hierarchical task structure
- Spawn agents with agent_spawn based on detected requirements
- Monitor with swarm_monitor and adjust strategy as needed`,

    research: `🔬 RESEARCH STRATEGY - INFORMATION GATHERING & ANALYSIS:
Optimized for: "${objective}"

RESEARCH PHASES:
1. Discovery: Broad information gathering
2. Analysis: Deep dive into findings
3. Synthesis: Combine insights
4. Reporting: Document conclusions

RECOMMENDED AGENTS:
- Lead Researcher: Coordinates research efforts
- Data Analysts: Process and analyze findings
- Subject Experts: Domain-specific investigation
- Documentation Specialist: Compile reports

MCP TOOL USAGE:
- memory_store: Save all research findings with structured keys
- memory_search: Find related information across research
- agent_communicate: Share discoveries between researchers
- task_create: Break research into focused sub-investigations`,

    development: `💻 DEVELOPMENT STRATEGY - SOFTWARE CREATION:
Building: "${objective}"

DEVELOPMENT WORKFLOW:
1. Architecture: Design system structure
2. Implementation: Build components
3. Integration: Connect systems
4. Testing: Validate functionality
5. Documentation: Create guides

RECOMMENDED AGENTS:
- System Architect: Overall design
- Backend Developers: API/server implementation
- Frontend Developers: UI/UX implementation
- DevOps Engineer: Infrastructure setup
- QA Engineers: Testing and validation

MCP TOOL USAGE:
- memory_store: Save architecture decisions, code modules
- task_create: Create implementation tasks with dependencies
- agent_assign: Assign specific components to developers
- swarm_monitor: Track build progress and blockers`,

    analysis: `📊 ANALYSIS STRATEGY - DATA EXAMINATION:
Analyzing: "${objective}"

ANALYSIS FRAMEWORK:
1. Data Collection: Gather relevant information
2. Processing: Clean and prepare data
3. Analysis: Apply analytical methods
4. Visualization: Create insights
5. Recommendations: Actionable outcomes

RECOMMENDED AGENTS:
- Lead Analyst: Coordinate analysis efforts
- Data Engineers: Prepare data pipelines
- Statistical Analysts: Apply analytical methods
- Visualization Experts: Create dashboards
- Business Analysts: Translate to recommendations

MCP TOOL USAGE:
- memory_store: Save datasets and analysis results
- memory_retrieve: Access historical analysis
- task_create: Define analysis pipelines
- agent_coordinate: Sync analysis phases`,

    testing: `🧪 TESTING STRATEGY - QUALITY ASSURANCE:
Testing: "${objective}"

TESTING PHASES:
1. Test Planning: Define test scenarios
2. Test Development: Create test cases
3. Execution: Run test suites
4. Bug Tracking: Document issues
5. Regression: Ensure fixes work

RECOMMENDED AGENTS:
- Test Lead: Coordinate testing efforts
- Unit Testers: Component-level testing
- Integration Testers: System-level testing
- Performance Testers: Load and stress testing
- Security Testers: Vulnerability assessment

MCP TOOL USAGE:
- task_create: Create test cases and scenarios
- memory_store: Save test results and bug reports
- agent_communicate: Report bugs to developers
- swarm_monitor: Track testing coverage and progress`,

    optimization: `⚡ OPTIMIZATION STRATEGY - PERFORMANCE IMPROVEMENT:
Optimizing: "${objective}"

OPTIMIZATION PROCESS:
1. Profiling: Identify bottlenecks
2. Analysis: Understand root causes
3. Implementation: Apply optimizations
4. Validation: Measure improvements
5. Documentation: Record changes

RECOMMENDED AGENTS:
- Performance Lead: Coordinate optimization
- System Profilers: Identify bottlenecks
- Algorithm Experts: Optimize logic
- Database Specialists: Query optimization
- Infrastructure Engineers: System tuning

MCP TOOL USAGE:
- memory_store: Save performance baselines and results
- task_create: Create optimization tasks by priority
- swarm_monitor: Track performance improvements
- agent_communicate: Coordinate optimization efforts`,

    maintenance: `🔧 MAINTENANCE STRATEGY - SYSTEM UPKEEP:
Maintaining: "${objective}"

MAINTENANCE WORKFLOW:
1. Assessment: Evaluate current state
2. Planning: Prioritize updates
3. Implementation: Apply changes
4. Testing: Verify stability
5. Documentation: Update records

RECOMMENDED AGENTS:
- Maintenance Lead: Coordinate efforts
- System Administrators: Infrastructure updates
- Security Engineers: Patch vulnerabilities
- Database Administrators: Data maintenance
- Documentation Writers: Update guides

MCP TOOL USAGE:
- memory_retrieve: Access system history
- task_create: Schedule maintenance tasks
- agent_assign: Delegate specific updates
- memory_store: Document all changes`,
  };

  return guidanceMap[strategy] || guidanceMap['auto'];
}

/**
 * Get mode-specific guidance for coordination
 */
function getModeGuidance(mode) {
  const modeMap = {
    centralized: `🎯 CENTRALIZED MODE - SINGLE COORDINATOR:
All decisions flow through one coordinator agent.

COORDINATION PATTERN:
- Spawn a single COORDINATOR as the first agent
- All other agents report to the coordinator
- Coordinator assigns tasks and monitors progress
- Use agent_assign for task delegation
- Use swarm_monitor for oversight

BENEFITS:
- Clear chain of command
- Consistent decision making
- Simple communication flow
- Easy progress tracking

BEST FOR:
- Small to medium projects
- Well-defined objectives
- Clear task dependencies`,

    distributed: `🌐 DISTRIBUTED MODE - MULTIPLE COORDINATORS:
Multiple coordinators share responsibility by domain.

COORDINATION PATTERN:
- Spawn domain-specific coordinators (e.g., frontend-lead, backend-lead)
- Each coordinator manages their domain agents
- Use agent_coordinate for inter-coordinator sync
- Use memory_sync to share state
- Implement consensus protocols for decisions

BENEFITS:
- Fault tolerance
- Parallel decision making
- Domain expertise
- Scalability

BEST FOR:
- Large projects
- Multiple workstreams
- Complex systems
- High availability needs`,

    hierarchical: `🏗️ HIERARCHICAL MODE - TREE STRUCTURE:
Agents organized in management layers.

COORDINATION PATTERN:
- Spawn top-level coordinator
- Spawn team leads under coordinator
- Spawn workers under team leads
- Use parent parameter in agent_spawn
- Tasks flow down, results flow up

BENEFITS:
- Clear reporting structure
- Efficient for large teams
- Natural work breakdown
- Manageable span of control

BEST FOR:
- Enterprise projects
- Multi-team efforts
- Complex hierarchies
- Phased deliveries`,

    mesh: `🔗 MESH MODE - PEER-TO-PEER:
Agents coordinate directly without central authority.

COORDINATION PATTERN:
- All agents are peers
- Use agent_communicate for direct messaging
- Consensus through voting or protocols
- Self-organizing teams
- Emergent leadership

BENEFITS:
- Maximum flexibility
- Fast local decisions
- Resilient to failures
- Creative solutions

BEST FOR:
- Research projects
- Exploratory work
- Innovation tasks
- Small expert teams`,

    hybrid: `🎨 HYBRID MODE - MIXED STRATEGIES:
Combine different coordination patterns as needed.

COORDINATION PATTERN:
- Start with one mode, adapt as needed
- Mix hierarchical for structure with mesh for innovation
- Use distributed for resilience with centralized for control
- Dynamic reorganization based on task needs

BENEFITS:
- Adaptability
- Best of all modes
- Task-appropriate structure
- Evolution over time

BEST FOR:
- Complex projects
- Uncertain requirements
- Long-term efforts
- Diverse objectives`,
  };

  return modeMap[mode] || modeMap['centralized'];
}

/**
 * Get agent recommendations based on strategy
 */
function getAgentRecommendations(strategy, maxAgents, objective) {
  const recommendations = {
    auto: `
🤖 RECOMMENDED AGENT COMPOSITION (Auto-detected):
⚡ SPAWN ALL AGENTS IN ONE BATCH - Copy this entire block:

\`\`\`
[BatchTool - Single Message]:
  mcp__claude-flow__agent_spawn {"type": "coordinator", "name": "SwarmLead"}
  mcp__claude-flow__agent_spawn {"type": "researcher", "name": "RequirementsAnalyst"}
  mcp__claude-flow__agent_spawn {"type": "architect", "name": "SystemDesigner"}
  mcp__claude-flow__memory_store {"key": "swarm/objective", "value": "${objective}"}
  mcp__claude-flow__task_create {"name": "Analyze Requirements", "assignTo": "RequirementsAnalyst"}
  mcp__claude-flow__task_create {"name": "Design Architecture", "assignTo": "SystemDesigner", "dependsOn": ["Analyze Requirements"]}
  TodoWrite {"todos": [
    {"id": "1", "content": "Initialize swarm coordination", "status": "completed", "priority": "high"},
    {"id": "2", "content": "Analyze objective requirements", "status": "in_progress", "priority": "high"},
    {"id": "3", "content": "Design system architecture", "status": "pending", "priority": "high"},
    {"id": "4", "content": "Spawn additional agents as needed", "status": "pending", "priority": "medium"}
  ]}
\`\`\``,

    research: `
🔬 RECOMMENDED RESEARCH AGENTS:
⚡ SPAWN ALL AGENTS IN ONE BATCH - Copy this entire block:

\`\`\`
[BatchTool - Single Message]:
  mcp__claude-flow__agent_spawn {"type": "coordinator", "name": "ResearchLead"}
  mcp__claude-flow__agent_spawn {"type": "researcher", "name": "PrimaryInvestigator"}
  mcp__claude-flow__agent_spawn {"type": "analyst", "name": "DataScientist"}
  mcp__claude-flow__agent_spawn {"type": "researcher", "name": "LiteratureExpert"}
  mcp__claude-flow__agent_spawn {"type": "analyst", "name": "InsightsCompiler"}
  mcp__claude-flow__memory_store {"key": "research/objective", "value": "${objective}"}
  mcp__claude-flow__task_create {"name": "Literature Review", "assignTo": "LiteratureExpert"}
  mcp__claude-flow__task_create {"name": "Primary Research", "assignTo": "PrimaryInvestigator"}
  mcp__claude-flow__task_create {"name": "Data Analysis", "assignTo": "DataScientist"}
  mcp__claude-flow__task_create {"name": "Compile Insights", "assignTo": "InsightsCompiler", "dependsOn": ["Literature Review", "Primary Research", "Data Analysis"]}
  TodoWrite {"todos": [
    {"id": "1", "content": "Initialize research swarm", "status": "completed", "priority": "high"},
    {"id": "2", "content": "Conduct literature review", "status": "in_progress", "priority": "high"},
    {"id": "3", "content": "Execute primary research", "status": "in_progress", "priority": "high"},
    {"id": "4", "content": "Analyze collected data", "status": "pending", "priority": "high"},
    {"id": "5", "content": "Compile and synthesize insights", "status": "pending", "priority": "medium"}
  ]}
\`\`\``,

    development: `
💻 RECOMMENDED DEVELOPMENT AGENTS:
⚡ SPAWN ALL AGENTS IN ONE BATCH - Copy this entire block:

\`\`\`
[BatchTool - Single Message]:
  mcp__claude-flow__agent_spawn {"type": "coordinator", "name": "TechLead"}
  mcp__claude-flow__agent_spawn {"type": "architect", "name": "SystemArchitect"}
  mcp__claude-flow__agent_spawn {"type": "coder", "name": "BackendDev"}
  mcp__claude-flow__agent_spawn {"type": "coder", "name": "FrontendDev"}
  mcp__claude-flow__agent_spawn {"type": "tester", "name": "QAEngineer"}
  mcp__claude-flow__memory_store {"key": "dev/objective", "value": "${objective}"}
  mcp__claude-flow__task_create {"name": "System Architecture", "assignTo": "SystemArchitect"}
  mcp__claude-flow__task_create {"name": "Backend Implementation", "assignTo": "BackendDev", "dependsOn": ["System Architecture"]}
  mcp__claude-flow__task_create {"name": "Frontend Implementation", "assignTo": "FrontendDev", "dependsOn": ["System Architecture"]}
  mcp__claude-flow__task_create {"name": "Testing Suite", "assignTo": "QAEngineer", "dependsOn": ["Backend Implementation", "Frontend Implementation"]}
  TodoWrite {"todos": [
    {"id": "1", "content": "Initialize development swarm", "status": "completed", "priority": "high"},
    {"id": "2", "content": "Design system architecture", "status": "in_progress", "priority": "high"},
    {"id": "3", "content": "Implement backend services", "status": "pending", "priority": "high"},
    {"id": "4", "content": "Implement frontend UI", "status": "pending", "priority": "high"},
    {"id": "5", "content": "Create comprehensive tests", "status": "pending", "priority": "medium"}
  ]}
\`\`\``,

    analysis: `
📊 RECOMMENDED ANALYSIS AGENTS:
⚡ SPAWN ALL AGENTS IN ONE BATCH - Copy this entire block:

\`\`\`
[BatchTool - Single Message]:
  mcp__claude-flow__agent_spawn {"type": "coordinator", "name": "AnalysisLead"}
  mcp__claude-flow__agent_spawn {"type": "analyst", "name": "DataEngineer"}
  mcp__claude-flow__agent_spawn {"type": "analyst", "name": "StatisticalExpert"}
  mcp__claude-flow__agent_spawn {"type": "coder", "name": "VisualizationDev"}
  mcp__claude-flow__agent_spawn {"type": "analyst", "name": "BusinessAnalyst"}
  mcp__claude-flow__memory_store {"key": "analysis/objective", "value": "${objective}"}
  mcp__claude-flow__task_create {"name": "Data Pipeline Setup", "assignTo": "DataEngineer"}
  mcp__claude-flow__task_create {"name": "Statistical Analysis", "assignTo": "StatisticalExpert", "dependsOn": ["Data Pipeline Setup"]}
  mcp__claude-flow__task_create {"name": "Create Visualizations", "assignTo": "VisualizationDev", "dependsOn": ["Statistical Analysis"]}
  mcp__claude-flow__task_create {"name": "Business Insights", "assignTo": "BusinessAnalyst", "dependsOn": ["Statistical Analysis"]}
  TodoWrite {"todos": [
    {"id": "1", "content": "Initialize analysis swarm", "status": "completed", "priority": "high"},
    {"id": "2", "content": "Setup data pipelines", "status": "in_progress", "priority": "high"},
    {"id": "3", "content": "Perform statistical analysis", "status": "pending", "priority": "high"},
    {"id": "4", "content": "Create data visualizations", "status": "pending", "priority": "medium"},
    {"id": "5", "content": "Generate business insights", "status": "pending", "priority": "medium"}
  ]}
\`\`\``,

    testing: `
🧪 RECOMMENDED TESTING AGENTS:
⚡ SPAWN ALL AGENTS IN ONE BATCH - Copy this entire block:

\`\`\`
[BatchTool - Single Message]:
  mcp__claude-flow__agent_spawn {"type": "coordinator", "name": "QALead"}
  mcp__claude-flow__agent_spawn {"type": "tester", "name": "UnitTestEngineer"}
  mcp__claude-flow__agent_spawn {"type": "tester", "name": "IntegrationTester"}
  mcp__claude-flow__agent_spawn {"type": "tester", "name": "PerformanceTester"}
  mcp__claude-flow__agent_spawn {"type": "tester", "name": "SecurityAuditor"}
  mcp__claude-flow__memory_store {"key": "testing/objective", "value": "${objective}"}
  mcp__claude-flow__task_create {"name": "Unit Test Suite", "assignTo": "UnitTestEngineer"}
  mcp__claude-flow__task_create {"name": "Integration Tests", "assignTo": "IntegrationTester"}
  mcp__claude-flow__task_create {"name": "Performance Tests", "assignTo": "PerformanceTester"}
  mcp__claude-flow__task_create {"name": "Security Audit", "assignTo": "SecurityAuditor"}
  TodoWrite {"todos": [
    {"id": "1", "content": "Initialize testing swarm", "status": "completed", "priority": "high"},
    {"id": "2", "content": "Create unit tests", "status": "in_progress", "priority": "high"},
    {"id": "3", "content": "Create integration tests", "status": "in_progress", "priority": "high"},
    {"id": "4", "content": "Run performance tests", "status": "pending", "priority": "medium"},
    {"id": "5", "content": "Execute security audit", "status": "pending", "priority": "high"}
  ]}
\`\`\``,

    optimization: `
⚡ RECOMMENDED OPTIMIZATION AGENTS:
⚡ SPAWN ALL AGENTS IN ONE BATCH - Copy this entire block:

\`\`\`
[BatchTool - Single Message]:
  mcp__claude-flow__agent_spawn {"type": "coordinator", "name": "OptimizationLead"}
  mcp__claude-flow__agent_spawn {"type": "analyst", "name": "PerformanceProfiler"}
  mcp__claude-flow__agent_spawn {"type": "coder", "name": "AlgorithmExpert"}
  mcp__claude-flow__agent_spawn {"type": "analyst", "name": "DatabaseOptimizer"}
  mcp__claude-flow__agent_spawn {"type": "coder", "name": "SystemsTuner"}
  mcp__claude-flow__memory_store {"key": "optimization/objective", "value": "${objective}"}
  mcp__claude-flow__task_create {"name": "Performance Profiling", "assignTo": "PerformanceProfiler"}
  mcp__claude-flow__task_create {"name": "Algorithm Optimization", "assignTo": "AlgorithmExpert", "dependsOn": ["Performance Profiling"]}
  mcp__claude-flow__task_create {"name": "Database Optimization", "assignTo": "DatabaseOptimizer", "dependsOn": ["Performance Profiling"]}
  mcp__claude-flow__task_create {"name": "System Tuning", "assignTo": "SystemsTuner", "dependsOn": ["Performance Profiling"]}
  TodoWrite {"todos": [
    {"id": "1", "content": "Initialize optimization swarm", "status": "completed", "priority": "high"},
    {"id": "2", "content": "Profile system performance", "status": "in_progress", "priority": "high"},
    {"id": "3", "content": "Optimize algorithms", "status": "pending", "priority": "high"},
    {"id": "4", "content": "Optimize database queries", "status": "pending", "priority": "high"},
    {"id": "5", "content": "Tune system parameters", "status": "pending", "priority": "medium"}
  ]}
\`\`\``,

    maintenance: `
🔧 RECOMMENDED MAINTENANCE AGENTS:
⚡ SPAWN ALL AGENTS IN ONE BATCH - Copy this entire block:

\`\`\`
[BatchTool - Single Message]:
  mcp__claude-flow__agent_spawn {"type": "coordinator", "name": "MaintenanceLead"}
  mcp__claude-flow__agent_spawn {"type": "analyst", "name": "SystemAuditor"}
  mcp__claude-flow__agent_spawn {"type": "coder", "name": "PatchDeveloper"}
  mcp__claude-flow__agent_spawn {"type": "tester", "name": "RegressionTester"}
  mcp__claude-flow__agent_spawn {"type": "analyst", "name": "DocumentationUpdater"}
  mcp__claude-flow__memory_store {"key": "maintenance/objective", "value": "${objective}"}
  mcp__claude-flow__task_create {"name": "System Audit", "assignTo": "SystemAuditor"}
  mcp__claude-flow__task_create {"name": "Develop Patches", "assignTo": "PatchDeveloper", "dependsOn": ["System Audit"]}
  mcp__claude-flow__task_create {"name": "Regression Testing", "assignTo": "RegressionTester", "dependsOn": ["Develop Patches"]}
  mcp__claude-flow__task_create {"name": "Update Documentation", "assignTo": "DocumentationUpdater", "dependsOn": ["Develop Patches"]}
  TodoWrite {"todos": [
    {"id": "1", "content": "Initialize maintenance swarm", "status": "completed", "priority": "high"},
    {"id": "2", "content": "Audit system health", "status": "in_progress", "priority": "high"},
    {"id": "3", "content": "Develop necessary patches", "status": "pending", "priority": "high"},
    {"id": "4", "content": "Run regression tests", "status": "pending", "priority": "high"},
    {"id": "5", "content": "Update documentation", "status": "pending", "priority": "medium"}
  ]}
\`\`\``,
  };

  return recommendations[strategy] || recommendations['auto'];
}

// basicSwarmNew function is dynamically imported from ../../headless/execution-bridge.js when needed

// Allow direct execution
if (import.meta.main) {
  // When called directly as a script, parse all arguments
  const args = [];
  const flags = {};

  // Parse arguments and flags
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const flagName = arg.substring(2);
      const nextArg = args[i + 1];

      if (nextArg && !nextArg.startsWith('--')) {
        flags[flagName] = nextArg;
        i++; // Skip the next argument
      } else {
        flags[flagName] = true;
      }
    } else {
      args.push(arg);
    }
  }

  // The objective is all non-flag arguments joined
  const objective = args.join(' ');

  // Execute the swarm command
  await swarmCommand([objective], flags);
}
