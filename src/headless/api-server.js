/**
 * API Server for Claude-Flow Headless Mode
 * Provides REST API and WebSocket interface for swarm management
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { generateId, getEnvironmentConfig } from '../utils/helpers.js';
import { ExecutionBridge } from './execution-bridge.js';
import { getShutdownHandler } from './graceful-shutdown.js';

export class HeadlessAPIServer {
  constructor(config = {}) {
    this.config = {
      port: 3000,
      host: '0.0.0.0',
      cors: true,
      ...getEnvironmentConfig(),
      ...config
    };
    
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.executionBridge = new ExecutionBridge(this.config);
    
    this.activeSwarms = new Map();
    this.connectedClients = new Set();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // CORS support
    if (this.config.cors) {
      this.app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
        if (req.method === 'OPTIONS') {
          res.sendStatus(200);
          return;
        }
        next();
      });
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`📡 ${req.method} ${req.path} - ${new Date().toISOString()}`);
      next();
    });
  }

  /**
   * Setup REST API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      const shutdownHandler = getShutdownHandler();
      
      if (shutdownHandler.isShuttingDown) {
        res.status(503).json({
          status: 'shutting_down',
          message: 'Service is gracefully shutting down',
          timestamp: new Date().toISOString()
        });
      } else {
        res.json({
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '2.0.0-alpha.75',
          mode: 'headless',
          activeSwarms: this.activeSwarms.size,
          connectedClients: this.connectedClients.size
        });
      }
    });

    // API documentation
    this.app.get('/api', (req, res) => {
      res.json({
        name: 'Claude-Flow Headless API',
        version: '1.0.0',
        endpoints: {
          'GET /health': 'Health check',
          'POST /api/swarms': 'Create and execute swarm',
          'GET /api/swarms': 'List active swarms',
          'GET /api/swarms/:id': 'Get swarm status',
          'DELETE /api/swarms/:id': 'Stop swarm',
          'WS /ws': 'WebSocket for real-time updates'
        }
      });
    });

    // Create and execute swarm
    this.app.post('/api/swarms', async (req, res) => {
      try {
        const { objective, ...flags } = req.body;
        
        if (!objective) {
          return res.status(400).json({
            error: 'Missing required field: objective',
            example: { objective: 'Build a REST API with authentication' }
          });
        }

        const swarmId = generateId('swarm');
        console.log(`🚀 API: Creating swarm ${swarmId} for objective: ${objective}`);

        // Start execution asynchronously
        const swarmPromise = this.executionBridge.executeSwarm(objective, flags);
        this.activeSwarms.set(swarmId, {
          id: swarmId,
          objective,
          flags,
          status: 'running',
          startTime: Date.now(),
          promise: swarmPromise
        });

        // Broadcast swarm creation
        this.broadcast({
          type: 'swarm.created',
          swarmId,
          objective,
          timestamp: new Date().toISOString()
        });

        // Handle completion
        swarmPromise.then(result => {
          const swarm = this.activeSwarms.get(swarmId);
          if (swarm) {
            swarm.status = 'completed';
            swarm.result = result;
            swarm.endTime = Date.now();
            
            this.broadcast({
              type: 'swarm.completed',
              swarmId,
              result,
              duration: swarm.endTime - swarm.startTime,
              timestamp: new Date().toISOString()
            });
          }
        }).catch(error => {
          const swarm = this.activeSwarms.get(swarmId);
          if (swarm) {
            swarm.status = 'failed';
            swarm.error = error.message;
            swarm.endTime = Date.now();
            
            this.broadcast({
              type: 'swarm.failed',
              swarmId,
              error: error.message,
              timestamp: new Date().toISOString()
            });
          }
        });

        res.status(202).json({
          success: true,
          swarmId,
          status: 'running',
          message: 'Swarm execution started',
          objective,
          flags
        });

      } catch (error) {
        console.error('❌ API: Swarm creation failed:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // List active swarms
    this.app.get('/api/swarms', (req, res) => {
      const swarms = Array.from(this.activeSwarms.values()).map(swarm => ({
        id: swarm.id,
        objective: swarm.objective,
        status: swarm.status,
        startTime: swarm.startTime,
        duration: swarm.endTime ? 
          swarm.endTime - swarm.startTime : 
          Date.now() - swarm.startTime,
        flags: swarm.flags
      }));

      res.json({
        success: true,
        swarms,
        total: swarms.length,
        active: swarms.filter(s => s.status === 'running').length
      });
    });

    // Get specific swarm status
    this.app.get('/api/swarms/:id', (req, res) => {
      const swarm = this.activeSwarms.get(req.params.id);
      
      if (!swarm) {
        return res.status(404).json({
          error: 'Swarm not found',
          swarmId: req.params.id
        });
      }

      res.json({
        success: true,
        swarm: {
          id: swarm.id,
          objective: swarm.objective,
          status: swarm.status,
          startTime: swarm.startTime,
          endTime: swarm.endTime,
          duration: swarm.endTime ? 
            swarm.endTime - swarm.startTime : 
            Date.now() - swarm.startTime,
          flags: swarm.flags,
          result: swarm.result,
          error: swarm.error
        }
      });
    });

    // Stop swarm
    this.app.delete('/api/swarms/:id', async (req, res) => {
      const swarm = this.activeSwarms.get(req.params.id);
      
      if (!swarm) {
        return res.status(404).json({
          error: 'Swarm not found',
          swarmId: req.params.id
        });
      }

      if (swarm.status !== 'running') {
        return res.status(400).json({
          error: 'Swarm is not running',
          status: swarm.status
        });
      }

      try {
        // Stop the execution
        await this.executionBridge.stopExecution(req.params.id);
        
        swarm.status = 'stopped';
        swarm.endTime = Date.now();

        this.broadcast({
          type: 'swarm.stopped',
          swarmId: req.params.id,
          timestamp: new Date().toISOString()
        });

        res.json({
          success: true,
          message: 'Swarm stopped successfully',
          swarmId: req.params.id
        });

      } catch (error) {
        res.status(500).json({
          error: 'Failed to stop swarm',
          message: error.message
        });
      }
    });

    // System status
    this.app.get('/api/system/status', (req, res) => {
      const executions = this.executionBridge.getActiveExecutions();
      
      res.json({
        success: true,
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          pid: process.pid,
          nodeVersion: process.version,
          platform: process.platform
        },
        service: {
          activeSwarms: this.activeSwarms.size,
          connectedClients: this.connectedClients.size,
          totalExecutions: executions.length
        },
        executions
      });
    });

    // Serve static files for documentation
    this.app.get('/', (req, res) => {
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Claude-Flow Headless API</title>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
            .endpoint { background: #f4f4f4; padding: 10px; margin: 10px 0; border-radius: 5px; }
            .method { font-weight: bold; color: #2196F3; }
            pre { background: #f8f8f8; padding: 15px; border-radius: 5px; overflow-x: auto; }
          </style>
        </head>
        <body>
          <h1>🐝 Claude-Flow Headless API</h1>
          <p>Welcome to the Claude-Flow Headless API Server. This provides REST and WebSocket interfaces for swarm management.</p>
          
          <h2>Available Endpoints</h2>
          
          <div class="endpoint">
            <span class="method">GET</span> <code>/health</code> - Health check
          </div>
          
          <div class="endpoint">
            <span class="method">POST</span> <code>/api/swarms</code> - Create and execute swarm
            <pre>{"objective": "Build a REST API", "strategy": "development", "max-agents": 5}</pre>
          </div>
          
          <div class="endpoint">
            <span class="method">GET</span> <code>/api/swarms</code> - List active swarms
          </div>
          
          <div class="endpoint">
            <span class="method">GET</span> <code>/api/swarms/:id</code> - Get swarm status
          </div>
          
          <div class="endpoint">
            <span class="method">DELETE</span> <code>/api/swarms/:id</code> - Stop swarm
          </div>
          
          <div class="endpoint">
            <span class="method">WS</span> <code>/ws</code> - WebSocket for real-time updates
          </div>
          
          <h2>System Status</h2>
          <p>Active Swarms: ${this.activeSwarms.size}</p>
          <p>Connected Clients: ${this.connectedClients.size}</p>
          <p>Server Time: ${new Date().toISOString()}</p>
          
          <h2>Example Usage</h2>
          <pre>
// Create a swarm
curl -X POST http://localhost:3000/api/swarms \\
  -H "Content-Type: application/json" \\
  -d '{"objective": "Build authentication system", "strategy": "development"}'

// Check status
curl http://localhost:3000/api/swarms/[swarm-id]

// WebSocket connection
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onmessage = (event) => console.log(JSON.parse(event.data));
          </pre>
        </body>
        </html>
      `);
    });
  }

  /**
   * Setup WebSocket for real-time updates
   */
  setupWebSocket() {
    this.wss.on('connection', (ws, req) => {
      console.log('🔌 WebSocket client connected from', req.socket.remoteAddress);
      this.connectedClients.add(ws);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection.established',
        message: 'Connected to Claude-Flow Headless API',
        timestamp: new Date().toISOString(),
        activeSwarms: this.activeSwarms.size
      }));

      ws.on('close', () => {
        console.log('🔌 WebSocket client disconnected');
        this.connectedClients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        this.connectedClients.delete(ws);
      });

      // Handle ping/pong for connection health
      ws.on('ping', () => {
        ws.pong();
      });
    });
  }

  /**
   * Broadcast message to all connected WebSocket clients
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    this.connectedClients.forEach(ws => {
      if (ws.readyState === ws.OPEN) {
        try {
          ws.send(data);
        } catch (error) {
          console.error('❌ Failed to send WebSocket message:', error);
          this.connectedClients.delete(ws);
        }
      }
    });
  }

  /**
   * Start the API server
   */
  async start() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`🚀 Claude-Flow Headless API Server started`);
        console.log(`📡 REST API: http://${this.config.host}:${this.config.port}`);
        console.log(`🔌 WebSocket: ws://${this.config.host}:${this.config.port}/ws`);
        console.log(`📊 Health Check: http://${this.config.host}:${this.config.port}/health`);
        
        // Register graceful shutdown cleanup
        const shutdownHandler = getShutdownHandler();
        shutdownHandler.addCleanupHandler(async () => {
          console.log('🧹 Closing API server...');
          await this.stop();
        });
        
        resolve();
      });

      this.server.on('error', (error) => {
        console.error('❌ Server failed to start:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the API server
   */
  async stop() {
    return new Promise((resolve) => {
      // Close WebSocket connections
      this.connectedClients.forEach(ws => {
        ws.close();
      });
      this.connectedClients.clear();

      // Close HTTP server
      this.server.close(() => {
        console.log('🛑 Claude-Flow Headless API Server stopped');
        resolve();
      });
    });
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      activeSwarms: this.activeSwarms.size,
      connectedClients: this.connectedClients.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      executions: this.executionBridge.getActiveExecutions()
    };
  }
}

export default HeadlessAPIServer;