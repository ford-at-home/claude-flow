/**
 * Graceful Shutdown Handler for Claude-Flow
 * Ensures proper cleanup and termination in headless/remote execution
 */

import { isHeadless } from '../utils/helpers.js';

export class GracefulShutdownHandler {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 30000, // 30 seconds max shutdown time
      forceExitDelay: config.forceExitDelay || 5000, // 5 seconds before forced exit
      exitOnComplete: config.exitOnComplete !== false,
      ...config
    };
    
    this.shutdownHandlers = [];
    this.isShuttingDown = false;
    this.shutdownPromise = null;
    
    // Register signal handlers
    this.registerSignalHandlers();
  }

  /**
   * Register handlers for various termination signals
   */
  registerSignalHandlers() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGHUP', 'SIGQUIT'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        console.log(`\n📡 Received ${signal}, initiating graceful shutdown...`);
        await this.shutdown(signal);
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error('❌ Uncaught Exception:', error);
      await this.shutdown('uncaughtException', 1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('❌ Unhandled Rejection:', reason);
      await this.shutdown('unhandledRejection', 1);
    });
  }

  /**
   * Add a cleanup handler to be called during shutdown
   */
  addCleanupHandler(handler) {
    if (typeof handler === 'function') {
      this.shutdownHandlers.push(handler);
    }
  }

  /**
   * Perform graceful shutdown
   */
  async shutdown(reason = 'manual', exitCode = 0) {
    if (this.isShuttingDown) {
      console.log('⚠️  Shutdown already in progress...');
      return this.shutdownPromise;
    }

    this.isShuttingDown = true;
    console.log(`🛑 Initiating graceful shutdown (reason: ${reason})`);

    // Create shutdown promise
    this.shutdownPromise = this.performShutdown(exitCode);

    // Set maximum shutdown timeout
    const timeoutId = setTimeout(() => {
      console.error('⏰ Shutdown timeout exceeded, forcing exit...');
      process.exit(exitCode || 1);
    }, this.config.timeout);

    try {
      await this.shutdownPromise;
      clearTimeout(timeoutId);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      clearTimeout(timeoutId);
      process.exit(1);
    }
  }

  /**
   * Perform the actual shutdown sequence
   */
  async performShutdown(exitCode) {
    const startTime = Date.now();

    // Execute all cleanup handlers
    console.log(`🧹 Running ${this.shutdownHandlers.length} cleanup handlers...`);
    
    const cleanupPromises = this.shutdownHandlers.map(async (handler, index) => {
      try {
        await Promise.race([
          handler(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Cleanup timeout')), 5000)
          )
        ]);
        console.log(`  ✅ Cleanup handler ${index + 1} completed`);
      } catch (error) {
        console.error(`  ❌ Cleanup handler ${index + 1} failed:`, error.message);
      }
    });

    await Promise.allSettled(cleanupPromises);

    const duration = Date.now() - startTime;
    console.log(`✅ Graceful shutdown completed in ${duration}ms`);

    // Final exit
    if (this.config.exitOnComplete) {
      console.log(`👋 Exiting with code ${exitCode}`);
      
      // Give a moment for logs to flush
      setTimeout(() => {
        process.exit(exitCode);
      }, 100);
    }
  }

  /**
   * Check if the process should exit after completion
   */
  shouldExitOnComplete() {
    // Always exit in headless/non-TTY environments
    if (isHeadless() || !process.stdout.isTTY) {
      return true;
    }

    // Check for CI/CD environments
    if (process.env.CI || process.env.CONTINUOUS_INTEGRATION) {
      return true;
    }

    // Check for common container environments
    if (process.env.KUBERNETES_SERVICE_HOST || process.env.ECS_CONTAINER_METADATA_URI) {
      return true;
    }

    // Check for AWS Batch
    if (process.env.AWS_BATCH_JOB_ID) {
      return true;
    }

    // Check for explicit configuration
    if (process.env.CLAUDE_FLOW_EXIT_ON_COMPLETE === 'true') {
      return true;
    }

    return this.config.exitOnComplete;
  }
}

/**
 * Singleton instance for global shutdown handling
 */
let shutdownHandler = null;

export function getShutdownHandler(config = {}) {
  if (!shutdownHandler) {
    shutdownHandler = new GracefulShutdownHandler(config);
  }
  return shutdownHandler;
}

/**
 * Utility function to ensure process exits after swarm completion
 */
export async function ensureGracefulExit(result, config = {}) {
  const handler = getShutdownHandler(config);
  
  if (handler.shouldExitOnComplete()) {
    console.log('\n🏁 Swarm execution completed');
    console.log(`📊 Final status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    
    if (result.duration) {
      console.log(`⏱️  Total duration: ${result.duration}ms`);
    }
    
    if (result.error) {
      console.error(`❌ Error details: ${result.error}`);
    }

    // Add cleanup for any remaining resources
    handler.addCleanupHandler(async () => {
      console.log('🧹 Cleaning up remaining resources...');
      // Add any specific cleanup logic here
    });

    // Initiate shutdown
    await handler.shutdown('completion', result.success ? 0 : 1);
  }
}

export default GracefulShutdownHandler;