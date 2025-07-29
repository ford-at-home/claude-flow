/**
 * Headless Mode Entry Point
 * Coordinates all headless components
 */

import { Logger } from '../core/logger.js';
import { ApiServer, ApiServerConfig } from './api-server.js';
import { ExecutionBridge, ExecutionConfig } from './execution-bridge.js';
import { HeadlessCoordinator, CoordinatorConfig } from './headless-coordinator.js';

export interface HeadlessConfig {
  api: ApiServerConfig;
  bridge: ExecutionConfig;
  coordinator: CoordinatorConfig;
  environment: {
    nodeEnv: string;
    logLevel: string;
    enableMetrics: boolean;
  };
}

export class HeadlessSystem {
  private logger: Logger;
  private config: HeadlessConfig;
  private bridge: ExecutionBridge;
  private coordinator: HeadlessCoordinator;
  private apiServer: ApiServer;
  private isRunning = false;

  constructor(config: HeadlessConfig) {
    this.config = config;
    this.logger = new Logger('HeadlessSystem');
    
    // Initialize components in dependency order
    this.bridge = new ExecutionBridge(config.bridge);
    this.coordinator = new HeadlessCoordinator(config.coordinator, this.bridge);
    this.apiServer = new ApiServer(config.api, this.coordinator, this.bridge);
  }

  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Headless system is already running');
    }

    this.logger.info('Starting Claude Flow Headless System...');

    try {
      // Start API server
      await this.apiServer.start();
      
      this.isRunning = true;
      this.logger.info('Headless system started successfully');
      
      // Log system info
      const serverInfo = this.apiServer.getServerInfo();
      this.logger.info('System ready:', {
        api: `http://${serverInfo.host}:${serverInfo.port}`,
        environment: this.config.environment.nodeEnv,
        bridgeRuntime: this.bridge.getEnvironmentInfo().runtime,
      });

    } catch (error) {
      this.logger.error('Failed to start headless system:', error);
      await this.stop();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping Claude Flow Headless System...');

    try {
      // Stop components in reverse order
      await this.apiServer.stop();
      await this.bridge.shutdown();
      
      this.isRunning = false;
      this.logger.info('Headless system stopped successfully');

    } catch (error) {
      this.logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  public isHealthy(): boolean {
    return this.isRunning;
  }

  public getStatus() {
    const serverInfo = this.apiServer.getServerInfo();
    const bridgeStatus = this.bridge.getQueueStatus();
    const envInfo = this.bridge.getEnvironmentInfo();

    return {
      running: this.isRunning,
      api: {
        host: serverInfo.host,
        port: serverInfo.port,
        activeSwarms: serverInfo.activeSwarms,
        connectedClients: serverInfo.connectedClients,
        uptime: serverInfo.uptime,
      },
      bridge: {
        runtime: envInfo.runtime,
        version: envInfo.version,
        features: envInfo.features,
        queue: bridgeStatus,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
      },
    };
  }
}

// Default configuration factory
export function createDefaultConfig(): HeadlessConfig {
  return {
    api: {
      port: parseInt(process.env.PORT || '3000'),
      host: process.env.HOST || '0.0.0.0',
      corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['*'],
      rateLimit: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // limit each IP to 100 requests per windowMs
      },
      authentication: {
        enabled: process.env.AUTH_ENABLED === 'true',
        jwtSecret: process.env.JWT_SECRET,
        apiKeys: process.env.API_KEYS?.split(','),
      },
      websocket: {
        enabled: process.env.WS_ENABLED !== 'false',
        heartbeatInterval: 30000,
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
      },
    },
    bridge: {
      runtime: 'node',
      enableFallbacks: true,
      asyncTimeout: 120000, // 2 minutes
      maxRetries: 3,
      retryDelay: 1000,
      useSimpleExecutor: true,
      useAdvancedExecutor: true,
      enableTaskQueue: true,
      maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || '10'),
      taskTimeout: parseInt(process.env.TASK_TIMEOUT || '300000'), // 5 minutes
      memoryLimit: parseInt(process.env.MEMORY_LIMIT || String(512 * 1024 * 1024)), // 512MB
    },
    coordinator: {
      maxSwarms: parseInt(process.env.MAX_SWARMS || '50'),
      maxAgentsPerSwarm: parseInt(process.env.MAX_AGENTS_PER_SWARM || '20'),
      defaultAgentTimeout: parseInt(process.env.AGENT_TIMEOUT || '30000'), // 30 seconds
      taskTimeoutMinutes: parseInt(process.env.TASK_TIMEOUT_MINUTES || '10'),
      enableResourceMonitoring: process.env.RESOURCE_MONITORING !== 'false',
      enableAutoScaling: process.env.AUTO_SCALING === 'true',
      enableFailover: process.env.FAILOVER === 'true',
      memoryThreshold: parseInt(process.env.MEMORY_THRESHOLD || String(1024 * 1024 * 1024)), // 1GB
      cpuThreshold: parseFloat(process.env.CPU_THRESHOLD || '0.8'), // 80%
    },
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      logLevel: process.env.LOG_LEVEL || 'info',
      enableMetrics: process.env.ENABLE_METRICS !== 'false',
    },
  };
}

// CLI entry point
export async function startHeadlessSystem(): Promise<HeadlessSystem> {
  const config = createDefaultConfig();
  const system = new HeadlessSystem(config);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await system.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nReceived SIGTERM, shutting down gracefully...');
    await system.stop();
    process.exit(0);
  });

  await system.start();
  return system;
}

// Export all components
export {
  ApiServer,
  ExecutionBridge,
  HeadlessCoordinator,
};

export type {
  ApiServerConfig,
  ExecutionConfig,
  CoordinatorConfig,
  HeadlessConfig,
};