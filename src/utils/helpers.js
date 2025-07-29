/**
 * Utility helper functions for Claude-Flow (JavaScript version)
 * This fixes the missing helpers.js import error in swarm-executor.js
 */

import { promisify } from 'util';
import { exec } from 'child_process';

/**
 * Executes a command asynchronously and returns the result
 */
export const execAsync = promisify(exec);

/**
 * Simple calculator function that adds two numbers
 */
export function add(a, b) {
  return a + b;
}

/**
 * Simple hello world function
 */
export function helloWorld() {
  return 'Hello, World!';
}

/**
 * Generates a unique identifier
 */
export function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}

/**
 * Creates a timeout promise that rejects after the specified time
 */
export function timeout(promise, ms, message) {
  let timeoutId;
  let completed = false;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (!completed) {
        completed = true;
        reject(new Error(message || 'Operation timed out'));
      }
    }, ms);
  });

  return Promise.race([
    promise.then(result => {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
      }
      return result;
    }).catch(error => {
      if (!completed) {
        completed = true;
        clearTimeout(timeoutId);
      }
      throw error;
    }),
    timeoutPromise
  ]);
}

/**
 * Delay function for testing and development
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if we're running in a headless environment
 */
export function isHeadless() {
  return !process.stdout || 
         !process.stdout.isTTY || 
         process.env.CLAUDE_FLOW_HEADLESS === 'true' ||
         process.env.CI === 'true' ||
         process.env.GITHUB_ACTIONS === 'true' ||
         process.env.DOCKER_CONTAINER === 'true' ||
         process.env.NODE_ENV === 'production';
}

/**
 * Get environment configuration
 */
export function getEnvironmentConfig() {
  return {
    headless: isHeadless(),
    claudeApiKey: process.env.ANTHROPIC_API_KEY,
    claudeApiEndpoint: process.env.CLAUDE_API_ENDPOINT || 'https://api.anthropic.com/v1/messages',
    claudeModel: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
    exitOnComplete: process.env.CLAUDE_FLOW_EXIT_ON_COMPLETE !== 'false',
    executionMode: process.env.CLAUDE_FLOW_EXECUTION_MODE || 'auto',
    maxAgents: parseInt(process.env.CLAUDE_FLOW_MAX_AGENTS) || 5,
    timeout: parseInt(process.env.CLAUDE_FLOW_TIMEOUT) || 300000,
  };
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Format duration from milliseconds to human readable format
 */
export function formatDuration(ms) {
  if (ms < 0) return `${ms}ms`;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Sanitize string for use as filename
 */
export function sanitizeForFilename(str) {
  return str.replace(/[\/\\:*?"<>|]/g, '-');
}

/**
 * Parse JSON safely with default value
 */
export function parseJsonSafe(str, defaultValue = undefined) {
  try {
    if (!str || str === '') return defaultValue;
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

/**
 * Deep merge objects
 */
export function deepMerge(target, source) {
  if (!source) return target || {};
  if (!target) return source;
  
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  
  return result;
}

// All functions are already exported at their declarations above
// No need for duplicate exports

// Default export for backward compatibility
export default {
  execAsync,
  add,
  helloWorld,
  generateId,
  timeout,
  delay,
  isHeadless,
  getEnvironmentConfig
};