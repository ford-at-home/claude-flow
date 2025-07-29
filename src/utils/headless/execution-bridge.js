/**
 * ExecutionBridge - Connects CLI commands to real execution systems
 * This is the critical missing piece that enables headless operation
 */

import { generateId, isHeadless, getEnvironmentConfig, timeout } from '../utils/helpers.js';
import { ensureGracefulExit } from './graceful-shutdown.js';
import { RealSwarmExecutor } from './real-swarm-executor.js';

export class ExecutionBridge {
  constructor(config = {}) {
    this.config = {
      ...getEnvironmentConfig(),
      ...config
    };
    this.activeExecutions = new Map();
  }

  /**
   * Main entry point - routes swarm commands to appropriate execution mode
   */
  async executeSwarm(objective, flags = {}) {
    const executionId = generateId('exec');
    const startTime = Date.now();
    console.log(`🚀 ExecutionBridge: Starting swarm execution ${executionId}`);
    console.log(`📋 Objective: ${objective}`);
    console.log(`🎯 Mode: ${this.config.headless ? 'Headless' : 'Interactive'}`);

    try {
      // Create execution context
      const context = this.createExecutionContext(objective, flags, executionId);
      this.activeExecutions.set(executionId, context);

      // Route to appropriate executor
      let result;
      if (this.config.headless || flags.headless || flags.executor || isHeadless()) {
        result = await this.executeHeadless(context);
      } else if (this.config.claudeApiKey) {
        result = await this.executeWithAPI(context);
      } else {
        result = await this.executeInteractive(context);
      }

      // Clean up and return results
      this.activeExecutions.delete(executionId);
      console.log(`✅ ExecutionBridge: Swarm execution completed in ${result.duration}ms`);
      
      // In headless/remote mode, ensure clean exit
      if (this.config.headless || flags.headless || flags.executor || isHeadless()) {
        await ensureGracefulExit(result, {
          exitOnComplete: this.config.exitOnComplete !== false,
          timeout: 5000
        });
      }
      
      return result;
    } catch (error) {
      this.activeExecutions.delete(executionId);
      console.error(`❌ ExecutionBridge: Execution failed:`, error.message);
      
      // In headless mode, ensure clean exit on error
      if (this.config.headless || flags.headless || flags.executor || isHeadless()) {
        await ensureGracefulExit({ 
          success: false, 
          error: error.message,
          duration: Date.now() - startTime 
        }, {
          exitOnComplete: this.config.exitOnComplete !== false,
          timeout: 5000
        });
      }
      
      throw error;
    }
  }


  /**
   * Create execution context with all necessary information
   */
  createExecutionContext(objective, flags, executionId) {
    return {
      id: executionId,
      objective,
      flags,
      startTime: Date.now(),
      strategy: flags.strategy || 'auto',
      mode: flags.mode || 'centralized',
      maxAgents: parseInt(flags['max-agents']) || this.config.maxAgents,
      timeout: parseInt(flags.timeout) || this.config.timeout,
      environment: {
        headless: this.config.headless,
        apiKey: this.config.claudeApiKey,
        endpoint: this.config.claudeApiEndpoint
      }
    };
  }

  /**
   * Execute in headless mode using direct API calls
   */
  async executeHeadless(context) {
    console.log(`🤖 Executing in headless mode...`);

    try {
      // Check if Claude API is configured
      if (!this.config.claudeApiKey || this.config.claudeApiKey === 'test-key') {
        throw new Error(
          'Real agent execution requires a valid ANTHROPIC_API_KEY. ' +
          'Please set your API key in the environment or use --allow-mock flag for mock mode.'
        );
      }

      // Use the real swarm executor
      console.log(`🔗 Using real Claude API swarm execution...`);
      
      const executor = new RealSwarmExecutor({
        apiKey: this.config.claudeApiKey,
        strategy: context.strategy,
        maxAgents: context.maxAgents,
        outputDir: `./swarm-runs/${context.id}`
      });
      
      // Execute the swarm
      const result = await timeout(
        executor.execute(context.objective),
        context.timeout,
        'Swarm execution timed out'
      );
      
      // Convert to expected format
      return {
        success: result.success,
        mode: 'headless-api',
        swarmId: result.swarmId,
        objective: result.objective,
        duration: result.duration,
        agents: result.agents,
        tasks: result.tasks,
        results: {
          status: 'completed',
          output: result.synthesis,
          artifacts: {
            outputDirectory: result.output.directory,
            files: result.output.files,
            taskResults: result.results
          }
        }
      };

    } catch (error) {
      console.error(`❌ Headless execution failed:`, error.message);
      
      // Only fall back to mock if explicitly requested
      if (context.flags.mock || context.flags['allow-mock']) {
        console.warn(`⚠️  Using mock execution (no real AI agents)`);
        return await this.executeEnhancedMock(context);
      }
      
      throw error;
    }
  }

  /**
   * Execute using Claude API directly
   */
  async executeWithAPI(context) {
    console.log(`🔗 Redirecting to headless API execution...`);
    return await this.executeHeadless(context);
  }

  /**
   * Execute in interactive mode (existing behavior)
   */
  async executeInteractive(context) {
    console.log(`💻 Executing in interactive mode...`);

    try {
      // Try to spawn Claude GUI
      const { spawn } = await import('child_process');
      const claudeProcess = spawn('claude', [
        '--dangerously-skip-permissions',
        '--prompt', context.objective
      ], { stdio: 'inherit' });

      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          claudeProcess.kill();
          reject(new Error('Interactive execution timed out'));
        }, context.timeout);

        claudeProcess.on('exit', (code) => {
          clearTimeout(timeoutId);
          if (code === 0) {
            resolve({
              success: true,
              mode: 'interactive',
              duration: Date.now() - context.startTime,
              output: 'Interactive Claude session completed'
            });
          } else {
            reject(new Error(`Claude process exited with code ${code}`));
          }
        });
      });
    } catch (error) {
      console.warn(`⚠️  Interactive mode failed, falling back to headless:`, error.message);
      return await this.executeHeadless(context);
    }
  }

  /**
   * Load existing TaskExecutor if available
   */
  async loadTaskExecutor() {
    try {
      // Try to import the TypeScript executor (requires build step)
      const { TaskExecutor } = await import('../swarm/executor.js');
      return new TaskExecutor({
        timeoutMs: this.config.timeout,
        maxConcurrentTasks: this.config.maxAgents
      });
    } catch (error) {
      console.log(`❌ Real TaskExecutor not available: ${error.message}`);
      console.log(`  ℹ️  The swarm executor requires TypeScript compilation`);
      console.log(`  ℹ️  Run 'npm run build' to compile the TypeScript files`);
      return null;
    }
  }

  /**
   * Create headless coordinator for agent management
   */
  async createHeadlessCoordinator(context) {
    return {
      async execute() {
        console.log(`🏗️  Initializing ${context.maxAgents} agents for ${context.strategy} strategy`);
        
        // Simulate agent spawning
        const agents = [];
        for (let i = 0; i < context.maxAgents; i++) {
          const agentType = context.strategy === 'research' ? 'researcher' : 
                           context.strategy === 'development' ? 'coder' : 'analyst';
          agents.push({
            id: generateId('agent'),
            type: agentType,
            status: 'active',
            spawnTime: Date.now()
          });
          console.log(`  🤖 Agent ${i + 1}/${context.maxAgents} spawned: ${agentType}`);
        }

        // Simulate task execution
        console.log(`📌 Executing objective: ${context.objective}`);
        console.log(`  ⏳ Processing with ${agents.length} agents...`);
        
        // IMPORTANT: This is a mock implementation that doesn't execute real AI agents
        console.log(`  ⚠️  WARNING: This is a mock execution - no real AI agents are running`);
        console.log(`  ℹ️  Real agent execution requires Claude API integration`);
        
        // Short delay to simulate minimal processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        const duration = Date.now() - context.startTime;
        
        return {
          success: true,
          mode: 'headless',
          swarmId: context.id,
          objective: context.objective,
          agents: agents.length,
          strategy: context.strategy,
          duration,
          results: {
            status: 'completed',
            output: `Headless swarm execution completed with ${agents.length} agents`,
            artifacts: {
              agentLogs: agents.map(a => `Agent ${a.id} (${a.type}) executed successfully`),
              executionMetrics: {
                totalAgents: agents.length,
                executionTime: duration,
                strategy: context.strategy,
                mode: context.mode
              }
            }
          }
        };
      }
    };
  }

  /**
   * Create API executor for direct Claude API calls
   */
  async createAPIExecutor(context) {
    const apiKey = context.environment.apiKey;
    const endpoint = context.environment.endpoint || 'https://api.anthropic.com/v1/messages';
    
    return {
      async execute() {
        console.log(`🔗 Using Claude API for execution...`);
        console.log(`  📡 Endpoint: ${endpoint}`);
        console.log(`  🤖 Model: claude-3-5-sonnet-20241022`);
        
        try {
          // Import fetch for Node.js environments
          const fetch = globalThis.fetch || (await import('node-fetch')).default;
          
          // Prepare the API request
          const apiRequest = {
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 4096,
            temperature: 0.7,
            messages: [{
              role: 'user',
              content: `You are an AI swarm coordinator. Execute the following objective by breaking it down into tasks and simulating a multi-agent approach. Provide a detailed execution plan and results.

Objective: ${context.objective}

Requirements:
- Break down the objective into specific tasks
- Assign tasks to different agent types (architect, developer, tester, etc.)
- Provide realistic execution steps
- Include code snippets or concrete outputs where applicable
- Structure your response as a detailed execution report

Begin the execution:`
            }]
          };
          
          console.log(`  ⏳ Calling Claude API...`);
          const startTime = Date.now();
          
          // Make the actual API call
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(apiRequest)
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API call failed: ${response.status} - ${errorText}`);
          }
          
          const apiResponse = await response.json();
          const apiDuration = Date.now() - startTime;
          console.log(`  ✅ API call completed in ${apiDuration}ms`);
          
          // Process the response
          const duration = Date.now() - context.startTime;
          
          return {
            success: true,
            mode: 'api',
            swarmId: context.id,
            objective: context.objective,
            duration,
            results: {
              status: 'completed',
              output: apiResponse.content[0].text,
              apiResponse: {
                model: apiRequest.model,
                tokensUsed: apiResponse.usage.input_tokens + apiResponse.usage.output_tokens,
                executionTime: apiDuration,
                messageId: apiResponse.id
              }
            }
          };
          
        } catch (error) {
          console.error(`  ❌ API call failed:`, error.message);
          throw error;
        }
      }
    };
  }

  /**
   * Enhanced mock execution (better than the current fake one)
   */
  async executeEnhancedMock(context) {
    console.log(`🎭 Enhanced mock execution (development mode)...`);
    
    // Simulate more realistic processing
    const steps = [
      'Analyzing objective requirements',
      'Initializing agent coordination',
      'Decomposing tasks for parallel execution',
      'Executing distributed agent tasks',
      'Aggregating results and artifacts',
      'Performing quality validation',
      'Generating final report'
    ];

    for (const [index, step] of steps.entries()) {
      console.log(`  ${index + 1}/${steps.length}: ${step}...`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds per step
    }

    const duration = Date.now() - context.startTime;

    return {
      success: true,
      mode: 'enhanced-mock',
      swarmId: context.id,
      objective: context.objective,
      duration,
      results: {
        status: 'completed',
        output: `Enhanced mock execution completed for: ${context.objective}`,
        steps: steps.length,
        executionDetails: {
          totalSteps: steps.length,
          avgStepTime: 2000,
          totalDuration: duration
        }
      }
    };
  }

  /**
   * Get status of active executions
   */
  getActiveExecutions() {
    return Array.from(this.activeExecutions.values()).map(context => ({
      id: context.id,
      objective: context.objective,
      startTime: context.startTime,
      duration: Date.now() - context.startTime,
      strategy: context.strategy,
      mode: context.mode,
      agents: context.maxAgents
    }));
  }

  /**
   * Stop a specific execution
   */
  async stopExecution(executionId) {
    const context = this.activeExecutions.get(executionId);
    if (context) {
      console.log(`🛑 Stopping execution ${executionId}`);
      this.activeExecutions.delete(executionId);
      return { success: true, message: `Execution ${executionId} stopped` };
    }
    return { success: false, message: `Execution ${executionId} not found` };
  }
}

/**
 * The missing basicSwarmNew function that fixes the original error
 */
export async function basicSwarmNew(args, flags) {
  console.log('🔄 BasicSwarmNew: Routing to ExecutionBridge...');
  
  const bridge = new ExecutionBridge();
  const objective = args.join(' ').trim();
  
  if (!objective) {
    throw new Error('No objective provided. Usage: swarm <objective>');
  }

  return await bridge.executeSwarm(objective, flags);
}

export default ExecutionBridge;