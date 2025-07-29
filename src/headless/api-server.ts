/**
 * Headless API Server - REST endpoints and WebSocket integration
 * Senior Backend Engineer Implementation
 */

import express, { Express, Request, Response } from 'express';
import { createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import morgan from 'morgan';
import { Logger } from '../core/logger.js';
import { generateId } from '../utils/helpers.js';
import { 
  SwarmObjective, 
  AgentState, 
  TaskDefinition, 
  SwarmStatus,
  SwarmEvent,
  EventType 
} from '../swarm/types.js';
import { HeadlessCoordinator } from './headless-coordinator.js';
import { ExecutionBridge } from './execution-bridge.js';

export interface ApiServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  rateLimit: {
    windowMs: number;
    max: number;
  };
  authentication: {
    enabled: boolean;
    jwtSecret?: string;
    apiKeys?: string[];
  };
  websocket: {
    enabled: boolean;
    heartbeatInterval: number;
  };
  logging: {
    level: string;
    format: string;
  };
}

export interface SwarmRequest {
  objective: string;
  strategy?: string;
  mode?: string;
  maxAgents?: number;
  timeout?: number;
  parallel?: boolean;
  options?: Record<string, any>;
}

export interface SwarmResponse {
  swarmId: string;
  status: SwarmStatus;
  message: string;
  data?: any;
  timestamp: Date;
}

export interface WebSocketClient {
  id: string;
  socket: WebSocket;
  subscriptions: Set<string>;
  isAlive: boolean;
  connectedAt: Date;
}

export class ApiServer {
  private app: Express;
  private server: Server;
  private wss?: WebSocketServer;
  private coordinator: HeadlessCoordinator;
  private bridge: ExecutionBridge;
  private logger: Logger;
  private config: ApiServerConfig;
  private clients: Map<string, WebSocketClient> = new Map();
  private activeSwarms: Map<string, SwarmObjective> = new Map();

  constructor(
    config: ApiServerConfig,
    coordinator: HeadlessCoordinator,
    bridge: ExecutionBridge
  ) {
    this.config = config;
    this.coordinator = coordinator;
    this.bridge = bridge;
    this.logger = new Logger('ApiServer');
    this.app = express();
    this.server = createServer(this.app);

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupEventHandlers();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: {
        error: 'Too many requests',
        retryAfter: Math.ceil(this.config.rateLimit.windowMs / 1000),
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Compression
    this.app.use(compression());

    // Logging
    this.app.use(morgan(this.config.logging.format));

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Authentication middleware
    if (this.config.authentication.enabled) {
      this.app.use('/api/', this.authenticationMiddleware.bind(this));
    }
  }

  private authenticationMiddleware(req: Request, res: Response, next: Function): void {
    const apiKey = req.headers['x-api-key'] as string;
    const authHeader = req.headers.authorization;

    // Skip auth for health check
    if (req.path === '/api/health') {
      return next();
    }

    if (this.config.authentication.apiKeys && apiKey) {
      if (this.config.authentication.apiKeys.includes(apiKey)) {
        return next();
      }
    }

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      // TODO: Implement JWT validation
      if (this.validateJWT(token)) {
        return next();
      }
    }

    res.status(401).json({
      error: 'Authentication required',
      message: 'Provide valid API key or JWT token',
    });
  }

  private validateJWT(token: string): boolean {
    // TODO: Implement proper JWT validation
    return token.length > 10;
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/api/health', (req: Request, res: Response) => {
      res.json({
        status: 'healthy',
        service: 'claude-flow-headless-api',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
      });
    });

    // Swarm management endpoints
    this.app.post('/api/swarm/create', this.createSwarm.bind(this));
    this.app.get('/api/swarm/:swarmId', this.getSwarm.bind(this));
    this.app.get('/api/swarm/:swarmId/status', this.getSwarmStatus.bind(this));
    this.app.post('/api/swarm/:swarmId/start', this.startSwarm.bind(this));
    this.app.post('/api/swarm/:swarmId/pause', this.pauseSwarm.bind(this));
    this.app.post('/api/swarm/:swarmId/resume', this.resumeSwarm.bind(this));
    this.app.post('/api/swarm/:swarmId/stop', this.stopSwarm.bind(this));
    this.app.delete('/api/swarm/:swarmId', this.deleteSwarm.bind(this));

    // Agent management endpoints
    this.app.get('/api/swarm/:swarmId/agents', this.getAgents.bind(this));
    this.app.post('/api/swarm/:swarmId/agents', this.spawnAgent.bind(this));
    this.app.get('/api/swarm/:swarmId/agents/:agentId', this.getAgent.bind(this));
    this.app.delete('/api/swarm/:swarmId/agents/:agentId', this.terminateAgent.bind(this));

    // Task management endpoints
    this.app.get('/api/swarm/:swarmId/tasks', this.getTasks.bind(this));
    this.app.post('/api/swarm/:swarmId/tasks', this.createTask.bind(this));
    this.app.get('/api/swarm/:swarmId/tasks/:taskId', this.getTask.bind(this));
    this.app.post('/api/swarm/:swarmId/tasks/:taskId/assign', this.assignTask.bind(this));
    this.app.delete('/api/swarm/:swarmId/tasks/:taskId', this.cancelTask.bind(this));

    // Results and metrics endpoints
    this.app.get('/api/swarm/:swarmId/results', this.getResults.bind(this));
    this.app.get('/api/swarm/:swarmId/metrics', this.getMetrics.bind(this));
    this.app.get('/api/swarm/:swarmId/logs', this.getLogs.bind(this));

    // System endpoints
    this.app.get('/api/system/swarms', this.listSwarms.bind(this));
    this.app.get('/api/system/stats', this.getSystemStats.bind(this));
    this.app.get('/api/system/config', this.getConfig.bind(this));

    // Error handling
    this.app.use(this.errorHandler.bind(this));
  }

  private async createSwarm(req: Request, res: Response): Promise<void> {
    try {
      const swarmRequest: SwarmRequest = req.body;
      
      if (!swarmRequest.objective) {
        res.status(400).json({
          error: 'Missing objective',
          message: 'Swarm objective is required',
        });
        return;
      }

      const swarmId = generateId('swarm');
      const swarmObjective: SwarmObjective = await this.coordinator.createSwarm({
        id: swarmId,
        name: `Swarm-${swarmId}`,
        description: swarmRequest.objective,
        strategy: swarmRequest.strategy as any || 'auto',
        mode: swarmRequest.mode as any || 'centralized',
        requirements: {
          minAgents: 1,
          maxAgents: swarmRequest.maxAgents || 5,
          agentTypes: [],
          estimatedDuration: swarmRequest.timeout || 3600,
          maxDuration: (swarmRequest.timeout || 3600) * 2,
          qualityThreshold: 0.8,
          reviewCoverage: 0.5,
          testCoverage: 0.7,
          reliabilityTarget: 0.95,
        },
        constraints: {
          milestones: [],
          minQuality: 0.7,
          requiredApprovals: [],
          allowedFailures: 3,
          recoveryTime: 300,
          resourceLimits: {},
        },
        tasks: [],
        dependencies: [],
        status: 'planning',
        progress: {
          totalTasks: 0,
          completedTasks: 0,
          failedTasks: 0,
          runningTasks: 0,
          estimatedCompletion: new Date(Date.now() + (swarmRequest.timeout || 3600) * 1000),
          timeRemaining: swarmRequest.timeout || 3600,
          percentComplete: 0,
          averageQuality: 0,
          passedReviews: 0,
          passedTests: 0,
          resourceUtilization: {},
          costSpent: 0,
          activeAgents: 0,
          idleAgents: 0,
          busyAgents: 0,
        },
        createdAt: new Date(),
        metrics: {
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
        },
      });

      this.activeSwarms.set(swarmId, swarmObjective);

      const response: SwarmResponse = {
        swarmId,
        status: swarmObjective.status,
        message: 'Swarm created successfully',
        data: {
          objective: swarmRequest.objective,
          strategy: swarmObjective.strategy,
          mode: swarmObjective.mode,
          maxAgents: swarmObjective.requirements.maxAgents,
        },
        timestamp: new Date(),
      };

      res.status(201).json(response);
      
      // Broadcast to WebSocket clients
      this.broadcastSwarmEvent('swarm.created', swarmId, response);

    } catch (error) {
      this.logger.error('Failed to create swarm:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create swarm',
      });
    }
  }

  private async getSwarm(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      const swarm = this.activeSwarms.get(swarmId);

      if (!swarm) {
        res.status(404).json({
          error: 'Swarm not found',
          message: `Swarm ${swarmId} does not exist`,
        });
        return;
      }

      res.json({
        swarmId,
        data: swarm,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to get swarm:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve swarm',
      });
    }
  }

  private async getSwarmStatus(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      const status = await this.coordinator.getSwarmStatus(swarmId);

      if (!status) {
        res.status(404).json({
          error: 'Swarm not found',
          message: `Swarm ${swarmId} does not exist`,
        });
        return;
      }

      res.json({
        swarmId,
        status,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to get swarm status:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve swarm status',
      });
    }
  }

  private async startSwarm(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      await this.coordinator.startSwarm(swarmId);

      const response: SwarmResponse = {
        swarmId,
        status: 'executing',
        message: 'Swarm started successfully',
        timestamp: new Date(),
      };

      res.json(response);
      this.broadcastSwarmEvent('swarm.started', swarmId, response);
    } catch (error) {
      this.logger.error('Failed to start swarm:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to start swarm',
      });
    }
  }

  private async pauseSwarm(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      await this.coordinator.pauseSwarm(swarmId);

      const response: SwarmResponse = {
        swarmId,
        status: 'paused',
        message: 'Swarm paused successfully',
        timestamp: new Date(),
      };

      res.json(response);
      this.broadcastSwarmEvent('swarm.paused', swarmId, response);
    } catch (error) {
      this.logger.error('Failed to pause swarm:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to pause swarm',
      });
    }
  }

  private async resumeSwarm(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      await this.coordinator.resumeSwarm(swarmId);

      const response: SwarmResponse = {
        swarmId,
        status: 'executing',
        message: 'Swarm resumed successfully',
        timestamp: new Date(),
      };

      res.json(response);
      this.broadcastSwarmEvent('swarm.resumed', swarmId, response);
    } catch (error) {
      this.logger.error('Failed to resume swarm:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to resume swarm',
      });
    }
  }

  private async stopSwarm(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      await this.coordinator.stopSwarm(swarmId);

      const response: SwarmResponse = {
        swarmId,
        status: 'completed',
        message: 'Swarm stopped successfully',
        timestamp: new Date(),
      };

      res.json(response);
      this.broadcastSwarmEvent('swarm.completed', swarmId, response);
    } catch (error) {
      this.logger.error('Failed to stop swarm:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to stop swarm',
      });
    }
  }

  private async deleteSwarm(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      await this.coordinator.deleteSwarm(swarmId);
      this.activeSwarms.delete(swarmId);

      res.status(204).send();
      this.broadcastSwarmEvent('swarm.cancelled', swarmId, { swarmId });
    } catch (error) {
      this.logger.error('Failed to delete swarm:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete swarm',
      });
    }
  }

  private async getAgents(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      const agents = await this.coordinator.getAgents(swarmId);

      res.json({
        swarmId,
        agents,
        count: agents.length,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to get agents:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve agents',
      });
    }
  }

  private async spawnAgent(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      const { type, name, capabilities } = req.body;

      const agent = await this.coordinator.spawnAgent(swarmId, {
        type,
        name,
        capabilities,
      });

      res.status(201).json({
        swarmId,
        agent,
        message: 'Agent spawned successfully',
        timestamp: new Date(),
      });

      this.broadcastSwarmEvent('agent.created', swarmId, { agent });
    } catch (error) {
      this.logger.error('Failed to spawn agent:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to spawn agent',
      });
    }
  }

  private async getAgent(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId, agentId } = req.params;
      const agent = await this.coordinator.getAgent(swarmId, agentId);

      if (!agent) {
        res.status(404).json({
          error: 'Agent not found',
          message: `Agent ${agentId} not found in swarm ${swarmId}`,
        });
        return;
      }

      res.json({
        swarmId,
        agentId,
        agent,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to get agent:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve agent',
      });
    }
  }

  private async terminateAgent(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId, agentId } = req.params;
      await this.coordinator.terminateAgent(swarmId, agentId);

      res.status(204).send();
      this.broadcastSwarmEvent('agent.stopped', swarmId, { agentId });
    } catch (error) {
      this.logger.error('Failed to terminate agent:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to terminate agent',
      });
    }
  }

  private async getTasks(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      const tasks = await this.coordinator.getTasks(swarmId);

      res.json({
        swarmId,
        tasks,
        count: tasks.length,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to get tasks:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve tasks',
      });
    }
  }

  private async createTask(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      const taskDefinition = req.body;

      const task = await this.coordinator.createTask(swarmId, taskDefinition);

      res.status(201).json({
        swarmId,
        task,
        message: 'Task created successfully',
        timestamp: new Date(),
      });

      this.broadcastSwarmEvent('task.created', swarmId, { task });
    } catch (error) {
      this.logger.error('Failed to create task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create task',
      });
    }
  }

  private async getTask(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId, taskId } = req.params;
      const task = await this.coordinator.getTask(swarmId, taskId);

      if (!task) {
        res.status(404).json({
          error: 'Task not found',
          message: `Task ${taskId} not found in swarm ${swarmId}`,
        });
        return;
      }

      res.json({
        swarmId,
        taskId,
        task,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to get task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve task',
      });
    }
  }

  private async assignTask(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId, taskId } = req.params;
      const { agentId } = req.body;

      await this.coordinator.assignTask(swarmId, taskId, agentId);

      res.json({
        swarmId,
        taskId,
        agentId,
        message: 'Task assigned successfully',
        timestamp: new Date(),
      });

      this.broadcastSwarmEvent('task.assigned', swarmId, { taskId, agentId });
    } catch (error) {
      this.logger.error('Failed to assign task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to assign task',
      });
    }
  }

  private async cancelTask(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId, taskId } = req.params;
      await this.coordinator.cancelTask(swarmId, taskId);

      res.status(204).send();
      this.broadcastSwarmEvent('task.cancelled', swarmId, { taskId });
    } catch (error) {
      this.logger.error('Failed to cancel task:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to cancel task',
      });
    }
  }

  private async getResults(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      const results = await this.coordinator.getResults(swarmId);

      res.json({
        swarmId,
        results,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to get results:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve results',
      });
    }
  }

  private async getMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      const metrics = await this.coordinator.getMetrics(swarmId);

      res.json({
        swarmId,
        metrics,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to get metrics:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve metrics',
      });
    }
  }

  private async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const { swarmId } = req.params;
      const { limit = 100, offset = 0, level } = req.query;

      const logs = await this.coordinator.getLogs(swarmId, {
        limit: Number(limit),
        offset: Number(offset),
        level: level as string,
      });

      res.json({
        swarmId,
        logs,
        count: logs.length,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to get logs:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve logs',
      });
    }
  }

  private async listSwarms(req: Request, res: Response): Promise<void> {
    try {
      const swarms = Array.from(this.activeSwarms.entries()).map(([id, swarm]) => ({
        id,
        name: swarm.name,
        status: swarm.status,
        strategy: swarm.strategy,
        mode: swarm.mode,
        createdAt: swarm.createdAt,
        progress: swarm.progress.percentComplete,
      }));

      res.json({
        swarms,
        count: swarms.length,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to list swarms:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to list swarms',
      });
    }
  }

  private async getSystemStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = {
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          architecture: process.arch,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
        },
        server: {
          activeSwarms: this.activeSwarms.size,
          connectedClients: this.clients.size,
          requestsPerMinute: 0, // TODO: Implement request counting
        },
        timestamp: new Date(),
      };

      res.json(stats);
    } catch (error) {
      this.logger.error('Failed to get system stats:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve system stats',
      });
    }
  }

  private async getConfig(req: Request, res: Response): Promise<void> {
    try {
      const safeConfig = {
        port: this.config.port,
        host: this.config.host,
        corsOrigins: this.config.corsOrigins,
        rateLimit: this.config.rateLimit,
        websocket: this.config.websocket,
        logging: this.config.logging,
        authentication: {
          enabled: this.config.authentication.enabled,
        },
      };

      res.json({
        config: safeConfig,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Failed to get config:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve config',
      });
    }
  }

  private errorHandler(error: any, req: Request, res: Response, next: Function): void {
    this.logger.error('API Error:', error);

    if (res.headersSent) {
      return next(error);
    }

    const status = error.status || error.statusCode || 500;
    const message = error.message || 'Internal server error';

    res.status(status).json({
      error: error.name || 'ServerError',
      message,
      timestamp: new Date().toISOString(),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    });
  }

  private setupWebSocket(): void {
    if (!this.config.websocket.enabled) {
      return;
    }

    this.wss = new WebSocketServer({
      server: this.server,
      path: '/ws',
    });

    this.wss.on('connection', (ws: WebSocket, req) => {
      const clientId = generateId('client');
      const client: WebSocketClient = {
        id: clientId,
        socket: ws,
        subscriptions: new Set(),
        isAlive: true,
        connectedAt: new Date(),
      };

      this.clients.set(clientId, client);
      this.logger.info(`WebSocket client connected: ${clientId}`);

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWebSocketMessage(client, message);
        } catch (error) {
          this.logger.error('Invalid WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid JSON message',
          }));
        }
      });

      ws.on('pong', () => {
        client.isAlive = true;
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        this.logger.info(`WebSocket client disconnected: ${clientId}`);
      });

      ws.on('error', (error) => {
        this.logger.error(`WebSocket error for client ${clientId}:`, error);
        this.clients.delete(clientId);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date(),
      }));
    });

    // Setup heartbeat
    const heartbeatInterval = setInterval(() => {
      this.wss?.clients.forEach((ws) => {
        const client = Array.from(this.clients.values()).find(c => c.socket === ws);
        if (client) {
          if (!client.isAlive) {
            ws.terminate();
            this.clients.delete(client.id);
            return;
          }
          client.isAlive = false;
          ws.ping();
        }
      });
    }, this.config.websocket.heartbeatInterval);

    // Cleanup on server close
    this.server.on('close', () => {
      clearInterval(heartbeatInterval);
    });
  }

  private handleWebSocketMessage(client: WebSocketClient, message: any): void {
    switch (message.type) {
      case 'subscribe':
        if (message.swarmId) {
          client.subscriptions.add(message.swarmId);
          client.socket.send(JSON.stringify({
            type: 'subscribed',
            swarmId: message.swarmId,
            timestamp: new Date(),
          }));
        }
        break;

      case 'unsubscribe':
        if (message.swarmId) {
          client.subscriptions.delete(message.swarmId);
          client.socket.send(JSON.stringify({
            type: 'unsubscribed',
            swarmId: message.swarmId,
            timestamp: new Date(),
          }));
        }
        break;

      case 'ping':
        client.socket.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date(),
        }));
        break;

      default:
        client.socket.send(JSON.stringify({
          type: 'error',
          message: `Unknown message type: ${message.type}`,
        }));
    }
  }

  private broadcastSwarmEvent(eventType: string, swarmId: string, data: any): void {
    if (!this.wss) return;

    const event = {
      type: 'swarm_event',
      eventType,
      swarmId,
      data,
      timestamp: new Date(),
    };

    this.clients.forEach((client) => {
      if (client.subscriptions.has(swarmId) || client.subscriptions.has('all')) {
        try {
          client.socket.send(JSON.stringify(event));
        } catch (error) {
          this.logger.error(`Failed to send event to client ${client.id}:`, error);
        }
      }
    });
  }

  private setupEventHandlers(): void {
    // Listen to coordinator events
    this.coordinator.on('swarm.status_changed', (swarmId: string, status: SwarmStatus) => {
      this.broadcastSwarmEvent('swarm.status_changed', swarmId, { status });
    });

    this.coordinator.on('agent.status_changed', (swarmId: string, agentId: string, status: string) => {
      this.broadcastSwarmEvent('agent.status_changed', swarmId, { agentId, status });
    });

    this.coordinator.on('task.completed', (swarmId: string, taskId: string, result: any) => {
      this.broadcastSwarmEvent('task.completed', swarmId, { taskId, result });
    });
  }

  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, () => {
        this.logger.info(`API Server started on ${this.config.host}:${this.config.port}`);
        if (this.config.websocket.enabled) {
          this.logger.info(`WebSocket server enabled on ws://${this.config.host}:${this.config.port}/ws`);
        }
        resolve();
      });

      this.server.on('error', (error) => {
        this.logger.error('Server startup error:', error);
        reject(error);
      });
    });
  }

  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close WebSocket connections
      if (this.wss) {
        this.wss.close(() => {
          this.logger.info('WebSocket server closed');
        });
      }

      // Close HTTP server
      this.server.close(() => {
        this.logger.info('API Server stopped');
        resolve();
      });
    });
  }

  public getServerInfo() {
    return {
      host: this.config.host,
      port: this.config.port,
      activeSwarms: this.activeSwarms.size,
      connectedClients: this.clients.size,
      uptime: process.uptime(),
    };
  }
}