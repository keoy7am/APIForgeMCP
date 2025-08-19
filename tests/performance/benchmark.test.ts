/**
 * Performance Benchmark Test Suite
 * 性能基準測試套件
 */

import { jest } from '@jest/globals';
import { PerformanceObserver, performance } from 'perf_hooks';
import { Worker } from 'worker_threads';
import { RequestExecutor } from '../../src/services/request.service';
import { BatchExecutor } from '../../src/services/batch/batch-executor.service';
import { CacheManager } from '../../src/services/performance/cache-manager.service';
import { ConnectionPool } from '../../src/services/performance/connection-pool.service';
import { RateLimiter } from '../../src/services/performance/rate-limiter.service';
import { HistoryService } from '../../src/services/history/history.service';
import { MockFactory, TestDataFactory } from '../utils/test-utils';

// Performance targets
const PERFORMANCE_TARGETS = {
  // API 請求性能目標
  REQUEST_EXECUTION: {
    P50: 50,   // 50ms
    P95: 200,  // 200ms
    P99: 500,  // 500ms
  },
  // 批量執行性能目標
  BATCH_EXECUTION: {
    THROUGHPUT_PER_SEC: 100,  // 100 requests/sec
    PARALLEL_EFFICIENCY: 0.8, // 80% efficiency
  },
  // 緩存性能目標
  CACHE_PERFORMANCE: {
    SET_TIME: 1,    // 1ms
    GET_TIME: 0.5,  // 0.5ms
    HIT_RATE: 0.9,  // 90%
  },
  // 記憶體使用目標
  MEMORY_USAGE: {
    MAX_HEAP: 150,      // 150MB
    MAX_RSS: 200,       // 200MB
    GROWTH_RATE: 0.1,   // 10% per 1000 operations
  },
};

interface BenchmarkResult {
  operation: string;
  duration: number;
  memory: NodeJS.MemoryUsage;
  metrics: Record<string, number>;
}

interface PerformanceMetrics {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
  throughput: number;
}

describe('Performance Benchmark Tests', () => {
  let requestExecutor: RequestExecutor;
  let batchExecutor: BatchExecutor;
  let cacheManager: CacheManager;
  let connectionPool: ConnectionPool;
  let rateLimiter: RateLimiter;
  let historyService: HistoryService;

  const benchmarkResults: BenchmarkResult[] = [];

  beforeAll(async () => {
    // 初始化所有服務
    const mockStorage = MockFactory.createMockStorage();
    const mockLogger = MockFactory.createMockLogger();

    // 請求執行器
    requestExecutor = new RequestExecutor(
      null as any, // EndpointRegistry mock
      null as any, // EnvironmentManager mock
      null as any, // AuthenticationService mock
      mockLogger
    );

    // 批量執行器
    batchExecutor = new BatchExecutor(requestExecutor, mockLogger);

    // 緩存管理器
    const cacheConfig = {
      maxSize: 10 * 1024 * 1024, // 10MB
      maxEntries: 10000,
      defaultTTL: 300000, // 5 minutes
      evictionPolicy: 'lru' as const,
      compression: true,
      collectStats: true,
    };
    cacheManager = new CacheManager(cacheConfig, mockStorage, mockLogger);

    // 連接池
    const poolConfig = {
      maxConnections: 50,
      maxConnectionsPerHost: 10,
      connectionTimeout: 5000,
      idleTimeout: 30000,
      retryAttempts: 3,
      keepAlive: true,
    };
    connectionPool = new ConnectionPool(poolConfig, mockLogger);

    // 速率限制器
    const rateLimitConfig = {
      maxRequests: 1000,
      windowMs: 1000,
      keyGenerator: (req: any) => req.clientId || 'default',
    };
    rateLimiter = new RateLimiter(rateLimitConfig, mockLogger);

    // 歷史服務
    historyService = new HistoryService(mockStorage, mockLogger);
  });

  afterAll(async () => {
    // 清理資源
    await cacheManager?.dispose();
    connectionPool?.dispose();
    rateLimiter?.dispose();

    // 生成性能報告
    generatePerformanceReport();
  });

  describe('API Request Performance', () => {
    it('should execute single requests within performance targets', async () => {
      const endpoint = TestDataFactory.createMockEndpoint();
      const iterations = 100;
      const durations: number[] = [];

      global.fetch = jest.fn().mockResolvedValue(
        MockFactory.createMockFetchResponse({ data: 'test' })
      );

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        
        try {
          await requestExecutor.execute(endpoint);
        } catch (error) {
          // Ignore mock errors for benchmarking
        }
        
        const duration = performance.now() - start;
        durations.push(duration);
      }

      const metrics = calculatePerformanceMetrics(durations);

      // Record benchmark result
      benchmarkResults.push({
        operation: 'Single Request Execution',
        duration: metrics.avg,
        memory: process.memoryUsage(),
        metrics: {
          p50: metrics.p50,
          p95: metrics.p95,
          p99: metrics.p99,
          throughput: metrics.throughput,
        },
      });

      // Assertions against performance targets
      expect(metrics.p50).toBeLessThan(PERFORMANCE_TARGETS.REQUEST_EXECUTION.P50);
      expect(metrics.p95).toBeLessThan(PERFORMANCE_TARGETS.REQUEST_EXECUTION.P95);
      expect(metrics.p99).toBeLessThan(PERFORMANCE_TARGETS.REQUEST_EXECUTION.P99);
    });

    it('should handle concurrent requests efficiently', async () => {
      const endpoint = TestDataFactory.createMockEndpoint();
      const concurrency = 50;
      const requestsPerBatch = 20;

      global.fetch = jest.fn().mockResolvedValue(
        MockFactory.createMockFetchResponse({ data: 'test' })
      );

      const start = performance.now();
      const startMemory = process.memoryUsage();

      // 並發執行多批請求
      const batches = Array(concurrency).fill(null).map(() =>
        Promise.all(
          Array(requestsPerBatch).fill(null).map(async () => {
            try {
              return await requestExecutor.execute(endpoint);
            } catch (error) {
              return null;
            }
          })
        )
      );

      await Promise.all(batches);

      const duration = performance.now() - start;
      const endMemory = process.memoryUsage();
      const totalRequests = concurrency * requestsPerBatch;
      const throughput = totalRequests / (duration / 1000); // requests per second

      benchmarkResults.push({
        operation: 'Concurrent Request Execution',
        duration,
        memory: endMemory,
        metrics: {
          throughput,
          memoryGrowth: (endMemory.heapUsed - startMemory.heapUsed) / (1024 * 1024),
          concurrency,
          totalRequests,
        },
      });

      // 驗證吞吐量和記憶體使用
      expect(throughput).toBeGreaterThan(PERFORMANCE_TARGETS.BATCH_EXECUTION.THROUGHPUT_PER_SEC);
      expect(endMemory.heapUsed / (1024 * 1024)).toBeLessThan(PERFORMANCE_TARGETS.MEMORY_USAGE.MAX_HEAP);
    });
  });

  describe('Batch Execution Performance', () => {
    it('should execute batches within performance targets', async () => {
      const endpoints = Array(50).fill(null).map(() => TestDataFactory.createMockEndpoint());

      global.fetch = jest.fn().mockResolvedValue(
        MockFactory.createMockFetchResponse({ data: 'test' })
      );

      // 串行執行
      const serialStart = performance.now();
      await batchExecutor.executeBatch(endpoints, { mode: 'sequential' });
      const serialDuration = performance.now() - serialStart;

      // 並行執行
      const parallelStart = performance.now();
      await batchExecutor.executeBatch(endpoints, { 
        mode: 'parallel',
        concurrency: 10,
      });
      const parallelDuration = performance.now() - parallelStart;

      const efficiency = 1 - (parallelDuration / serialDuration);

      benchmarkResults.push({
        operation: 'Batch Execution Comparison',
        duration: parallelDuration,
        memory: process.memoryUsage(),
        metrics: {
          serialDuration,
          parallelDuration,
          efficiency,
          speedup: serialDuration / parallelDuration,
        },
      });

      // 驗證並行效率
      expect(efficiency).toBeGreaterThan(PERFORMANCE_TARGETS.BATCH_EXECUTION.PARALLEL_EFFICIENCY);
      expect(parallelDuration).toBeLessThan(serialDuration);
    });

    it('should scale batch performance linearly', async () => {
      const batchSizes = [10, 25, 50, 100];
      const results: Array<{ size: number; duration: number; throughput: number }> = [];

      global.fetch = jest.fn().mockResolvedValue(
        MockFactory.createMockFetchResponse({ data: 'test' })
      );

      for (const size of batchSizes) {
        const endpoints = Array(size).fill(null).map(() => TestDataFactory.createMockEndpoint());
        
        const start = performance.now();
        await batchExecutor.executeBatch(endpoints, {
          mode: 'parallel',
          concurrency: 10,
        });
        const duration = performance.now() - start;
        const throughput = size / (duration / 1000);

        results.push({ size, duration, throughput });
      }

      benchmarkResults.push({
        operation: 'Batch Scalability Test',
        duration: 0,
        memory: process.memoryUsage(),
        metrics: {
          results: results as any,
          linearityScore: calculateLinearityScore(results),
        },
      });

      // 驗證線性擴展性
      const linearityScore = calculateLinearityScore(results);
      expect(linearityScore).toBeGreaterThan(0.8); // 80% linearity
    });
  });

  describe('Cache Performance', () => {
    it('should achieve cache performance targets', async () => {
      const iterations = 1000;
      const setTimes: number[] = [];
      const getTimes: number[] = [];

      // 測試 SET 性能
      for (let i = 0; i < iterations; i++) {
        const key = `test-key-${i}`;
        const value = { data: `test-value-${i}`, index: i };

        const start = performance.now();
        await cacheManager.set(key, value);
        const duration = performance.now() - start;
        setTimes.push(duration);
      }

      // 測試 GET 性能
      for (let i = 0; i < iterations; i++) {
        const key = `test-key-${i}`;

        const start = performance.now();
        await cacheManager.get(key);
        const duration = performance.now() - start;
        getTimes.push(duration);
      }

      const setMetrics = calculatePerformanceMetrics(setTimes);
      const getMetrics = calculatePerformanceMetrics(getTimes);
      const stats = cacheManager.getStatistics();

      benchmarkResults.push({
        operation: 'Cache Performance',
        duration: 0,
        memory: process.memoryUsage(),
        metrics: {
          setP50: setMetrics.p50,
          getP50: getMetrics.p50,
          hitRate: stats.hitRate / 100,
          cacheSize: stats.size,
          entries: stats.entries,
        },
      });

      // 驗證緩存性能
      expect(setMetrics.p50).toBeLessThan(PERFORMANCE_TARGETS.CACHE_PERFORMANCE.SET_TIME);
      expect(getMetrics.p50).toBeLessThan(PERFORMANCE_TARGETS.CACHE_PERFORMANCE.GET_TIME);
      expect(stats.hitRate / 100).toBeGreaterThan(PERFORMANCE_TARGETS.CACHE_PERFORMANCE.HIT_RATE);
    });

    it('should handle cache eviction efficiently', async () => {
      // 測試 LRU 驅逐性能
      const maxEntries = 1000;
      const overfill = 500; // 額外添加 500 個條目觸發驅逐

      const start = performance.now();
      const startMemory = process.memoryUsage();

      // 填滿緩存
      for (let i = 0; i < maxEntries + overfill; i++) {
        await cacheManager.set(`eviction-test-${i}`, {
          data: 'x'.repeat(1000), // 1KB per entry
          index: i,
        });
      }

      const duration = performance.now() - start;
      const endMemory = process.memoryUsage();
      const stats = cacheManager.getStatistics();

      benchmarkResults.push({
        operation: 'Cache Eviction Performance',
        duration,
        memory: endMemory,
        metrics: {
          totalOperations: maxEntries + overfill,
          evictions: stats.evictions,
          finalEntries: stats.entries,
          memoryGrowth: (endMemory.heapUsed - startMemory.heapUsed) / (1024 * 1024),
        },
      });

      // 驗證驅逐機制
      expect(stats.entries).toBeLessThanOrEqual(maxEntries);
      expect(stats.evictions).toBeGreaterThan(0);
      expect(duration / (maxEntries + overfill)).toBeLessThan(1); // < 1ms per operation
    });
  });

  describe('Memory Usage and Garbage Collection', () => {
    it('should maintain stable memory usage under load', async () => {
      const iterations = 10;
      const operationsPerIteration = 100;
      const memorySnapshots: NodeJS.MemoryUsage[] = [];

      for (let i = 0; i < iterations; i++) {
        // 執行一系列操作
        const endpoints = Array(operationsPerIteration).fill(null)
          .map(() => TestDataFactory.createMockEndpoint());

        global.fetch = jest.fn().mockResolvedValue(
          MockFactory.createMockFetchResponse({ data: 'test' })
        );

        // 模擬混合工作負載
        await Promise.all([
          // 批量請求
          batchExecutor.executeBatch(endpoints.slice(0, 20), { mode: 'parallel' }),
          // 緩存操作
          ...Array(50).fill(null).map(async (_, idx) => {
            await cacheManager.set(`load-test-${i}-${idx}`, { data: 'test' });
            return cacheManager.get(`load-test-${i}-${idx}`);
          }),
          // 速率限制檢查
          ...Array(20).fill(null).map(() => 
            rateLimiter.checkLimit({ clientId: `client-${i}` })
          ),
        ]);

        // 記錄記憶體使用狀況
        const memory = process.memoryUsage();
        memorySnapshots.push(memory);

        // 強制垃圾回收 (如果可用)
        if (global.gc) {
          global.gc();
        }

        // 短暫延遲讓系統穩定
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const initialMemory = memorySnapshots[0];
      const finalMemory = memorySnapshots[memorySnapshots.length - 1];
      const memoryGrowth = (finalMemory.heapUsed - initialMemory.heapUsed) / (1024 * 1024);
      const growthRate = memoryGrowth / (iterations * operationsPerIteration);

      benchmarkResults.push({
        operation: 'Memory Stability Test',
        duration: 0,
        memory: finalMemory,
        metrics: {
          initialHeap: initialMemory.heapUsed / (1024 * 1024),
          finalHeap: finalMemory.heapUsed / (1024 * 1024),
          memoryGrowth,
          growthRate,
          maxRSS: finalMemory.rss / (1024 * 1024),
        },
      });

      // 驗證記憶體穩定性
      expect(finalMemory.heapUsed / (1024 * 1024)).toBeLessThan(PERFORMANCE_TARGETS.MEMORY_USAGE.MAX_HEAP);
      expect(finalMemory.rss / (1024 * 1024)).toBeLessThan(PERFORMANCE_TARGETS.MEMORY_USAGE.MAX_RSS);
      expect(growthRate).toBeLessThan(PERFORMANCE_TARGETS.MEMORY_USAGE.GROWTH_RATE);
    });
  });

  // 輔助函數
  function calculatePerformanceMetrics(durations: number[]): PerformanceMetrics {
    const sorted = durations.sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      avg: durations.reduce((sum, d) => sum + d, 0) / len,
      min: sorted[0],
      max: sorted[len - 1],
      throughput: len / (durations.reduce((sum, d) => sum + d, 0) / 1000),
    };
  }

  function calculateLinearityScore(results: Array<{ size: number; duration: number; throughput: number }>): number {
    // 計算線性相關係數
    const n = results.length;
    const sumX = results.reduce((sum, r) => sum + r.size, 0);
    const sumY = results.reduce((sum, r) => sum + r.duration, 0);
    const sumXY = results.reduce((sum, r) => sum + r.size * r.duration, 0);
    const sumXX = results.reduce((sum, r) => sum + r.size * r.size, 0);
    const sumYY = results.reduce((sum, r) => sum + r.duration * r.duration, 0);

    const correlation = (n * sumXY - sumX * sumY) / 
      Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

    return Math.abs(correlation);
  }

  function generatePerformanceReport(): void {
    console.log('\n=== Performance Benchmark Report ===\n');
    
    benchmarkResults.forEach(result => {
      console.log(`Operation: ${result.operation}`);
      console.log(`Duration: ${result.duration.toFixed(2)}ms`);
      console.log(`Memory (Heap): ${(result.memory.heapUsed / (1024 * 1024)).toFixed(2)}MB`);
      console.log('Metrics:', JSON.stringify(result.metrics, null, 2));
      console.log('---');
    });

    // 生成性能摘要
    const totalMemory = process.memoryUsage();
    console.log('\nSystem Summary:');
    console.log(`Total Heap Used: ${(totalMemory.heapUsed / (1024 * 1024)).toFixed(2)}MB`);
    console.log(`Total RSS: ${(totalMemory.rss / (1024 * 1024)).toFixed(2)}MB`);
    console.log(`Total Tests: ${benchmarkResults.length}`);
    console.log('\n=== End of Report ===\n');
  }
});