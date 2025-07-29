#!/usr/bin/env node
/**
 * Test script for real swarm execution
 */

import { RealSwarmExecutor } from './src/headless/real-swarm-executor.js';
import { ClaudeAPIExecutor } from './src/headless/claude-api-executor.js';

console.log('🧪 Testing Real Swarm Execution\n');

// Check API key
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey || apiKey === 'test-key') {
  console.error('❌ Error: Valid ANTHROPIC_API_KEY required');
  console.error('   Set your API key: export ANTHROPIC_API_KEY=sk-ant-api03-...');
  process.exit(1);
}

console.log('✅ API key detected');

async function testBasicAPICall() {
  console.log('\n📋 Test 1: Basic Claude API Call');
  
  try {
    const executor = new ClaudeAPIExecutor({ apiKey });
    const response = await executor.callClaudeAPI('Say "Hello from Claude API" and nothing else.');
    console.log('  ✅ API call successful');
    console.log('  📝 Response:', response.content[0].text);
    return true;
  } catch (error) {
    console.error('  ❌ API call failed:', error.message);
    return false;
  }
}

async function testSingleTask() {
  console.log('\n📋 Test 2: Single Task Execution');
  
  try {
    const executor = new ClaudeAPIExecutor({ apiKey });
    const task = {
      id: 'test-task-1',
      description: 'Write a haiku about distributed systems'
    };
    const agent = {
      id: 'test-agent-1',
      name: 'Poetry Bot',
      type: 'developer'
    };
    
    const result = await executor.executeTask(task, agent);
    console.log('  ✅ Task executed successfully');
    console.log('  ⏱️  Duration:', result.duration + 'ms');
    console.log('  💰 Tokens used:', result.tokensUsed);
    console.log('  📝 Output:', result.output);
    return true;
  } catch (error) {
    console.error('  ❌ Task execution failed:', error.message);
    return false;
  }
}

async function testMiniSwarm() {
  console.log('\n📋 Test 3: Mini Swarm Execution');
  
  try {
    const executor = new RealSwarmExecutor({
      apiKey,
      maxAgents: 2,
      strategy: 'development',
      outputDir: './test-swarm-output'
    });
    
    const objective = 'Create a simple hello world function in JavaScript';
    console.log('  🎯 Objective:', objective);
    console.log('  ⏳ Executing swarm (this will make real API calls)...\n');
    
    const result = await executor.execute(objective);
    
    console.log('\n  ✅ Swarm executed successfully');
    console.log('  📊 Results:');
    console.log('    - Duration:', (result.duration/1000).toFixed(1) + ' seconds');
    console.log('    - Agents used:', result.agents);
    console.log('    - Tasks completed:', result.tasks);
    console.log('    - Output saved to:', result.output.directory);
    
    return true;
  } catch (error) {
    console.error('  ❌ Swarm execution failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('⚠️  WARNING: This test will make real API calls and incur costs!\n');
  
  const tests = [
    testBasicAPICall,
    testSingleTask,
    testMiniSwarm
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = await test();
    if (result) passed++;
    else failed++;
  }
  
  console.log(`\n📊 Test Summary: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed. Check your API key and network connection.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed! Real swarm execution is working.');
    process.exit(0);
  }
}

// Only run tests if explicitly confirmed
if (process.argv.includes('--confirm')) {
  runTests().catch(console.error);
} else {
  console.log('⚠️  This test will make real Claude API calls and incur costs!');
  console.log('\nTo run the tests, use: node test-real-execution.js --confirm');
  console.log('\nEstimated API usage:');
  console.log('  - Test 1: ~50 tokens');
  console.log('  - Test 2: ~200 tokens');
  console.log('  - Test 3: ~2000-5000 tokens');
  console.log('\nTotal estimated cost: ~$0.05-0.10 USD');
}