# Claude-Flow Headless Mode Deployment Guide - Part 2

## Monitoring and Logging

### CloudWatch Integration

#### Custom Metrics Dashboard
```json
{
  "widgets": [
    {
      "type": "metric",
      "x": 0,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "Claude-Flow", "ActiveSwarms", { "stat": "Average" } ],
          [ ".", "TotalAgents", { "stat": "Sum" } ],
          [ ".", "CompletedTasks", { "stat": "Sum" } ],
          [ ".", "FailedTasks", { "stat": "Sum" } ]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "Claude-Flow Metrics"
      }
    },
    {
      "type": "metric",
      "x": 12,
      "y": 0,
      "width": 12,
      "height": 6,
      "properties": {
        "metrics": [
          [ "AWS/EC2", "CPUUtilization", "InstanceId", "i-1234567890abcdef0" ],
          [ ".", "NetworkIn", ".", "." ],
          [ ".", "NetworkOut", ".", "." ]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "EC2 Performance"
      }
    },
    {
      "type": "log",
      "x": 0,
      "y": 6,
      "width": 24,
      "height": 6,
      "properties": {
        "query": "SOURCE '/aws/ec2/claude-flow/application'\n| fields @timestamp, @message\n| filter @message like /ERROR/\n| sort @timestamp desc\n| limit 100",
        "region": "us-east-1",
        "title": "Recent Errors"
      }
    }
  ]
}
```

#### Custom CloudWatch Metrics
```javascript
// src/monitoring/cloudwatch-metrics.js
import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

export class CloudWatchMetrics {
  constructor(config = {}) {
    this.client = new CloudWatchClient({ region: config.region || 'us-east-1' });
    this.namespace = config.namespace || 'Claude-Flow';
    this.enabled = config.enabled !== false && process.env.AWS_REGION;
  }

  async putMetric(metricName, value, unit = 'Count', dimensions = {}) {
    if (!this.enabled) return;

    try {
      const params = {
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
            Dimensions: Object.entries(dimensions).map(([Name, Value]) => ({
              Name,
              Value: String(Value)
            }))
          }
        ]
      };

      await this.client.send(new PutMetricDataCommand(params));
    } catch (error) {
      console.error('Failed to put CloudWatch metric:', error);
    }
  }

  async recordSwarmCreated(swarmId, strategy) {
    await this.putMetric('SwarmCreated', 1, 'Count', {
      Strategy: strategy,
      SwarmId: swarmId
    });
  }

  async recordSwarmCompleted(swarmId, duration, agentCount) {
    await Promise.all([
      this.putMetric('SwarmCompleted', 1, 'Count', { SwarmId: swarmId }),
      this.putMetric('SwarmDuration', duration, 'Milliseconds', { SwarmId: swarmId }),
      this.putMetric('AgentCount', agentCount, 'Count', { SwarmId: swarmId })
    ]);
  }

  async recordSwarmFailed(swarmId, errorType) {
    await this.putMetric('SwarmFailed', 1, 'Count', {
      SwarmId: swarmId,
      ErrorType: errorType
    });
  }

  async recordActiveSwarms(count) {
    await this.putMetric('ActiveSwarms', count, 'Count');
  }

  async recordMemoryUsage(memoryMB) {
    await this.putMetric('MemoryUsage', memoryMB, 'None');
  }

  async recordCPUUsage(cpuPercent) {
    await this.putMetric('CPUUsage', cpuPercent, 'Percent');
  }
}
```

#### Integration with Execution Bridge
```javascript
// Update src/headless/execution-bridge.js
import { CloudWatchMetrics } from '../monitoring/cloudwatch-metrics.js';

export class ExecutionBridge {
  constructor(config = {}) {
    // ... existing constructor code ...
    this.metrics = new CloudWatchMetrics(config.metrics);
  }

  async executeSwarm(objective, flags = {}) {
    const executionId = generateId('exec');
    
    // Record swarm creation
    await this.metrics.recordSwarmCreated(executionId, flags.strategy || 'auto');
    
    try {
      const result = await this.performExecution(objective, flags, executionId);
      
      // Record successful completion
      await this.metrics.recordSwarmCompleted(
        executionId, 
        result.duration, 
        result.agents || 0
      );
      
      return result;
    } catch (error) {
      // Record failure
      await this.metrics.recordSwarmFailed(executionId, error.constructor.name);
      throw error;
    }
  }
}
```

### Structured Logging

#### Winston Configuration
```javascript
// src/monitoring/logger.js
import winston from 'winston';
import CloudWatchTransport from 'winston-cloudwatch';

const logLevel = process.env.CLAUDE_FLOW_LOG_LEVEL || 'info';
const environment = process.env.NODE_ENV || 'development';

// Create logger configuration
const loggerConfig = {
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'claude-flow',
    environment,
    version: process.env.CLAUDE_FLOW_VERSION || '2.0.0-alpha.75'
  },
  transports: [
    // Console output
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    
    // File output
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    })
  ]
};

// Add CloudWatch transport in AWS environments
if (process.env.AWS_REGION) {
  loggerConfig.transports.push(
    new CloudWatchTransport({
      logGroupName: '/aws/claude-flow/application',
      logStreamName: `${environment}-${new Date().toISOString().split('T')[0]}`,
      awsRegion: process.env.AWS_REGION,
      messageFormatter: (logObject) => JSON.stringify(logObject)
    })
  );
}

export const logger = winston.createLogger(loggerConfig);

// Add request ID to all logs
export function addRequestId(req, res, next) {
  req.requestId = generateId('req');
  logger.defaultMeta.requestId = req.requestId;
  next();
}
```

#### Application Integration
```javascript
// Update src/headless/api-server.js to use structured logging
import { logger, addRequestId } from '../monitoring/logger.js';

export class HeadlessAPIServer {
  constructor(config = {}) {
    // ... existing constructor code ...
    this.logger = logger;
  }

  setupMiddleware() {
    // Add request ID middleware
    this.app.use(addRequestId);
    
    // Request logging middleware
    this.app.use((req, res, next) => {
      this.logger.info('Request received', {
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        requestId: req.requestId
      });
      
      // Log response
      res.on('finish', () => {
        this.logger.info('Request completed', {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          responseTime: Date.now() - req.startTime,
          requestId: req.requestId
        });
      });
      
      req.startTime = Date.now();
      next();
    });
    
    // ... rest of middleware setup ...
  }

  async createSwarm(req, res) {
    const { objective, ...flags } = req.body;
    
    this.logger.info('Creating swarm', {
      objective,
      flags,
      requestId: req.requestId
    });
    
    try {
      // ... swarm creation logic ...
      
      this.logger.info('Swarm created successfully', {
        swarmId,
        objective,
        requestId: req.requestId
      });
      
    } catch (error) {
      this.logger.error('Swarm creation failed', {
        error: error.message,
        stack: error.stack,
        objective,
        requestId: req.requestId
      });
    }
  }
}
```

### Log Aggregation with ELK Stack

#### Docker Compose with ELK
```yaml
# docker-compose.monitoring.yml
version: '3.8'

services:
  claude-flow:
    build: .
    ports:
      - "3000:3000"
    environment:
      - CLAUDE_FLOW_HEADLESS=true
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    volumes:
      - ./logs:/app/logs
    depends_on:
      - elasticsearch
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    container_name: elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data

  logstash:
    image: docker.elastic.co/logstash/logstash:8.11.0
    container_name: logstash
    volumes:
      - ./logstash/pipeline:/usr/share/logstash/pipeline
      - ./logs:/app/logs:ro
    ports:
      - "5044:5044"
    environment:
      LS_JAVA_OPTS: "-Xmx256m -Xms256m"
    depends_on:
      - elasticsearch

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    container_name: kibana
    ports:
      - "5601:5601"
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    depends_on:
      - elasticsearch

volumes:
  elasticsearch_data:
```

#### Logstash Pipeline Configuration
```ruby
# logstash/pipeline/claude-flow.conf
input {
  file {
    path => "/app/logs/combined.log"
    start_position => "beginning"
    codec => "json"
  }
}

filter {
  if [service] == "claude-flow" {
    # Parse timestamp
    date {
      match => [ "timestamp", "ISO8601" ]
    }
    
    # Extract request information
    if [requestId] {
      mutate {
        add_tag => ["request"]
      }
    }
    
    # Extract swarm information
    if [swarmId] {
      mutate {
        add_tag => ["swarm"]
      }
    }
    
    # Parse error information
    if [level] == "error" {
      mutate {
        add_tag => ["error"]
      }
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "claude-flow-%{+YYYY.MM.dd}"
  }
  
  stdout {
    codec => rubydebug
  }
}
```

### Prometheus Integration

#### Metrics Endpoint
```javascript
// src/monitoring/prometheus-metrics.js
import promClient from 'prom-client';

// Create a Registry
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({ register });

// Custom metrics
const swarmCreatedCounter = new promClient.Counter({
  name: 'claude_flow_swarms_created_total',
  help: 'Total number of swarms created',
  labelNames: ['strategy', 'mode']
});

const swarmCompletedCounter = new promClient.Counter({
  name: 'claude_flow_swarms_completed_total',
  help: 'Total number of swarms completed',
  labelNames: ['strategy', 'mode']
});

const swarmFailedCounter = new promClient.Counter({
  name: 'claude_flow_swarms_failed_total',
  help: 'Total number of swarms failed',
  labelNames: ['strategy', 'error_type']
});

const swarmDurationHistogram = new promClient.Histogram({
  name: 'claude_flow_swarm_duration_seconds',
  help: 'Duration of swarm execution',
  labelNames: ['strategy', 'mode'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600]
});

const activeSwarmGauge = new promClient.Gauge({
  name: 'claude_flow_active_swarms',
  help: 'Number of currently active swarms'
});

const agentCountHistogram = new promClient.Histogram({
  name: 'claude_flow_agent_count',
  help: 'Number of agents used in swarms',
  buckets: [1, 2, 3, 5, 8, 10, 15, 20]
});

// Register metrics
register.registerMetric(swarmCreatedCounter);
register.registerMetric(swarmCompletedCounter);
register.registerMetric(swarmFailedCounter);
register.registerMetric(swarmDurationHistogram);
register.registerMetric(activeSwarmGauge);
register.registerMetric(agentCountHistogram);

export class PrometheusMetrics {
  constructor() {
    this.register = register;
    this.swarmCreated = swarmCreatedCounter;
    this.swarmCompleted = swarmCompletedCounter;
    this.swarmFailed = swarmFailedCounter;
    this.swarmDuration = swarmDurationHistogram;
    this.activeSwarms = activeSwarmGauge;
    this.agentCount = agentCountHistogram;
  }

  recordSwarmCreated(strategy, mode) {
    this.swarmCreated.inc({ strategy, mode });
  }

  recordSwarmCompleted(strategy, mode, duration, agentCount) {
    this.swarmCompleted.inc({ strategy, mode });
    this.swarmDuration.observe({ strategy, mode }, duration / 1000);
    this.agentCount.observe(agentCount);
  }

  recordSwarmFailed(strategy, errorType) {
    this.swarmFailed.inc({ strategy, error_type: errorType });
  }

  updateActiveSwarms(count) {
    this.activeSwarms.set(count);
  }

  getMetrics() {
    return this.register.metrics();
  }
}
```

#### Add Metrics Endpoint to API Server
```javascript
// Update src/headless/api-server.js
import { PrometheusMetrics } from '../monitoring/prometheus-metrics.js';

export class HeadlessAPIServer {
  constructor(config = {}) {
    // ... existing constructor code ...
    this.metrics = new PrometheusMetrics();
  }

  setupRoutes() {
    // ... existing routes ...

    // Prometheus metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      try {
        res.set('Content-Type', this.metrics.register.contentType);
        res.end(await this.metrics.getMetrics());
      } catch (ex) {
        res.status(500).end(ex);
      }
    });
  }

  async createSwarm(req, res) {
    const { objective, strategy = 'auto', mode = 'centralized', ...flags } = req.body;
    
    // Record metrics
    this.metrics.recordSwarmCreated(strategy, mode);
    this.metrics.updateActiveSwarms(this.activeSwarms.size + 1);
    
    // ... rest of createSwarm logic ...
  }
}
```

---

## Performance Optimization

### Resource Management

#### Memory Optimization
```javascript
// src/optimization/memory-manager.js
export class MemoryManager {
  constructor(config = {}) {
    this.maxMemoryMB = config.maxMemoryMB || 2048;
    this.warningThresholdMB = config.warningThresholdMB || 1536;
    this.checkIntervalMs = config.checkIntervalMs || 30000;
    this.gcThresholdMB = config.gcThresholdMB || 1792;
    
    this.startMonitoring();
  }

  startMonitoring() {
    setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkIntervalMs);
  }

  checkMemoryUsage() {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    
    console.log(`Memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`);
    
    if (heapUsedMB > this.warningThresholdMB) {
      console.warn(`⚠️  High memory usage: ${heapUsedMB}MB (threshold: ${this.warningThresholdMB}MB)`);
    }
    
    if (heapUsedMB > this.gcThresholdMB) {
      console.log('🗑️  Triggering garbage collection...');
      if (global.gc) {
        global.gc();
      }
    }
    
    if (heapUsedMB > this.maxMemoryMB) {
      console.error(`❌ Memory limit exceeded: ${heapUsedMB}MB > ${this.maxMemoryMB}MB`);
      this.handleMemoryPressure();
    }
  }

  handleMemoryPressure() {
    // Implement memory pressure handling
    console.log('🚨 Handling memory pressure...');
    
    // 1. Clear caches
    this.clearCaches();
    
    // 2. Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    // 3. Pause new swarm creation temporarily
    this.pauseNewSwarms();
    
    // 4. If still over limit, terminate oldest swarms
    setTimeout(() => {
      const usage = process.memoryUsage();
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
      
      if (heapUsedMB > this.maxMemoryMB) {
        this.terminateOldestSwarms();
      }
    }, 5000);
  }

  clearCaches() {
    // Implement cache clearing logic
    console.log('🧹 Clearing caches...');
  }

  pauseNewSwarms() {
    // Temporarily prevent new swarms
    console.log('⏸️  Pausing new swarm creation...');
  }

  terminateOldestSwarms() {
    // Terminate oldest running swarms
    console.log('🛑 Terminating oldest swarms...');
  }
}
```

#### Connection Pooling
```javascript
// src/optimization/connection-pool.js
export class ConnectionPool {
  constructor(config = {}) {
    this.maxConnections = config.maxConnections || 10;
    this.minConnections = config.minConnections || 2;
    this.acquireTimeoutMs = config.acquireTimeoutMs || 30000;
    this.idleTimeoutMs = config.idleTimeoutMs || 300000;
    
    this.pool = [];
    this.waiting = [];
    this.activeConnections = 0;
    
    this.initialize();
  }

  async initialize() {
    // Create minimum connections
    for (let i = 0; i < this.minConnections; i++) {
      const connection = await this.createConnection();
      this.pool.push({
        connection,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        inUse: false
      });
    }
  }

  async createConnection() {
    // Implement connection creation logic
    return {
      id: Math.random().toString(36).substr(2, 9),
      status: 'ready'
    };
  }

  async acquire() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection acquire timeout'));
      }, this.acquireTimeoutMs);

      // Try to find available connection
      const available = this.pool.find(item => !item.inUse);
      
      if (available) {
        clearTimeout(timeout);
        available.inUse = true;
        available.lastUsed = Date.now();
        this.activeConnections++;
        resolve(available.connection);
        return;
      }

      // Create new connection if under limit
      if (this.pool.length < this.maxConnections) {
        this.createConnection().then(connection => {
          clearTimeout(timeout);
          const poolItem = {
            connection,
            createdAt: Date.now(),
            lastUsed: Date.now(),
            inUse: true
          };
          this.pool.push(poolItem);
          this.activeConnections++;
          resolve(connection);
        }).catch(reject);
        return;
      }

      // Wait for connection to become available
      this.waiting.push({ resolve, reject, timeout });
    });
  }

  release(connection) {
    const poolItem = this.pool.find(item => item.connection === connection);
    
    if (poolItem) {
      poolItem.inUse = false;
      poolItem.lastUsed = Date.now();
      this.activeConnections--;
      
      // Serve waiting requests
      if (this.waiting.length > 0) {
        const waiter = this.waiting.shift();
        clearTimeout(waiter.timeout);
        poolItem.inUse = true;
        this.activeConnections++;
        waiter.resolve(connection);
      }
    }
  }

  async cleanup() {
    const now = Date.now();
    const itemsToRemove = [];
    
    for (const item of this.pool) {
      if (!item.inUse && 
          (now - item.lastUsed) > this.idleTimeoutMs &&
          this.pool.length > this.minConnections) {
        itemsToRemove.push(item);
      }
    }
    
    for (const item of itemsToRemove) {
      await this.destroyConnection(item.connection);
      const index = this.pool.indexOf(item);
      this.pool.splice(index, 1);
    }
  }

  async destroyConnection(connection) {
    // Implement connection cleanup
    console.log(`Destroying connection ${connection.id}`);
  }

  getStats() {
    return {
      totalConnections: this.pool.length,
      activeConnections: this.activeConnections,
      waitingRequests: this.waiting.length,
      availableConnections: this.pool.filter(item => !item.inUse).length
    };
  }
}
```

### Load Balancing Configuration

#### NGINX Configuration
```nginx
# /etc/nginx/sites-available/claude-flow
upstream claude_flow_backend {
    least_conn;
    server 10.0.1.10:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.11:3000 max_fails=3 fail_timeout=30s;
    server 10.0.1.12:3000 max_fails=3 fail_timeout=30s backup;
}

server {
    listen 80;
    listen 443 ssl http2;
    server_name claude-flow.example.com;
    
    # SSL Configuration
    ssl_certificate /etc/ssl/certs/claude-flow.crt;
    ssl_certificate_key /etc/ssl/private/claude-flow.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    
    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types application/json text/plain text/css application/javascript;
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=swarm:10m rate=2r/s;
    
    # API endpoints
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://claude_flow_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 300s;
    }
    
    # Swarm creation (more restrictive)
    location /api/swarms {
        limit_req zone=swarm burst=5 nodelay;
        
        proxy_pass http://claude_flow_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Extended timeout for swarm operations
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 600s;
    }
    
    # WebSocket support
    location /ws {
        proxy_pass http://claude_flow_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeouts
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
    
    # Health check (no rate limiting)
    location /health {
        proxy_pass http://claude_flow_backend;
        proxy_set_header Host $host;
        access_log off;
    }
    
    # Metrics (restrict access)
    location /metrics {
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
        
        proxy_pass http://claude_flow_backend;
        proxy_set_header Host $host;
    }
    
    # Static files (if any)
    location /static/ {
        alias /var/www/claude-flow/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Redirect HTTP to HTTPS
    if ($scheme != "https") {
        return 301 https://$host$request_uri;
    }
}
```

### Caching Strategy

#### Redis Caching Implementation
```javascript
// src/optimization/cache-manager.js
import Redis from 'redis';

export class CacheManager {
  constructor(config = {}) {
    this.redis = Redis.createClient({
      url: config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379',
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          console.error('Redis connection refused');
          return new Error('Redis connection refused');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          return new Error('Max retry attempts reached');
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });
    
    this.defaultTTL = config.defaultTTL || 3600; // 1 hour
    this.enabled = config.enabled !== false;
    
    this.redis.on('error', (err) => {
      console.error('Redis Client Error', err);
      this.enabled = false;
    });
    
    this.redis.on('connect', () => {
      console.log('Redis Client Connected');
      this.enabled = true;
    });
  }

  async get(key) {
    if (!this.enabled) return null;
    
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = this.defaultTTL) {
    if (!this.enabled) return false;
    
    try {
      await this.redis.setex(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  async del(key) {
    if (!this.enabled) return false;
    
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  async exists(key) {
    if (!this.enabled) return false;
    
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  // Swarm-specific caching methods
  async cacheSwarmResult(swarmId, result) {
    const key = `swarm:result:${swarmId}`;
    await this.set(key, result, 86400); // 24 hours
  }

  async getCachedSwarmResult(swarmId) {
    const key = `swarm:result:${swarmId}`;
    return await this.get(key);
  }

  async cacheAgentConfiguration(strategy, config) {
    const key = `agent:config:${strategy}`;
    await this.set(key, config, 3600); // 1 hour
  }

  async getCachedAgentConfiguration(strategy) {
    const key = `agent:config:${strategy}`;
    return await this.get(key);
  }

  // Rate limiting support
  async incrementRateLimit(identifier, window = 3600) {
    if (!this.enabled) return { count: 1, remaining: Infinity };
    
    try {
      const key = `rate:${identifier}`;
      const count = await this.redis.incr(key);
      
      if (count === 1) {
        await this.redis.expire(key, window);
      }
      
      return { count, remaining: Math.max(0, 100 - count) };
    } catch (error) {
      console.error('Rate limit error:', error);
      return { count: 1, remaining: Infinity };
    }
  }
}
```

---

## Security Configuration

### Authentication and Authorization

#### API Key Authentication
```javascript
// src/security/auth-middleware.js
import crypto from 'crypto';

export class AuthenticationManager {
  constructor(config = {}) {
    this.apiKeys = new Map();
    this.sessions = new Map();
    this.jwtSecret = config.jwtSecret || process.env.JWT_SECRET || this.generateSecret();
    this.apiKeyHeader = config.apiKeyHeader || 'x-api-key';
    this.rateLimiter = config.rateLimiter;
    
    this.loadApiKeys(config.apiKeys || []);
  }

  generateSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  loadApiKeys(keys) {
    keys.forEach(key => {
      this.apiKeys.set(key.key, {
        name: key.name,
        permissions: key.permissions || ['read', 'write'],
        rateLimit: key.rateLimit || 100,
        createdAt: new Date()
      });
    });
  }

  // Middleware for API key authentication
  apiKeyAuth = (req, res, next) => {
    const apiKey = req.headers[this.apiKeyHeader];
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        message: `Provide API key in ${this.apiKeyHeader} header`
      });
    }

    const keyInfo = this.apiKeys.get(apiKey);
    if (!keyInfo) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is not valid'
      });
    }

    // Rate limiting per API key
    if (this.rateLimiter) {
      const identifier = `apikey:${crypto.createHash('sha256').update(apiKey).digest('hex')}`;
      this.rateLimiter.incrementRateLimit(identifier).then(({ count, remaining }) => {
        if (count > keyInfo.rateLimit) {
          return res.status(429).json({
            error: 'Rate limit exceeded',
            message: `Rate limit of ${keyInfo.rateLimit} requests per hour exceeded`
          });
        }
        
        // Add auth info to request
        req.auth = {
          type: 'apikey',
          keyName: keyInfo.name,
          permissions: keyInfo.permissions,
          rateLimit: { count, remaining: Math.max(0, keyInfo.rateLimit - count) }
        };
        
        next();
      });
    } else {
      req.auth = {
        type: 'apikey',
        keyName: keyInfo.name,
        permissions: keyInfo.permissions
      };
      next();
    }
  };

  // Permission checking middleware
  requirePermission = (permission) => {
    return (req, res, next) => {
      if (!req.auth) {
        return res.status(401).json({
          error: 'Authentication required'
        });
      }

      if (!req.auth.permissions.includes(permission) && !req.auth.permissions.includes('admin')) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: permission,
          available: req.auth.permissions
        });
      }

      next();
    };
  };

  // JWT token generation (for session-based auth)
  generateJWT(payload) {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, this.jwtSecret, { expiresIn: '24h' });
  }

  // JWT token verification
  verifyJWT(token) {
    const jwt = require('jsonwebtoken');
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      return null;
    }
  }
}

// Usage in API server
export function setupAuthentication(app, config = {}) {
  const auth = new AuthenticationManager(config);
  
  // Apply authentication to protected routes
  app.use('/api/swarms', auth.apiKeyAuth);
  app.use('/api/swarms', auth.requirePermission('write'));
  
  return auth;
}
```

#### Network Security
```javascript
// src/security/security-middleware.js
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';

export function setupSecurityMiddleware(app, config = {}) {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "https:"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimitWindow || 15 * 60 * 1000, // 15 minutes
    max: config.rateLimitMax || 100, // limit each IP to 100 requests per windowMs
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Too many requests from this IP, please try again later.'
      });
    }
  });

  // Speed limiting for expensive operations
  const speedLimiter = slowDown({
    windowMs: config.slowDownWindow || 15 * 60 * 1000, // 15 minutes
    delayAfter: config.slowDownAfter || 10, // allow 10 requests per windowMs without delay
    delayMs: config.slowDownDelay || 500 // add 500ms of delay per request after delayAfter
  });

  // Apply rate limiting
  app.use('/api/', limiter);
  app.use('/api/swarms', speedLimiter);

  // Request size limiting
  app.use(express.json({ limit: config.jsonLimit || '10mb' }));
  app.use(express.urlencoded({ limit: config.urlLimit || '10mb', extended: true }));

  // IP filtering (if configured)
  if (config.allowedIPs && config.allowedIPs.length > 0) {
    app.use((req, res, next) => {
      const clientIP = req.ip || req.connection.remoteAddress;
      
      if (!config.allowedIPs.includes(clientIP)) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Access denied from this IP address'
        });
      }
      
      next();
    });
  }
}
```

### Input Validation and Sanitization

```javascript
// src/security/validation.js
import Joi from 'joi';
import DOMPurify from 'isomorphic-dompurify';

// Validation schemas
export const swarmCreationSchema = Joi.object({
  objective: Joi.string()
    .min(10)
    .max(1000)
    .required()
    .pattern(/^[a-zA-Z0-9\s\-.,!?()]+$/)
    .messages({
      'string.pattern.base': 'Objective contains invalid characters',
      'string.min': 'Objective must be at least 10 characters long',
      'string.max': 'Objective must not exceed 1000 characters'
    }),
  
  strategy: Joi.string()
    .valid('auto', 'research', 'development', 'analysis', 'testing')
    .default('auto'),
  
  mode: Joi.string()
    .valid('centralized', 'distributed', 'hierarchical')
    .default('centralized'),
  
  'max-agents': Joi.number()
    .integer()
    .min(1)
    .max(20)
    .default(5),
  
  timeout: Joi.number()
    .integer()
    .min(30000)
    .max(3600000)
    .default(300000)
});

export const swarmQuerySchema = Joi.object({
  status: Joi.string().valid('running', 'completed', 'failed', 'all').default('all'),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0)
});

// Validation middleware
export function validateRequest(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    req.validatedBody = value;
    next();
  };
}

// Sanitization middleware
export function sanitizeInput(req, res, next) {
  // Sanitize string inputs
  if (req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) {
      if (typeof value === 'string') {
        // Remove potentially dangerous HTML/script content
        req.body[key] = DOMPurify.sanitize(value, { 
          ALLOWED_TAGS: [],
          ALLOWED_ATTR: []
        });
        
        // Additional sanitization for specific fields
        if (key === 'objective') {
          // Remove excessive whitespace and normalize
          req.body[key] = value.trim().replace(/\s+/g, ' ');
        }
      }
    }
  }
  
  next();
}

// SQL injection prevention (if using SQL databases)
export function preventSQLInjection(input) {
  if (typeof input !== 'string') return input;
  
  // Basic SQL injection patterns to block
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(;|\-\-|\/\*|\*\/|xp_|sp_)/gi,
    /'.*'|".*"/gi
  ];
  
  for (const pattern of sqlPatterns) {
    if (pattern.test(input)) {
      throw new Error('Invalid input detected');
    }
  }
  
  return input;
}
```

---

## Graceful Shutdown Configuration

### Overview
Claude-Flow includes comprehensive graceful shutdown handling to ensure clean process termination in headless/remote execution scenarios. This is critical for container orchestration platforms and CI/CD pipelines.

### Automatic Detection
The system automatically detects and handles graceful shutdown in these environments:
- **Docker containers** - No TTY available
- **Kubernetes pods** - `KUBERNETES_SERVICE_HOST` environment variable
- **AWS Batch/Fargate** - `AWS_BATCH_JOB_ID` or `ECS_CONTAINER_METADATA_URI`
- **CI/CD pipelines** - `CI` or `CONTINUOUS_INTEGRATION` environment variables
- **Explicit headless mode** - `CLAUDE_FLOW_HEADLESS=true`

### Configuration Options

#### Environment Variables
```bash
# Force exit on completion (default: auto-detected)
CLAUDE_FLOW_EXIT_ON_COMPLETE=true

# Shutdown timeout in milliseconds (default: 30000)
CLAUDE_FLOW_SHUTDOWN_TIMEOUT=30000

# Force exit delay after cleanup (default: 5000)
CLAUDE_FLOW_FORCE_EXIT_DELAY=5000

# Disable graceful shutdown (not recommended)
CLAUDE_FLOW_NO_GRACEFUL_SHUTDOWN=true
```

#### Code Configuration
```javascript
import { getShutdownHandler } from 'claude-flow/headless';

const handler = getShutdownHandler({
  timeout: 30000,           // Maximum shutdown time
  forceExitDelay: 5000,    // Delay before forced exit
  exitOnComplete: true      // Exit when work completes
});

// Add custom cleanup handlers
handler.addCleanupHandler(async () => {
  console.log('Closing database connections...');
  await database.close();
});

handler.addCleanupHandler(async () => {
  console.log('Saving application state...');
  await saveState();
});
```

### Signal Handling
The following signals trigger graceful shutdown:
- **SIGTERM** - Standard termination (Docker, Kubernetes)
- **SIGINT** - Ctrl+C interruption
- **SIGHUP** - Terminal hangup
- **SIGQUIT** - Quit signal

### Shutdown Sequence
1. **Signal received** or **execution completed**
2. **Log shutdown reason** and status
3. **Execute cleanup handlers** in parallel (with timeout)
4. **Close active connections** and save state
5. **Log completion** and duration
6. **Exit with appropriate code** (0 for success, 1 for error)

### Container Best Practices

#### Dockerfile Configuration
```dockerfile
# Handle signals properly
STOPSIGNAL SIGTERM

# Ensure proper PID 1 handling
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/headless/index.js"]
```

#### Kubernetes Configuration
```yaml
spec:
  containers:
  - name: claude-flow
    # Graceful shutdown period
    terminationGracePeriodSeconds: 60
    
    # Shutdown lifecycle hook
    lifecycle:
      preStop:
        exec:
          command: ["/bin/sh", "-c", "sleep 5"]
```

#### Docker Compose Configuration
```yaml
services:
  claude-flow:
    stop_grace_period: 60s
    stop_signal: SIGTERM
```

### Monitoring Graceful Shutdown

#### Log Patterns
```bash
# Successful shutdown
🏁 Swarm execution completed
📊 Final status: ✅ Success
🛑 Initiating graceful shutdown (reason: completion)
🧹 Running 3 cleanup handlers...
✅ Graceful shutdown completed in 1234ms
👋 Exiting with code 0

# Error shutdown
📊 Final status: ❌ Failed
❌ Error details: Connection timeout
🛑 Initiating graceful shutdown (reason: error)
⚠️  Some cleanup handlers failed
✅ Graceful shutdown completed in 5678ms
👋 Exiting with code 1
```

#### Health Check Integration
```javascript
// Health endpoint reports shutdown status
app.get('/health', (req, res) => {
  if (shutdownHandler.isShuttingDown) {
    res.status(503).json({ 
      status: 'shutting_down',
      message: 'Service is gracefully shutting down' 
    });
  } else {
    res.json({ status: 'healthy' });
  }
});
```

### Testing Graceful Shutdown

#### Local Testing
```bash
# Test with timeout
timeout 10 node src/headless/index.js

# Test with signal
node src/headless/index.js &
PID=$!
sleep 5
kill -TERM $PID

# Test in Docker
docker run --rm claude-flow:headless &
CONTAINER=$(docker ps -lq)
sleep 5
docker stop $CONTAINER
```

#### Automated Testing
```javascript
// test-graceful-shutdown.js
import { spawn } from 'child_process';

const child = spawn('node', ['src/headless/index.js'], {
  env: { ...process.env, CLAUDE_FLOW_HEADLESS: 'true' }
});

setTimeout(() => {
  child.kill('SIGTERM');
}, 5000);

child.on('exit', (code) => {
  console.log(`Process exited with code: ${code}`);
  assert(code === 0, 'Should exit cleanly');
});
```

---

## Troubleshooting

### Common Issues and Solutions

#### 1. basicSwarmNew is not defined
**Error:**
```
ReferenceError: basicSwarmNew is not defined
    at Object.swarmCommand [as handler] (swarm.js:807:7)
```

**Solution:**
```bash
# Verify the import is correct in swarm.js
grep -n "basicSwarmNew" src/cli/simple-commands/swarm.js

# Should show:
# 13:import { basicSwarmNew } from '../../headless/execution-bridge.js';
# 810:      return await basicSwarmNew(args, flags);

# If missing, add the import:
echo "import { basicSwarmNew } from '../../headless/execution-bridge.js';" >> src/cli/simple-commands/swarm.js
```

#### 2. Cannot find module 'helpers.js'
**Error:**
```
Cannot find module '/path/to/claude-flow/src/utils/helpers.js'
```

**Solution:**
```bash
# Check if helpers.js exists
ls -la src/utils/helpers.js

# If missing, create it:
node -e "
const fs = require('fs');
const content = \`export function generateId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 9);
  return prefix ? \\\`\\\${prefix}_\\\${timestamp}_\\\${random}\\\` : \\\`\\\${timestamp}_\\\${random}\\\`;
}\`;
fs.writeFileSync('src/utils/helpers.js', content);
console.log('Created helpers.js');
"
```

#### 3. Docker Container Won't Start
**Error:**
```
Error: listen EADDRINUSE: address already in use :::3000
```

**Solution:**
```bash
# Check what's using port 3000
sudo netstat -tlnp | grep :3000

# Kill the process or use a different port
docker run -p 3001:3000 claude-flow:headless

# Or set a different port in environment
docker run -e CLAUDE_FLOW_PORT=3001 -p 3001:3001 claude-flow:headless
```

#### 4. API Requests Timing Out
**Symptoms:**
- Requests to `/api/swarms` hang
- No response after 60+ seconds

**Solution:**
```bash
# Check API server logs
docker logs claude-flow-container

# Check if the headless system is actually running
curl -v http://localhost:3000/health

# Verify environment variables are set
docker exec claude-flow-container env | grep CLAUDE

# Test with minimal request
curl -X POST http://localhost:3000/api/swarms \
  -H "Content-Type: application/json" \
  -d '{"objective": "test", "timeout": 10000}'
```

#### 5. High Memory Usage
**Symptoms:**
- Memory usage climbing continuously
- Container getting killed by OOM

**Solution:**
```bash
# Monitor memory usage
docker stats claude-flow-container

# Check for memory leaks in logs
docker logs claude-flow-container | grep -i memory

# Restart with memory limits
docker run --memory=2g --memory-swap=2g claude-flow:headless

# Enable garbage collection logging
docker run -e NODE_OPTIONS="--max-old-space-size=2048 --expose-gc" claude-flow:headless
```

### Diagnostic Scripts

#### Health Check Script
```bash
#!/bin/bash
# health-check.sh - Comprehensive health check for Claude-Flow

set -e

CLAUDE_FLOW_URL=${CLAUDE_FLOW_URL:-"http://localhost:3000"}
API_KEY=${CLAUDE_FLOW_API_KEY:-""}

echo "🏥 Claude-Flow Health Check"
echo "=========================="
echo "URL: $CLAUDE_FLOW_URL"
echo "Time: $(date)"
echo ""

# Test 1: Basic connectivity
echo "1. Testing basic connectivity..."
if curl -s -f "$CLAUDE_FLOW_URL/health" > /dev/null; then
  echo "   ✅ Server is responding"
else
  echo "   ❌ Server is not responding"
  exit 1
fi

# Test 2: Health endpoint response
echo "2. Checking health endpoint..."
HEALTH_RESPONSE=$(curl -s "$CLAUDE_FLOW_URL/health")
echo "   Response: $HEALTH_RESPONSE"

if echo "$HEALTH_RESPONSE" | grep -q '"status":"healthy"'; then
  echo "   ✅ Health check passed"
else
  echo "   ❌ Health check failed"
fi

# Test 3: API endpoint availability
echo "3. Testing API endpoints..."
if curl -s -f "$CLAUDE_FLOW_URL/api" > /dev/null; then
  echo "   ✅ API endpoints accessible"
else
  echo "   ❌ API endpoints not accessible"
fi

# Test 4: Swarm creation (if API key provided)
if [ -n "$API_KEY" ]; then
  echo "4. Testing swarm creation..."
  SWARM_RESPONSE=$(curl -s -X POST "$CLAUDE_FLOW_URL/api/swarms" \
    -H "Content-Type: application/json" \
    -H "x-api-key: $API_KEY" \
    -d '{"objective": "Health check test", "timeout": 10000}' || echo "ERROR")
  
  if echo "$SWARM_RESPONSE" | grep -q '"success":true'; then
    echo "   ✅ Swarm creation successful"
    
    # Extract swarm ID and check status
    SWARM_ID=$(echo "$SWARM_RESPONSE" | grep -o '"swarmId":"[^"]*"' | cut -d'"' -f4)
    if [ -n "$SWARM_ID" ]; then
      echo "   📋 Swarm ID: $SWARM_ID"
      
      # Wait a moment and check status
      sleep 2
      STATUS_RESPONSE=$(curl -s "$CLAUDE_FLOW_URL/api/swarms/$SWARM_ID" \
        -H "x-api-key: $API_KEY")
      echo "   📊 Status: $STATUS_RESPONSE"
    fi
  else
    echo "   ❌ Swarm creation failed: $SWARM_RESPONSE"
  fi
else
  echo "4. Skipping swarm creation test (no API key provided)"
fi

# Test 5: System resources
echo "5. Checking system resources..."
if command -v free >/dev/null 2>&1; then
  MEMORY_INFO=$(free -m | awk 'NR==2{printf "Memory: %s/%sMB (%.2f%%)", $3,$2,$3*100/$2}')
  echo "   📊 $MEMORY_INFO"
fi

if command -v df >/dev/null 2>&1; then
  DISK_INFO=$(df -h / | awk 'NR==2{printf "Disk: %s/%s (%s)", $3,$2,$5}')
  echo "   💾 $DISK_INFO"
fi

echo ""
echo "🎉 Health check completed successfully!"
```

#### Performance Monitoring Script
```bash
#!/bin/bash
# monitor-performance.sh - Monitor Claude-Flow performance

CLAUDE_FLOW_URL=${CLAUDE_FLOW_URL:-"http://localhost:3000"}
INTERVAL=${INTERVAL:-30}
LOG_FILE=${LOG_FILE:-"performance.log"}

echo "📊 Starting performance monitoring..."
echo "URL: $CLAUDE_FLOW_URL"
echo "Interval: ${INTERVAL}s"
echo "Log: $LOG_FILE"
echo ""

# Create CSV header
echo "timestamp,response_time_ms,cpu_percent,memory_mb,active_swarms,completed_swarms" > $LOG_FILE

while true; do
  TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  
  # Measure API response time
  START_TIME=$(date +%s%N)
  HEALTH_RESPONSE=$(curl -s "$CLAUDE_FLOW_URL/health" 2>/dev/null || echo "{}")
  END_TIME=$(date +%s%N)
  RESPONSE_TIME=$(( (END_TIME - START_TIME) / 1000000 ))
  
  # Extract metrics from health response
  ACTIVE_SWARMS=$(echo "$HEALTH_RESPONSE" | grep -o '"activeSwarms":[0-9]*' | cut -d':' -f2 || echo "0")
  
  # Get system metrics (Linux)
  if command -v ps >/dev/null 2>&1; then
    CPU_PERCENT=$(ps -o %cpu -p $$ | tail -n 1 | tr -d ' ' || echo "0")
  else
    CPU_PERCENT="0"
  fi
  
  if command -v free >/dev/null 2>&1; then
    MEMORY_MB=$(free -m | awk 'NR==2{print $3}' || echo "0")
  else
    MEMORY_MB="0"
  fi
  
  # Log to file
  echo "$TIMESTAMP,$RESPONSE_TIME,$CPU_PERCENT,$MEMORY_MB,$ACTIVE_SWARMS,0" >> $LOG_FILE
  
  # Print to console
  printf "\r%s | Response: %4dms | CPU: %5s%% | Memory: %5sMB | Swarms: %2s" \
    "$(date +%H:%M:%S)" "$RESPONSE_TIME" "$CPU_PERCENT" "$MEMORY_MB" "$ACTIVE_SWARMS"
  
  sleep $INTERVAL
done
```

This completes the comprehensive headless deployment guide for Claude-Flow. The documentation covers all major deployment scenarios, monitoring, performance optimization, security, and troubleshooting for AWS Batch Fargate and EC2 standalone deployments.