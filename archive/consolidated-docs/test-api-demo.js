#!/usr/bin/env node
/**
 * API Demo - Test the headless API server functionality
 */

import { HeadlessSystem, createDefaultConfig } from './src/headless/index.js';

async function runAPIDemo() {
  console.log('🚀 Starting Claude-Flow Headless API Demo...\n');

  // Create and start the system
  const system = new HeadlessSystem(createDefaultConfig({
    port: Math.floor(Math.random() * 10000) + 40000, // Random port to avoid conflicts
    headless: true
  }));

  try {
    // Start the API server
    await system.start();
    console.log('✅ API Server started successfully\n');

    // Test direct execution
    console.log('🧪 Testing direct swarm execution...');
    const directResult = await system.executeSwarm('Build a simple calculator API', {
      strategy: 'development',
      'max-agents': 3,
      timeout: 10000
    });
    console.log('✅ Direct execution result:', directResult.success ? '✅ Success' : '❌ Failed');
    console.log(`   Duration: ${directResult.duration}ms, Mode: ${directResult.mode}\n`);

    // Test system status
    console.log('📊 System Status:');
    const status = system.getStatus();
    console.log(`   Running: ${status.running}`);
    console.log(`   Active Swarms: ${status.stats.activeSwarms}`);
    console.log(`   Connected Clients: ${status.stats.connectedClients}`);
    console.log(`   Uptime: ${Math.floor(status.stats.uptime)}s\n`);

    // Test API endpoints (simulated)
    console.log('🔗 API Endpoints Available:');
    console.log('   GET  http://localhost:3001/health');
    console.log('   GET  http://localhost:3001/api');
    console.log('   POST http://localhost:3001/api/swarms');
    console.log('   GET  http://localhost:3001/api/swarms');
    console.log('   WS   ws://localhost:3001/ws\n');

    // Run a quick smoke test
    console.log('💨 Running integrated smoke test...');
    const smokeTestResult = await system.runSmokeTest();
    console.log(`✅ Smoke test result: ${smokeTestResult ? '✅ All tests passed' : '❌ Some tests failed'}\n`);

    console.log('🎉 API Demo completed successfully!');
    console.log('🔧 To test manually:');
    console.log('   curl http://localhost:3001/health');
    console.log('   curl -X POST http://localhost:3001/api/swarms -H "Content-Type: application/json" -d \'{"objective": "test"}\'');
    console.log('\n⚠️  Server will continue running. Press Ctrl+C to stop.');

    // Keep the server running for manual testing
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down API server...');
      await system.stop();
      console.log('✅ Server stopped successfully');
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ API Demo failed:', error.message);
    await system.stop();
    process.exit(1);
  }
}

// Run the demo
runAPIDemo().catch(console.error);