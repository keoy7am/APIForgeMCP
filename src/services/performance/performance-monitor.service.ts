/**
 * Performance Monitor Service
 * Monitors and tracks application performance metrics
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import type {
  PerformanceMetrics,
  PerformanceThreshold,
  OptimizationStrategy,
  PerformanceReport,
  ResourceUsage,
  ResourceMonitorConfig,
} from '../../types';
import { Logger } from '../../utils/logger';
import { FileStorage } from '../../storage/file-storage';

interface MetricSample {
  timestamp: Date;
  value: number;
}

interface MetricHistory {
  samples: MetricSample[];
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
}

export class PerformanceMonitor extends EventEmitter {
  private config: Required<ResourceMonitorConfig>;
  private logger: Logger;
  private storage?: FileStorage;
  
  private metrics: Map<string, MetricHistory> = new Map();
  private thresholds: PerformanceThreshold[] = [];
  private strategies: OptimizationStrategy[] = [];
  private sampleTimer?: NodeJS.Timeout;
  private resourceHistory: ResourceUsage[] = [];
  
  // Request tracking
  private requestMetrics = {
    total: 0,
    successful: 0,
    failed: 0,
    durations: [] as number[],
    sizes: [] as number[],
  };
  
  // Cache tracking
  private cacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    lookupTimes: [] as number[],
  };
  
  private startTime: Date;

  constructor(
    config: ResourceMonitorConfig = {},
    storage?: FileStorage,
    logger: Logger = new Logger('PerformanceMonitor')
  ) {
    super();
    
    this.config = {
      enabled: config.enabled !== false,
      samplingInterval: config.samplingInterval || 5000, // 5 seconds
      historySize: config.historySize || 1000,
      thresholds: config.thresholds || {
        cpu: 80,
        memory: 90,
        heap: 85,
        eventLoop: 100,
      },
      onAlert: config.onAlert || (() => {}),
    };
    
    this.logger = logger;
    this.storage = storage;
    this.startTime = new Date();
    
    if (this.config.enabled) {
      this.startMonitoring();
    }
    
    this.initializeDefaultStrategies();
  }

  /**
   * Record request metrics
   */
  recordRequest(
    duration: number,
    success: boolean,
    responseSize?: number
  ): void {
    this.requestMetrics.total++;
    
    if (success) {
      this.requestMetrics.successful++;
    } else {
      this.requestMetrics.failed++;
    }
    
    this.requestMetrics.durations.push(duration);
    
    if (responseSize !== undefined) {
      this.requestMetrics.sizes.push(responseSize);
    }
    
    // Keep array sizes manageable
    if (this.requestMetrics.durations.length > this.config.historySize) {
      this.requestMetrics.durations.shift();
    }
    if (this.requestMetrics.sizes.length > this.config.historySize) {
      this.requestMetrics.sizes.shift();
    }
    
    // Check thresholds
    this.checkThreshold('request.duration', duration);
    if (responseSize) {
      this.checkThreshold('response.size', responseSize);
    }
  }

  /**
   * Record cache metrics
   */
  recordCacheAccess(hit: boolean, lookupTime: number): void {
    if (hit) {
      this.cacheMetrics.hits++;
    } else {
      this.cacheMetrics.misses++;
    }
    
    this.cacheMetrics.lookupTimes.push(lookupTime);
    
    if (this.cacheMetrics.lookupTimes.length > this.config.historySize) {
      this.cacheMetrics.lookupTimes.shift();
    }
    
    this.checkThreshold('cache.lookupTime', lookupTime);
  }

  /**
   * Record cache eviction
   */
  recordCacheEviction(): void {
    this.cacheMetrics.evictions++;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    const requestStats = this.calculateStatistics(this.requestMetrics.durations);
    const sizeStats = this.calculateStatistics(this.requestMetrics.sizes);
    const cacheStats = this.calculateStatistics(this.cacheMetrics.lookupTimes);
    const currentResource = this.getCurrentResourceUsage();
    
    const totalCacheAccess = this.cacheMetrics.hits + this.cacheMetrics.misses;
    const hitRate = totalCacheAccess > 0 
      ? (this.cacheMetrics.hits / totalCacheAccess) * 100 
      : 0;
    
    const duration = Date.now() - this.startTime.getTime();
    const throughput = this.requestMetrics.total > 0
      ? (this.requestMetrics.total / (duration / 1000))
      : 0;
    
    return {
      requests: {
        total: this.requestMetrics.total,
        successful: this.requestMetrics.successful,
        failed: this.requestMetrics.failed,
        avgDuration: requestStats.avg,
        p50: requestStats.p50,
        p95: requestStats.p95,
        p99: requestStats.p99,
        throughput,
      },
      responses: {
        avgSize: sizeStats.avg,
        totalSize: this.requestMetrics.sizes.reduce((sum, size) => sum + size, 0),
        avgProcessingTime: requestStats.avg,
      },
      cache: {
        hitRate,
        missRate: 100 - hitRate,
        evictionRate: totalCacheAccess > 0
          ? (this.cacheMetrics.evictions / totalCacheAccess) * 100
          : 0,
        avgLookupTime: cacheStats.avg,
      },
      system: {
        cpuUsage: currentResource.cpu.total,
        memoryUsage: currentResource.memory.rss,
        heapUsed: currentResource.memory.heapUsed,
        heapTotal: currentResource.memory.heapTotal,
        eventLoopLag: currentResource.eventLoop?.lag,
      },
      network: {
        activeConnections: currentResource.connections?.active || 0,
        bytesReceived: 0, // Would need actual network tracking
        bytesSent: 0,
      },
      timestamp: new Date(),
      duration,
    };
  }

  /**
   * Generate performance report
   */
  async generateReport(
    startTime?: Date,
    endTime?: Date
  ): Promise<PerformanceReport> {
    const metrics = this.getMetrics();
    const slowEndpoints = this.identifySlowEndpoints();
    const suggestions = this.generateOptimizationSuggestions(metrics);
    
    const report: PerformanceReport = {
      id: `report-${Date.now()}`,
      timeRange: {
        start: startTime || this.startTime,
        end: endTime || new Date(),
      },
      summary: metrics,
      slowEndpoints,
      suggestions,
      generatedAt: new Date(),
    };
    
    // Save report if storage is available
    if (this.storage) {
      await this.saveReport(report);
    }
    
    return report;
  }

  /**
   * Add performance threshold
   */
  addThreshold(threshold: PerformanceThreshold): void {
    this.thresholds.push(threshold);
    this.logger.debug(`Added threshold for ${threshold.metric}`);
  }

  /**
   * Add optimization strategy
   */
  addStrategy(strategy: OptimizationStrategy): void {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => b.priority - a.priority);
    this.logger.debug(`Added optimization strategy: ${strategy.name}`);
  }

  /**
   * Start monitoring
   */
  startMonitoring(): void {
    if (this.sampleTimer) return;
    
    this.sampleTimer = setInterval(() => {
      this.collectSample();
    }, this.config.samplingInterval);
    
    this.logger.info('Performance monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = undefined;
    }
    
    this.logger.info('Performance monitoring stopped');
  }

  /**
   * Collect resource sample
   */
  private collectSample(): void {
    const usage = this.getCurrentResourceUsage();
    
    // Add to history
    this.resourceHistory.push(usage);
    if (this.resourceHistory.length > this.config.historySize) {
      this.resourceHistory.shift();
    }
    
    // Check thresholds
    this.checkResourceThresholds(usage);
    
    // Store metric samples
    this.storeMetricSample('cpu', usage.cpu.total);
    this.storeMetricSample('memory', usage.memory.rss);
    this.storeMetricSample('heap', usage.memory.heapUsed);
    
    if (usage.eventLoop) {
      this.storeMetricSample('eventLoop', usage.eventLoop.lag);
    }
  }

  /**
   * Get current resource usage
   */
  private getCurrentResourceUsage(): ResourceUsage {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // Calculate CPU percentage (simplified)
    const cpuPercent = {
      user: cpuUsage.user / 1000000, // Convert to seconds
      system: cpuUsage.system / 1000000,
      total: (cpuUsage.user + cpuUsage.system) / 1000000,
    };
    
    return {
      cpu: cpuPercent,
      memory: memUsage,
      timestamp: new Date(),
    };
  }

  /**
   * Store metric sample
   */
  private storeMetricSample(metric: string, value: number): void {
    let history = this.metrics.get(metric);
    
    if (!history) {
      history = {
        samples: [],
        min: value,
        max: value,
        avg: value,
        p50: value,
        p95: value,
        p99: value,
      };
      this.metrics.set(metric, history);
    }
    
    // Add sample
    history.samples.push({
      timestamp: new Date(),
      value,
    });
    
    // Trim history
    if (history.samples.length > this.config.historySize) {
      history.samples.shift();
    }
    
    // Update statistics
    const values = history.samples.map(s => s.value);
    const stats = this.calculateStatistics(values);
    
    history.min = stats.min;
    history.max = stats.max;
    history.avg = stats.avg;
    history.p50 = stats.p50;
    history.p95 = stats.p95;
    history.p99 = stats.p99;
  }

  /**
   * Calculate statistics for values
   */
  private calculateStatistics(values: number[]): {
    min: number;
    max: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
  } {
    if (values.length === 0) {
      return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((acc, val) => acc + val, 0);
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      p50: this.percentile(sorted, 0.5),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Check threshold
   */
  private checkThreshold(metric: string, value: number): void {
    for (const threshold of this.thresholds) {
      if (threshold.metric !== metric) continue;
      
      let exceeded = false;
      
      switch (threshold.operator) {
        case 'gt':
          exceeded = value > threshold.value;
          break;
        case 'gte':
          exceeded = value >= threshold.value;
          break;
        case 'lt':
          exceeded = value < threshold.value;
          break;
        case 'lte':
          exceeded = value <= threshold.value;
          break;
        case 'eq':
          exceeded = value === threshold.value;
          break;
        case 'ne':
          exceeded = value !== threshold.value;
          break;
      }
      
      if (exceeded) {
        this.handleThresholdExceeded(threshold, value);
      }
    }
  }

  /**
   * Check resource thresholds
   */
  private checkResourceThresholds(usage: ResourceUsage): void {
    const thresholds = this.config.thresholds!;
    
    if (thresholds.cpu && usage.cpu.total > thresholds.cpu) {
      this.handleAlert('cpu', usage.cpu.total, thresholds.cpu);
    }
    
    const memoryPercent = (usage.memory.rss / (2 * 1024 * 1024 * 1024)) * 100; // Assume 2GB limit
    if (thresholds.memory && memoryPercent > thresholds.memory) {
      this.handleAlert('memory', memoryPercent, thresholds.memory);
    }
    
    const heapPercent = (usage.memory.heapUsed / usage.memory.heapTotal) * 100;
    if (thresholds.heap && heapPercent > thresholds.heap) {
      this.handleAlert('heap', heapPercent, thresholds.heap);
    }
    
    if (thresholds.eventLoop && usage.eventLoop && usage.eventLoop.lag > thresholds.eventLoop) {
      this.handleAlert('eventLoop', usage.eventLoop.lag, thresholds.eventLoop);
    }
  }

  /**
   * Handle threshold exceeded
   */
  private handleThresholdExceeded(threshold: PerformanceThreshold, value: number): void {
    this.logger.warn(`Threshold exceeded for ${threshold.metric}: ${value} ${threshold.operator} ${threshold.value}`);
    
    // Trigger action
    switch (threshold.action) {
      case 'warn':
        this.emit('warning', threshold.metric, value);
        break;
      case 'error':
        this.emit('error', threshold.metric, value);
        break;
      case 'alert':
        this.handleAlert(threshold.metric, value, threshold.value);
        break;
      case 'throttle':
        this.emit('throttle', threshold.metric, value);
        break;
      case 'circuit-break':
        this.emit('circuit-break', threshold.metric, value);
        break;
    }
    
    // Check optimization strategies
    this.checkOptimizationStrategies(threshold.metric, value);
  }

  /**
   * Handle alert
   */
  private handleAlert(metric: string, value: number, threshold: number): void {
    this.logger.error(`Alert: ${metric} = ${value} (threshold: ${threshold})`);
    
    if (this.config.onAlert) {
      this.config.onAlert(metric, value, threshold);
    }
    
    this.emit('alert', metric, value, threshold);
  }

  /**
   * Check optimization strategies
   */
  private checkOptimizationStrategies(metric: string, value: number): void {
    for (const strategy of this.strategies) {
      if (!strategy.enabled) continue;
      
      const shouldActivate = strategy.conditions.every(condition => {
        if (condition.metric !== metric) return true;
        
        switch (condition.operator) {
          case 'gt': return value > condition.value;
          case 'gte': return value >= condition.value;
          case 'lt': return value < condition.value;
          case 'lte': return value <= condition.value;
          case 'eq': return value === condition.value;
          case 'ne': return value !== condition.value;
          default: return false;
        }
      });
      
      if (shouldActivate) {
        this.executeOptimizationStrategy(strategy);
      }
    }
  }

  /**
   * Execute optimization strategy
   */
  private executeOptimizationStrategy(strategy: OptimizationStrategy): void {
    this.logger.info(`Executing optimization strategy: ${strategy.name}`);
    
    for (const action of strategy.actions) {
      setTimeout(() => {
        this.emit('optimize', action.type, action.config);
      }, action.delay || 0);
    }
  }

  /**
   * Initialize default strategies
   */
  private initializeDefaultStrategies(): void {
    // High memory usage strategy
    this.addStrategy({
      name: 'high-memory-optimization',
      enabled: true,
      conditions: [
        { metric: 'memory', value: 80, operator: 'gt' },
      ],
      actions: [
        { type: 'cache', config: { action: 'clear-old' } },
        { type: 'custom', config: { action: 'gc' } },
      ],
      priority: 10,
    });
    
    // High latency strategy
    this.addStrategy({
      name: 'high-latency-optimization',
      enabled: true,
      conditions: [
        { metric: 'request.duration', value: 1000, operator: 'gt' },
      ],
      actions: [
        { type: 'cache', config: { action: 'warm-up' } },
        { type: 'pool', config: { action: 'increase-connections' } },
      ],
      priority: 8,
    });
    
    // Low cache hit rate strategy
    this.addStrategy({
      name: 'low-cache-hit-optimization',
      enabled: true,
      conditions: [
        { metric: 'cache.hitRate', value: 50, operator: 'lt' },
      ],
      actions: [
        { type: 'cache', config: { action: 'optimize-keys' } },
        { type: 'cache', config: { action: 'increase-ttl' } },
      ],
      priority: 6,
    });
  }

  /**
   * Identify slow endpoints
   */
  private identifySlowEndpoints(): Array<{
    endpoint: string;
    avgDuration: number;
    count: number;
    p95: number;
  }> {
    // This would need integration with request tracking
    // For now, return empty array
    return [];
  }

  /**
   * Generate optimization suggestions
   */
  private generateOptimizationSuggestions(
    metrics: PerformanceMetrics
  ): Array<{
    type: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'high' | 'medium' | 'low';
  }> {
    const suggestions = [];
    
    // Check cache hit rate
    if (metrics.cache.hitRate < 70) {
      suggestions.push({
        type: 'cache',
        description: 'Improve cache hit rate by adjusting TTL and key generation',
        impact: 'high' as const,
        effort: 'low' as const,
      });
    }
    
    // Check response times
    if (metrics.requests.p95 > 2000) {
      suggestions.push({
        type: 'performance',
        description: 'Optimize slow endpoints or implement response caching',
        impact: 'high' as const,
        effort: 'medium' as const,
      });
    }
    
    // Check memory usage
    if (metrics.system.heapUsed / metrics.system.heapTotal > 0.8) {
      suggestions.push({
        type: 'memory',
        description: 'Reduce memory usage by optimizing data structures',
        impact: 'medium' as const,
        effort: 'high' as const,
      });
    }
    
    return suggestions;
  }

  /**
   * Save report to storage
   */
  private async saveReport(report: PerformanceReport): Promise<void> {
    if (!this.storage) return;
    
    try {
      const filename = `performance-report-${report.id}.json`;
      await this.storage.writeData(filename, report);
      this.logger.info(`Performance report saved: ${filename}`);
    } catch (error) {
      this.logger.error('Failed to save performance report', error);
    }
  }

  /**
   * Dispose of the monitor
   */
  dispose(): void {
    this.stopMonitoring();
    this.removeAllListeners();
  }
}