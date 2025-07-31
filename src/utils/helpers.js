/**
 * Claude-Flow Utility Helper Functions
 * 
 * This module provides essential utility functions for Claude-Flow, with particular
 * focus on environment detection and configuration management for the remote-execution
 * and headless execution capabilities.
 * 
 * KEY FUNCTIONS:
 * =============
 * 
 * - isHeadless(): Environment detection for automatic execution mode routing
 * - getEnvironmentConfig(): Environment-specific configuration extraction
 * - generateId(): Unique identifier generation for execution tracking
 * - timeout(): Promise timeout wrapper for reliable execution
 * - execAsync(): Promisified child process execution
 * 
 * ARCHITECTURAL ROLE:
 * ==================
 * 
 * This module is central to the Claude-Flow execution architecture, providing
 * the foundation for intelligent routing between interactive and headless modes.
 * The environment detection logic here enables seamless operation across:
 * 
 * - Local development environments (interactive)
 * - CI/CD pipelines (headless)
 * - Docker containers (headless)
 * - Production deployments (headless)
 * 
 * REMOTE-EXECUTION INTEGRATION:
 * ============================
 * 
 * These utilities were enhanced as part of the remote-execution branch (PR #511)
 * to enable Claude-Flow to automatically adapt its execution strategy based on
 * the runtime environment, eliminating the need for manual mode selection in
 * most scenarios.
 * 
 * The isHeadless() function in particular is critical for the ExecutionBridge
 * routing logic that determines whether to use:
 * - Claude Code GUI (interactive environments)
 * - Claude API (headless environments)
 * 
 * @module utils/helpers
 * @author Claude-Flow Team
 * @version 2.0.0-alpha.79
 * @since 1.0.0 (enhanced in 2.0.0-alpha.58 for remote-exec)
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
 * Detect headless execution environments for automatic mode selection
 * 
 * This function is crucial for the ExecutionBridge routing logic, automatically
 * detecting when Claude-Flow is running in environments that don't support
 * interactive GUI operations (like Claude Code) and should use headless execution.
 * 
 * DETECTION CRITERIA:
 * ==================
 * 
 * The function returns true when any of these conditions are met:
 * 
 * 1. NO STDOUT AVAILABLE:
 *    - !process.stdout: Process has no stdout stream (rare but possible)
 *    - This indicates a severely restricted execution environment
 * 
 * 2. NO TTY AVAILABLE:
 *    - !process.stdout.isTTY: No terminal/TTY attached to stdout
 *    - Common in CI/CD pipelines, Docker containers, background processes
 *    - Interactive applications like Claude Code cannot display properly
 * 
 * 3. EXPLICIT HEADLESS MODE:
 *    - CLAUDE_FLOW_HEADLESS=true: User/system explicitly requests headless mode
 *    - Allows manual override even in interactive environments
 * 
 * 4. CI/CD ENVIRONMENTS:
 *    - CI=true: Generic CI environment variable (most CI systems set this)
 *    - GITHUB_ACTIONS=true: GitHub Actions specific environment
 *    - These environments typically don't support interactive applications
 * 
 * 5. CONTAINERIZED ENVIRONMENTS:
 *    - DOCKER_CONTAINER=true: Running inside Docker container
 *    - Containers often lack display capabilities for GUI applications
 * 
 * 6. PRODUCTION ENVIRONMENTS:
 *    - NODE_ENV=production: Production deployment context
 *    - Production systems should use reliable, non-interactive execution
 * 
 * USAGE IN CLAUDE-FLOW:
 * =====================
 * 
 * This function is used by:
 * - SwarmCommand: To determine whether to route through ExecutionBridge
 * - ExecutionBridge: To choose between interactive and headless execution
 * - API servers: To configure appropriate execution modes
 * - Background processes: To ensure headless operation
 * 
 * IMPLICATIONS:
 * ============
 * 
 * When isHeadless() returns true:
 * - Claude-Flow uses API-based execution (requires ANTHROPIC_API_KEY)
 * - No attempt to launch Claude Code GUI
 * - Results returned as structured data (JSON)
 * - Process exits cleanly after execution
 * 
 * When isHeadless() returns false:
 * - Claude-Flow attempts interactive execution via Claude Code
 * - User can collaborate with AI through GUI interface
 * - Results depend on user interaction
 * - Process stays alive for user session
 * 
 * @function isHeadless
 * @returns {boolean} True if running in headless environment, false for interactive
 * 
 * @example
 * // In local terminal: false (interactive mode)
 * // In GitHub Actions: true (headless mode) 
 * // In Docker: true (headless mode)
 * // With CLAUDE_FLOW_HEADLESS=true: true (headless mode)
 * const headless = isHeadless();
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
 * Extract environment-specific configuration for Claude-Flow execution
 * 
 * Collects configuration from environment variables and system state to provide
 * appropriate defaults for different execution contexts (development, CI/CD, production).
 * 
 * This configuration is used by ExecutionBridge to set up the execution environment
 * with appropriate timeouts, API endpoints, model selections, and other parameters.
 * 
 * CONFIGURATION SOURCES:
 * =====================
 * 
 * 1. Environment Detection: Uses isHeadless() to determine execution mode
 * 2. API Configuration: Claude API key, endpoint, model selection
 * 3. Execution Parameters: Timeouts, limits, performance settings
 * 4. Output Configuration: Formats, destinations, logging levels
 * 
 * @function getEnvironmentConfig
 * @returns {Object} Environment-specific configuration object
 * @returns {boolean} returns.headless - Whether headless mode is detected
 * @returns {string} returns.claudeApiKey - Claude API key from environment
 * @returns {string} returns.claudeApiEndpoint - Claude API endpoint URL
 * @returns {string} returns.claudeModel - Claude model identifier
 * @returns {number} returns.timeout - Default execution timeout (ms)
 * @returns {boolean} returns.exitOnComplete - Whether to exit after completion
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