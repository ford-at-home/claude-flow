/**
 * Headless Coordinator - Agent pool management and system integration
 * Integration Engineer Implementation
 */

import { EventEmitter } from 'node:events';
import { Logger } from '../core/logger.js';
import { generateId } from '../utils/helpers.js';
import {
  SwarmObjective,
  AgentState,
  TaskDefinition,
  TaskResult,
  SwarmStatus,
  AgentType,
  TaskStatus,
  AgentId,
  TaskId,
  SwarmMetrics,
  SwarmResults,
} from '../swarm/types.js';
import { ExecutionBridge } from './execution-bridge.js';

export interface CoordinatorConfig {
  maxSwarms: number;
  maxAgentsPerSwarm: number;
  defaultAgentTimeout: number;
  taskTimeoutMinutes: number;
  enableResourceMonitoring: boolean;
  enableAutoScaling: boolean;
  enableFailover: boolean;
  memoryThreshold: number;
  cpuThreshold: number;
}

export interface AgentPool {
  available: Map<string, AgentState>;
  busy: Map<string, AgentState>;
  terminated: Map<string, AgentState>;
  typeCounters: Map<AgentType, number>;
}

export interface SwarmInstance {
  objective: SwarmObjective;
  agents: Map<string, AgentState>;
  tasks: Map<string, TaskDefinition>;
  executionContext: ExecutionContext;
  metrics: SwarmMetrics;
  startedAt?: Date;
  completedAt?: Date;
}

export interface ExecutionContext {
  workingDirectory: string;
  logDirectory: string;
  tempDirectory: string;
  environment: Record<string, string>;
  resourceLimits: ResourceLimits;
}

export interface ResourceLimits {
  maxMemory: number;
  maxCpu: number;
  maxDisk: number;
  maxNetworkConnections: number;
  maxFileHandles: number;
}

export interface LogEntry {
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  swarmId?: string;
  agentId?: string;
  taskId?: string;
  message: string;
  metadata?: Record<string, any>;
}

export class HeadlessCoordinator extends EventEmitter {
  private logger: Logger;
  private config: CoordinatorConfig;
  private bridge: ExecutionBridge;
  
  // Core state management
  private swarms: Map<string, SwarmInstance> = new Map();
  private agentPools: Map<string, AgentPool> = new Map();
  private globalAgents: Map<string, AgentState> = new Map();
  private logs: LogEntry[] = [];
  
  // Resource monitoring
  private resourceMonitor?: NodeJS.Timer;
  private healthChecks: Map<string, NodeJS.Timer> = new Map();

  constructor(config: CoordinatorConfig, bridge: ExecutionBridge) {
    super();
    this.config = config;
    this.bridge = bridge;
    this.logger = new Logger('HeadlessCoordinator');
    
    this.setupResourceMonitoring();
    this.setupEventHandlers();
  }

  private setupResourceMonitoring(): void {
    if (!this.config.enableResourceMonitoring) return;

    this.resourceMonitor = setInterval(async () => {
      await this.monitorResources();
    }, 10000); // Check every 10 seconds
  }

  private setupEventHandlers(): void {
    // Bridge event handlers
    this.bridge.on('task.completed', (task) => {
      this.handleTaskCompletion(task);
    });

    this.bridge.on('task.failed', (task) => {
      this.handleTaskFailure(task);
    });

    process.on('exit', () => {
      this.cleanup();
    });

    process.on('SIGINT', () => {
      this.cleanup();
      process.exit(0);
    });
  }

  public async createSwarm(objective: SwarmObjective): Promise<SwarmObjective> {
    if (this.swarms.size >= this.config.maxSwarms) {
      throw new Error(`Maximum number of swarms (${this.config.maxSwarms}) reached`);
    }

    const swarmId = objective.id;
    this.log('info', 'HeadlessCoordinator', `Creating swarm: ${swarmId}`, { objective: objective.name });

    // Initialize agent pool for this swarm
    const agentPool: AgentPool = {
      available: new Map(),
      busy: new Map(),
      terminated: new Map(),
      typeCounters: new Map(),
    };

    // Create execution context
    const executionContext: ExecutionContext = {
      workingDirectory: process.cwd(),
      logDirectory: `./logs/swarm-${swarmId}`,
      tempDirectory: `./tmp/swarm-${swarmId}`,
      environment: {
        ...process.env,
        SWARM_ID: swarmId,
        SWARM_MODE: 'headless',
      },
      resourceLimits: {
        maxMemory: this.config.memoryThreshold,
        maxCpu: this.config.cpuThreshold,
        maxDisk: 1024 * 1024 * 1024, // 1GB
        maxNetworkConnections: 100,
        maxFileHandles: 1000,
      },
    };

    // Create swarm instance
    const swarmInstance: SwarmInstance = {
      objective,
      agents: new Map(),
      tasks: new Map(),
      executionContext,
      metrics: this.initializeMetrics(),
    };

    this.swarms.set(swarmId, swarmInstance);
    this.agentPools.set(swarmId, agentPool);

    this.emit('swarm.created', swarmId, objective);
    return objective;
  }

  public async startSwarm(swarmId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    this.log('info', 'HeadlessCoordinator', `Starting swarm: ${swarmId}`);

    swarm.objective.status = 'executing';
    swarm.startedAt = new Date();

    // Decompose objective into tasks
    await this.decomposeObjective(swarmId, swarm.objective);

    // Spawn initial agents based on strategy
    await this.spawnInitialAgents(swarmId, swarm.objective);

    // Start task execution
    await this.startTaskExecution(swarmId);

    this.emit('swarm.started', swarmId);
  }

  public async pauseSwarm(swarmId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    this.log('info', 'HeadlessCoordinator', `Pausing swarm: ${swarmId}`);

    swarm.objective.status = 'paused';

    // Pause all running tasks
    for (const [taskId, task] of swarm.tasks) {
      if (task.status === 'running') {
        task.status = 'paused';
        this.emit('task.paused', swarmId, taskId);
      }
    }

    this.emit('swarm.paused', swarmId);
  }

  public async resumeSwarm(swarmId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    this.log('info', 'HeadlessCoordinator', `Resuming swarm: ${swarmId}`);

    swarm.objective.status = 'executing';

    // Resume paused tasks
    for (const [taskId, task] of swarm.tasks) {
      if (task.status === 'paused') {
        task.status = 'assigned';
        await this.assignTaskToAgent(swarmId, taskId);
      }
    }

    this.emit('swarm.resumed', swarmId);
  }

  public async stopSwarm(swarmId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    this.log('info', 'HeadlessCoordinator', `Stopping swarm: ${swarmId}`);

    swarm.objective.status = 'completed';
    swarm.completedAt = new Date();

    // Stop all running tasks
    for (const [taskId, task] of swarm.tasks) {
      if (task.status === 'running' || task.status === 'assigned') {
        task.status = 'cancelled';
        this.emit('task.cancelled', swarmId, taskId);
      }
    }

    // Terminate all agents
    for (const [agentId, agent] of swarm.agents) {
      agent.status = 'terminated';
      this.emit('agent.terminated', swarmId, agentId);
    }

    this.emit('swarm.completed', swarmId);
  }

  public async deleteSwarm(swarmId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    // Stop swarm if still running
    if (swarm.objective.status === 'executing') {
      await this.stopSwarm(swarmId);
    }

    // Cleanup resources
    this.swarms.delete(swarmId);
    this.agentPools.delete(swarmId);

    // Remove from global agent tracking
    for (const [agentId, agent] of swarm.agents) {
      this.globalAgents.delete(agentId);
    }

    // Clear health checks
    const healthCheck = this.healthChecks.get(swarmId);
    if (healthCheck) {
      clearInterval(healthCheck);
      this.healthChecks.delete(swarmId);
    }

    this.log('info', 'HeadlessCoordinator', `Deleted swarm: ${swarmId}`);
  }

  public async spawnAgent(
    swarmId: string, 
    config: { type: AgentType; name?: string; capabilities?: any }
  ): Promise<AgentState> {
    const swarm = this.swarms.get(swarmId);
    const agentPool = this.agentPools.get(swarmId);
    
    if (!swarm || !agentPool) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    if (swarm.agents.size >= this.config.maxAgentsPerSwarm) {
      throw new Error(`Maximum agents per swarm (${this.config.maxAgentsPerSwarm}) reached`);
    }

    // Generate agent ID
    const agentId: AgentId = {
      id: generateId('agent'),
      swarmId,
      type: config.type,
      instance: (agentPool.typeCounters.get(config.type) || 0) + 1,
    };

    // Create agent through bridge
    const agent = await this.bridge.safeAsyncExecution(async () => {
      return await this.bridge.executeTask({
        id: generateId('spawn-task'),
        type: 'agent',
        action: 'spawn',
        payload: {
          id: agentId.id,
          type: config.type,
          name: config.name || `${config.type}-${agentId.instance}`,
          capabilities: config.capabilities,
        },
        priority: 1,
        retries: 0,
        maxRetries: 3,
        createdAt: new Date(),
        status: 'queued',
      });
    });

    // Add to pools
    swarm.agents.set(agentId.id, agent);
    agentPool.available.set(agentId.id, agent);
    this.globalAgents.set(agentId.id, agent);

    // Update type counter
    agentPool.typeCounters.set(config.type, agentId.instance);

    this.log('info', 'HeadlessCoordinator', `Spawned agent: ${agent.name}`, {
      swarmId,
      agentId: agentId.id,
      type: config.type,
    });

    this.emit('agent.spawned', swarmId, agentId.id, agent);
    return agent;
  }

  public async terminateAgent(swarmId: string, agentId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    const agentPool = this.agentPools.get(swarmId);
    
    if (!swarm || !agentPool) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const agent = swarm.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in swarm ${swarmId}`);
    }

    this.log('info', 'HeadlessCoordinator', `Terminating agent: ${agent.name}`, { swarmId, agentId });

    // Terminate through bridge
    await this.bridge.safeAsyncExecution(async () => {
      return await this.bridge.executeTask({
        id: generateId('terminate-task'),
        type: 'agent',
        action: 'terminate',
        payload: { agentId },
        priority: 1,
        retries: 0,
        maxRetries: 3,
        createdAt: new Date(),
        status: 'queued',
      });
    });

    // Update agent status
    agent.status = 'terminated';

    // Move to terminated pool
    agentPool.available.delete(agentId);
    agentPool.busy.delete(agentId);
    agentPool.terminated.set(agentId, agent);

    this.emit('agent.terminated', swarmId, agentId);
  }

  public async getSwarmStatus(swarmId: string): Promise<SwarmStatus | null> {
    const swarm = this.swarms.get(swarmId);
    return swarm ? swarm.objective.status : null;
  }

  public async getAgents(swarmId: string): Promise<AgentState[]> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    return Array.from(swarm.agents.values());
  }

  public async getAgent(swarmId: string, agentId: string): Promise<AgentState | null> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    return swarm.agents.get(agentId) || null;
  }

  public async getTasks(swarmId: string): Promise<TaskDefinition[]> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    return Array.from(swarm.tasks.values());
  }

  public async getTask(swarmId: string, taskId: string): Promise<TaskDefinition | null> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    return swarm.tasks.get(taskId) || null;
  }

  public async createTask(swarmId: string, taskDefinition: Partial<TaskDefinition>): Promise<TaskDefinition> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const taskId: TaskId = {
      id: taskDefinition.id?.id || generateId('task'),
      swarmId,
      sequence: swarm.tasks.size + 1,
      priority: taskDefinition.priority === 'critical' ? 4 : 
                taskDefinition.priority === 'high' ? 3 :
                taskDefinition.priority === 'low' ? 1 : 2,
    };

    const task: TaskDefinition = {
      id: taskId,
      type: taskDefinition.type || 'custom',
      name: taskDefinition.name || 'Untitled Task',
      description: taskDefinition.description || '',
      requirements: taskDefinition.requirements || {
        capabilities: [],
        tools: [],
        permissions: [],
      },
      constraints: taskDefinition.constraints || {
        dependencies: [],
        dependents: [],
        conflicts: [],
      },
      priority: taskDefinition.priority || 'normal',
      input: taskDefinition.input || {},
      instructions: taskDefinition.instructions || '',
      context: taskDefinition.context || {},
      status: 'created',
      createdAt: new Date(),
      updatedAt: new Date(),
      attempts: [],
      statusHistory: [{
        timestamp: new Date(),
        from: 'created' as TaskStatus,
        to: 'created' as TaskStatus,
        reason: 'Task created',
        triggeredBy: 'system',
      }],
    };

    swarm.tasks.set(taskId.id, task);

    this.log('info', 'HeadlessCoordinator', `Created task: ${task.name}`, {
      swarmId,
      taskId: taskId.id,
      type: task.type,
    });

    this.emit('task.created', swarmId, taskId.id, task);
    return task;
  }

  public async assignTask(swarmId: string, taskId: string, agentId?: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    const agentPool = this.agentPools.get(swarmId);
    
    if (!swarm || !agentPool) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const task = swarm.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in swarm ${swarmId}`);
    }

    let selectedAgent: AgentState;

    if (agentId) {
      const agent = swarm.agents.get(agentId);
      if (!agent) {
        throw new Error(`Agent ${agentId} not found in swarm ${swarmId}`);
      }
      selectedAgent = agent;
    } else {
      // Auto-assign based on capabilities
      selectedAgent = await this.selectBestAgent(swarmId, task);
    }

    // Update task
    task.assignedTo = selectedAgent.id;
    task.assignedAt = new Date();
    task.status = 'assigned';
    task.updatedAt = new Date();

    // Move agent to busy pool
    agentPool.available.delete(selectedAgent.id.id);
    agentPool.busy.set(selectedAgent.id.id, selectedAgent);
    selectedAgent.status = 'busy';
    selectedAgent.currentTask = task.id;

    this.log('info', 'HeadlessCoordinator', `Assigned task ${task.name} to agent ${selectedAgent.name}`, {
      swarmId,
      taskId,
      agentId: selectedAgent.id.id,
    });

    this.emit('task.assigned', swarmId, taskId, selectedAgent.id.id);

    // Execute task
    await this.executeTask(swarmId, taskId);
  }

  public async cancelTask(swarmId: string, taskId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const task = swarm.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found in swarm ${swarmId}`);
    }

    task.status = 'cancelled';
    task.updatedAt = new Date();

    // If assigned, free up the agent
    if (task.assignedTo) {
      const agent = swarm.agents.get(task.assignedTo.id);
      if (agent) {
        agent.status = 'idle';
        agent.currentTask = undefined;

        const agentPool = this.agentPools.get(swarmId);
        if (agentPool) {
          agentPool.busy.delete(agent.id.id);
          agentPool.available.set(agent.id.id, agent);
        }
      }
    }

    this.emit('task.cancelled', swarmId, taskId);
  }

  public async getResults(swarmId: string): Promise<SwarmResults | null> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    const completedTasks = Array.from(swarm.tasks.values())
      .filter(task => task.status === 'completed');

    const results: SwarmResults = {
      outputs: {},
      artifacts: {},
      reports: {},
      overallQuality: 0,
      qualityByTask: {},
      totalExecutionTime: 0,
      resourcesUsed: {},
      efficiency: 0,
      objectivesMet: [],
      objectivesFailed: [],
      improvements: [],
      nextActions: [],
    };

    // Aggregate results from completed tasks
    completedTasks.forEach(task => {
      if (task.result) {
        results.outputs[task.id.id] = task.result.output;
        results.artifacts[task.id.id] = task.result.artifacts;
        results.qualityByTask[task.id.id] = task.result.quality;
        results.totalExecutionTime += task.result.executionTime;
        
        // Merge resource usage
        Object.entries(task.result.resourcesUsed).forEach(([key, value]) => {
          results.resourcesUsed[key] = (results.resourcesUsed[key] || 0) + (value as number);
        });
      }
    });

    // Calculate overall quality
    const qualityValues = Object.values(results.qualityByTask);
    results.overallQuality = qualityValues.length > 0 
      ? qualityValues.reduce((sum, q) => sum + q, 0) / qualityValues.length 
      : 0;

    return results;
  }

  public async getMetrics(swarmId: string): Promise<SwarmMetrics> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) {
      throw new Error(`Swarm ${swarmId} not found`);
    }

    return swarm.metrics;
  }

  public async getLogs(
    swarmId: string, 
    options: { limit?: number; offset?: number; level?: string } = {}
  ): Promise<LogEntry[]> {
    const { limit = 100, offset = 0, level } = options;

    let filteredLogs = this.logs.filter(log => log.swarmId === swarmId);

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    return filteredLogs
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(offset, offset + limit);
  }

  private async decomposeObjective(swarmId: string, objective: SwarmObjective): Promise<void> {
    this.log('info', 'HeadlessCoordinator', `Decomposing objective: ${objective.name}`, { swarmId });

    // Basic task decomposition based on strategy
    const tasks = await this.generateTasksFromObjective(objective);
    
    for (const taskDef of tasks) {
      await this.createTask(swarmId, taskDef);
    }
  }

  private async generateTasksFromObjective(objective: SwarmObjective): Promise<Partial<TaskDefinition>[]> {
    const tasks: Partial<TaskDefinition>[] = [];

    switch (objective.strategy) {
      case 'research':
        tasks.push(
          {
            name: 'Literature Review',
            description: `Research existing information related to: ${objective.description}`,
            type: 'research',
            priority: 'high',
            requirements: {
              capabilities: ['research', 'analysis'],
              tools: ['web-search', 'documentation'],
              permissions: ['read'],
            },
          },
          {
            name: 'Data Analysis',
            description: 'Analyze collected research data',
            type: 'analysis',
            priority: 'normal',
            requirements: {
              capabilities: ['analysis'],
              tools: ['analytics'],
              permissions: ['read', 'write'],
            },
          }
        );
        break;

      case 'development':
        tasks.push(
          {
            name: 'System Architecture',
            description: `Design system architecture for: ${objective.description}`,
            type: 'system-design',
            priority: 'high',
            requirements: {
              capabilities: ['architecture', 'design'],
              tools: ['modeling'],
              permissions: ['read', 'write'],
            },
          },
          {
            name: 'Implementation',
            description: 'Implement the designed system',
            type: 'coding',
            priority: 'high',
            requirements: {
              capabilities: ['codeGeneration'],
              tools: ['git', 'compiler'],
              permissions: ['read', 'write', 'execute'],
            },
          },
          {
            name: 'Testing',
            description: 'Create and run tests',
            type: 'testing',
            priority: 'normal',
            requirements: {
              capabilities: ['testing'],
              tools: ['test-framework'],
              permissions: ['read', 'write', 'execute'],
            },
          }
        );
        break;

      default:
        tasks.push({
          name: 'Execute Objective',
          description: objective.description,
          type: 'custom',
          priority: 'high',
          requirements: {
            capabilities: [],
            tools: [],
            permissions: ['read', 'write'],
          },
        });
    }

    return tasks;
  }

  private async spawnInitialAgents(swarmId: string, objective: SwarmObjective): Promise<void> {
    const agentConfigs = this.getInitialAgentConfigs(objective);
    
    for (const config of agentConfigs) {
      await this.spawnAgent(swarmId, config);
    }
  }

  private getInitialAgentConfigs(objective: SwarmObjective): Array<{ type: AgentType; name?: string }> {
    const configs: Array<{ type: AgentType; name?: string }> = [
      { type: 'coordinator', name: 'swarm-coordinator' },
    ];

    switch (objective.strategy) {
      case 'research':
        configs.push(
          { type: 'researcher', name: 'primary-researcher' },
          { type: 'analyst', name: 'data-analyst' }
        );
        break;

      case 'development':
        configs.push(
          { type: 'architect', name: 'system-architect' },
          { type: 'coder', name: 'developer' },
          { type: 'tester', name: 'qa-engineer' }
        );
        break;

      case 'analysis':
        configs.push(
          { type: 'analyst', name: 'lead-analyst' },
          { type: 'researcher', name: 'data-researcher' }
        );
        break;

      default:
        configs.push({ type: 'specialist', name: 'general-specialist' });
    }

    return configs.slice(0, objective.requirements.maxAgents);
  }

  private async startTaskExecution(swarmId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    // Assign tasks to available agents
    const unassignedTasks = Array.from(swarm.tasks.values())
      .filter(task => task.status === 'created');

    for (const task of unassignedTasks) {
      try {
        await this.assignTaskToAgent(swarmId, task.id.id);
      } catch (error) {
        this.log('error', 'HeadlessCoordinator', `Failed to assign task ${task.id.id}`, { error });
      }
    }
  }

  private async assignTaskToAgent(swarmId: string, taskId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    const agentPool = this.agentPools.get(swarmId);
    
    if (!swarm || !agentPool) return;

    const task = swarm.tasks.get(taskId);
    if (!task) return;

    const availableAgents = Array.from(agentPool.available.values());
    if (availableAgents.length === 0) {
      this.log('warn', 'HeadlessCoordinator', `No available agents for task ${taskId}`, { swarmId });
      return;
    }

    const bestAgent = await this.selectBestAgent(swarmId, task);
    await this.assignTask(swarmId, taskId, bestAgent.id.id);
  }

  private async selectBestAgent(swarmId: string, task: TaskDefinition): Promise<AgentState> {
    const agentPool = this.agentPools.get(swarmId);
    if (!agentPool) {
      throw new Error(`Agent pool for swarm ${swarmId} not found`);
    }

    const availableAgents = Array.from(agentPool.available.values());
    if (availableAgents.length === 0) {
      throw new Error(`No available agents in swarm ${swarmId}`);
    }

    // Simple selection: first available agent with matching capabilities
    const suitableAgent = availableAgents.find(agent => {
      return task.requirements.capabilities.every(cap => {
        return agent.capabilities[cap as keyof typeof agent.capabilities];
      });
    });

    return suitableAgent || availableAgents[0];
  }

  private async executeTask(swarmId: string, taskId: string): Promise<void> {
    const swarm = this.swarms.get(swarmId);
    if (!swarm) return;

    const task = swarm.tasks.get(taskId);
    if (!task) return;

    this.log('info', 'HeadlessCoordinator', `Executing task: ${task.name}`, { swarmId, taskId });

    task.status = 'running';
    task.startedAt = new Date();
    task.updatedAt = new Date();

    try {
      // Execute through bridge
      const result = await this.bridge.safeAsyncExecution(async () => {
        return await this.bridge.executeTask({
          id: generateId('execution-task'),
          type: 'task',
          action: 'execute',
          payload: {
            taskDefinition: task,
            agentId: task.assignedTo?.id,
          },
          priority: task.id.priority,
          retries: 0,
          maxRetries: 3,
          createdAt: new Date(),
          status: 'queued',
        });
      }, this.config.taskTimeoutMinutes * 60 * 1000);

      // Update task with result
      task.result = result;
      task.status = 'completed';
      task.completedAt = new Date();
      task.updatedAt = new Date();

      // Free up agent
      if (task.assignedTo) {
        const agent = swarm.agents.get(task.assignedTo.id);
        if (agent) {
          agent.status = 'idle';
          agent.currentTask = undefined;

          const agentPool = this.agentPools.get(swarmId);
          if (agentPool) {
            agentPool.busy.delete(agent.id.id);
            agentPool.available.set(agent.id.id, agent);
          }
        }
      }

      this.emit('task.completed', swarmId, taskId, result);

    } catch (error) {
      this.log('error', 'HeadlessCoordinator', `Task execution failed: ${task.name}`, { 
        swarmId, 
        taskId, 
        error: error instanceof Error ? error.message : String(error) 
      });

      task.status = 'failed';
      task.error = {
        type: 'ExecutionError',
        message: error instanceof Error ? error.message : String(error),
        code: 'TASK_EXECUTION_FAILED',
        context: { swarmId, taskId },
        recoverable: true,
        retryable: true,
      };
      task.updatedAt = new Date();

      this.emit('task.failed', swarmId, taskId, task.error);
    }
  }

  private handleTaskCompletion(task: any): void {
    this.log('info', 'HeadlessCoordinator', `Task completed: ${task.id}`);
  }

  private handleTaskFailure(task: any): void {
    this.log('error', 'HeadlessCoordinator', `Task failed: ${task.id}`, { error: task.error });
  }

  private async monitorResources(): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Check memory threshold
    if (memoryUsage.heapUsed > this.config.memoryThreshold) {
      this.log('warn', 'HeadlessCoordinator', 'Memory threshold exceeded', { memoryUsage });
      this.emit('resource.threshold.exceeded', 'memory', memoryUsage);
    }

    // Update metrics for all swarms
    this.swarms.forEach((swarm, swarmId) => {
      this.updateSwarmMetrics(swarmId, swarm);
    });
  }

  private updateSwarmMetrics(swarmId: string, swarm: SwarmInstance): void {
    const now = Date.now();
    const startTime = swarm.startedAt?.getTime() || now;
    const duration = now - startTime;

    const completedTasks = Array.from(swarm.tasks.values())
      .filter(task => task.status === 'completed');

    const totalTasks = swarm.tasks.size;
    const runningTasks = Array.from(swarm.tasks.values())
      .filter(task => task.status === 'running').length;

    swarm.metrics = {
      throughput: completedTasks.length > 0 ? completedTasks.length / (duration / 60000) : 0,
      latency: 0, // Calculate based on task completion times
      efficiency: totalTasks > 0 ? completedTasks.length / totalTasks : 0,
      reliability: 0.95, // Calculate based on success rate
      averageQuality: 0, // Calculate from task results
      defectRate: 0, // Calculate from failed tasks
      reworkRate: 0, // Calculate from retried tasks
      resourceUtilization: {
        memory: process.memoryUsage().heapUsed,
        cpu: process.cpuUsage().user + process.cpuUsage().system,
      },
      costEfficiency: 1.0,
      agentUtilization: swarm.agents.size > 0 ? 
        Array.from(swarm.agents.values()).filter(a => a.status === 'busy').length / swarm.agents.size : 0,
      agentSatisfaction: 0.9,
      collaborationEffectiveness: 0.85,
      scheduleVariance: 0,
      deadlineAdherence: 1.0,
    };

    // Update progress
    swarm.objective.progress = {
      totalTasks,
      completedTasks: completedTasks.length,
      failedTasks: Array.from(swarm.tasks.values()).filter(task => task.status === 'failed').length,
      runningTasks,
      estimatedCompletion: new Date(now + (duration * (totalTasks - completedTasks.length) / Math.max(completedTasks.length, 1))),
      timeRemaining: duration * (totalTasks - completedTasks.length) / Math.max(completedTasks.length, 1),
      percentComplete: totalTasks > 0 ? (completedTasks.length / totalTasks) * 100 : 0,
      averageQuality: swarm.metrics.averageQuality,
      passedReviews: 0,
      passedTests: 0,
      resourceUtilization: swarm.metrics.resourceUtilization,
      costSpent: 0,
      activeAgents: Array.from(swarm.agents.values()).filter(a => a.status !== 'terminated').length,
      idleAgents: Array.from(swarm.agents.values()).filter(a => a.status === 'idle').length,
      busyAgents: Array.from(swarm.agents.values()).filter(a => a.status === 'busy').length,
    };
  }

  private initializeMetrics(): SwarmMetrics {
    return {
      throughput: 0,
      latency: 0,
      efficiency: 0,
      reliability: 0,
      averageQuality: 0,
      defectRate: 0,
      reworkRate: 0,
      resourceUtilization: {},
      costEfficiency: 0,
      agentUtilization: 0,
      agentSatisfaction: 0,
      collaborationEffectiveness: 0,
      scheduleVariance: 0,
      deadlineAdherence: 0,
    };
  }

  private log(
    level: LogEntry['level'], 
    source: string, 
    message: string, 
    metadata?: Record<string, any>
  ): void {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      source,
      message,
      metadata,
    };

    if (metadata?.swarmId) {
      entry.swarmId = metadata.swarmId;
    }
    if (metadata?.agentId) {
      entry.agentId = metadata.agentId;
    }
    if (metadata?.taskId) {
      entry.taskId = metadata.taskId;
    }

    this.logs.push(entry);

    // Keep only recent logs
    if (this.logs.length > 10000) {
      this.logs = this.logs.slice(-5000);
    }

    this.logger[level](message, metadata);
  }

  private cleanup(): void {
    if (this.resourceMonitor) {
      clearInterval(this.resourceMonitor);
    }

    this.healthChecks.forEach(timer => clearInterval(timer));
    this.healthChecks.clear();

    this.logger.info('HeadlessCoordinator cleanup complete');
  }
}