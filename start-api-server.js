#!/usr/bin/env node

/**
 * Wrapper script to start the Claude-Flow API server
 */

import { HeadlessAPIServer } from './src/headless/api-server.js';

// Create and start the server
const server = new HeadlessAPIServer({
  port: process.env.PORT || 3456,
  host: process.env.HOST || '0.0.0.0'
});

server.start().then(() => {
  console.log('✅ Claude-Flow API server is running');
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