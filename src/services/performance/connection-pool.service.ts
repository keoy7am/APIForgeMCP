/**
 * Connection Pool Service
 * Manages HTTP connection pooling for improved performance
 */

import { Agent as HttpAgent } from 'http';
import { Agent as HttpsAgent } from 'https';
import { URL } from 'url';
import { EventEmitter } from 'events';
import type {
  ConnectionPoolConfig,
  ConnectionState,
  ConnectionPoolStats,
} from '../../types';
import { Logger } from '../../utils/logger';

interface PooledConnection {
  agent: HttpAgent | HttpsAgent;
  state: ConnectionState;
  queue: Array<{
    resolve: (agent: HttpAgent | HttpsAgent) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>;
}

export class ConnectionPool extends EventEmitter {
  private pools: Map<string, PooledConnection> = new Map();
  private config: Required<ConnectionPoolConfig>;
  private logger: Logger;
  private stats: ConnectionPoolStats;
  private validationTimer?: NodeJS.Timeout;

  constructor(
    config: ConnectionPoolConfig = {},
    logger: Logger = new Logger('ConnectionPool')
  ) {
    super();
    
    this.config = {
      minConnections: config.minConnections || 1,
      maxConnections: config.maxConnections || 10,
      connectionTimeout: config.connectionTimeout || 30000,
      idleTimeout: config.idleTimeout || 60000,
      validationInterval: config.validationInterval || 30000,
      keepAlive: config.keepAlive !== false,
      keepAliveInterval: config.keepAliveInterval || 30000,
      queueRequests: config.queueRequests !== false,
      maxQueueSize: config.maxQueueSize || 100,
      retryFailedConnections: config.retryFailedConnections !== false,
    };
    
    this.logger = logger;
    
    this.stats = {
      total: 0,
      active: 0,
      idle: 0,
      waiting: 0,
      totalRequests: 0,
      failedRequests: 0,
      avgWaitTime: 0,
      utilization: 0,
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
    };
    
    this.startValidation();
  }

  /**
   * Get or create a connection for the given URL
   */
  async getConnection(url: string): Promise<HttpAgent | HttpsAgent> {
    const parsedUrl = new URL(url);
    const poolKey = this.getPoolKey(parsedUrl);
    
    this.stats.totalRequests++;
    
    // Get or create pool for this host
    let pool = this.pools.get(poolKey);
    if (!pool) {
      pool = this.createPool(parsedUrl);
      this.pools.set(poolKey, pool);
    }
    
    // Check if connection is available
    if (pool.state.status === 'idle' || pool.state.status === 'active') {
      this.updateConnectionState(pool, 'active');
      return pool.agent;
    }
    
    // Check if we should queue the request
    if (this.config.queueRequests && pool.queue.length < this.config.maxQueueSize) {
      return this.queueRequest(pool);
    }
    
    // Connection not available and queue is full
    this.stats.failedRequests++;
    throw new Error(`Connection pool exhausted for ${poolKey}`);
  }

  /**
   * Release a connection back to the pool
   */
  releaseConnection(url: string): void {
    const parsedUrl = new URL(url);
    const poolKey = this.getPoolKey(parsedUrl);
    const pool = this.pools.get(poolKey);
    
    if (!pool) return;
    
    // Process queued requests
    if (pool.queue.length > 0) {
      const request = pool.queue.shift()!;
      clearTimeout(request.timeout);
      request.resolve(pool.agent);
      this.stats.waiting--;
    } else {
      this.updateConnectionState(pool, 'idle');
    }
  }

  /**
   * Report connection error
   */
  reportError(url: string, error: Error): void {
    const parsedUrl = new URL(url);
    const poolKey = this.getPoolKey(parsedUrl);
    const pool = this.pools.get(poolKey);
    
    if (!pool) return;
    
    pool.state.errorCount++;
    this.logger.error(`Connection error for ${poolKey}:`, error);
    
    // Check if connection should be recreated
    if (pool.state.errorCount > 3) {
      this.updateConnectionState(pool, 'error');
      
      if (this.config.retryFailedConnections) {
        this.recreateConnection(poolKey, pool);
      }
    }
  }

  /**
   * Get pool statistics
   */
  getStatistics(): ConnectionPoolStats {
    // Update current stats
    this.updateStatistics();
    return { ...this.stats };
  }

  /**
   * Get connection states
   */
  getConnectionStates(): ConnectionState[] {
    return Array.from(this.pools.values()).map(pool => ({ ...pool.state }));
  }

  /**
   * Close all connections
   */
  closeAll(): void {
    for (const [key, pool] of this.pools.entries()) {
      this.closeConnection(key, pool);
    }
    
    this.pools.clear();
    this.stopValidation();
  }

  /**
   * Create a new pool for a host
   */
  private createPool(url: URL): PooledConnection {
    const isHttps = url.protocol === 'https:';
    
    const agentOptions = {
      keepAlive: this.config.keepAlive,
      keepAliveMsecs: this.config.keepAliveInterval,
      maxSockets: this.config.maxConnections,
      maxFreeSockets: this.config.minConnections,
      timeout: this.config.connectionTimeout,
    };
    
    const agent = isHttps
      ? new HttpsAgent(agentOptions)
      : new HttpAgent(agentOptions);
    
    const state: ConnectionState = {
      id: `${url.hostname}:${url.port || (isHttps ? 443 : 80)}`,
      target: url.hostname,
      status: 'idle',
      createdAt: new Date(),
      requestCount: 0,
      errorCount: 0,
      reusable: true,
    };
    
    this.stats.total++;
    this.stats.idle++;
    
    return {
      agent,
      state,
      queue: [],
    };
  }

  /**
   * Queue a request for a connection
   */
  private queueRequest(pool: PooledConnection): Promise<HttpAgent | HttpsAgent> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = pool.queue.findIndex(r => r.resolve === resolve);
        if (index > -1) {
          pool.queue.splice(index, 1);
          this.stats.waiting--;
          this.stats.failedRequests++;
          reject(new Error('Connection request timeout'));
        }
      }, this.config.connectionTimeout);
      
      pool.queue.push({ resolve, reject, timeout });
      this.stats.waiting++;
      
      this.emit('queued', pool.state.id);
    });
  }

  /**
   * Update connection state
   */
  private updateConnectionState(
    pool: PooledConnection,
    status: ConnectionState['status']
  ): void {
    const oldStatus = pool.state.status;
    pool.state.status = status;
    
    // Update stats
    if (oldStatus === 'idle' && status === 'active') {
      this.stats.idle--;
      this.stats.active++;
      pool.state.requestCount++;
      pool.state.lastUsedAt = new Date();
    } else if (oldStatus === 'active' && status === 'idle') {
      this.stats.active--;
      this.stats.idle++;
    } else if (status === 'closed' || status === 'error') {
      if (oldStatus === 'idle') this.stats.idle--;
      if (oldStatus === 'active') this.stats.active--;
      this.stats.total--;
    }
    
    this.emit('stateChange', pool.state.id, oldStatus, status);
  }

  /**
   * Recreate a failed connection
   */
  private recreateConnection(key: string, oldPool: PooledConnection): void {
    this.logger.info(`Recreating connection for ${key}`);
    
    // Close old connection
    this.closeConnection(key, oldPool);
    
    // Create new connection
    const url = new URL(`http://${oldPool.state.target}`);
    const newPool = this.createPool(url);
    this.pools.set(key, newPool);
    
    // Process queued requests
    for (const request of oldPool.queue) {
      clearTimeout(request.timeout);
      request.resolve(newPool.agent);
    }
  }

  /**
   * Close a connection
   */
  private closeConnection(key: string, pool: PooledConnection): void {
    // Reject all queued requests
    for (const request of pool.queue) {
      clearTimeout(request.timeout);
      request.reject(new Error('Connection closed'));
    }
    
    pool.queue = [];
    
    // Destroy the agent
    if ('destroy' in pool.agent) {
      (pool.agent as any).destroy();
    }
    
    this.updateConnectionState(pool, 'closed');
    this.emit('closed', key);
  }

  /**
   * Get pool key for a URL
   */
  private getPoolKey(url: URL): string {
    return `${url.protocol}//${url.hostname}:${url.port || (url.protocol === 'https:' ? 443 : 80)}`;
  }

  /**
   * Update statistics
   */
  private updateStatistics(): void {
    let totalWaitTime = 0;
    let waitCount = 0;
    
    for (const pool of this.pools.values()) {
      if (pool.state.avgResponseTime) {
        totalWaitTime += pool.state.avgResponseTime;
        waitCount++;
      }
    }
    
    if (waitCount > 0) {
      this.stats.avgWaitTime = totalWaitTime / waitCount;
    }
    
    if (this.stats.total > 0) {
      this.stats.utilization = (this.stats.active / this.stats.total) * 100;
    }
    
    // Update aliases for backward compatibility
    this.stats.totalConnections = this.stats.total;
    this.stats.activeConnections = this.stats.active;
    this.stats.idleConnections = this.stats.idle;
  }

  /**
   * Start connection validation
   */
  private startValidation(): void {
    if (!this.config.validationInterval) return;
    
    this.validationTimer = setInterval(() => {
      this.validateConnections();
    }, this.config.validationInterval);
  }

  /**
   * Stop connection validation
   */
  private stopValidation(): void {
    if (this.validationTimer) {
      clearInterval(this.validationTimer);
      this.validationTimer = undefined;
    }
  }

  /**
   * Validate all connections
   */
  private validateConnections(): void {
    const now = Date.now();
    const toRemove: string[] = [];
    
    for (const [key, pool] of this.pools.entries()) {
      // Check idle timeout
      if (
        pool.state.status === 'idle' &&
        pool.state.lastUsedAt &&
        now - pool.state.lastUsedAt.getTime() > this.config.idleTimeout
      ) {
        toRemove.push(key);
      }
      
      // Check error state
      if (pool.state.status === 'error' && !this.config.retryFailedConnections) {
        toRemove.push(key);
      }
    }
    
    // Remove idle connections
    for (const key of toRemove) {
      const pool = this.pools.get(key)!;
      this.closeConnection(key, pool);
      this.pools.delete(key);
      this.logger.debug(`Removed idle connection: ${key}`);
    }
  }

  /**
   * Dispose of the connection pool
   */
  dispose(): void {
    this.closeAll();
    this.removeAllListeners();
  }
}