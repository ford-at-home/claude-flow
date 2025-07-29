/**
 * Tests for helpers.js utility functions
 */

import { jest } from '@jest/globals';
import {
  generateId,
  isHeadless,
  getEnvironmentConfig,
  timeout,
  sleep,
  formatDuration,
  sanitizeForFilename,
  parseJsonSafe,
  deepMerge
} from '../helpers.js';

describe('helpers', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env;
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('generateId', () => {
    test('should generate unique IDs with prefix', () => {
      const id1 = generateId('test');
      const id2 = generateId('test');
      
      expect(id1).toMatch(/^test_[a-z0-9]+_[a-z0-9]+$/);
      expect(id2).toMatch(/^test_[a-z0-9]+_[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    test('should generate ID without prefix', () => {
      const id = generateId();
      
      expect(id).toMatch(/^[a-z0-9]+_[a-z0-9]+$/);
      expect(id).not.toContain('undefined');
    });

    test('should handle empty string prefix', () => {
      const id = generateId('');
      
      expect(id).toMatch(/^[a-z0-9]+_[a-z0-9]+$/);
    });
  });

  describe('isHeadless', () => {
    test('should detect headless environment variables', () => {
      process.env.CLAUDE_FLOW_HEADLESS = 'true';
      expect(isHeadless()).toBe(true);
      
      delete process.env.CLAUDE_FLOW_HEADLESS;
      process.env.CI = 'true';
      expect(isHeadless()).toBe(true);
      
      delete process.env.CI;
      process.env.GITHUB_ACTIONS = 'true';
      expect(isHeadless()).toBe(true);
      
      delete process.env.GITHUB_ACTIONS;
      process.env.DOCKER_CONTAINER = 'true';
      expect(isHeadless()).toBe(true);
    });

    test('should detect non-TTY environment', () => {
      const originalTTY = process.stdout.isTTY;
      
      process.stdout.isTTY = false;
      expect(isHeadless()).toBe(true);
      
      process.stdout.isTTY = true;
      delete process.env.CLAUDE_FLOW_HEADLESS;
      delete process.env.CI;
      expect(isHeadless()).toBe(false);
      
      process.stdout.isTTY = originalTTY;
    });

    test('should handle missing stdout', () => {
      const originalStdout = process.stdout;
      process.stdout = undefined;
      
      expect(isHeadless()).toBe(true);
      
      process.stdout = originalStdout;
    });

    test('should return false in interactive environment', () => {
      delete process.env.CLAUDE_FLOW_HEADLESS;
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      delete process.env.DOCKER_CONTAINER;
      
      const originalTTY = process.stdout.isTTY;
      process.stdout.isTTY = true;
      
      expect(isHeadless()).toBe(false);
      
      process.stdout.isTTY = originalTTY;
    });
  });

  describe('getEnvironmentConfig', () => {
    test('should return environment configuration', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
      process.env.CLAUDE_FLOW_HEADLESS = 'true';
      process.env.CLAUDE_API_ENDPOINT = 'https://custom.api.com';
      process.env.CLAUDE_MODEL = 'claude-3-opus';
      process.env.CLAUDE_FLOW_EXIT_ON_COMPLETE = 'false';
      process.env.CLAUDE_FLOW_MAX_AGENTS = '10';
      process.env.CLAUDE_FLOW_TIMEOUT = '300000';
      
      const config = getEnvironmentConfig();
      
      expect(config).toMatchObject({
        claudeApiKey: 'test-key-123',
        claudeApiEndpoint: 'https://custom.api.com',
        claudeModel: 'claude-3-opus',
        headless: true,
        exitOnComplete: false,
        maxAgents: 10,
        timeout: 300000
      });
    });

    test('should use defaults for missing values', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_API_ENDPOINT;
      
      const config = getEnvironmentConfig();
      
      expect(config.claudeApiKey).toBeUndefined();
      expect(config.claudeApiEndpoint).toBe('https://api.anthropic.com/v1/messages');
      expect(config.claudeModel).toBe('claude-3-5-sonnet-20241022');
    });

    test('should handle boolean string conversion', () => {
      process.env.CLAUDE_FLOW_HEADLESS = 'false';
      process.env.CLAUDE_FLOW_EXIT_ON_COMPLETE = 'true';
      
      const config = getEnvironmentConfig();
      
      expect(config.headless).toBe(false);
      expect(config.exitOnComplete).toBe(true);
    });

    test('should handle invalid number values', () => {
      process.env.CLAUDE_FLOW_MAX_AGENTS = 'invalid';
      process.env.CLAUDE_FLOW_TIMEOUT = 'not-a-number';
      
      const config = getEnvironmentConfig();
      
      expect(config.maxAgents).toBeUndefined();
      expect(config.timeout).toBe(300000); // default
    });
  });

  describe('timeout', () => {
    jest.useFakeTimers();

    test('should resolve promise within timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await timeout(promise, 1000, 'Timeout error');
      
      expect(result).toBe('success');
    });

    test('should reject on timeout', async () => {
      const promise = new Promise(() => {}); // Never resolves
      const timeoutPromise = timeout(promise, 100, 'Custom timeout message');
      
      jest.advanceTimersByTime(150);
      
      await expect(timeoutPromise).rejects.toThrow('Custom timeout message');
    });

    test('should clear timeout on success', async () => {
      const promise = Promise.resolve('quick');
      await timeout(promise, 1000, 'Should not timeout');
      
      // Advance time past timeout
      jest.advanceTimersByTime(2000);
      
      // No additional errors should occur
    });

    jest.useRealTimers();
  });

  describe('sleep', () => {
    jest.useFakeTimers();

    test('should delay for specified time', async () => {
      const startTime = Date.now();
      const sleepPromise = sleep(1000);
      
      jest.advanceTimersByTime(1000);
      await sleepPromise;
      
      // Time should have advanced
      expect(Date.now()).toBe(startTime + 1000);
    });

    test('should handle zero delay', async () => {
      await sleep(0);
      // Should complete immediately
    });

    jest.useRealTimers();
  });

  describe('formatDuration', () => {
    test('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    test('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    test('should format minutes', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
      expect(formatDuration(90000)).toBe('1m 30s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });

    test('should handle zero', () => {
      expect(formatDuration(0)).toBe('0ms');
    });

    test('should handle negative values', () => {
      expect(formatDuration(-1000)).toBe('-1000ms');
    });
  });

  describe('sanitizeForFilename', () => {
    test('should replace invalid characters', () => {
      expect(sanitizeForFilename('hello/world')).toBe('hello-world');
      expect(sanitizeForFilename('test\\file')).toBe('test-file');
      expect(sanitizeForFilename('my:file*name')).toBe('my-file-name');
      expect(sanitizeForFilename('file?name<test>')).toBe('file-name-test-');
      expect(sanitizeForFilename('pipe|test"quotes"')).toBe('pipe-test-quotes-');
    });

    test('should handle special characters', () => {
      expect(sanitizeForFilename('file.name.txt')).toBe('file.name.txt');
      expect(sanitizeForFilename('under_score-dash')).toBe('under_score-dash');
      expect(sanitizeForFilename('spaces in name')).toBe('spaces in name');
    });

    test('should handle empty string', () => {
      expect(sanitizeForFilename('')).toBe('');
    });

    test('should handle all invalid characters', () => {
      expect(sanitizeForFilename('/:*?"<>|\\')).toBe('---------');
    });
  });

  describe('parseJsonSafe', () => {
    test('should parse valid JSON', () => {
      expect(parseJsonSafe('{"key": "value"}')).toEqual({ key: 'value' });
      expect(parseJsonSafe('[1, 2, 3]')).toEqual([1, 2, 3]);
      expect(parseJsonSafe('null')).toBe(null);
      expect(parseJsonSafe('true')).toBe(true);
      expect(parseJsonSafe('123')).toBe(123);
    });

    test('should return default for invalid JSON', () => {
      expect(parseJsonSafe('invalid json', {})).toEqual({});
      expect(parseJsonSafe('{broken', null)).toBe(null);
      expect(parseJsonSafe('', [])).toEqual([]);
    });

    test('should return undefined by default for invalid JSON', () => {
      expect(parseJsonSafe('not json')).toBeUndefined();
      expect(parseJsonSafe('{incomplete')).toBeUndefined();
    });

    test('should handle edge cases', () => {
      expect(parseJsonSafe(null, 'default')).toBe('default');
      expect(parseJsonSafe(undefined, 'default')).toBe('default');
      expect(parseJsonSafe('', 'default')).toBe('default');
    });
  });

  describe('deepMerge', () => {
    test('should merge simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      
      expect(deepMerge(target, source)).toEqual({
        a: 1,
        b: 3,
        c: 4
      });
    });

    test('should merge nested objects', () => {
      const target = {
        config: {
          api: { key: 'old', url: 'http://old.com' },
          timeout: 1000
        }
      };
      
      const source = {
        config: {
          api: { key: 'new' },
          debug: true
        }
      };
      
      expect(deepMerge(target, source)).toEqual({
        config: {
          api: { key: 'new', url: 'http://old.com' },
          timeout: 1000,
          debug: true
        }
      });
    });

    test('should handle arrays', () => {
      const target = { items: [1, 2], name: 'test' };
      const source = { items: [3, 4, 5], tags: ['a', 'b'] };
      
      expect(deepMerge(target, source)).toEqual({
        items: [3, 4, 5], // Arrays are replaced, not merged
        name: 'test',
        tags: ['a', 'b']
      });
    });

    test('should handle null and undefined', () => {
      expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
      expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
      expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
      expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 });
    });

    test('should not modify original objects', () => {
      const target = { a: { b: 1 } };
      const source = { a: { c: 2 } };
      const targetCopy = JSON.parse(JSON.stringify(target));
      const sourceCopy = JSON.parse(JSON.stringify(source));
      
      deepMerge(target, source);
      
      expect(target).toEqual(targetCopy);
      expect(source).toEqual(sourceCopy);
    });

    test('should handle empty objects', () => {
      expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 });
      expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 });
      expect(deepMerge({}, {})).toEqual({});
    });
  });
});