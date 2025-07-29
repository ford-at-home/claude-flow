/**
 * Tests for claude-api-executor.js
 */

import { jest } from '@jest/globals';
import { ClaudeAPIExecutor } from '../claude-api-executor.js';

// Mock fetch
global.fetch = jest.fn();

describe('ClaudeAPIExecutor', () => {
  let executor;
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    executor = new ClaudeAPIExecutor({
      apiKey: 'test-api-key',
      apiEndpoint: 'https://api.anthropic.com/v1/messages',
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 1024,
      temperature: 0.7
    });
    
    // Reset fetch mock
    global.fetch.mockReset();
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'msg_test123',
        content: [{ 
          type: 'text', 
          text: 'Test response from Claude' 
        }],
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      })
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    test('should initialize with provided config', () => {
      expect(executor.apiKey).toBe('test-api-key');
      expect(executor.apiEndpoint).toBe('https://api.anthropic.com/v1/messages');
      expect(executor.model).toBe('claude-3-5-sonnet-20241022');
      expect(executor.maxTokens).toBe(1024);
      expect(executor.temperature).toBe(0.7);
    });

    test('should use default values when not provided', () => {
      const defaultExecutor = new ClaudeAPIExecutor({ apiKey: 'key' });
      expect(defaultExecutor.apiEndpoint).toBe('https://api.anthropic.com/v1/messages');
      expect(defaultExecutor.model).toBe('claude-3-5-sonnet-20241022');
      expect(defaultExecutor.maxTokens).toBe(1024);
      expect(defaultExecutor.temperature).toBe(0.7);
    });

    test('should throw error if API key is missing', () => {
      expect(() => new ClaudeAPIExecutor({})).toThrow('API key is required');
    });
  });

  describe('callClaudeAPI', () => {
    test('should make successful API call', async () => {
      const prompt = 'Test prompt';
      const response = await executor.callClaudeAPI(prompt);
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'test-api-key',
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1024,
            temperature: 0.7,
            messages: [{
              role: 'user',
              content: prompt
            }]
          })
        }
      );
      
      expect(response).toMatchObject({
        id: 'msg_test123',
        content: [{ type: 'text', text: 'Test response from Claude' }],
        usage: { input_tokens: 100, output_tokens: 50 }
      });
    });

    test('should handle API errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: async () => 'Rate limit exceeded'
      });
      
      await expect(executor.callClaudeAPI('test')).rejects.toThrow(
        'Claude API error: 429 - Rate limit exceeded'
      );
    });

    test('should handle network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));
      
      await expect(executor.callClaudeAPI('test')).rejects.toThrow('Network error');
    });

    test('should handle invalid responses', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          // Missing content
          id: 'msg_test',
          usage: { input_tokens: 10, output_tokens: 5 }
        })
      });
      
      await expect(executor.callClaudeAPI('test')).rejects.toThrow(
        'Invalid API response: missing content'
      );
    });
  });

  describe('executeTask', () => {
    const mockTask = {
      id: 'task_123',
      description: 'Create a hello world function'
    };

    const mockAgent = {
      id: 'agent_456',
      name: 'Developer',
      type: 'developer'
    };

    test('should execute task successfully', async () => {
      const startTime = Date.now();
      const result = await executor.executeTask(mockTask, mockAgent);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🤖 Agent Developer executing task task_123')
      );
      
      expect(result).toMatchObject({
        taskId: 'task_123',
        agentId: 'agent_456',
        agentName: 'Developer',
        agentType: 'developer',
        output: 'Test response from Claude',
        success: true,
        tokensUsed: 150
      });
      
      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThan(Date.now() - startTime + 1000);
      
      // Check the prompt includes agent personality
      const callArg = global.fetch.mock.calls[0][1].body;
      const body = JSON.parse(callArg);
      expect(body.messages[0].content).toContain('Developer');
      expect(body.messages[0].content).toContain('Create a hello world function');
    });

    test('should handle task execution errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('API error'));
      
      const result = await executor.executeTask(mockTask, mockAgent);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Task task_123 failed:'),
        'API error'
      );
      
      expect(result).toMatchObject({
        taskId: 'task_123',
        agentId: 'agent_456',
        success: false,
        error: 'API error',
        tokensUsed: 0
      });
    });

    test('should respect agent type in prompt', async () => {
      const researchAgent = {
        id: 'agent_789',
        name: 'Researcher',
        type: 'researcher'
      };
      
      await executor.executeTask(mockTask, researchAgent);
      
      const callArg = global.fetch.mock.calls[0][1].body;
      const body = JSON.parse(callArg);
      expect(body.messages[0].content).toContain('research-focused');
      expect(body.messages[0].content).toContain('Researcher');
    });

    test('should include coordinator personality', async () => {
      const coordinatorAgent = {
        id: 'agent_000',
        name: 'Coordinator',
        type: 'coordinator'
      };
      
      await executor.executeTask(mockTask, coordinatorAgent);
      
      const callArg = global.fetch.mock.calls[0][1].body;
      const body = JSON.parse(callArg);
      expect(body.messages[0].content).toContain('strategic planning');
      expect(body.messages[0].content).toContain('break down complex');
    });
  });

  describe('rate limiting', () => {
    test('should track token usage', async () => {
      await executor.callClaudeAPI('test 1');
      await executor.callClaudeAPI('test 2');
      
      expect(global.fetch).toHaveBeenCalledTimes(2);
      
      // Token usage would be tracked internally
      // In a real implementation, you might expose getTotalTokens()
    });
  });

  describe('custom configuration', () => {
    test('should use custom model', async () => {
      const customExecutor = new ClaudeAPIExecutor({
        apiKey: 'key',
        model: 'claude-3-opus-20240229'
      });
      
      await customExecutor.callClaudeAPI('test');
      
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.model).toBe('claude-3-opus-20240229');
    });

    test('should use custom temperature', async () => {
      const customExecutor = new ClaudeAPIExecutor({
        apiKey: 'key',
        temperature: 0.2
      });
      
      await customExecutor.callClaudeAPI('test');
      
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.2);
    });

    test('should use custom max tokens', async () => {
      const customExecutor = new ClaudeAPIExecutor({
        apiKey: 'key',
        maxTokens: 2048
      });
      
      await customExecutor.callClaudeAPI('test');
      
      const body = JSON.parse(global.fetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(2048);
    });
  });

  describe('error scenarios', () => {
    test('should handle 401 unauthorized', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Invalid API key'
      });
      
      await expect(executor.callClaudeAPI('test')).rejects.toThrow(
        'Claude API error: 401 - Invalid API key'
      );
    });

    test('should handle 500 server error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error'
      });
      
      await expect(executor.callClaudeAPI('test')).rejects.toThrow(
        'Claude API error: 500 - Internal server error'
      );
    });

    test('should handle JSON parse errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => { throw new Error('Invalid JSON'); }
      });
      
      await expect(executor.callClaudeAPI('test')).rejects.toThrow('Invalid JSON');
    });
  });
});