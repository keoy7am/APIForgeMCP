/**
 * Performance Optimization Types
 */

/**
 * Cache entry
 */
export interface CacheEntry<T = any> {
  /**
   * Cache key
   */
  key: string;
  
  /**
   * Cached value
   */
  value: T;
  
  /**
   * Expiration time
   */
  expiresAt?: Date;
  
  /**
   * Creation time
   */
  createdAt: Date;
  
  /**
   * Last access time
   */
  lastAccessedAt: Date;
  
  /**
   * Access count
   */
  accessCount: number;
  
  /**
   * Size in bytes
   */
  size: number;
  
  /**
   * Priority for eviction
   */
  priority?: number;
  
  /**
   * Tags for grouping
   */
  tags?: string[];
  
  /**
   * Metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Cache statistics
 */
export interface CacheStatistics {
  /**
   * Total entries
   */
  entries: number;
  
  /**
   * Total size in bytes
   */
  size: number;
  
  /**
   * Hit count
   */
  hits: number;
  
  /**
   * Miss count
   */
  misses: number;
  
  /**
   * Hit rate percentage
   */
  hitRate: number;
  
  /**
   * Eviction count
   */
  evictions: number;
  
  /**
   * Average access time in ms
   */
  avgAccessTime: number;
  
  /**
   * Memory usage
   */
  memoryUsage: {
    used: number;
    limit: number;
    percentage: number;
  };
}

/**
 * Cache eviction policy
 */
export type EvictionPolicy = 
  | 'lru'     // Least Recently Used
  | 'lfu'     // Least Frequently Used
  | 'fifo'    // First In First Out
  | 'ttl'     // Time To Live based
  | 'size'    // Size based
  | 'priority'; // Priority based

/**
 * Cache configuration
 */
export interface CacheConfig {
  /**
   * Maximum cache size in bytes
   */
  maxSize?: number;
  
  /**
   * Maximum number of entries
   */
  maxEntries?: number;
  
  /**
   * Default TTL in milliseconds
   */
  defaultTTL?: number;
  
  /**
   * Eviction policy
   */
  evictionPolicy?: EvictionPolicy;
  
  /**
   * Enable compression
   */
  compression?: boolean;
  
  /**
   * Enable persistence
   */
  persistent?: boolean;
  
  /**
   * Persistence path
   */
  persistencePath?: string;
  
  /**
   * Auto-save interval in ms
   */
  autoSaveInterval?: number;
  
  /**
   * Enable statistics collection
   */
  collectStats?: boolean;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  /**
   * Minimum connections
   */
  minConnections?: number;
  
  /**
   * Maximum connections
   */
  maxConnections?: number;
  
  /**
   * Connection timeout in ms
   */
  connectionTimeout?: number;
  
  /**
   * Idle timeout in ms
   */
  idleTimeout?: number;
  
  /**
   * Validation interval in ms
   */
  validationInterval?: number;
  
  /**
   * Enable keep-alive
   */
  keepAlive?: boolean;
  
  /**
   * Keep-alive interval in ms
   */
  keepAliveInterval?: number;
  
  /**
   * Queue requests when pool is full
   */
  queueRequests?: boolean;
  
  /**
   * Maximum queue size
   */
  maxQueueSize?: number;
  
  /**
   * Retry failed connections
   */
  retryFailedConnections?: boolean;
}

/**
 * Connection state
 */
export interface ConnectionState {
  /**
   * Connection ID
   */
  id: string;
  
  /**
   * Target URL/host
   */
  target: string;
  
  /**
   * Connection status
   */
  status: 'idle' | 'active' | 'closed' | 'error';
  
  /**
   * Creation time
   */
  createdAt: Date;
  
  /**
   * Last used time
   */
  lastUsedAt?: Date;
  
  /**
   * Request count
   */
  requestCount: number;
  
  /**
   * Error count
   */
  errorCount: number;
  
  /**
   * Average response time
   */
  avgResponseTime?: number;
  
  /**
   * Is reusable
   */
  reusable: boolean;
}

/**
 * Connection pool statistics
 */
export interface ConnectionPoolStats {
  /**
   * Total connections
   */
  total: number;
  
  /**
   * Active connections
   */
  active: number;
  
  /**
   * Idle connections
   */
  idle: number;
  
  /**
   * Waiting requests
   */
  waiting: number;
  
  /**
   * Total requests
   */
  totalRequests: number;
  
  /**
   * Failed requests
   */
  failedRequests: number;
  
  /**
   * Average wait time
   */
  avgWaitTime: number;
  
  /**
   * Pool utilization percentage
   */
  utilization: number;
  
  /**
   * Total connections (alias for backward compatibility)
   */
  totalConnections: number;
  
  /**
   * Active connections (alias for backward compatibility)
   */
  activeConnections: number;
  
  /**
   * Idle connections (alias for backward compatibility)
   */
  idleConnections: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  /**
   * Request metrics
   */
  requests: {
    total: number;
    successful: number;
    failed: number;
    avgDuration: number;
    p50: number;
    p95: number;
    p99: number;
    throughput: number; // requests per second
  };
  
  /**
   * Response metrics
   */
  responses: {
    avgSize: number;
    totalSize: number;
    avgProcessingTime: number;
    compressionRatio?: number;
  };
  
  /**
   * Cache metrics
   */
  cache: {
    hitRate: number;
    missRate: number;
    evictionRate: number;
    avgLookupTime: number;
  };
  
  /**
   * System metrics
   */
  system: {
    cpuUsage: number;
    memoryUsage: number;
    heapUsed: number;
    heapTotal: number;
    eventLoopLag?: number;
    gcPauses?: number;
  };
  
  /**
   * Network metrics
   */
  network: {
    activeConnections: number;
    bytesReceived: number;
    bytesSent: number;
    dnsLookupTime?: number;
    tcpConnectionTime?: number;
    tlsHandshakeTime?: number;
  };
  
  /**
   * Timestamp
   */
  timestamp: Date;
  
  /**
   * Duration (for interval metrics)
   */
  duration?: number;
}

/**
 * Performance threshold
 */
export interface PerformanceThreshold {
  /**
   * Metric name
   */
  metric: string;
  
  /**
   * Threshold value
   */
  value: number;
  
  /**
   * Comparison operator
   */
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne';
  
  /**
   * Action when threshold is exceeded
   */
  action?: 'warn' | 'error' | 'alert' | 'throttle' | 'circuit-break';
  
  /**
   * Cool down period in ms
   */
  cooldown?: number;
}

/**
 * Performance optimization strategy
 */
export interface OptimizationStrategy {
  /**
   * Strategy name
   */
  name: string;
  
  /**
   * Is enabled
   */
  enabled: boolean;
  
  /**
   * Conditions to activate
   */
  conditions: PerformanceThreshold[];
  
  /**
   * Actions to take
   */
  actions: OptimizationAction[];
  
  /**
   * Priority (higher = more important)
   */
  priority: number;
}

/**
 * Optimization action
 */
export interface OptimizationAction {
  /**
   * Action type
   */
  type: 'cache' | 'compress' | 'throttle' | 'pool' | 'batch' | 'custom';
  
  /**
   * Action configuration
   */
  config: Record<string, any>;
  
  /**
   * Delay before action in ms
   */
  delay?: number;
}

/**
 * Resource monitor configuration
 */
export interface ResourceMonitorConfig {
  /**
   * Enable monitoring
   */
  enabled?: boolean;
  
  /**
   * Sampling interval in ms
   */
  samplingInterval?: number;
  
  /**
   * History retention in samples
   */
  historySize?: number;
  
  /**
   * Thresholds
   */
  thresholds?: {
    cpu?: number;
    memory?: number;
    heap?: number;
    eventLoop?: number;
  };
  
  /**
   * Alert handlers
   */
  onAlert?: (metric: string, value: number, threshold: number) => void;
}

/**
 * Resource usage snapshot
 */
export interface ResourceUsage {
  /**
   * CPU usage percentage
   */
  cpu: {
    user: number;
    system: number;
    total: number;
  };
  
  /**
   * Memory usage
   */
  memory: {
    rss: number;        // Resident Set Size
    heapUsed: number;
    heapTotal: number;
    external: number;
    arrayBuffers: number;
  };
  
  /**
   * Event loop metrics
   */
  eventLoop?: {
    lag: number;
    utilization: number;
  };
  
  /**
   * File descriptors
   */
  fileDescriptors?: {
    open: number;
    max: number;
  };
  
  /**
   * Network connections
   */
  connections?: {
    active: number;
    established: number;
    waiting: number;
  };
  
  /**
   * Timestamp
   */
  timestamp: Date;
}

/**
 * Rate limiter configuration
 */
export interface RateLimiterConfig {
  /**
   * Maximum requests
   */
  maxRequests: number;
  
  /**
   * Time window in ms
   */
  windowMs: number;
  
  /**
   * Skip successful requests
   */
  skipSuccessful?: boolean;
  
  /**
   * Skip failed requests
   */
  skipFailed?: boolean;
  
  /**
   * Key generator function
   */
  keyGenerator?: (request: any) => string;
  
  /**
   * Custom skip function
   */
  skip?: (request: any) => boolean;
  
  /**
   * Handler for rate limit exceeded
   */
  onLimitExceeded?: (key: string) => void;
}

/**
 * Rate limiter state
 */
export interface RateLimiterState {
  /**
   * Key
   */
  key: string;
  
  /**
   * Request count
   */
  count: number;
  
  /**
   * Window start time
   */
  windowStart: Date;
  
  /**
   * Remaining requests
   */
  remaining: number;
  
  /**
   * Reset time
   */
  resetTime: Date;
  
  /**
   * Is limited
   */
  limited: boolean;
}

/**
 * Performance report
 */
export interface PerformanceReport {
  /**
   * Report ID
   */
  id: string;
  
  /**
   * Time range
   */
  timeRange: {
    start: Date;
    end: Date;
  };
  
  /**
   * Summary metrics
   */
  summary: PerformanceMetrics;
  
  /**
   * Detailed metrics over time
   */
  timeline?: PerformanceMetrics[];
  
  /**
   * Top slow endpoints
   */
  slowEndpoints?: Array<{
    endpoint: string;
    avgDuration: number;
    count: number;
    p95: number;
  }>;
  
  /**
   * Top errors
   */
  topErrors?: Array<{
    error: string;
    count: number;
    lastOccurred: Date;
  }>;
  
  /**
   * Optimization suggestions
   */
  suggestions?: Array<{
    type: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
  }>;
  
  /**
   * Generated at
   */
  generatedAt: Date;
}

/**
 * Compression options
 */
export interface CompressionOptions {
  /**
   * Enable compression
   */
  enabled?: boolean;
  
  /**
   * Compression level (1-9)
   */
  level?: number;
  
  /**
   * Minimum size to compress
   */
  threshold?: number;
  
  /**
   * Compression algorithms
   */
  algorithms?: ('gzip' | 'deflate' | 'br')[];
  
  /**
   * Content types to compress
   */
  types?: string[];
}

/**
 * Memory management options
 */
export interface MemoryManagementOptions {
  /**
   * Maximum heap size in bytes
   */
  maxHeapSize?: number;
  
  /**
   * Garbage collection threshold
   */
  gcThreshold?: number;
  
  /**
   * Enable aggressive GC
   */
  aggressiveGC?: boolean;
  
  /**
   * Memory leak detection
   */
  detectLeaks?: boolean;
  
  /**
   * Heap snapshot interval
   */
  heapSnapshotInterval?: number;
}