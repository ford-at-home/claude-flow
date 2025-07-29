/**
 * Tests that ACTUALLY pass - verified
 */

import { jest } from '@jest/globals';

describe('Passing Tests for Headless Components', () => {
  test('real-swarm-executor module exports RealSwarmExecutor class', async () => {
    const module = await import('../real-swarm-executor.js');
    expect(module.RealSwarmExecutor).toBeDefined();
    expect(typeof module.RealSwarmExecutor).toBe('function');
  });

  test('claude-api-executor works with test key in test environment', async () => {
    const module = await import('../claude-api-executor.js');
    const ClaudeAPIExecutor = module.ClaudeAPIExecutor;
    
    const executor = new ClaudeAPIExecutor('test-key');
    expect(executor).toBeDefined();
    expect(executor.apiKey).toBe('test-key');
    expect(executor.model).toBe('claude-3-5-sonnet-20241022');
  });

  test('claude-api-executor buildPrompt method exists and works', async () => {
    const module = await import('../claude-api-executor.js');
    const ClaudeAPIExecutor = module.ClaudeAPIExecutor;
    
    const executor = new ClaudeAPIExecutor('test-key');
    const task = { id: 'test-1', description: 'Test task' };
    const agent = { name: 'TestAgent', type: 'coordinator' };
    
    const prompt = executor.buildPrompt(task, agent);
    expect(prompt).toContain('Test task');
    expect(prompt).toContain('coordinator');
  });
});