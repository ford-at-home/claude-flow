#!/usr/bin/env node

/**
 * Example wrapper script for starting Claude-Flow API server
 * when installed as a dependency in another project
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);

// Find the installed claude-flow package
const claudeFlowPath = require.resolve('claude-flow/package.json');
const claudeFlowDir = path.dirname(claudeFlowPath);

// Import the API server class
const { HeadlessAPIServer } = await import(
  path.join(claudeFlowDir, 'src/headless/api-server.js')
);

// Create and start the server
const server = new HeadlessAPIServer({
  port: process.env.PORT || 3456,
  host: process.env.HOST || '0.0.0.0'
});

server.start().then(() => {
  console.log('✅ Claude-Flow API server is running');
  console.log(`📡 API available at: http://localhost:${server.config.port}`);
}).catch(error => {
  console.error('❌ Failed to start API server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down API server...');
  await server.stop();
  process.exit(0);
});