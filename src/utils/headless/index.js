/**
 * Claude-Flow Headless Mode - Main Entry Point
 * Exports all headless components and provides easy setup
 */

import { ExecutionBridge, basicSwarmNew } from './execution-bridge.js';
import { HeadlessAPIServer } from './api-server.js';
import { HeadlessTestRunner } from './test-runner.js';
import { generateId, isHeadless, getEnvironmentConfig } from '../utils/helpers.js';

/**
 * Main HeadlessSystem class that orchestrates all components
 */
export class HeadlessSystem {
  constructor(config = {}) {
    this.config = {
      ...getEnvironmentConfig(),
      ...config
    };
    
    this.executionBridge = new ExecutionBridge(this.config);
    this.apiServer = new HeadlessAPIServer(this.config);
    this.isRunning = false;
  }

  /**
   * Start the complete headless system
   */
  async start() {
    console.log('🚀 Starting Claude-Flow Headless System...');
    console.log(`📋 Configuration:`);
    console.log(`  - Headless Mode: ${this.config.headless}`);
    console.log(`  - Max Agents: ${this.config.maxAgents}`);
    console.log(`  - Timeout: ${this.config.timeout}ms`);
    console.log(`  - API Port: ${this.config.port || 3000}`);

    try {
      // Start API server
      await this.apiServer.start();
      this.isRunning = true;
      
      console.log('✅ Headless system started successfully');
      console.log(`📡 REST API available at http://localhost:${this.config.port || 3000}`);
      console.log(`🔌 WebSocket available at ws://localhost:${this.config.port || 3000}/ws`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to start headless system:', error);
      throw error;
    }
  }

  /**
   * Stop the headless system
   */
  async stop() {
    if (!this.isRunning) return;
    
    console.log('🛑 Stopping Claude-Flow Headless System...');
    
    try {
      await this.apiServer.stop();
      this.isRunning = false;
      console.log('✅ Headless system stopped successfully');
    } catch (error) {
      console.error('❌ Error stopping headless system:', error);
      throw error;
    }
  }

  /**
   * Execute a swarm directly (without API)
   */
  async executeSwarm(objective, flags = {}) {
    return await this.executionBridge.executeSwarm(objective, flags);
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      running: this.isRunning,
      config: this.config,
      stats: this.apiServer.getStats(),
      activeExecutions: this.executionBridge.getActiveExecutions()
    };
  }

  /**
   * Run comprehensive tests
   */
  async runTests() {
    const testRunner = new HeadlessTestRunner();
    return await testRunner.runAllTests();
  }

  /**
   * Run quick smoke test
   */
  async runSmokeTest() {
    const testRunner = new HeadlessTestRunner();
    return await testRunner.runSmokeTest();
  }
}

/**
 * Create a default configuration
 */
export function createDefaultConfig(overrides = {}) {
  return {
    port: 3000,
    host: '0.0.0.0',
    headless: isHeadless(),
    maxAgents: 5,
    timeout: 300000, // 5 minutes
    cors: true,
    ...overrides
  };
}

/**
 * Quick start function for common use cases
 */
export async function quickStart(config = {}) {
  const system = new HeadlessSystem(createDefaultConfig(config));
  await system.start();
  return system;
}

/**
 * CLI helper for direct execution
 */
export async function executeFromCLI(args, flags = {}) {
  const objective = args.join(' ').trim();
  
  if (!objective) {
    throw new Error('No objective provided. Usage: <objective>');
  }

  const bridge = new ExecutionBridge(getEnvironmentConfig());
  return await bridge.executeSwarm(objective, flags);
}

/**
 * Docker/Container helper
 */
export async function startContainer(config = {}) {
  const containerConfig = {
    ...createDefaultConfig(),
    headless: true,
    host: '0.0.0.0', // Allow external connections in container
    ...config
  };

  console.log('🐳 Starting Claude-Flow in container mode...');
  const system = new HeadlessSystem(containerConfig);
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('📡 Received SIGTERM, shutting down gracefully...');
    await system.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('📡 Received SIGINT, shutting down gracefully...');
    await system.stop();
    process.exit(0);
  });

  await system.start();
  return system;
}

// Export all components for advanced usage
export {
  ExecutionBridge,
  basicSwarmNew,
  HeadlessAPIServer,
  HeadlessTestRunner,
  generateId,
  isHeadless,
  getEnvironmentConfig
};

// Default export
export default HeadlessSystem;