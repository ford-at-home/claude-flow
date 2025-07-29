/**
 * Real Swarm Executor - Executes actual AI agent swarms
 * No mocks, no simulations - real work via Claude API
 */

import { ClaudeAPIExecutor } from './claude-api-executor.js';
import { generateId } from '../utils/helpers.js';
import { promises as fs } from 'fs';
import path from 'path';

export class RealSwarmExecutor {
  constructor(config = {}) {
    this.config = {
      maxAgents: config.maxAgents || 5,
      strategy: config.strategy || 'auto',
      outputDir: config.outputDir || './swarm-output',
      ...config
    };
    
    // Initialize API executor
    this.apiExecutor = new ClaudeAPIExecutor({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      model: config.model,
      maxTokens: config.maxTokens
    });
    
    this.swarmId = generateId('swarm');
    this.agents = [];
    this.tasks = [];
    this.results = [];
  }

  /**
   * Execute a complete swarm for an objective
   */
  async execute(objective) {
    console.log(`\n🚀 Starting REAL swarm execution: ${this.swarmId}`);
    console.log(`📋 Objective: ${objective}`);
    console.log(`🎯 Strategy: ${this.config.strategy}`);
    console.log(`🤖 Using Claude API for actual AI execution\n`);
    
    const startTime = Date.now();
    
    try {
      // Phase 1: Initialize agents
      console.log('📌 Phase 1: Initializing agents...');
      this.agents = await this.initializeAgents();
      
      // Phase 2: Decompose objective into tasks
      console.log('\n📌 Phase 2: Decomposing objective into tasks...');
      this.tasks = await this.decomposeObjective(objective);
      
      // Phase 3: Execute tasks with real AI agents
      console.log('\n📌 Phase 3: Executing tasks with AI agents...');
      this.results = await this.executeTasks();
      
      // Phase 4: Synthesize results
      console.log('\n📌 Phase 4: Synthesizing results...');
      const synthesis = await this.synthesizeResults(objective);
      
      // Phase 5: Generate output
      console.log('\n📌 Phase 5: Generating output...');
      const output = await this.generateOutput(objective, synthesis);
      
      const duration = Date.now() - startTime;
      
      console.log(`\n✅ Swarm execution completed in ${(duration/1000).toFixed(1)} seconds`);
      console.log(`📊 Total API calls: ${this.results.length}`);
      console.log(`💰 Estimated tokens used: ${this.results.reduce((sum, r) => sum + (r.tokensUsed || 0), 0)}`);
      
      return {
        success: true,
        swarmId: this.swarmId,
        objective,
        duration,
        agents: this.agents.length,
        tasks: this.tasks.length,
        results: this.results,
        synthesis,
        output
      };
      
    } catch (error) {
      console.error(`\n❌ Swarm execution failed:`, error.message);
      throw error;
    }
  }

  /**
   * Initialize agents based on strategy
   */
  async initializeAgents() {
    const agents = [];
    
    switch (this.config.strategy) {
      case 'development':
        agents.push(
          { id: generateId('agent'), name: 'System Architect', type: 'architect' },
          { id: generateId('agent'), name: 'Backend Developer', type: 'developer' },
          { id: generateId('agent'), name: 'Frontend Developer', type: 'developer' },
          { id: generateId('agent'), name: 'QA Engineer', type: 'tester' },
          { id: generateId('agent'), name: 'Code Reviewer', type: 'reviewer' }
        );
        break;
        
      case 'research':
        agents.push(
          { id: generateId('agent'), name: 'Lead Researcher', type: 'researcher' },
          { id: generateId('agent'), name: 'Data Analyst', type: 'analyst' },
          { id: generateId('agent'), name: 'Research Assistant', type: 'researcher' }
        );
        break;
        
      case 'analysis':
        agents.push(
          { id: generateId('agent'), name: 'Senior Analyst', type: 'analyst' },
          { id: generateId('agent'), name: 'Data Scientist', type: 'analyst' },
          { id: generateId('agent'), name: 'Business Analyst', type: 'analyst' }
        );
        break;
        
      default: // auto
        agents.push(
          { id: generateId('agent'), name: 'Coordinator', type: 'coordinator' },
          { id: generateId('agent'), name: 'Architect', type: 'architect' },
          { id: generateId('agent'), name: 'Developer', type: 'developer' },
          { id: generateId('agent'), name: 'Analyst', type: 'analyst' },
          { id: generateId('agent'), name: 'Tester', type: 'tester' }
        );
    }
    
    // Limit to maxAgents
    const selectedAgents = agents.slice(0, this.config.maxAgents);
    
    console.log(`  ✅ Initialized ${selectedAgents.length} agents:`);
    selectedAgents.forEach(agent => {
      console.log(`    🤖 ${agent.name} (${agent.type})`);
    });
    
    return selectedAgents;
  }

  /**
   * Decompose objective into concrete tasks
   */
  async decomposeObjective(objective) {
    console.log(`  🔍 Analyzing objective with coordinator agent...`);
    
    // Use coordinator to break down the objective
    const decompositionPrompt = `As a project coordinator, break down this objective into concrete, actionable tasks:

Objective: ${objective}

Create a list of 3-7 specific tasks that would accomplish this objective. Each task should be:
- Clear and actionable
- Assignable to a single agent
- Completable independently
- Contributing to the overall objective

Format your response as a numbered list of tasks, with each task on its own line.`;

    const response = await this.apiExecutor.callClaudeAPI(decompositionPrompt);
    const taskList = response.content[0].text;
    
    // Parse tasks from response
    const tasks = this.parseTaskList(taskList, objective);
    
    console.log(`  ✅ Decomposed into ${tasks.length} tasks:`);
    tasks.forEach((task, index) => {
      console.log(`    ${index + 1}. ${task.description}`);
    });
    
    return tasks;
  }

  /**
   * Parse task list from Claude response
   */
  parseTaskList(taskList, objective) {
    const lines = taskList.split('\n').filter(line => line.trim());
    const tasks = [];
    
    lines.forEach(line => {
      // Look for numbered lists or bullet points
      const match = line.match(/^(?:\d+\.|[-*])\s*(.+)$/);
      if (match) {
        tasks.push({
          id: generateId('task'),
          description: match[1].trim(),
          context: objective,
          status: 'pending'
        });
      }
    });
    
    // If no tasks found, create a default one
    if (tasks.length === 0) {
      tasks.push({
        id: generateId('task'),
        description: `Complete the objective: ${objective}`,
        context: objective,
        status: 'pending'
      });
    }
    
    return tasks;
  }

  /**
   * Execute tasks using real AI agents
   */
  async executeTasks() {
    console.log(`  ⚡ Executing ${this.tasks.length} tasks with ${this.agents.length} agents...`);
    
    // Execute tasks in batches to respect rate limits
    const results = await this.apiExecutor.executeTasksBatch(
      this.tasks, 
      this.agents,
      { batchSize: 3 }
    );
    
    // Update task statuses
    results.forEach(result => {
      const task = this.tasks.find(t => t.id === result.taskId);
      if (task) {
        task.status = result.success ? 'completed' : 'failed';
        task.result = result;
      }
    });
    
    const successful = results.filter(r => r.success).length;
    console.log(`  ✅ Completed ${successful}/${results.length} tasks successfully`);
    
    return results;
  }

  /**
   * Synthesize results from all agents
   */
  async synthesizeResults(objective) {
    console.log(`  🔄 Synthesizing results from all agents...`);
    
    // Prepare synthesis context
    const successfulResults = this.results.filter(r => r.success);
    const resultsSummary = successfulResults.map((result, index) => {
      const task = this.tasks.find(t => t.id === result.taskId);
      const agent = this.agents.find(a => a.id === result.agentId);
      return `Task ${index + 1}: ${task.description}
Agent: ${agent.name} (${agent.type})
Output: ${result.output}
---`;
    }).join('\n\n');
    
    // Use coordinator to synthesize
    const synthesisPrompt = `As a project coordinator, synthesize the following task results into a cohesive solution for the objective:

Original Objective: ${objective}

Task Results:
${resultsSummary}

Create a comprehensive synthesis that:
1. Integrates all task outputs into a unified solution
2. Identifies key findings and recommendations
3. Highlights any gaps or areas needing attention
4. Provides clear next steps

Be specific and actionable in your synthesis.`;

    const response = await this.apiExecutor.callClaudeAPI(synthesisPrompt);
    const synthesis = response.content[0].text;
    
    console.log(`  ✅ Synthesis completed`);
    
    return synthesis;
  }

  /**
   * Generate final output files
   */
  async generateOutput(objective, synthesis) {
    const outputDir = path.join(this.config.outputDir, this.swarmId);
    await fs.mkdir(outputDir, { recursive: true });
    
    // Save swarm summary
    const summary = {
      swarmId: this.swarmId,
      objective,
      strategy: this.config.strategy,
      timestamp: new Date().toISOString(),
      agents: this.agents,
      tasks: this.tasks.map(t => ({
        id: t.id,
        description: t.description,
        status: t.status
      })),
      synthesis
    };
    
    await fs.writeFile(
      path.join(outputDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );
    
    // Save detailed results
    await fs.writeFile(
      path.join(outputDir, 'results.json'),
      JSON.stringify(this.results, null, 2)
    );
    
    // Save synthesis as markdown
    const markdown = `# Swarm Execution Results

**Objective:** ${objective}  
**Strategy:** ${this.config.strategy}  
**Swarm ID:** ${this.swarmId}  
**Date:** ${new Date().toISOString()}

## Agents

${this.agents.map(a => `- **${a.name}** (${a.type})`).join('\n')}

## Tasks

${this.tasks.map((t, i) => `${i + 1}. ${t.description} - ${t.status}`).join('\n')}

## Synthesis

${synthesis}

## Individual Task Results

${this.results.filter(r => r.success).map((r, i) => {
  const task = this.tasks.find(t => t.id === r.taskId);
  const agent = this.agents.find(a => a.id === r.agentId);
  return `### Task ${i + 1}: ${task.description}

**Agent:** ${agent.name} (${agent.type})  
**Duration:** ${r.duration}ms  
**Tokens Used:** ${r.tokensUsed}

${r.output}

---`;
}).join('\n\n')}
`;
    
    await fs.writeFile(
      path.join(outputDir, 'report.md'),
      markdown
    );
    
    console.log(`  ✅ Output saved to: ${outputDir}`);
    
    return {
      directory: outputDir,
      files: ['summary.json', 'results.json', 'report.md']
    };
  }
}

export default RealSwarmExecutor;