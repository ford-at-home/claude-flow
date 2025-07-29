/**
 * Tests for graceful-shutdown.js
 */

import { jest } from '@jest/globals';
import { 
  GracefulShutdownHandler, 
  getShutdownHandler, 
  ensureGracefulExit 
} from '../graceful-shutdown.js';
import * as helpers from '../../utils/helpers.js';

// Mock dependencies
jest.mock('../../utils/helpers.js', () => ({
  isHeadless: jest.fn(() => false),
  timeout: jest.fn((promise) => promise)
}));

// Mock process.exit
const originalExit = process.exit;
const mockExit = jest.fn();

describe('GracefulShutdownHandler', () => {
  let handler;
  let consoleLogSpy;
  let consoleErrorSpy;
  let processOnSpy;
  let processOffSpy;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Mock process methods
    process.exit = mockExit;
    processOnSpy = jest.spyOn(process, 'on');
    processOffSpy = jest.spyOn(process, 'off');
    
    // Clear mocks
    jest.clearAllMocks();
    mockExit.mockClear();
    
    handler = new GracefulShutdownHandler();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processOnSpy.mockRestore();
    processOffSpy.mockRestore();
    process.exit = originalExit;
    
    // Clean up any handlers
    handler.cleanup();
  });

  describe('constructor', () => {
    test('should initialize with default config', () => {
      expect(handler.shutdownInProgress).toBe(false);
      expect(handler.cleanupHandlers).toEqual([]);
      expect(handler.config).toMatchObject({
        gracePeriodMs: 5000,
        forceKillMs: 10000
      });
    });

    test('should register signal handlers', () => {
      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    test('should accept custom config', () => {
      const customHandler = new GracefulShutdownHandler({
        gracePeriodMs: 3000,
        forceKillMs: 6000
      });
      
      expect(customHandler.config.gracePeriodMs).toBe(3000);
      expect(customHandler.config.forceKillMs).toBe(6000);
      
      customHandler.cleanup();
    });
  });

  describe('registerCleanupHandler', () => {
    test('should register cleanup handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      handler.registerCleanupHandler(handler1);
      handler.registerCleanupHandler(handler2);
      
      expect(handler.cleanupHandlers).toHaveLength(2);
      expect(handler.cleanupHandlers).toContain(handler1);
      expect(handler.cleanupHandlers).toContain(handler2);
    });

    test('should ignore non-function handlers', () => {
      handler.registerCleanupHandler('not a function');
      handler.registerCleanupHandler(null);
      handler.registerCleanupHandler(undefined);
      
      expect(handler.cleanupHandlers).toHaveLength(0);
    });
  });

  describe('shutdown', () => {
    test('should execute shutdown sequence', async () => {
      const cleanupHandler = jest.fn().mockResolvedValue(undefined);
      handler.registerCleanupHandler(cleanupHandler);
      
      await handler.shutdown('test', 0);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🛑 Initiating graceful shutdown')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🧹 Running 1 cleanup handlers...')
      );
      expect(cleanupHandler).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('should prevent multiple shutdowns', async () => {
      handler.shutdownInProgress = true;
      
      await handler.shutdown('test', 0);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Shutdown already in progress')
      );
      expect(mockExit).not.toHaveBeenCalled();
    });

    test('should handle cleanup errors gracefully', async () => {
      const errorHandler = jest.fn().mockRejectedValue(new Error('Cleanup failed'));
      const successHandler = jest.fn().mockResolvedValue(undefined);
      
      handler.registerCleanupHandler(errorHandler);
      handler.registerCleanupHandler(successHandler);
      
      await handler.shutdown('test', 0);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup handler 1 failed:')
      );
      expect(successHandler).toHaveBeenCalled();
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('should force exit after timeout', async () => {
      jest.useFakeTimers();
      
      const slowHandler = jest.fn(() => new Promise(() => {})); // Never resolves
      handler.registerCleanupHandler(slowHandler);
      handler.config.gracePeriodMs = 1000;
      
      const shutdownPromise = handler.shutdown('test', 0);
      
      // Advance past grace period
      jest.advanceTimersByTime(1100);
      
      await Promise.resolve(); // Let promises settle
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️  Graceful shutdown timeout')
      );
      
      jest.useRealTimers();
    });

    test('should handle different exit codes', async () => {
      await handler.shutdown('error', 1);
      expect(mockExit).toHaveBeenCalledWith(1);
      
      mockExit.mockClear();
      handler.shutdownInProgress = false;
      
      await handler.shutdown('success', 0);
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('handleSignal', () => {
    test('should handle SIGTERM', async () => {
      const sigHandler = processOnSpy.mock.calls.find(
        call => call[0] === 'SIGTERM'
      )[1];
      
      await sigHandler();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGTERM')
      );
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('should handle SIGINT', async () => {
      const sigHandler = processOnSpy.mock.calls.find(
        call => call[0] === 'SIGINT'
      )[1];
      
      await sigHandler();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received SIGINT')
      );
      expect(mockExit).toHaveBeenCalledWith(0);
    });

    test('should handle uncaught exceptions', async () => {
      const exceptionHandler = processOnSpy.mock.calls.find(
        call => call[0] === 'uncaughtException'
      )[1];
      
      const error = new Error('Uncaught error');
      await exceptionHandler(error);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Uncaught Exception:')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(error);
      expect(mockExit).toHaveBeenCalledWith(1);
    });

    test('should handle unhandled rejections', async () => {
      const rejectionHandler = processOnSpy.mock.calls.find(
        call => call[0] === 'unhandledRejection'
      )[1];
      
      const reason = 'Promise rejected';
      await rejectionHandler(reason);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled Rejection:')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(reason);
      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('shouldExitOnComplete', () => {
    test('should return true in headless mode', () => {
      helpers.isHeadless.mockReturnValue(true);
      handler.config.headless = false;
      
      expect(handler.shouldExitOnComplete()).toBe(true);
    });

    test('should return true when headless config is set', () => {
      helpers.isHeadless.mockReturnValue(false);
      handler.config.headless = true;
      
      expect(handler.shouldExitOnComplete()).toBe(true);
    });

    test('should return true when CI env var is set', () => {
      helpers.isHeadless.mockReturnValue(false);
      handler.config.headless = false;
      process.env.CI = 'true';
      
      expect(handler.shouldExitOnComplete()).toBe(true);
      
      delete process.env.CI;
    });

    test('should return true when exitOnComplete is true', () => {
      helpers.isHeadless.mockReturnValue(false);
      handler.config.exitOnComplete = true;
      
      expect(handler.shouldExitOnComplete()).toBe(true);
    });

    test('should return false in interactive mode', () => {
      helpers.isHeadless.mockReturnValue(false);
      handler.config.headless = false;
      handler.config.exitOnComplete = false;
      
      expect(handler.shouldExitOnComplete()).toBe(false);
    });
  });

  describe('cleanup', () => {
    test('should remove all signal handlers', () => {
      handler.cleanup();
      
      expect(processOffSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(processOffSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(processOffSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
      expect(processOffSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });
  });
});

describe('getShutdownHandler', () => {
  test('should return singleton instance', () => {
    const handler1 = getShutdownHandler();
    const handler2 = getShutdownHandler();
    
    expect(handler1).toBe(handler2);
    
    // Cleanup
    handler1.cleanup();
  });

  test('should accept config for first call', () => {
    // Clear any existing instance
    const handler = getShutdownHandler({ gracePeriodMs: 2000 });
    
    expect(handler.config.gracePeriodMs).toBe(2000);
    
    // Cleanup
    handler.cleanup();
  });
});

describe('ensureGracefulExit', () => {
  let handler;

  beforeEach(() => {
    handler = {
      shouldExitOnComplete: jest.fn(() => true),
      shutdown: jest.fn().mockResolvedValue(undefined)
    };
    
    // Mock getShutdownHandler to return our mock
    jest.spyOn(global, 'getShutdownHandler').mockReturnValue(handler);
  });

  afterEach(() => {
    global.getShutdownHandler.mockRestore();
  });

  test('should trigger shutdown when shouldExitOnComplete is true', async () => {
    const result = { success: true };
    
    await ensureGracefulExit(result);
    
    expect(handler.shouldExitOnComplete).toHaveBeenCalled();
    expect(handler.shutdown).toHaveBeenCalledWith('completion', 0);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('✅ Success')
    );
  });

  test('should use exit code 1 for failures', async () => {
    const result = { success: false };
    
    await ensureGracefulExit(result);
    
    expect(handler.shutdown).toHaveBeenCalledWith('completion', 1);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('❌ Failed')
    );
  });

  test('should not shutdown when shouldExitOnComplete is false', async () => {
    handler.shouldExitOnComplete.mockReturnValue(false);
    
    await ensureGracefulExit({ success: true });
    
    expect(handler.shutdown).not.toHaveBeenCalled();
  });

  test('should accept custom config', async () => {
    await ensureGracefulExit(
      { success: true }, 
      { exitOnComplete: false, timeout: 3000 }
    );
    
    expect(global.getShutdownHandler).toHaveBeenCalledWith({ 
      exitOnComplete: false, 
      timeout: 3000 
    });
  });
});