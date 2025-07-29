/**
 * Real Claude API Executor for Headless Swarm Execution
 * This replaces mock execution with actual Claude API calls
 */

import { generateId } from '../utils/helpers.js';

export class ClaudeAPIExecutor {
  constructor(config = {}) {
    // Handle both config object and direct apiKey string for backward compatibility
    if (typeof config === 'string') {
      this.apiKey = config;
      this.apiEndpoint = 'https://api.anthropic.com/v1/messages';
      this.model = 'claude-3-5-sonnet-20241022';
      this.maxTokens = 4096;
      this.temperature = 0.7;
    } else {
      this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
      this.apiEndpoint = config.apiEndpoint || 'https://api.anthropic.com/v1/messages';
      this.model = config.model || 'claude-3-5-sonnet-20241022';
      this.maxTokens = config.maxTokens || 4096;
      this.temperature = config.temperature || 0.7;
    }
    
    // Allow test mode
    const isTestMode = process.env.NODE_ENV === 'test' || process.env.CLAUDE_FLOW_ENV === 'test';
    
    if (!this.apiKey || (this.apiKey === 'test-key' && !isTestMode)) {
      throw new Error('Valid ANTHROPIC_API_KEY required for Claude API executor');
    }
  }

  /**
   * Execute a swarm task by calling Claude API
   */
  async executeTask(task, agent) {
    const executionId = generateId('api-exec');
    console.log(`  🤖 Agent ${agent.name} executing task ${task.id}`);
    
    try {
      // Build the prompt based on agent type and task
      const prompt = this.buildPrompt(task, agent);
      
      // Make the API call
      const startTime = Date.now();
      const response = await this.callClaudeAPI(prompt);
      const duration = Date.now() - startTime;
      
      console.log(`  ✅ Task ${task.id} completed by ${agent.name} in ${duration}ms`);
      
      return {
        success: true,
        executionId,
        taskId: task.id,
        agentId: agent.id,
        output: response.content[0].text,
        duration,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        model: response.model
      };
      
    } catch (error) {
      console.error(`  ❌ Task ${task.id} failed:`, error.message);
      throw error;
    }
  }

  /**
   * Build prompt based on agent type and task
   */
  buildPrompt(task, agent) {
    const agentPersonality = this.getAgentPersonality(agent.type);
    
    return `You are a ${agent.type} agent named "${agent.name}" working as part of a swarm.

${agentPersonality}

Your task: ${task.description}

${task.context ? `Context: ${task.context}` : ''}

${task.requirements ? `Requirements:\n${task.requirements.join('\n')}` : ''}

Please complete this task and provide concrete, actionable output. If this involves code, provide working implementations. If this involves analysis, provide specific findings and recommendations.

Begin your work:`;
  }

  /**
   * Get agent personality based on type
   */
  getAgentPersonality(type) {
    const personalities = {
      architect: `You are a system architect focused on designing robust, scalable solutions. You think in terms of components, interfaces, and patterns. You prioritize clean architecture, separation of concerns, and future maintainability.`,
      
      developer: `You are an experienced developer who writes clean, efficient, and well-documented code. You follow best practices, write tests, and ensure your implementations are production-ready.`,
      
      researcher: `You are a thorough researcher who gathers comprehensive information from multiple perspectives. You analyze trends, identify patterns, and provide evidence-based insights.`,
      
      analyst: `You are a data analyst who examines information critically, identifies patterns, and provides actionable insights. You use quantitative and qualitative analysis methods.`,
      
      tester: `You are a QA engineer focused on ensuring quality through comprehensive testing. You think about edge cases, write test scenarios, and validate implementations thoroughly.`,
      
      reviewer: `You are a code reviewer who ensures quality, security, and best practices. You provide constructive feedback and identify potential improvements.`,
      
      coordinator: `You are a project coordinator who manages tasks, tracks progress, and ensures smooth collaboration between team members.`
    };
    
    return personalities[type] || `You are a ${type} specialist focused on delivering high-quality results.`;
  }

  /**
   * Make actual API call to Claude
   */
  async callClaudeAPI(prompt) {
    const fetch = globalThis.fetch || (await import('node-fetch')).default;
    
    const requestBody = {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      messages: [{
        role: 'user',
        content: prompt
      }]
    };
    
    const response = await fetch(this.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error: ${response.status} - ${errorText}`);
    }
    
    return await response.json();
  }

  /**
   * Execute multiple tasks in parallel (respecting rate limits)
   */
  async executeTasksBatch(tasks, agents, options = {}) {
    const batchSize = options.batchSize || 3; // Respect rate limits
    const results = [];
    
    // Assign tasks to agents
    const assignments = this.assignTasksToAgents(tasks, agents);
    
    // Execute in batches
    for (let i = 0; i < assignments.length; i += batchSize) {
      const batch = assignments.slice(i, i + batchSize);
      console.log(`\n📦 Executing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(assignments.length/batchSize)}`);
      
      const batchPromises = batch.map(({ task, agent }) => 
        this.executeTask(task, agent).catch(error => ({
          success: false,
          taskId: task.id,
          agentId: agent.id,
          error: error.message
        }))
      );
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Rate limit delay between batches
      if (i + batchSize < assignments.length) {
        console.log(`  ⏳ Rate limit delay...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }

  /**
   * Assign tasks to agents based on their capabilities
   */
  assignTasksToAgents(tasks, agents) {
    const assignments = [];
    let agentIndex = 0;
    
    for (const task of tasks) {
      // Simple round-robin for now, could be enhanced with capability matching
      const agent = agents[agentIndex % agents.length];
      assignments.push({ task, agent });
      agentIndex++;
    }
    
    return assignments;
  }
}

export default ClaudeAPIExecutor;