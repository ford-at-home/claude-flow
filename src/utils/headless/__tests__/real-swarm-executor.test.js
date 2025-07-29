/**
 * Tests for real-swarm-executor.js
 */

import { jest } from '@jest/globals';
import { RealSwarmExecutor } from '../real-swarm-executor.js';
import { ClaudeAPIExecutor } from '../claude-api-executor.js';
import fs from 'fs-extra';
import path from 'path';

// Mock dependencies
jest.mock('../claude-api-executor.js');
jest.mock('fs-extra');

describe('RealSwarmExecutor', () => {
  let executor;
  let consoleLogSpy;
  let consoleErrorSpy;
  let mockApiExecutor;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Mock API executor
    mockApiExecutor = {
      callClaudeAPI: jest.fn().mockResolvedValue({
        content: [{ text: 'API response' }]
      }),
      executeTask: jest.fn().mockResolvedValue({
        taskId: 'task_123',
        agentId: 'agent_456',
        output: 'Task completed',
        success: true,
        duration: 1000,
        tokensUsed: 100
      })
    };
    
    ClaudeAPIExecutor.mockImplementation(() => mockApiExecutor);
    
    // Mock fs operations
    fs.ensureDir.mockResolvedValue(undefined);
    fs.writeFile.mockResolvedValue(undefined);
    
    executor = new RealSwarmExecutor({
      apiKey: 'test-key',
      strategy: 'development',
      maxAgents: 5,
      outputDir: './test-output',
      batchSize: 3,
      rateLimitDelay: 100
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should initialize with provided config', () => {
      expect(executor.apiKey).toBe('test-key');
      expect(executor.strategy).toBe('development');
      expect(executor.maxAgents).toBe(5);
      expect(executor.batchSize).toBe(3);
      expect(executor.rateLimitDelay).toBe(100);
      expect(executor.swarmId).toMatch(/^swarm_/);
    });

    test('should use default values', () => {
      const defaultExecutor = new RealSwarmExecutor({ apiKey: 'key' });
      expect(defaultExecutor.strategy).toBe('auto');
      expect(defaultExecutor.maxAgents).toBe(5);
      expect(defaultExecutor.batchSize).toBe(3);
      expect(defaultExecutor.rateLimitDelay).toBe(2000);
    });

    test('should throw error without API key', () => {
      expect(() => new RealSwarmExecutor({})).toThrow('API key is required');
    });
  });

  describe('execute', () => {
    const objective = 'Build a REST API';

    test('should execute full swarm lifecycle', async () => {
      // Mock decompose response
      mockApiExecutor.callClaudeAPI.mockResolvedValueOnce({
        content: [{
          text: `Tasks:
1. Design API endpoints
2. Implement authentication
3. Create database schema
4. Build CRUD operations
5. Add validation`
        }]
      });

      // Mock synthesis response
      mockApiExecutor.callClaudeAPI.mockResolvedValueOnce({
        content: [{
          text: 'Comprehensive REST API implementation completed with all features.'
        }]
      });

      const result = await executor.execute(objective);

      // Verify phases
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🚀 Starting REAL swarm execution')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📌 Phase 1: Initializing agents...')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📌 Phase 2: Decomposing objective into tasks...')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📌 Phase 3: Executing tasks with AI agents...')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📌 Phase 4: Synthesizing results...')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📌 Phase 5: Generating output...')
      );

      // Verify result
      expect(result).toMatchObject({
        success: true,
        swarmId: executor.swarmId,
        objective,
        strategy: 'development',
        agents: 5,
        tasks: 5,
        synthesis: expect.stringContaining('Comprehensive REST API')
      });

      expect(result.duration).toBeGreaterThan(0);
      expect(result.output.directory).toContain('test-output');
    });

    test('should handle task decomposition errors', async () => {
      mockApiExecutor.callClaudeAPI.mockRejectedValueOnce(
        new Error('API error during decomposition')
      );

      await expect(executor.execute(objective)).rejects.toThrow(
        'API error during decomposition'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to decompose objective:')
      );
    });

    test('should handle empty task list', async () => {
      mockApiExecutor.callClaudeAPI.mockResolvedValueOnce({
        content: [{ text: 'No tasks found' }]
      });

      await expect(executor.execute(objective)).rejects.toThrow(
        'No tasks generated from objective'
      );
    });
  });

  describe('initializeAgents', () => {
    test('should initialize development strategy agents', async () => {
      const agents = await executor.initializeAgents();

      expect(agents).toHaveLength(5);
      expect(agents.map(a => a.type)).toEqual([
        'coordinator',
        'architect', 
        'developer',
        'tester',
        'reviewer'
      ]);

      agents.forEach(agent => {
        expect(agent).toMatchObject({
          id: expect.stringMatching(/^agent_/),
          name: expect.any(String),
          type: expect.any(String),
          status: 'ready'
        });
      });
    });

    test('should initialize research strategy agents', async () => {
      executor.strategy = 'research';
      executor.maxAgents = 3;
      
      const agents = await executor.initializeAgents();

      expect(agents).toHaveLength(3);
      expect(agents[0].type).toBe('researcher');
      expect(agents[0].name).toBe('Lead Researcher');
    });

    test('should initialize analysis strategy agents', async () => {
      executor.strategy = 'analysis';
      
      const agents = await executor.initializeAgents();

      expect(agents).toHaveLength(3);
      expect(agents[0].type).toBe('analyst');
    });
  });

  describe('decomposeObjective', () => {
    test('should decompose objective into tasks', async () => {
      const objective = 'Build authentication system';
      
      mockApiExecutor.callClaudeAPI.mockResolvedValueOnce({
        content: [{
          text: `Based on the objective, here are the tasks:

1. Design authentication flow and requirements
2. Implement user registration endpoint
3. Create login functionality with JWT
4. Add password reset feature
5. Implement session management
6. Write comprehensive tests`
        }]
      });

      const tasks = await executor.decomposeObjective(objective);

      expect(tasks).toHaveLength(6);
      expect(tasks[0]).toMatchObject({
        id: expect.stringMatching(/^task_/),
        description: 'Design authentication flow and requirements',
        status: 'pending'
      });
      
      expect(mockApiExecutor.callClaudeAPI).toHaveBeenCalledWith(
        expect.stringContaining('Break down the following objective')
      );
    });

    test('should handle malformed task response', async () => {
      mockApiExecutor.callClaudeAPI.mockResolvedValueOnce({
        content: [{
          text: 'This is not a proper task list format'
        }]
      });

      const tasks = await executor.decomposeObjective('Test');
      expect(tasks).toHaveLength(0);
    });

    test('should extract tasks with various formats', async () => {
      mockApiExecutor.callClaudeAPI.mockResolvedValueOnce({
        content: [{
          text: `Tasks to complete:
- First task
* Second task  
• Third task
1) Fourth task
2. Fifth task`
        }]
      });

      const tasks = await executor.decomposeObjective('Test');
      expect(tasks).toHaveLength(5);
    });
  });

  describe('executeTasks', () => {
    beforeEach(() => {
      executor.agents = [
        { id: 'agent_1', name: 'Agent 1', type: 'developer', status: 'ready' },
        { id: 'agent_2', name: 'Agent 2', type: 'tester', status: 'ready' },
        { id: 'agent_3', name: 'Agent 3', type: 'architect', status: 'ready' }
      ];
      
      executor.tasks = [
        { id: 'task_1', description: 'Task 1', status: 'pending' },
        { id: 'task_2', description: 'Task 2', status: 'pending' },
        { id: 'task_3', description: 'Task 3', status: 'pending' },
        { id: 'task_4', description: 'Task 4', status: 'pending' }
      ];
    });

    test('should execute tasks in batches', async () => {
      const results = await executor.executeTasks();

      expect(results).toHaveLength(4);
      expect(mockApiExecutor.executeTask).toHaveBeenCalledTimes(4);
      
      // Verify batching
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📦 Executing batch 1/2')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('📦 Executing batch 2/2')
      );
      
      // Verify rate limit delay
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⏳ Rate limit delay...')
      );
    });

    test('should handle task execution failures', async () => {
      mockApiExecutor.executeTask
        .mockResolvedValueOnce({
          taskId: 'task_1',
          success: true,
          output: 'Success',
          duration: 1000,
          tokensUsed: 100
        })
        .mockResolvedValueOnce({
          taskId: 'task_2',
          success: false,
          error: 'Task failed',
          duration: 500,
          tokensUsed: 50
        });

      executor.tasks = executor.tasks.slice(0, 2);
      const results = await executor.executeTasks();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      
      // Should still mark as completed
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Completed 2/2 tasks')
      );
    });

    test('should assign tasks to agents round-robin', async () => {
      await executor.executeTasks();

      // Check task assignments
      const calls = mockApiExecutor.executeTask.mock.calls;
      expect(calls[0][1].id).toBe('agent_1'); // Task 1 -> Agent 1
      expect(calls[1][1].id).toBe('agent_2'); // Task 2 -> Agent 2
      expect(calls[2][1].id).toBe('agent_3'); // Task 3 -> Agent 3
      expect(calls[3][1].id).toBe('agent_1'); // Task 4 -> Agent 1 (round-robin)
    });
  });

  describe('synthesizeResults', () => {
    test('should synthesize results successfully', async () => {
      executor.results = [
        { taskId: 'task_1', output: 'Designed API endpoints', success: true },
        { taskId: 'task_2', output: 'Implemented authentication', success: true },
        { taskId: 'task_3', output: 'Created database schema', success: true }
      ];

      mockApiExecutor.callClaudeAPI.mockResolvedValueOnce({
        content: [{
          text: 'Synthesized solution: Complete REST API with authentication and database integration.'
        }]
      });

      const synthesis = await executor.synthesizeResults('Build REST API');

      expect(synthesis).toContain('Synthesized solution');
      expect(mockApiExecutor.callClaudeAPI).toHaveBeenCalledWith(
        expect.stringContaining('Task 1:')
      );
    });

    test('should handle synthesis errors gracefully', async () => {
      executor.results = [];
      mockApiExecutor.callClaudeAPI.mockRejectedValueOnce(new Error('Synthesis failed'));

      const synthesis = await executor.synthesizeResults('Test');
      
      expect(synthesis).toContain('Error synthesizing results');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error during synthesis:')
      );
    });
  });

  describe('generateOutput', () => {
    test('should generate output files', async () => {
      executor.objective = 'Test objective';
      executor.agents = [{ id: 'agent_1', name: 'Test Agent' }];
      executor.tasks = [{ id: 'task_1', description: 'Test task' }];
      executor.results = [{ taskId: 'task_1', output: 'Test output' }];
      executor.synthesis = 'Test synthesis';

      await executor.generateOutput();

      // Verify directories created
      expect(fs.ensureDir).toHaveBeenCalledWith(
        expect.stringContaining('test-output')
      );

      // Verify files written
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('summary.json'),
        expect.any(String)
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('results.json'),
        expect.any(String)
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('report.md'),
        expect.any(String)
      );
    });

    test('should include all data in summary.json', async () => {
      executor.objective = 'Build API';
      executor.synthesis = 'API built successfully';
      
      await executor.generateOutput();

      const summaryCall = fs.writeFile.mock.calls.find(
        call => call[0].includes('summary.json')
      );
      const summaryData = JSON.parse(summaryCall[1]);

      expect(summaryData).toMatchObject({
        swarmId: executor.swarmId,
        objective: 'Build API',
        strategy: 'development',
        timestamp: expect.any(String),
        success: true
      });
    });

    test('should generate markdown report', async () => {
      executor.objective = 'Test';
      executor.tasks = [{ id: 'task_1', description: 'Test task', status: 'completed' }];
      executor.results = [{ 
        taskId: 'task_1', 
        output: 'Task completed',
        agentName: 'Test Agent',
        duration: 1000,
        tokensUsed: 100
      }];

      await executor.generateOutput();

      const reportCall = fs.writeFile.mock.calls.find(
        call => call[0].includes('report.md')
      );
      const report = reportCall[1];

      expect(report).toContain('# Swarm Execution Results');
      expect(report).toContain('Test task - completed');
      expect(report).toContain('Task completed');
      expect(report).toContain('Duration:** 1000ms');
    });
  });

  describe('error handling', () => {
    test('should handle file system errors', async () => {
      fs.ensureDir.mockRejectedValueOnce(new Error('Permission denied'));
      
      // Should not throw, but log error
      await executor.generateOutput();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error generating output:')
      );
    });

    test('should continue execution if a single task fails', async () => {
      executor.agents = [{ id: 'agent_1', name: 'Agent', type: 'developer' }];
      executor.tasks = [
        { id: 'task_1', description: 'Task 1' },
        { id: 'task_2', description: 'Task 2' }
      ];

      mockApiExecutor.executeTask
        .mockRejectedValueOnce(new Error('Task 1 failed'))
        .mockResolvedValueOnce({
          taskId: 'task_2',
          success: true,
          output: 'Task 2 success',
          duration: 1000,
          tokensUsed: 100
        });

      const results = await executor.executeTasks();
      
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(false);
      expect(results[1].success).toBe(true);
    });
  });
});