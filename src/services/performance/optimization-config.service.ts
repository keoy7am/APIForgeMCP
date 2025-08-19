/**
 * Performance Optimization Configuration Service
 * 性能優化配置服務
 */

import { EventEmitter } from 'events';
import { PerformanceDashboard } from './performance-dashboard.service';
import { CacheManager } from './cache-manager.service';
import { ConnectionPool } from './connection-pool.service';
import { RateLimiter } from './rate-limiter.service';
import type { Logger, CacheConfig, ConnectionPoolConfig, RateLimiterConfig } from '../../types';

// 優化配置類型
interface OptimizationConfig {
  autoTuning: {
    enabled: boolean;
    interval: number;        // ms
    aggressiveness: 'conservative' | 'moderate' | 'aggressive';
    maxAdjustmentPercentage: number; // %
  };
  triggers: {
    cpuThreshold: number;    // %
    memoryThreshold: number; // %
    responseTimeThreshold: number; // ms
    errorRateThreshold: number;    // %
    cacheHitRateThreshold: number; // %
  };
  constraints: {
    minCacheSize: number;         // bytes
    maxCacheSize: number;         // bytes
    minConnections: number;
    maxConnections: number;
    minRateLimitWindow: number;   // ms
    maxRateLimitWindow: number;   // ms
  };
  recommendations: {
    enabled: boolean;
    notificationThreshold: number; // Number of recommendations before notification
  };
}

// 優化建議類型
interface OptimizationRecommendation {
  id: string;
  type: 'cache' | 'connection' | 'rateLimit' | 'system';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  expectedImpact: string;
  currentValue: number;
  recommendedValue: number;
  autoApplicable: boolean;
  applied: boolean;
  timestamp: number;
}

// 性能調整結果
interface PerformanceTuningResult {
  success: boolean;
  adjustments: {
    service: string;
    parameter: string;
    oldValue: any;
    newValue: any;
    impact: string;
  }[];
  recommendations: OptimizationRecommendation[];
  nextTuningTime?: number;
}

const DEFAULT_CONFIG: OptimizationConfig = {
  autoTuning: {
    enabled: false,
    interval: 300000, // 5 minutes
    aggressiveness: 'moderate',
    maxAdjustmentPercentage: 20,
  },
  triggers: {
    cpuThreshold: 70,           // %
    memoryThreshold: 80,        // %
    responseTimeThreshold: 200, // ms
    errorRateThreshold: 5,      // %
    cacheHitRateThreshold: 85,  // %
  },
  constraints: {
    minCacheSize: 10 * 1024 * 1024,      // 10MB
    maxCacheSize: 500 * 1024 * 1024,     // 500MB
    minConnections: 5,
    maxConnections: 200,
    minRateLimitWindow: 1000,             // 1 second
    maxRateLimitWindow: 300000,           // 5 minutes
  },
  recommendations: {
    enabled: true,
    notificationThreshold: 3,
  },
};

export class OptimizationConfigService extends EventEmitter {
  private config: OptimizationConfig;
  private dashboard: PerformanceDashboard;
  private logger: Logger;
  
  // 服務引用
  private cacheManager?: CacheManager;
  private connectionPool?: ConnectionPool;
  private rateLimiter?: RateLimiter;
  
  // 狀態追踪
  private tuningInterval?: NodeJS.Timeout;
  private recommendations: Map<string, OptimizationRecommendation> = new Map();
  private lastTuningTime = 0;
  private tuningHistory: PerformanceTuningResult[] = [];

  constructor(
    dashboard: PerformanceDashboard,
    logger: Logger,
    config?: Partial<OptimizationConfig>
  ) {
    super();
    
    this.dashboard = dashboard;
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.setupEventListeners();
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
   * 啟動自動調優
   */
  startAutoTuning(): void {
    if (!this.config.autoTuning.enabled) {
      this.logger.warn('Auto-tuning is disabled in configuration');
      return;
    }

    if (this.tuningInterval) {
      return; // Already running
    }

    this.tuningInterval = setInterval(() => {
      this.performAutoTuning();
    }, this.config.autoTuning.interval);

    this.logger.info('Auto-tuning started', {
      interval: this.config.autoTuning.interval,
      aggressiveness: this.config.autoTuning.aggressiveness,
    });

    this.emit('autoTuningStarted');
  }

  /**
   * 停止自動調優
   */
  stopAutoTuning(): void {
    if (this.tuningInterval) {
      clearInterval(this.tuningInterval);
      this.tuningInterval = undefined;
    }

    this.logger.info('Auto-tuning stopped');
    this.emit('autoTuningStopped');
  }

  /**
   * 執行手動調優
   */
  async performManualTuning(): Promise<PerformanceTuningResult> {
    this.logger.info('Starting manual performance tuning');
    return this.performTuning(true);
  }

  /**
   * 生成性能建議
   */
  generateRecommendations(): OptimizationRecommendation[] {
    const metrics = this.dashboard.getCurrentMetrics();
    if (!metrics) {
      return [];
    }

    const recommendations: OptimizationRecommendation[] = [];

    // 記憶體使用建議
    if (metrics.system.memory.percentage > this.config.triggers.memoryThreshold) {
      recommendations.push(this.createRecommendation({
        type: 'cache',
        priority: 'high',
        title: 'Reduce Cache Size',
        description: `Memory usage is ${metrics.system.memory.percentage.toFixed(1)}%, consider reducing cache size`,
        currentValue: metrics.application.cache.size,
        recommendedValue: Math.floor(metrics.application.cache.size * 0.8),
        expectedImpact: 'Reduce memory usage by ~20%',
        autoApplicable: true,
      }));
    }

    // 響應時間建議
    if (metrics.performance.responseTime.p95 > this.config.triggers.responseTimeThreshold) {
      // 建議增加連接池大小
      recommendations.push(this.createRecommendation({
        type: 'connection',
        priority: 'medium',
        title: 'Increase Connection Pool Size',
        description: `P95 response time is ${metrics.performance.responseTime.p95.toFixed(1)}ms, consider increasing connection pool`,
        currentValue: metrics.application.connections.total,
        recommendedValue: Math.min(
          metrics.application.connections.total * 1.5,
          this.config.constraints.maxConnections
        ),
        expectedImpact: 'Improve response time by reducing connection wait time',
        autoApplicable: true,
      }));

      // 建議增加緩存大小
      if (metrics.application.cache.hitRate < this.config.triggers.cacheHitRateThreshold) {
        recommendations.push(this.createRecommendation({
          type: 'cache',
          priority: 'medium',
          title: 'Increase Cache Size',
          description: `Cache hit rate is ${metrics.application.cache.hitRate.toFixed(1)}%, consider increasing cache size`,
          currentValue: metrics.application.cache.size,
          recommendedValue: Math.min(
            metrics.application.cache.size * 1.5,
            this.config.constraints.maxCacheSize
          ),
          expectedImpact: 'Improve cache hit rate and reduce response time',
          autoApplicable: true,
        }));
      }
    }

    // 錯誤率建議
    if (metrics.application.requests.errorRate > this.config.triggers.errorRateThreshold) {
      recommendations.push(this.createRecommendation({
        type: 'rateLimit',
        priority: 'high',
        title: 'Adjust Rate Limiting',
        description: `Error rate is ${metrics.application.requests.errorRate.toFixed(1)}%, consider tightening rate limits`,
        currentValue: 1000, // Current rate limit (假設值)
        recommendedValue: 800,
        expectedImpact: 'Reduce system load and error rate',
        autoApplicable: true,
      }));
    }

    // CPU 使用建議
    if (metrics.system.cpu.usage > this.config.triggers.cpuThreshold) {
      recommendations.push(this.createRecommendation({
        type: 'system',
        priority: 'critical',
        title: 'High CPU Usage',
        description: `CPU usage is ${metrics.system.cpu.usage.toFixed(1)}%, consider scaling or optimizing`,
        currentValue: metrics.system.cpu.usage,
        recommendedValue: 50, // Target CPU usage
        expectedImpact: 'Requires horizontal scaling or code optimization',
        autoApplicable: false,
      }));
    }

    // 更新建議記錄
    recommendations.forEach(rec => {
      this.recommendations.set(rec.id, rec);
    });

    // 檢查是否需要發送通知
    if (this.config.recommendations.enabled) {
      const highPriorityRecs = recommendations.filter(r => r.priority === 'high' || r.priority === 'critical');
      if (highPriorityRecs.length >= this.config.recommendations.notificationThreshold) {
        this.emit('recommendationsGenerated', recommendations);
      }
    }

    return recommendations;
  }

  /**
   * 應用建議
   */
  async applyRecommendation(recommendationId: string): Promise<boolean> {
    const recommendation = this.recommendations.get(recommendationId);
    if (!recommendation || recommendation.applied) {
      return false;
    }

    try {
      let success = false;

      switch (recommendation.type) {
        case 'cache':
          success = await this.applyCacheRecommendation(recommendation);
          break;
        case 'connection':
          success = await this.applyConnectionRecommendation(recommendation);
          break;
        case 'rateLimit':
          success = await this.applyRateLimitRecommendation(recommendation);
          break;
        default:
          this.logger.warn('Cannot auto-apply recommendation', { type: recommendation.type });
          return false;
      }

      if (success) {
        recommendation.applied = true;
        this.emit('recommendationApplied', recommendation);
        this.logger.info('Applied performance recommendation', {
          id: recommendationId,
          type: recommendation.type,
          title: recommendation.title,
        });
      }

      return success;
    } catch (error) {
      this.logger.error('Failed to apply recommendation', {
        id: recommendationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * 獲取所有建議
   */
  getAllRecommendations(): OptimizationRecommendation[] {
    return Array.from(this.recommendations.values());
  }

  /**
   * 獲取未應用的建議
   */
  getPendingRecommendations(): OptimizationRecommendation[] {
    return Array.from(this.recommendations.values()).filter(r => !r.applied);
  }

  /**
   * 獲取調優歷史
   */
  getTuningHistory(): PerformanceTuningResult[] {
    return [...this.tuningHistory];
  }

  /**
   * 重置建議
   */
  clearRecommendations(): void {
    this.recommendations.clear();
    this.emit('recommendationsCleared');
  }

  /**
   * 執行自動調優
   */
  private async performAutoTuning(): Promise<void> {
    if (Date.now() - this.lastTuningTime < this.config.autoTuning.interval) {
      return; // Too soon
    }

    try {
      const result = await this.performTuning(false);
      this.emit('autoTuningCompleted', result);
    } catch (error) {
      this.logger.error('Auto-tuning failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      this.emit('autoTuningFailed', error);
    }
  }

  /**
   * 執行調優邏輯
   */
  private async performTuning(manual: boolean): Promise<PerformanceTuningResult> {
    const startTime = Date.now();
    const adjustments: PerformanceTuningResult['adjustments'] = [];
    const recommendations = this.generateRecommendations();

    this.logger.info(`Starting ${manual ? 'manual' : 'automatic'} performance tuning`, {
      recommendationsCount: recommendations.length,
    });

    // 自動應用可自動應用的建議
    if (!manual) {
      const autoApplicableRecs = recommendations.filter(r => r.autoApplicable && !r.applied);
      
      for (const rec of autoApplicableRecs) {
        const applied = await this.applyRecommendation(rec.id);
        if (applied) {
          adjustments.push({
            service: rec.type,
            parameter: rec.title,
            oldValue: rec.currentValue,
            newValue: rec.recommendedValue,
            impact: rec.expectedImpact,
          });
        }
      }
    }

    const result: PerformanceTuningResult = {
      success: true,
      adjustments,
      recommendations,
      nextTuningTime: startTime + this.config.autoTuning.interval,
    };

    // 更新記錄
    this.lastTuningTime = startTime;
    this.tuningHistory.push(result);
    
    // 保持歷史記錄在合理長度
    if (this.tuningHistory.length > 100) {
      this.tuningHistory = this.tuningHistory.slice(-50);
    }

    this.logger.info('Performance tuning completed', {
      adjustmentsCount: adjustments.length,
      duration: Date.now() - startTime,
    });

    return result;
  }

  /**
   * 創建建議對象
   */
  private createRecommendation(params: {
    type: OptimizationRecommendation['type'];
    priority: OptimizationRecommendation['priority'];
    title: string;
    description: string;
    currentValue: number;
    recommendedValue: number;
    expectedImpact: string;
    autoApplicable: boolean;
  }): OptimizationRecommendation {
    const id = `${params.type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id,
      type: params.type,
      priority: params.priority,
      title: params.title,
      description: params.description,
      expectedImpact: params.expectedImpact,
      currentValue: params.currentValue,
      recommendedValue: params.recommendedValue,
      autoApplicable: params.autoApplicable,
      applied: false,
      timestamp: Date.now(),
    };
  }

  /**
   * 應用緩存建議
   */
  private async applyCacheRecommendation(recommendation: OptimizationRecommendation): Promise<boolean> {
    if (!this.cacheManager) {
      return false;
    }

    // TODO: 實現緩存配置調整
    // 這需要 CacheManager 支援動態配置更新
    this.logger.info('Cache recommendation would be applied', {
      currentSize: recommendation.currentValue,
      recommendedSize: recommendation.recommendedValue,
    });

    return true;
  }

  /**
   * 應用連接池建議
   */
  private async applyConnectionRecommendation(recommendation: OptimizationRecommendation): Promise<boolean> {
    if (!this.connectionPool) {
      return false;
    }

    // TODO: 實現連接池配置調整
    // 這需要 ConnectionPool 支援動態配置更新
    this.logger.info('Connection pool recommendation would be applied', {
      currentConnections: recommendation.currentValue,
      recommendedConnections: recommendation.recommendedValue,
    });

    return true;
  }

  /**
   * 應用速率限制建議
   */
  private async applyRateLimitRecommendation(recommendation: OptimizationRecommendation): Promise<boolean> {
    if (!this.rateLimiter) {
      return false;
    }

    // TODO: 實現速率限制配置調整
    // 這需要 RateLimiter 支援動態配置更新
    this.logger.info('Rate limit recommendation would be applied', {
      currentLimit: recommendation.currentValue,
      recommendedLimit: recommendation.recommendedValue,
    });

    return true;
  }

  /**
   * 設置事件監聽器
   */
  private setupEventListeners(): void {
    // 監聽儀表板指標更新
    this.dashboard.on('metricsUpdated', (metrics) => {
      // 可以在這裡觸發即時建議生成
      if (this.config.recommendations.enabled) {
        const recommendations = this.generateRecommendations();
        if (recommendations.length > 0) {
          this.emit('recommendationsUpdated', recommendations);
        }
      }
    });

    // 監聽儀表板警報
    this.dashboard.on('alertCreated', (alert) => {
      // 根據警報生成建議
      this.generateAlertBasedRecommendations(alert);
    });
  }

  /**
   * 根據警報生成建議
   */
  private generateAlertBasedRecommendations(alert: any): void {
    // TODO: 根據特定警報類型生成對應建議
    this.logger.info('Generating recommendations based on alert', {
      alertId: alert.id,
      metric: alert.metric,
      severity: alert.severity,
    });
  }

  /**
   * 清理資源
   */
  dispose(): void {
    this.stopAutoTuning();
    this.removeAllListeners();
    this.recommendations.clear();
    this.tuningHistory = [];
  }
}