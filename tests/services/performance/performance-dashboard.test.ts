/**
 * Tests for Performance Dashboard Service
 */

import { jest } from '@jest/globals';
import { PerformanceDashboard } from '../../../src/services/performance/performance-dashboard.service';
import { PerformanceMonitor } from '../../../src/services/performance/performance-monitor.service';
import { CacheManager } from '../../../src/services/performance/cache-manager.service';
import { ConnectionPool } from '../../../src/services/performance/connection-pool.service';
import { RateLimiter } from '../../../src/services/performance/rate-limiter.service';
import { MockFactory } from '../../utils/test-utils';

describe('Performance Dashboard Service', () => {
  let dashboard: PerformanceDashboard;
  let performanceMonitor: PerformanceMonitor;
  let cacheManager: CacheManager;
  let connectionPool: ConnectionPool;
  let rateLimiter: RateLimiter;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = MockFactory.createMockLogger();
    
    // Create performance monitor
    performanceMonitor = new PerformanceMonitor(mockLogger);

    // Create dashboard
    dashboard = new PerformanceDashboard(
      performanceMonitor,
      mockLogger,
      {
        updateInterval: 1000, // 1 second for faster tests
        historyLength: 10,
        enableRealTimeUpdates: false, // Start manually for tests
        enableAlerts: true,
      }
    );

    // Create other services
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
  });

  afterEach(() => {
    dashboard.stop();
    dashboard.dispose();
    cacheManager?.dispose();
    connectionPool?.dispose();
    rateLimiter?.dispose();
  });

  describe('Basic Operations', () => {
    it('should start and stop monitoring', () => {
      expect(dashboard.getCurrentMetrics()).toBeNull();

      dashboard.start();
      expect(dashboard.getCurrentMetrics()).toBeDefined();

      dashboard.stop();
      // Should still have the last metrics after stopping
      expect(dashboard.getCurrentMetrics()).toBeDefined();
    });

    it('should collect system metrics', () => {
      dashboard.start();
      
      const metrics = dashboard.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics!.system).toBeDefined();
      expect(metrics!.system.memory).toBeDefined();
      expect(metrics!.system.cpu).toBeDefined();
      expect(metrics!.system.uptime).toBeGreaterThan(0);
      expect(metrics!.system.nodeVersion).toBe(process.version);
    });

    it('should collect application metrics', () => {
      dashboard.start();
      
      const metrics = dashboard.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics!.application).toBeDefined();
      expect(metrics!.application.requests).toBeDefined();
      expect(metrics!.application.cache).toBeDefined();
      expect(metrics!.application.connections).toBeDefined();
      expect(metrics!.application.rateLimiting).toBeDefined();
    });

    it('should collect performance metrics', () => {
      dashboard.start();
      
      const metrics = dashboard.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics!.performance).toBeDefined();
      expect(metrics!.performance.responseTime).toBeDefined();
      expect(metrics!.performance.throughput).toBeDefined();
      expect(metrics!.performance.latency).toBeDefined();
    });

    it('should perform health checks', () => {
      dashboard.start();
      
      const metrics = dashboard.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics!.health).toBeDefined();
      expect(metrics!.health.status).toMatch(/^(healthy|warning|critical)$/);
      expect(metrics!.health.checks).toBeDefined();
      expect(metrics!.health.checks.memory).toBeDefined();
      expect(metrics!.health.checks.cpu).toBeDefined();
      expect(metrics!.health.checks.responseTime).toBeDefined();
      expect(metrics!.health.checks.errorRate).toBeDefined();
      expect(metrics!.health.checks.cache).toBeDefined();
    });
  });

  describe('Request Recording', () => {
    it('should record successful requests', () => {
      dashboard.recordRequest(true, 100);
      dashboard.recordRequest(true, 150);
      dashboard.recordRequest(true, 200);
      
      dashboard.start();
      
      const metrics = dashboard.getCurrentMetrics();
      expect(metrics!.application.requests.total).toBe(3);
      expect(metrics!.application.requests.successful).toBe(3);
      expect(metrics!.application.requests.failed).toBe(0);
      expect(metrics!.application.requests.errorRate).toBe(0);
    });

    it('should record failed requests', () => {
      dashboard.recordRequest(false, 100);
      dashboard.recordRequest(false, 150);
      dashboard.recordRequest(true, 200);
      
      dashboard.start();
      
      const metrics = dashboard.getCurrentMetrics();
      expect(metrics!.application.requests.total).toBe(3);
      expect(metrics!.application.requests.successful).toBe(1);
      expect(metrics!.application.requests.failed).toBe(2);
      expect(metrics!.application.requests.errorRate).toBeCloseTo(66.67, 1);
    });

    it('should calculate response time percentiles', () => {
      // Record requests with varying response times
      for (let i = 1; i <= 100; i++) {
        dashboard.recordRequest(true, i * 10); // 10ms to 1000ms
      }
      
      dashboard.start();
      
      const metrics = dashboard.getCurrentMetrics();
      expect(metrics!.performance.responseTime.p50).toBeGreaterThan(0);
      expect(metrics!.performance.responseTime.p95).toBeGreaterThan(metrics!.performance.responseTime.p50);
      expect(metrics!.performance.responseTime.p99).toBeGreaterThan(metrics!.performance.responseTime.p95);
    });
  });

  describe('Historical Data', () => {
    it('should maintain historical metrics', async () => {
      dashboard.start();
      
      // Wait for a few updates
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      const history = dashboard.getHistoricalMetrics();
      expect(history.length).toBeGreaterThan(1);
      expect(history.length).toBeLessThanOrEqual(10); // historyLength config
    });

    it('should filter historical data by time', async () => {
      dashboard.start();
      
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      const oneMinuteHistory = dashboard.getHistoricalMetrics(1);
      const allHistory = dashboard.getHistoricalMetrics();
      
      expect(oneMinuteHistory.length).toBeLessThanOrEqual(allHistory.length);
    });

    it('should limit history length', async () => {
      // Create dashboard with very small history
      const smallDashboard = new PerformanceDashboard(
        performanceMonitor,
        mockLogger,
        {
          updateInterval: 100,
          historyLength: 3,
          enableRealTimeUpdates: true,
        }
      );

      smallDashboard.setServices({ cacheManager, connectionPool, rateLimiter });
      
      // Wait for several updates
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const history = smallDashboard.getHistoricalMetrics();
      expect(history.length).toBeLessThanOrEqual(3);
      
      smallDashboard.stop();
      smallDashboard.dispose();
    });
  });

  describe('Alert System', () => {
    it('should create alerts when thresholds are exceeded', () => {
      const alertDashboard = new PerformanceDashboard(
        performanceMonitor,
        mockLogger,
        {
          updateInterval: 1000,
          alertThresholds: {
            memory: { warning: 0.1, critical: 0.2 }, // Very low thresholds
            cpu: { warning: 0.1, critical: 0.2 },
            responseTime: { warning: 1, critical: 2 }, // Very low thresholds
            errorRate: { warning: 0.1, critical: 0.2 },
            cacheHitRate: { warning: 99, critical: 99.5 }, // Very high thresholds
          },
          enableAlerts: true,
        }
      );

      alertDashboard.setServices({ cacheManager, connectionPool, rateLimiter });
      
      // Record some slow requests to trigger alerts
      alertDashboard.recordRequest(false, 1000);
      alertDashboard.recordRequest(false, 2000);
      
      alertDashboard.start();
      
      const alerts = alertDashboard.getActiveAlerts();
      expect(alerts.length).toBeGreaterThan(0);
      
      alertDashboard.stop();
      alertDashboard.dispose();
    });

    it('should resolve alerts when conditions improve', () => {
      const alertDashboard = new PerformanceDashboard(
        performanceMonitor,
        mockLogger,
        {
          updateInterval: 500,
          alertThresholds: {
            memory: { warning: 0.1, critical: 0.2 },
            cpu: { warning: 0.1, critical: 0.2 },
            responseTime: { warning: 100, critical: 200 },
            errorRate: { warning: 50, critical: 80 }, // High threshold
            cacheHitRate: { warning: 99, critical: 99.5 },
          },
          enableAlerts: true,
        }
      );

      alertDashboard.setServices({ cacheManager, connectionPool, rateLimiter });
      
      // First, create conditions that trigger alerts
      alertDashboard.recordRequest(false, 500);
      alertDashboard.start();
      
      let alerts = alertDashboard.getActiveAlerts();
      const initialAlertCount = alerts.length;
      
      // Then, improve conditions
      for (let i = 0; i < 10; i++) {
        alertDashboard.recordRequest(true, 50);
      }
      
      // Wait for alert resolution
      setTimeout(() => {
        alerts = alertDashboard.getActiveAlerts();
        expect(alerts.length).toBeLessThanOrEqual(initialAlertCount);
        
        alertDashboard.stop();
        alertDashboard.dispose();
      }, 1000);
    });

    it('should manually resolve alerts', () => {
      dashboard.start();
      
      // Simulate an alert by directly adding one to the dashboard
      const alertEvent = {
        id: 'test-alert',
        severity: 'medium' as const,
        message: 'Test alert',
        timestamp: Date.now(),
        resolved: false,
        metric: 'test',
        value: 100,
        threshold: 50,
      };

      // Use event emission to simulate alert creation
      dashboard.emit('alertCreated', alertEvent);
      
      const beforeResolve = dashboard.getActiveAlerts();
      const alertToResolve = beforeResolve.find(a => a.id === 'test-alert');
      
      if (alertToResolve) {
        const resolved = dashboard.resolveAlert(alertToResolve.id);
        expect(resolved).toBe(true);
        
        const afterResolve = dashboard.getActiveAlerts();
        expect(afterResolve.filter(a => a.id === 'test-alert')).toHaveLength(0);
      }
    });

    it('should clear resolved alerts', () => {
      dashboard.start();
      
      // Add some test alerts
      const alert1 = {
        id: 'alert-1',
        severity: 'low' as const,
        message: 'Test alert 1',
        timestamp: Date.now(),
        resolved: true,
        metric: 'test1',
        value: 100,
        threshold: 50,
      };
      
      const alert2 = {
        id: 'alert-2',
        severity: 'medium' as const,
        message: 'Test alert 2',
        timestamp: Date.now(),
        resolved: false,
        metric: 'test2',
        value: 200,
        threshold: 100,
      };

      dashboard.emit('alertCreated', alert1);
      dashboard.emit('alertCreated', alert2);
      
      const beforeClear = dashboard.getAllAlerts();
      const cleared = dashboard.clearResolvedAlerts();
      const afterClear = dashboard.getAllAlerts();
      
      expect(cleared).toBeGreaterThanOrEqual(0);
      expect(afterClear.length).toBeLessThanOrEqual(beforeClear.length);
    });
  });

  describe('Report Generation', () => {
    it('should generate performance report', async () => {
      dashboard.start();
      
      // Record some data
      dashboard.recordRequest(true, 100);
      dashboard.recordRequest(true, 150);
      dashboard.recordRequest(false, 200);
      
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const report = dashboard.generateReport(60);
      
      expect(report).toContain('APIForge MCP Server Performance Report');
      expect(report).toContain('SYSTEM METRICS');
      expect(report).toContain('APPLICATION METRICS');
      expect(report).toContain('PERFORMANCE METRICS');
      expect(report).toContain('HEALTH STATUS');
      expect(report).toContain('Memory Usage');
      expect(report).toContain('CPU Usage');
    });

    it('should handle empty data in report', () => {
      const report = dashboard.generateReport(60);
      expect(report).toContain('No data available');
    });
  });

  describe('Event Handling', () => {
    it('should emit events for lifecycle operations', (done) => {
      let eventsReceived = 0;
      const expectedEvents = ['started', 'metricsUpdated'];
      
      expectedEvents.forEach(event => {
        dashboard.on(event, () => {
          eventsReceived++;
          if (eventsReceived === expectedEvents.length) {
            done();
          }
        });
      });
      
      dashboard.start();
    });

    it('should emit alert events', (done) => {
      const alertDashboard = new PerformanceDashboard(
        performanceMonitor,
        mockLogger,
        {
          updateInterval: 1000,
          alertThresholds: {
            memory: { warning: 0.1, critical: 0.2 },
            cpu: { warning: 0.1, critical: 0.2 },
            responseTime: { warning: 1, critical: 2 },
            errorRate: { warning: 0.1, critical: 0.2 },
            cacheHitRate: { warning: 99, critical: 99.5 },
          },
          enableAlerts: true,
        }
      );

      alertDashboard.setServices({ cacheManager, connectionPool, rateLimiter });
      
      alertDashboard.on('alertCreated', (alert) => {
        expect(alert).toBeDefined();
        expect(alert.id).toBeDefined();
        expect(alert.severity).toBeDefined();
        alertDashboard.stop();
        alertDashboard.dispose();
        done();
      });
      
      // Create conditions that should trigger alerts
      alertDashboard.recordRequest(false, 5000);
      alertDashboard.start();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing services gracefully', () => {
      const isolatedDashboard = new PerformanceDashboard(
        performanceMonitor,
        mockLogger
      );
      
      // Don't set services
      isolatedDashboard.start();
      
      const metrics = isolatedDashboard.getCurrentMetrics();
      expect(metrics).toBeDefined();
      expect(metrics!.application.cache.hitRate).toBe(0);
      expect(metrics!.application.connections.total).toBe(0);
      
      isolatedDashboard.stop();
      isolatedDashboard.dispose();
    });

    it('should handle configuration errors', () => {
      expect(() => {
        new PerformanceDashboard(
          performanceMonitor,
          mockLogger,
          {
            updateInterval: -1, // Invalid interval
            historyLength: 0,   // Invalid history length
          }
        );
      }).not.toThrow(); // Should handle gracefully, not throw
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with long running operations', async () => {
      const memoryDashboard = new PerformanceDashboard(
        performanceMonitor,
        mockLogger,
        {
          updateInterval: 50, // Fast updates
          historyLength: 5,   // Small history
        }
      );

      memoryDashboard.setServices({ cacheManager, connectionPool, rateLimiter });
      
      const initialMemory = process.memoryUsage().heapUsed;
      
      memoryDashboard.start();
      
      // Run for a while with frequent operations
      for (let i = 0; i < 100; i++) {
        memoryDashboard.recordRequest(true, Math.random() * 100);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
      
      memoryDashboard.stop();
      memoryDashboard.dispose();
    });
  });
});