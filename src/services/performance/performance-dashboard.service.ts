/**
 * Performance Monitoring Dashboard Service
 * 性能監控儀表板服務
 */

import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';
import { PerformanceMonitor } from './performance-monitor.service';
import { CacheManager } from './cache-manager.service';
import { ConnectionPool } from './connection-pool.service';
import { RateLimiter } from './rate-limiter.service';
import type { Logger } from '../../types';

// Dashboard 數據類型
interface DashboardMetrics {
  timestamp: number;
  system: SystemMetrics;
  application: ApplicationMetrics;
  performance: PerformanceMetrics;
  health: HealthMetrics;
}

interface SystemMetrics {
  memory: {
    used: number;        // MB
    total: number;       // MB
    percentage: number;  // %
    heap: {
      used: number;
      total: number;
      percentage: number;
    };
    external: number;    // MB
  };
  cpu: {
    usage: number;       // %
    loadAverage: number[];
  };
  uptime: number;        // seconds
  nodeVersion: string;
  connections?: {
    active: number;
    total: number;
  };
}

interface ApplicationMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    rate: number;        // requests/sec
    errorRate: number;   // %
  };
  cache: {
    hitRate: number;     // %
    size: number;        // bytes
    entries: number;
    evictions: number;
  };
  connections: {
    active: number;
    idle: number;
    total: number;
    utilization: number; // %
  };
  rateLimiting: {
    activeClients: number;
    rejectedRequests: number;
    rejectionRate: number; // %
  };
}

interface PerformanceMetrics {
  responseTime: {
    avg: number;         // ms
    p50: number;         // ms
    p95: number;         // ms
    p99: number;         // ms
  };
  throughput: {
    current: number;     // requests/sec
    peak: number;        // requests/sec
    average: number;     // requests/sec
  };
  latency: {
    network: number;     // ms
    processing: number;  // ms
    queue: number;       // ms
  };
}

interface HealthMetrics {
  status: 'healthy' | 'warning' | 'critical';
  checks: {
    memory: HealthCheck;
    cpu: HealthCheck;
    responseTime: HealthCheck;
    errorRate: HealthCheck;
    cache: HealthCheck;
    connections: HealthCheck;
  };
  alerts: Alert[];
}

interface HealthCheck {
  status: 'ok' | 'warning' | 'critical';
  value: number;
  threshold: number;
  message: string;
}

interface Alert {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: number;
  resolved: boolean;
  metric: string;
  value: number;
  threshold: number;
}

// Dashboard 配置
interface DashboardConfig {
  updateInterval: number;    // ms
  historyLength: number;     // number of data points to keep
  alertThresholds: {
    memory: { warning: number; critical: number };
    cpu: { warning: number; critical: number };
    responseTime: { warning: number; critical: number };
    errorRate: { warning: number; critical: number };
    cacheHitRate: { warning: number; critical: number };
    connections: { warning: number; critical: number };
  };
  enableRealTimeUpdates: boolean;
  enableAlerts: boolean;
}

const DEFAULT_CONFIG: DashboardConfig = {
  updateInterval: 5000,      // 5 seconds
  historyLength: 720,        // 1 hour of data (5s intervals)
  alertThresholds: {
    memory: { warning: 70, critical: 85 },        // %
    cpu: { warning: 70, critical: 90 },           // %
    responseTime: { warning: 200, critical: 500 }, // ms
    errorRate: { warning: 5, critical: 10 },      // %
    cacheHitRate: { warning: 80, critical: 60 },  // %
    connections: { warning: 80, critical: 95 },   // active connections
  },
  enableRealTimeUpdates: true,
  enableAlerts: true,
};

export class PerformanceDashboard extends EventEmitter {
  private config: DashboardConfig;
  private metricsHistory: DashboardMetrics[] = [];
  private updateInterval?: NodeJS.Timeout;
  private alerts: Map<string, Alert> = new Map();
  private alertCounter = 0;

  // 服務引用
  private performanceMonitor: PerformanceMonitor;
  private cacheManager?: CacheManager;
  private connectionPool?: ConnectionPool;
  private rateLimiter?: RateLimiter;

  // 統計追踪
  private requestStats = {
    total: 0,
    successful: 0,
    failed: 0,
    responseTimes: [] as number[],
    lastUpdateTime: Date.now(),
  };

  constructor(
    performanceMonitor: PerformanceMonitor,
    logger: Logger,
    config?: Partial<DashboardConfig>
  ) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.performanceMonitor = performanceMonitor;
    
    this.setupEventListeners();
    
    if (this.config.enableRealTimeUpdates) {
      this.start();
    }
  }

  /**
   * 設置服務引用
   */
  setServices(services: {
    cacheManager?: CacheManager;
    connectionPool?: ConnectionPool;
    rateLimiter?: RateLimiter;
  }): void {
    this.cacheManager = services.cacheManager;
    this.connectionPool = services.connectionPool;
    this.rateLimiter = services.rateLimiter;
  }

  /**
   * 開始實時監控
   */
  start(): void {
    if (this.updateInterval) {
      return; // Already running
    }

    this.updateInterval = setInterval(() => {
      this.updateMetrics();
    }, this.config.updateInterval);

    // 初始更新
    this.updateMetrics();
    
    this.emit('started');
  }

  /**
   * 停止監控
   */
  stop(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = undefined;
    }
    
    this.emit('stopped');
  }

  /**
   * 獲取當前儀表板數據
   */
  getCurrentMetrics(): DashboardMetrics | null {
    return this.metricsHistory.length > 0 
      ? this.metricsHistory[this.metricsHistory.length - 1] 
      : null;
  }

  /**
   * 獲取歷史數據
   */
  getHistoricalMetrics(minutes?: number): DashboardMetrics[] {
    if (!minutes) {
      return [...this.metricsHistory];
    }

    const pointsNeeded = Math.ceil((minutes * 60 * 1000) / this.config.updateInterval);
    return this.metricsHistory.slice(-pointsNeeded);
  }

  /**
   * 獲取活躍警報
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * 獲取所有警報
   */
  getAllAlerts(): Alert[] {
    return Array.from(this.alerts.values());
  }

  /**
   * 解決警報
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      this.emit('alertResolved', alert);
      return true;
    }
    return false;
  }

  /**
   * 清除已解決的警報
   */
  clearResolvedAlerts(): number {
    const resolved = Array.from(this.alerts.values()).filter(a => a.resolved);
    resolved.forEach(alert => this.alerts.delete(alert.id));
    return resolved.length;
  }

  /**
   * 記錄請求統計
   */
  recordRequest(success: boolean, responseTime: number): void {
    this.requestStats.total++;
    if (success) {
      this.requestStats.successful++;
    } else {
      this.requestStats.failed++;
    }
    
    this.requestStats.responseTimes.push(responseTime);
    
    // 保持響應時間數組在合理大小
    if (this.requestStats.responseTimes.length > 1000) {
      this.requestStats.responseTimes = this.requestStats.responseTimes.slice(-500);
    }
  }

  /**
   * 生成性能報告
   */
  generateReport(periodMinutes: number = 60): string {
    const metrics = this.getHistoricalMetrics(periodMinutes);
    if (metrics.length === 0) {
      return 'No data available for the specified period.';
    }

    const latest = metrics[metrics.length - 1];
    
    return `
=== APIForge MCP Server Performance Report ===
Generated: ${new Date().toISOString()}
Period: Last ${periodMinutes} minutes

🖥️  SYSTEM METRICS
Memory Usage: ${latest.system.memory.percentage.toFixed(1)}% (${latest.system.memory.used.toFixed(1)}MB)
CPU Usage: ${latest.system.cpu.usage.toFixed(1)}%
Uptime: ${(latest.system.uptime / 3600).toFixed(1)} hours

📊 APPLICATION METRICS
Total Requests: ${latest.application.requests.total.toLocaleString()}
Success Rate: ${(100 - latest.application.requests.errorRate).toFixed(1)}%
Request Rate: ${latest.application.requests.rate.toFixed(1)} req/sec
Cache Hit Rate: ${latest.application.cache.hitRate.toFixed(1)}%

⚡ PERFORMANCE METRICS
Avg Response Time: ${latest.performance.responseTime.avg.toFixed(1)}ms
P95 Response Time: ${latest.performance.responseTime.p95.toFixed(1)}ms
P99 Response Time: ${latest.performance.responseTime.p99.toFixed(1)}ms
Current Throughput: ${latest.performance.throughput.current.toFixed(1)} req/sec

🏥 HEALTH STATUS
Overall Status: ${latest.health.status.toUpperCase()}
Active Alerts: ${this.getActiveAlerts().length}

Memory Check: ${latest.health.checks.memory.status.toUpperCase()} (${latest.health.checks.memory.value.toFixed(1)}%)
CPU Check: ${latest.health.checks.cpu.status.toUpperCase()} (${latest.health.checks.cpu.value.toFixed(1)}%)
Response Time Check: ${latest.health.checks.responseTime.status.toUpperCase()} (${latest.health.checks.responseTime.value.toFixed(1)}ms)
Error Rate Check: ${latest.health.checks.errorRate.status.toUpperCase()} (${latest.health.checks.errorRate.value.toFixed(1)}%)

${this.getActiveAlerts().length > 0 ? `
🚨 ACTIVE ALERTS
${this.getActiveAlerts().map(alert => 
  `- ${alert.severity.toUpperCase()}: ${alert.message} (${alert.value} > ${alert.threshold})`
).join('\n')}
` : '✅ No active alerts'}

=== End of Report ===
    `.trim();
  }

  /**
   * 設置事件監聽器
   */
  private setupEventListeners(): void {
    // 監聽性能監控器事件
    this.performanceMonitor.on('metrics', (metrics) => {
      // 可以在這裡處理從 PerformanceMonitor 來的數據
    });
  }

  /**
   * 更新所有指標
   */
  private updateMetrics(): void {
    const timestamp = Date.now();
    
    const metrics: DashboardMetrics = {
      timestamp,
      system: this.collectSystemMetrics(),
      application: this.collectApplicationMetrics(),
      performance: this.collectPerformanceMetrics(),
      health: this.performHealthChecks(),
    };

    // 添加到歷史記錄
    this.metricsHistory.push(metrics);
    
    // 保持歷史記錄在指定長度內
    if (this.metricsHistory.length > this.config.historyLength) {
      this.metricsHistory = this.metricsHistory.slice(-this.config.historyLength);
    }

    // 檢查和生成警報
    if (this.config.enableAlerts) {
      this.checkAlerts(metrics);
    }

    // 發出更新事件
    this.emit('metricsUpdated', metrics);
  }

  /**
   * 收集系統指標
   */
  private collectSystemMetrics(): SystemMetrics {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    // 估算總記憶體 (在 Node.js 中較難獲取，這裡用常見值)
    const totalMemory = 8192; // 8GB 假設值，實際應該從系統獲取
    
    return {
      memory: {
        used: memoryUsage.rss / (1024 * 1024), // MB
        total: totalMemory,
        percentage: (memoryUsage.rss / (1024 * 1024)) / totalMemory * 100,
        heap: {
          used: memoryUsage.heapUsed / (1024 * 1024),
          total: memoryUsage.heapTotal / (1024 * 1024),
          percentage: (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100,
        },
        external: memoryUsage.external / (1024 * 1024),
      },
      cpu: {
        usage: ((cpuUsage.user + cpuUsage.system) / 1000000) * 100, // Convert to %
        loadAverage: [0, 0, 0], // Node.js 在 Windows 上不支援，設為預設值
      },
      uptime: process.uptime(),
      nodeVersion: process.version,
    };
  }

  /**
   * 收集應用程式指標
   */
  private collectApplicationMetrics(): ApplicationMetrics {
    const now = Date.now();
    const timeDiff = (now - this.requestStats.lastUpdateTime) / 1000; // seconds
    const requestRate = timeDiff > 0 ? this.requestStats.total / timeDiff : 0;
    const errorRate = this.requestStats.total > 0 
      ? (this.requestStats.failed / this.requestStats.total) * 100 
      : 0;

    // 更新統計時間
    this.requestStats.lastUpdateTime = now;

    // 緩存統計
    const cacheStats = this.cacheManager?.getStatistics() || {
      hitRate: 0,
      size: 0,
      entries: 0,
      evictions: 0,
    };

    // 連接池統計
    const connectionStats = this.connectionPool?.getStatistics() || {
      activeConnections: 0,
      idleConnections: 0,
      totalConnections: 0,
    };

    // 速率限制統計
    const rateLimitStats = this.rateLimiter?.getAllStates() || new Map();

    return {
      requests: {
        total: this.requestStats.total,
        successful: this.requestStats.successful,
        failed: this.requestStats.failed,
        rate: requestRate,
        errorRate,
      },
      cache: {
        hitRate: cacheStats.hitRate,
        size: cacheStats.size,
        entries: cacheStats.entries,
        evictions: cacheStats.evictions,
      },
      connections: {
        active: connectionStats.activeConnections,
        idle: connectionStats.idleConnections,
        total: connectionStats.totalConnections,
        utilization: connectionStats.totalConnections > 0 
          ? (connectionStats.activeConnections / connectionStats.totalConnections) * 100 
          : 0,
      },
      rateLimiting: {
        activeClients: rateLimitStats.size,
        rejectedRequests: 0, // TODO: Track this in RateLimiter
        rejectionRate: 0,    // TODO: Calculate based on rejected requests
      },
    };
  }

  /**
   * 收集性能指標
   */
  private collectPerformanceMetrics(): PerformanceMetrics {
    const responseTimes = [...this.requestStats.responseTimes];
    responseTimes.sort((a, b) => a - b);
    
    const avg = responseTimes.length > 0 
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length 
      : 0;
    
    const p50 = responseTimes.length > 0 
      ? responseTimes[Math.floor(responseTimes.length * 0.5)] 
      : 0;
    
    const p95 = responseTimes.length > 0 
      ? responseTimes[Math.floor(responseTimes.length * 0.95)] 
      : 0;
    
    const p99 = responseTimes.length > 0 
      ? responseTimes[Math.floor(responseTimes.length * 0.99)] 
      : 0;

    return {
      responseTime: { avg, p50, p95, p99 },
      throughput: {
        current: this.requestStats.total > 0 ? this.requestStats.total / (Date.now() - this.requestStats.lastUpdateTime) * 1000 : 0,
        peak: 0, // TODO: Track peak throughput
        average: 0, // TODO: Calculate average throughput
      },
      latency: {
        network: 0,    // TODO: Implement network latency tracking
        processing: avg, // Use response time as processing latency approximation
        queue: 0,      // TODO: Implement queue latency tracking
      },
    };
  }

  /**
   * 執行健康檢查
   */
  private performHealthChecks(): HealthMetrics {
    const system = this.collectSystemMetrics();
    const application = this.collectApplicationMetrics();
    const performance = this.collectPerformanceMetrics();

    const checks = {
      memory: this.createHealthCheck(
        'memory',
        system.memory.percentage,
        this.config.alertThresholds.memory
      ),
      cpu: this.createHealthCheck(
        'cpu',
        system.cpu.usage,
        this.config.alertThresholds.cpu
      ),
      responseTime: this.createHealthCheck(
        'responseTime',
        performance.responseTime.avg,
        this.config.alertThresholds.responseTime
      ),
      errorRate: this.createHealthCheck(
        'errorRate',
        application.requests.errorRate,
        this.config.alertThresholds.errorRate
      ),
      cache: this.createHealthCheck(
        'cache',
        application.cache.hitRate,
        this.config.alertThresholds.cacheHitRate,
        true // Lower is worse for cache hit rate
      ),
      connections: this.createHealthCheck(
        'connections',
        system.connections?.active || 0,
        this.config.alertThresholds.connections
      ),
    };

    // 確定整體狀態
    const statuses = Object.values(checks).map(check => check.status);
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    
    if (statuses.includes('critical')) {
      overallStatus = 'critical';
    } else if (statuses.includes('warning')) {
      overallStatus = 'warning';
    }

    return {
      status: overallStatus,
      checks,
      alerts: this.getActiveAlerts(),
    };
  }

  /**
   * 創建健康檢查結果
   */
  private createHealthCheck(
    metric: string,
    value: number,
    thresholds: { warning: number; critical: number },
    lowerIsBetter: boolean = false
  ): HealthCheck {
    let status: 'ok' | 'warning' | 'critical' = 'ok';
    let message = `${metric} is normal`;
    
    if (lowerIsBetter) {
      if (value <= thresholds.critical) {
        status = 'critical';
        message = `${metric} is critically low: ${value.toFixed(1)}`;
      } else if (value <= thresholds.warning) {
        status = 'warning';
        message = `${metric} is low: ${value.toFixed(1)}`;
      }
    } else {
      if (value >= thresholds.critical) {
        status = 'critical';
        message = `${metric} is critically high: ${value.toFixed(1)}`;
      } else if (value >= thresholds.warning) {
        status = 'warning';
        message = `${metric} is high: ${value.toFixed(1)}`;
      }
    }

    return {
      status,
      value,
      threshold: status === 'critical' ? thresholds.critical : thresholds.warning,
      message,
    };
  }

  /**
   * 檢查和生成警報
   */
  private checkAlerts(metrics: DashboardMetrics): void {
    Object.entries(metrics.health.checks).forEach(([metric, check]) => {
      if (check.status === 'warning' || check.status === 'critical') {
        const alertId = `${metric}-${check.status}`;
        
        if (!this.alerts.has(alertId)) {
          const alert: Alert = {
            id: alertId,
            severity: check.status === 'critical' ? 'critical' : 'medium',
            message: check.message,
            timestamp: metrics.timestamp,
            resolved: false,
            metric,
            value: check.value,
            threshold: check.threshold,
          };
          
          this.alerts.set(alertId, alert);
          this.emit('alertCreated', alert);
        }
      } else {
        // 解決現有警報
        const warningId = `${metric}-warning`;
        const criticalId = `${metric}-critical`;
        
        [warningId, criticalId].forEach(id => {
          if (this.alerts.has(id) && !this.alerts.get(id)!.resolved) {
            this.resolveAlert(id);
          }
        });
      }
    });
  }

  /**
   * 清理資源
   */
  dispose(): void {
    this.stop();
    this.removeAllListeners();
    this.metricsHistory = [];
    this.alerts.clear();
  }
}