/**
 * Tests for Optimization Configuration Service
 */

import { jest } from '@jest/globals';
import { OptimizationConfigService } from '../../../src/services/performance/optimization-config.service';
import { PerformanceDashboard } from '../../../src/services/performance/performance-dashboard.service';
import { PerformanceMonitor } from '../../../src/services/performance/performance-monitor.service';
import { CacheManager } from '../../../src/services/performance/cache-manager.service';
import { ConnectionPool } from '../../../src/services/performance/connection-pool.service';
import { RateLimiter } from '../../../src/services/performance/rate-limiter.service';
import { MockFactory } from '../../utils/test-utils';

describe('Optimization Configuration Service', () => {
  let optimizationService: OptimizationConfigService;
  let dashboard: PerformanceDashboard;
  let performanceMonitor: PerformanceMonitor;
  let cacheManager: CacheManager;
  let connectionPool: ConnectionPool;
  let rateLimiter: RateLimiter;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = MockFactory.createMockLogger();
    
    // Create performance monitor and dashboard
    performanceMonitor = new PerformanceMonitor(mockLogger);
    dashboard = new PerformanceDashboard(
      performanceMonitor,
      mockLogger,
      {
        updateInterval: 1000,
        historyLength: 10,
        enableRealTimeUpdates: false,
        enableAlerts: true,
      }
    );

    // Create optimization service
    optimizationService = new OptimizationConfigService(
      dashboard,
      mockLogger,
      {
        autoTuning: {
          enabled: false, // Start disabled for tests
          interval: 5000,
          aggressiveness: 'moderate',
          maxAdjustmentPercentage: 20,
        },
        triggers: {
          cpuThreshold: 50,        // Lower thresholds for easier testing
          memoryThreshold: 60,
          responseTimeThreshold: 100,
          errorRateThreshold: 10,
          cacheHitRateThreshold: 70,
        },
        recommendations: {
          enabled: true,
          notificationThreshold: 2,
        },
      }
    );

    // Create services
    const mockStorage = MockFactory.createMockStorage();
    
    const cacheConfig = {
      maxSize: 10 * 1024 * 1024,
      maxEntries: 1000,
      defaultTTL: 60000,
      evictionPolicy: 'lru' as const,
      collectStats: true,
    };
    cacheManager = new CacheManager(cacheConfig, mockStorage, mockLogger);

    const poolConfig = {
      maxConnections: 20,
      maxConnectionsPerHost: 5,
      connectionTimeout: 5000,
      idleTimeout: 30000,
      retryAttempts: 3,
      keepAlive: true,
    };
    connectionPool = new ConnectionPool(poolConfig, mockLogger);

    const rateLimitConfig = {
      maxRequests: 100,
      windowMs: 60000,
      keyGenerator: (req: any) => req.clientId || 'default',
    };
    rateLimiter = new RateLimiter(rateLimitConfig, mockLogger);

    // Set services
    dashboard.setServices({ cacheManager, connectionPool, rateLimiter });
    optimizationService.setServices({ cacheManager, connectionPool, rateLimiter });
  });

  afterEach(() => {
    optimizationService.stopAutoTuning();
    optimizationService.dispose();
    dashboard.stop();
    dashboard.dispose();
    cacheManager?.dispose();
    connectionPool?.dispose();
    rateLimiter?.dispose();
  });

  describe('Auto-tuning Control', () => {
    it('should start and stop auto-tuning', () => {
      expect(() => optimizationService.startAutoTuning()).not.toThrow();
      expect(() => optimizationService.stopAutoTuning()).not.toThrow();
    });

    it('should emit events when auto-tuning starts and stops', (done) => {
      let eventsReceived = 0;
      
      optimizationService.on('autoTuningStarted', () => {
        eventsReceived++;
        optimizationService.stopAutoTuning();
      });
      
      optimizationService.on('autoTuningStopped', () => {
        eventsReceived++;
        expect(eventsReceived).toBe(2);
        done();
      });
      
      // Enable auto-tuning in config first
      optimizationService['config'].autoTuning.enabled = true;
      optimizationService.startAutoTuning();
    });

    it('should not start auto-tuning when disabled', () => {
      const warnSpy = jest.spyOn(mockLogger, 'warn');
      
      optimizationService.startAutoTuning();
      
      expect(warnSpy).toHaveBeenCalledWith('Auto-tuning is disabled in configuration');
    });

    it('should not start multiple auto-tuning instances', () => {
      optimizationService['config'].autoTuning.enabled = true;
      
      optimizationService.startAutoTuning();
      optimizationService.startAutoTuning(); // Second call should be ignored
      
      expect(optimizationService['tuningInterval']).toBeDefined();
      
      optimizationService.stopAutoTuning();
    });
  });

  describe('Manual Tuning', () => {
    it('should perform manual tuning', async () => {
      dashboard.start();
      
      // Create some performance data
      dashboard.recordRequest(true, 150);
      dashboard.recordRequest(false, 200);
      
      const result = await optimizationService.performManualTuning();
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.adjustments).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it('should track tuning history', async () => {
      dashboard.start();
      
      await optimizationService.performManualTuning();
      await optimizationService.performManualTuning();
      
      const history = optimizationService.getTuningHistory();
      expect(history.length).toBe(2);
      expect(history[0].success).toBe(true);
      expect(history[1].success).toBe(true);
    });
  });

  describe('Recommendation Generation', () => {
    it('should generate recommendations based on metrics', () => {
      dashboard.start();
      
      // Create conditions that should trigger recommendations
      dashboard.recordRequest(false, 500); // High response time and error
      dashboard.recordRequest(false, 600);
      dashboard.recordRequest(true, 400);
      
      const recommendations = optimizationService.generateRecommendations();
      
      expect(Array.isArray(recommendations)).toBe(true);
      expect(recommendations.length).toBeGreaterThan(0);
      
      recommendations.forEach(rec => {
        expect(rec.id).toBeDefined();
        expect(rec.type).toMatch(/^(cache|connection|rateLimit|system)$/);
        expect(rec.priority).toMatch(/^(low|medium|high|critical)$/);
        expect(rec.title).toBeDefined();
        expect(rec.description).toBeDefined();
        expect(rec.expectedImpact).toBeDefined();
        expect(typeof rec.currentValue).toBe('number');
        expect(typeof rec.recommendedValue).toBe('number');
        expect(typeof rec.autoApplicable).toBe('boolean');
        expect(rec.applied).toBe(false);
        expect(typeof rec.timestamp).toBe('number');
      });
    });

    it('should generate memory-based recommendations', () => {
      dashboard.start();
      
      // Mock high memory usage
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = jest.fn().mockReturnValue({
        rss: 500 * 1024 * 1024,    // 500MB RSS
        heapUsed: 400 * 1024 * 1024, // 400MB heap
        heapTotal: 450 * 1024 * 1024,
        external: 50 * 1024 * 1024,
        arrayBuffers: 10 * 1024 * 1024,
      });
      
      const recommendations = optimizationService.generateRecommendations();
      
      // Should generate cache size reduction recommendation
      const cacheRecs = recommendations.filter(r => r.type === 'cache');
      expect(cacheRecs.length).toBeGreaterThan(0);
      
      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    it('should generate response time-based recommendations', () => {
      dashboard.start();
      
      // Record slow requests
      for (let i = 0; i < 10; i++) {
        dashboard.recordRequest(true, 300); // Slow requests
      }
      
      const recommendations = optimizationService.generateRecommendations();
      
      // Should generate connection pool or cache recommendations
      const connectionRecs = recommendations.filter(r => r.type === 'connection');
      const cacheRecs = recommendations.filter(r => r.type === 'cache');
      
      expect(connectionRecs.length + cacheRecs.length).toBeGreaterThan(0);
    });

    it('should generate error rate-based recommendations', () => {
      dashboard.start();
      
      // Record high error rate
      for (let i = 0; i < 5; i++) {
        dashboard.recordRequest(false, 100); // Failed requests
      }
      dashboard.recordRequest(true, 100); // One success to get some ratio
      
      const recommendations = optimizationService.generateRecommendations();
      
      // Should generate rate limiting recommendations
      const rateLimitRecs = recommendations.filter(r => r.type === 'rateLimit');
      expect(rateLimitRecs.length).toBeGreaterThan(0);
    });
  });

  describe('Recommendation Management', () => {
    it('should apply recommendations', async () => {
      dashboard.start();
      
      // Generate some recommendations
      dashboard.recordRequest(false, 400);
      const recommendations = optimizationService.generateRecommendations();
      
      if (recommendations.length > 0) {
        const rec = recommendations[0];
        const applied = await optimizationService.applyRecommendation(rec.id);
        
        expect(applied).toBe(true);
        
        const updatedRec = optimizationService.getAllRecommendations()
          .find(r => r.id === rec.id);
        expect(updatedRec?.applied).toBe(true);
      }
    });

    it('should not apply non-existent recommendations', async () => {
      const applied = await optimizationService.applyRecommendation('non-existent-id');
      expect(applied).toBe(false);
    });

    it('should not apply already applied recommendations', async () => {
      dashboard.start();
      
      dashboard.recordRequest(false, 400);
      const recommendations = optimizationService.generateRecommendations();
      
      if (recommendations.length > 0) {
        const rec = recommendations[0];
        
        // Apply once
        await optimizationService.applyRecommendation(rec.id);
        
        // Try to apply again
        const secondApply = await optimizationService.applyRecommendation(rec.id);
        expect(secondApply).toBe(false);
      }
    });

    it('should get pending recommendations', () => {
      dashboard.start();
      
      dashboard.recordRequest(false, 400);
      const allRecommendations = optimizationService.generateRecommendations();
      const pendingRecommendations = optimizationService.getPendingRecommendations();
      
      expect(pendingRecommendations.length).toBe(allRecommendations.length);
      expect(pendingRecommendations.every(r => !r.applied)).toBe(true);
    });

    it('should clear recommendations', () => {
      dashboard.start();
      
      dashboard.recordRequest(false, 400);
      optimizationService.generateRecommendations();
      
      expect(optimizationService.getAllRecommendations().length).toBeGreaterThan(0);
      
      optimizationService.clearRecommendations();
      expect(optimizationService.getAllRecommendations().length).toBe(0);
    });
  });

  describe('Event Handling', () => {
    it('should emit events for recommendation operations', (done) => {
      let eventsReceived = 0;
      
      optimizationService.on('recommendationsGenerated', (recommendations) => {
        expect(Array.isArray(recommendations)).toBe(true);
        eventsReceived++;
        
        if (eventsReceived === 1) {
          done();
        }
      });
      
      dashboard.start();
      
      // Create conditions for high-priority recommendations
      for (let i = 0; i < 5; i++) {
        dashboard.recordRequest(false, 500);
      }
      
      optimizationService.generateRecommendations();
    });

    it('should emit events when recommendations are applied', async () => {
      const appliedSpy = jest.fn();
      optimizationService.on('recommendationApplied', appliedSpy);
      
      dashboard.start();
      dashboard.recordRequest(false, 400);
      
      const recommendations = optimizationService.generateRecommendations();
      
      if (recommendations.length > 0) {
        await optimizationService.applyRecommendation(recommendations[0].id);
        expect(appliedSpy).toHaveBeenCalledWith(expect.objectContaining({
          id: recommendations[0].id,
          applied: true,
        }));
      }
    });

    it('should emit events when recommendations are cleared', () => {
      const clearedSpy = jest.fn();
      optimizationService.on('recommendationsCleared', clearedSpy);
      
      optimizationService.clearRecommendations();
      expect(clearedSpy).toHaveBeenCalled();
    });
  });

  describe('Dashboard Integration', () => {
    it('should respond to dashboard metric updates', (done) => {
      const updatesSpy = jest.fn();
      optimizationService.on('recommendationsUpdated', updatesSpy);
      
      dashboard.start();
      dashboard.recordRequest(false, 400);
      
      // Simulate dashboard metrics update
      dashboard.emit('metricsUpdated', {
        timestamp: Date.now(),
        system: {} as any,
        application: {} as any,
        performance: {} as any,
        health: {} as any,
      });
      
      setTimeout(() => {
        // Should have generated recommendations due to metric update
        expect(updatesSpy).toHaveBeenCalled();
        done();
      }, 100);
    });

    it('should respond to dashboard alerts', () => {
      const logSpy = jest.spyOn(mockLogger, 'info');
      
      dashboard.start();
      
      // Simulate an alert
      const alert = {
        id: 'test-alert',
        metric: 'memory',
        severity: 'high',
      };
      
      dashboard.emit('alertCreated', alert);
      
      expect(logSpy).toHaveBeenCalledWith(
        'Generating recommendations based on alert',
        expect.objectContaining({
          alertId: alert.id,
          metric: alert.metric,
          severity: alert.severity,
        })
      );
    });
  });

  describe('Auto-tuning Execution', () => {
    it('should perform auto-tuning at intervals', (done) => {
      optimizationService['config'].autoTuning.enabled = true;
      optimizationService['config'].autoTuning.interval = 1000; // 1 second
      
      let tuningCount = 0;
      optimizationService.on('autoTuningCompleted', () => {
        tuningCount++;
        if (tuningCount >= 2) {
          optimizationService.stopAutoTuning();
          done();
        }
      });
      
      dashboard.start();
      dashboard.recordRequest(true, 100);
      
      optimizationService.startAutoTuning();
    });

    it('should handle auto-tuning failures gracefully', (done) => {
      optimizationService['config'].autoTuning.enabled = true;
      optimizationService['config'].autoTuning.interval = 500;
      
      // Mock a failure in the tuning process
      const originalPerformTuning = optimizationService['performTuning'];
      optimizationService['performTuning'] = jest.fn().mockRejectedValue(new Error('Test error'));
      
      optimizationService.on('autoTuningFailed', (error) => {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe('Test error');
        
        // Restore original method
        optimizationService['performTuning'] = originalPerformTuning;
        optimizationService.stopAutoTuning();
        done();
      });
      
      optimizationService.startAutoTuning();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing services gracefully', async () => {
      const isolatedService = new OptimizationConfigService(
        dashboard,
        mockLogger
      );
      
      // Don't set services
      dashboard.start();
      dashboard.recordRequest(false, 400);
      
      const recommendations = isolatedService.generateRecommendations();
      
      // Should still generate recommendations, even without services
      expect(Array.isArray(recommendations)).toBe(true);
      
      isolatedService.dispose();
    });

    it('should handle recommendation application errors', async () => {
      dashboard.start();
      dashboard.recordRequest(false, 400);
      
      const recommendations = optimizationService.generateRecommendations();
      
      if (recommendations.length > 0) {
        // Mock service to throw error
        const originalMethod = optimizationService['applyCacheRecommendation'];
        optimizationService['applyCacheRecommendation'] = jest.fn().mockRejectedValue(new Error('Test error'));
        
        const applied = await optimizationService.applyRecommendation(recommendations[0].id);
        expect(applied).toBe(false);
        
        // Restore original method
        optimizationService['applyCacheRecommendation'] = originalMethod;
      }
    });
  });

  describe('Memory Management', () => {
    it('should limit tuning history size', async () => {
      dashboard.start();
      
      // Perform many tuning operations
      for (let i = 0; i < 150; i++) {
        await optimizationService.performManualTuning();
      }
      
      const history = optimizationService.getTuningHistory();
      expect(history.length).toBeLessThanOrEqual(100); // Should be limited
    });

    it('should not leak memory with frequent recommendations', () => {
      dashboard.start();
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Generate many recommendations
      for (let i = 0; i < 100; i++) {
        dashboard.recordRequest(false, 400);
        optimizationService.generateRecommendations();
        optimizationService.clearRecommendations();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 5MB)
      expect(memoryIncrease).toBeLessThan(5 * 1024 * 1024);
    });
  });
});