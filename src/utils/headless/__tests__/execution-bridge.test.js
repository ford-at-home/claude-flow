/**
 * Tests for execution-bridge.js
 */

import { jest } from '@jest/globals';
import { ExecutionBridge, basicSwarmNew } from '../execution-bridge.js';
import { RealSwarmExecutor } from '../real-swarm-executor.js';
import { ensureGracefulExit } from '../graceful-shutdown.js';
import * as helpers from '../../utils/helpers.js';

// Mock dependencies
jest.mock('../real-swarm-executor.js');
jest.mock('../graceful-shutdown.js');
jest.mock('../../utils/helpers.js', () => ({
  generateId: jest.fn(prefix => `${prefix}_test123`),
  isHeadless: jest.fn(() => false),
  getEnvironmentConfig: jest.fn(() => ({ 
    claudeApiKey: 'test-key',
    headless: false 
  })),
  timeout: jest.fn((promise) => promise),
}));

// Mock child_process for interactive mode
jest.mock('child_process', () => ({
  spawn: jest.fn(() => ({
    on: jest.fn((event, callback) => {
      if (event === 'exit') setTimeout(() => callback(0), 100);
    }),
    kill: jest.fn(),
    stdio: 'inherit'
  }))
}));

describe('ExecutionBridge', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let bridge;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    bridge = new ExecutionBridge();
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mock behaviors
    RealSwarmExecutor.mockImplementation(() => ({
      execute: jest.fn().mockResolvedValue({
        success: true,
        swarmId: 'swarm_test123',
        objective: 'test objective',
        duration: 5000,
        agents: 5,
        tasks: 6,
        synthesis: 'Test synthesis',
        results: [],
        output: {
          directory: './swarm-runs/test',
          files: ['report.md', 'summary.json']
        }
      })
    }));
    
    ensureGracefulExit.mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    test('should initialize with default config', () => {
      const bridge = new ExecutionBridge();
      expect(bridge.config).toHaveProperty('claudeApiKey', 'test-key');
      expect(bridge.config).toHaveProperty('headless', false);
      expect(bridge.activeExecutions).toBeInstanceOf(Map);
    });

    test('should merge custom config', () => {
      const customConfig = { 
        maxAgents: 10, 
        timeout: 60000,
        headless: true 
      };
      const bridge = new ExecutionBridge(customConfig);
      expect(bridge.config.maxAgents).toBe(10);
      expect(bridge.config.timeout).toBe(60000);
      expect(bridge.config.headless).toBe(true);
    });
  });

  describe('executeSwarm', () => {
    test('should execute swarm successfully with headless detection', async () => {
      helpers.isHeadless.mockReturnValue(true);
      
      const result = await bridge.executeSwarm('Build a REST API', { executor: true });
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚀 ExecutionBridge: Starting swarm execution')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📋 Objective: Build a REST API')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🎯 Mode: Headless')
      );
      
      expect(result).toMatchObject({
        success: true,
        mode: 'headless-api',
        swarmId: 'swarm_test123',
        objective: 'test objective'
      });
      
      expect(RealSwarmExecutor).toHaveBeenCalledWith({
        apiKey: 'test-key',
        strategy: 'auto',
        maxAgents: undefined,
        outputDir: expect.stringContaining('exec_test123')
      });
      
      expect(ensureGracefulExit).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
        expect.objectContaining({ exitOnComplete: true })
      );
    });

    test('should handle missing objective', async () => {
      await expect(bridge.executeSwarm('', {})).rejects.toThrow();
    });

    test('should route to headless mode when executor flag is set', async () => {
      const result = await bridge.executeSwarm('Test task', { executor: true });
      
      expect(result.mode).toBe('headless-api');
      expect(RealSwarmExecutor).toHaveBeenCalled();
    });

    test('should handle API key validation', async () => {
      bridge.config.claudeApiKey = undefined;
      
      await expect(
        bridge.executeSwarm('Test task', { executor: true })
      ).rejects.toThrow('Real agent execution requires a valid ANTHROPIC_API_KEY');
    });

    test('should handle execution errors gracefully', async () => {
      const error = new Error('Execution failed');
      RealSwarmExecutor.mockImplementation(() => ({
        execute: jest.fn().mockRejectedValue(error)
      }));
      
      await expect(
        bridge.executeSwarm('Test task', { executor: true })
      ).rejects.toThrow('Execution failed');
      
      expect(ensureGracefulExit).toHaveBeenCalledWith(
        expect.objectContaining({ 
          success: false, 
          error: 'Execution failed' 
        }),
        expect.any(Object)
      );
    });

    test('should respect custom strategy and max agents', async () => {
      await bridge.executeSwarm('Research task', { 
        executor: true,
        strategy: 'research',
        'max-agents': '3'
      });
      
      expect(RealSwarmExecutor).toHaveBeenCalledWith(
        expect.objectContaining({
          strategy: 'research',
          maxAgents: 3
        })
      );
    });

    test('should handle timeout configuration', async () => {
      await bridge.executeSwarm('Long task', { 
        executor: true,
        timeout: '300'
      });
      
      expect(helpers.timeout).toHaveBeenCalledWith(
        expect.any(Promise),
        300000, // converted to ms
        'Swarm execution timed out'
      );
    });
  });

  describe('createExecutionContext', () => {
    test('should create valid execution context', () => {
      const objective = 'Test objective';
      const flags = {
        strategy: 'development',
        mode: 'distributed',
        'max-agents': '8',
        timeout: '600'
      };
      
      const context = bridge.createExecutionContext(objective, flags, 'exec_123');
      
      expect(context).toMatchObject({
        id: 'exec_123',
        objective: 'Test objective',
        flags: flags,
        strategy: 'development',
        mode: 'distributed',
        maxAgents: 8,
        timeout: 600000,
        environment: {
          headless: false,
          apiKey: 'test-key'
        }
      });
      
      expect(context.startTime).toBeGreaterThan(0);
    });

    test('should use default values when flags not provided', () => {
      const context = bridge.createExecutionContext('Test', {}, 'exec_123');
      
      expect(context.strategy).toBe('auto');
      expect(context.mode).toBe('centralized');
      expect(context.maxAgents).toBeUndefined();
    });
  });

  describe('executeHeadless', () => {
    test('should execute in headless mode successfully', async () => {
      const context = {
        id: 'exec_123',
        objective: 'Build API',
        strategy: 'development',
        flags: {},
        timeout: 60000
      };
      
      const result = await bridge.executeHeadless(context);
      
      expect(consoleLogSpy).toHaveBeenCalledWith('🤖 Executing in headless mode...');
      expect(consoleLogSpy).toHaveBeenCalledWith('🔗 Using real Claude API swarm execution...');
      
      expect(result).toMatchObject({
        success: true,
        mode: 'headless-api',
        swarmId: 'swarm_test123'
      });
    });

    test('should fall back to mock when allow-mock flag is set', async () => {
      bridge.config.claudeApiKey = undefined;
      
      const context = {
        id: 'exec_123',
        objective: 'Test',
        flags: { 'allow-mock': true },
        timeout: 60000
      };
      
      const result = await bridge.executeHeadless(context);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Using mock execution')
      );
      expect(result.mode).toBe('enhanced-mock');
    });
  });

  describe('getActiveExecutions', () => {
    test('should return active executions', async () => {
      // Start an execution
      const promise = bridge.executeSwarm('Test task', { executor: true });
      
      // Check active executions while running
      const active = bridge.getActiveExecutions();
      expect(active).toHaveLength(1);
      expect(active[0]).toMatchObject({
        objective: 'Test task',
        strategy: 'auto',
        mode: 'centralized'
      });
      
      // Wait for completion
      await promise;
      
      // Should be empty after completion
      expect(bridge.getActiveExecutions()).toHaveLength(0);
    });
  });

  describe('stopExecution', () => {
    test('should stop active execution', async () => {
      // Start an execution
      const promise = bridge.executeSwarm('Test task', { executor: true });
      const active = bridge.getActiveExecutions();
      const executionId = active[0].id;
      
      // Stop it
      const result = await bridge.stopExecution(executionId);
      expect(result).toMatchObject({
        success: true,
        message: expect.stringContaining('stopped')
      });
      
      // Should be removed from active
      expect(bridge.getActiveExecutions()).toHaveLength(0);
      
      await promise;
    });

    test('should handle stopping non-existent execution', async () => {
      const result = await bridge.stopExecution('non-existent');
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining('not found')
      });
    });
  });
});

describe('basicSwarmNew', () => {
  let consoleLogSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    jest.clearAllMocks();
    
    // Mock ExecutionBridge for basicSwarmNew tests
    ExecutionBridge.prototype.executeSwarm = jest.fn().mockResolvedValue({
      success: true,
      mode: 'headless-api'
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  test('should route to ExecutionBridge', async () => {
    const args = ['Build a REST API'];
    const flags = { executor: true, strategy: 'development' };
    
    const result = await basicSwarmNew(args, flags);
    
    expect(consoleLogSpy).toHaveBeenCalledWith('🔄 BasicSwarmNew: Routing to ExecutionBridge...');
    expect(ExecutionBridge.prototype.executeSwarm).toHaveBeenCalledWith(
      'Build a REST API',
      flags
    );
    expect(result).toMatchObject({ success: true });
  });

  test('should handle empty args', async () => {
    await expect(basicSwarmNew([], {})).rejects.toThrow(
      'No objective provided. Usage: swarm <objective>'
    );
  });

  test('should join multiple args into objective', async () => {
    const args = ['Build', 'a', 'REST', 'API'];
    await basicSwarmNew(args, {});
    
    expect(ExecutionBridge.prototype.executeSwarm).toHaveBeenCalledWith(
      'Build a REST API',
      {}
    );
  });

  test('should handle whitespace in args', async () => {
    const args = ['  Build  ', '  API  '];
    await basicSwarmNew(args, {});
    
    expect(ExecutionBridge.prototype.executeSwarm).toHaveBeenCalledWith(
      'Build API',
      {}
    );
  });
});