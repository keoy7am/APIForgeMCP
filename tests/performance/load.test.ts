/**
 * Load testing scenarios for APIForge MCP Server
 * Simulates real-world usage patterns and stress tests the system
 */

import { jest } from '@jest/globals';
import { performance } from 'perf_hooks';
import {
  RequestExecutor,
  WorkspaceManager,
  CollectionManager,
  EnvironmentManager,
  AuthenticationService,
  ErrorHandler,
  ErrorRecoveryService,
  VariableReplacementService,
  EncryptionService,
  RequestBodyProcessor,
  ResponseParser,
  APIImporter
} from '../../src/services';
import { Storage } from '../../src/storage';
import { TestDataFactory, MockFactory } from '../utils/test-utils';
import { ApiEndpoint, Collection, Environment, Workspace } from '../../src/types';

describe('Load Testing Scenarios', () => {
  let requestExecutor: RequestExecutor;
  let workspaceManager: WorkspaceManager;
  let collectionManager: CollectionManager;
  let environmentManager: EnvironmentManager;
  let apiImporter: APIImporter;
  let storage: Storage;
  let mockLogger: any;

  // Performance metrics collection
  const metrics = {
    requestTimes: [] as number[],
    errorCount: 0,
    successCount: 0,
    memoryUsage: [] as number[],
    cpuUsage: [] as number[],
  };

  beforeEach(() => {
    // Reset metrics
    metrics.requestTimes = [];
    metrics.errorCount = 0;
    metrics.successCount = 0;
    metrics.memoryUsage = [];
    metrics.cpuUsage = [];

    // Setup services with minimal overhead
    storage = MockFactory.createMockStorage();
    mockLogger = MockFactory.createMockLogger();
    
    const encryptionService = new EncryptionService();
    const authService = new AuthenticationService();
    const variableReplacementService = new VariableReplacementService();
    const errorHandler = new ErrorHandler(mockLogger, {
      recordError: jest.fn(),
      incrementCounter: jest.fn(),
      recordTiming: jest.fn(),
    });
    const errorRecoveryService = new ErrorRecoveryService(mockLogger);
    const requestBodyProcessor = new RequestBodyProcessor();
    const responseParser = new ResponseParser();

    workspaceManager = new WorkspaceManager(storage);
    collectionManager = new CollectionManager(storage);
    environmentManager = new EnvironmentManager(storage, encryptionService);
    apiImporter = new APIImporter(storage);
    
    requestExecutor = new RequestExecutor({
      authService,
      environmentManager,
      variableReplacementService,
      errorHandler,
      errorRecoveryService,
      requestBodyProcessor,
      responseParser,
      storage,
      logger: mockLogger,
    });

    // Mock fetch for consistent load testing
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Sustained Load Testing', () => {
    it('should handle sustained load of 100 req/sec for 10 seconds', async () => {
      const requestsPerSecond = 100;
      const durationSeconds = 10;
      const totalRequests = requestsPerSecond * durationSeconds;

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/load-test',
        method: 'GET',
      });

      // Mock varying response times to simulate real conditions
      (global.fetch as jest.Mock).mockImplementation(() => {
        const responseTime = Math.random() * 50 + 10; // 10-60ms
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(MockFactory.createMockFetchResponse(
              { success: true, timestamp: Date.now() },
              { status: 200 }
            ));
          }, responseTime);
        });
      });

      const startTime = performance.now();
      const requests: Promise<any>[] = [];

      // Simulate sustained load
      for (let second = 0; second < durationSeconds; second++) {
        const batchStart = performance.now();
        
        // Send batch of requests for this second
        const batch = Array.from({ length: requestsPerSecond }, () => {
          const requestStart = performance.now();
          return requestExecutor.execute(endpoint)
            .then(result => {
              metrics.successCount++;
              metrics.requestTimes.push(performance.now() - requestStart);
              return result;
            })
            .catch(error => {
              metrics.errorCount++;
              metrics.requestTimes.push(performance.now() - requestStart);
              throw error;
            });
        });
        
        requests.push(...batch);
        
        // Record memory usage
        metrics.memoryUsage.push(process.memoryUsage().heapUsed / 1024 / 1024);
        
        // Wait for the remainder of the second
        const elapsed = performance.now() - batchStart;
        if (elapsed < 1000) {
          await new Promise(resolve => setTimeout(resolve, 1000 - elapsed));
        }
      }

      // Wait for all requests to complete
      const results = await Promise.allSettled(requests);
      const totalDuration = performance.now() - startTime;

      // Calculate statistics
      const successRate = (metrics.successCount / totalRequests) * 100;
      const avgResponseTime = metrics.requestTimes.reduce((a, b) => a + b, 0) / metrics.requestTimes.length;
      const p95ResponseTime = metrics.requestTimes.sort((a, b) => a - b)[Math.floor(metrics.requestTimes.length * 0.95)];
      const p99ResponseTime = metrics.requestTimes.sort((a, b) => a - b)[Math.floor(metrics.requestTimes.length * 0.99)];
      const avgMemoryUsage = metrics.memoryUsage.reduce((a, b) => a + b, 0) / metrics.memoryUsage.length;
      const maxMemoryUsage = Math.max(...metrics.memoryUsage);

      // Assert performance targets
      expect(successRate).toBeGreaterThan(95); // >95% success rate
      expect(avgResponseTime).toBeLessThan(100); // Avg response < 100ms
      expect(p95ResponseTime).toBeLessThan(200); // P95 < 200ms
      expect(p99ResponseTime).toBeLessThan(500); // P99 < 500ms
      expect(maxMemoryUsage).toBeLessThan(500); // Max memory < 500MB
      expect(totalDuration).toBeLessThan(15000); // Complete within 15 seconds

      console.log('Sustained Load Test Results:', {
        totalRequests,
        successRate: `${successRate.toFixed(2)}%`,
        avgResponseTime: `${avgResponseTime.toFixed(2)}ms`,
        p95ResponseTime: `${p95ResponseTime.toFixed(2)}ms`,
        p99ResponseTime: `${p99ResponseTime.toFixed(2)}ms`,
        avgMemoryUsage: `${avgMemoryUsage.toFixed(2)}MB`,
        maxMemoryUsage: `${maxMemoryUsage.toFixed(2)}MB`,
      });
    });

    it('should handle gradual load increase (ramp-up test)', async () => {
      const maxRequestsPerSecond = 200;
      const rampUpDuration = 10; // seconds
      const sustainDuration = 5; // seconds at peak
      const rampDownDuration = 5; // seconds

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/ramp-test',
        method: 'GET',
      });

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve(MockFactory.createMockFetchResponse(
          { success: true },
          { status: 200 }
        ))
      );

      const requests: Promise<any>[] = [];
      const loadProfile: number[] = [];

      // Ramp-up phase
      for (let second = 0; second < rampUpDuration; second++) {
        const requestsThisSecond = Math.floor((second + 1) * (maxRequestsPerSecond / rampUpDuration));
        loadProfile.push(requestsThisSecond);
        
        const batch = Array.from({ length: requestsThisSecond }, () =>
          requestExecutor.execute(endpoint)
            .then(() => metrics.successCount++)
            .catch(() => metrics.errorCount++)
        );
        
        requests.push(...batch);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Sustain phase
      for (let second = 0; second < sustainDuration; second++) {
        loadProfile.push(maxRequestsPerSecond);
        
        const batch = Array.from({ length: maxRequestsPerSecond }, () =>
          requestExecutor.execute(endpoint)
            .then(() => metrics.successCount++)
            .catch(() => metrics.errorCount++)
        );
        
        requests.push(...batch);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Ramp-down phase
      for (let second = 0; second < rampDownDuration; second++) {
        const requestsThisSecond = Math.floor((rampDownDuration - second) * (maxRequestsPerSecond / rampDownDuration));
        loadProfile.push(requestsThisSecond);
        
        const batch = Array.from({ length: requestsThisSecond }, () =>
          requestExecutor.execute(endpoint)
            .then(() => metrics.successCount++)
            .catch(() => metrics.errorCount++)
        );
        
        requests.push(...batch);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      await Promise.allSettled(requests);

      const totalRequests = loadProfile.reduce((a, b) => a + b, 0);
      const successRate = (metrics.successCount / totalRequests) * 100;

      expect(successRate).toBeGreaterThan(90); // >90% success rate during ramp
      expect(metrics.errorCount).toBeLessThan(totalRequests * 0.1); // <10% errors

      console.log('Ramp Test Results:', {
        totalRequests,
        successRate: `${successRate.toFixed(2)}%`,
        peakLoad: `${maxRequestsPerSecond} req/sec`,
        loadProfile,
      });
    });
  });

  describe('Spike Testing', () => {
    it('should handle sudden traffic spikes', async () => {
      const normalLoad = 50; // req/sec
      const spikeLoad = 500; // req/sec
      const normalDuration = 5; // seconds
      const spikeDuration = 2; // seconds

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/spike-test',
        method: 'GET',
      });

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve(MockFactory.createMockFetchResponse(
          { success: true },
          { status: 200 }
        ))
      );

      const requests: Promise<any>[] = [];
      const responseTimesDuringSpike: number[] = [];

      // Normal load phase
      for (let second = 0; second < normalDuration; second++) {
        const batch = Array.from({ length: normalLoad }, () =>
          requestExecutor.execute(endpoint)
        );
        requests.push(...batch);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Spike phase
      const spikeStart = performance.now();
      for (let second = 0; second < spikeDuration; second++) {
        const batch = Array.from({ length: spikeLoad }, () => {
          const start = performance.now();
          return requestExecutor.execute(endpoint).then(result => {
            responseTimesDuringSpike.push(performance.now() - start);
            return result;
          });
        });
        requests.push(...batch);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      const spikeDurationActual = performance.now() - spikeStart;

      // Return to normal load
      for (let second = 0; second < normalDuration; second++) {
        const batch = Array.from({ length: normalLoad }, () =>
          requestExecutor.execute(endpoint)
        );
        requests.push(...batch);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const results = await Promise.allSettled(requests);
      const successfulRequests = results.filter(r => r.status === 'fulfilled').length;
      const totalRequests = results.length;
      const successRate = (successfulRequests / totalRequests) * 100;

      // Calculate spike performance metrics
      const avgResponseTimeDuringSpike = responseTimesDuringSpike.reduce((a, b) => a + b, 0) / responseTimesDuringSpike.length;
      const maxResponseTimeDuringSpike = Math.max(...responseTimesDuringSpike);

      // System should handle spike without crashing
      expect(successRate).toBeGreaterThan(85); // >85% success rate even during spike
      expect(avgResponseTimeDuringSpike).toBeLessThan(500); // Degraded but acceptable
      expect(maxResponseTimeDuringSpike).toBeLessThan(2000); // Max 2 second response

      console.log('Spike Test Results:', {
        totalRequests,
        successRate: `${successRate.toFixed(2)}%`,
        spikeLoad: `${spikeLoad} req/sec`,
        avgResponseDuringSpike: `${avgResponseTimeDuringSpike.toFixed(2)}ms`,
        maxResponseDuringSpike: `${maxResponseTimeDuringSpike.toFixed(2)}ms`,
      });
    });

    it('should recover from traffic burst', async () => {
      const burstSize = 1000; // requests at once
      
      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/burst-test',
        method: 'GET',
      });

      let activeRequests = 0;
      let maxConcurrentRequests = 0;

      (global.fetch as jest.Mock).mockImplementation(() => {
        activeRequests++;
        maxConcurrentRequests = Math.max(maxConcurrentRequests, activeRequests);
        
        return new Promise(resolve => {
          setTimeout(() => {
            activeRequests--;
            resolve(MockFactory.createMockFetchResponse(
              { success: true },
              { status: 200 }
            ));
          }, Math.random() * 100 + 50); // 50-150ms response time
        });
      });

      const memoryBefore = process.memoryUsage().heapUsed / 1024 / 1024;
      const startTime = performance.now();

      // Send burst of requests
      const burstRequests = Array.from({ length: burstSize }, () =>
        requestExecutor.execute(endpoint)
      );

      const results = await Promise.allSettled(burstRequests);
      const duration = performance.now() - startTime;
      const memoryAfter = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryIncrease = memoryAfter - memoryBefore;

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const successRate = (successCount / burstSize) * 100;

      // System should handle burst without memory explosion
      expect(successRate).toBeGreaterThan(90); // >90% success rate
      expect(memoryIncrease).toBeLessThan(200); // Memory increase < 200MB
      expect(duration).toBeLessThan(10000); // Complete within 10 seconds
      expect(maxConcurrentRequests).toBeLessThanOrEqual(burstSize); // Proper concurrency control

      console.log('Burst Test Results:', {
        burstSize,
        successRate: `${successRate.toFixed(2)}%`,
        duration: `${duration.toFixed(2)}ms`,
        memoryIncrease: `${memoryIncrease.toFixed(2)}MB`,
        maxConcurrentRequests,
      });
    });
  });

  describe('Stress Testing', () => {
    it('should identify system breaking point', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/stress-test',
        method: 'GET',
      });

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve(MockFactory.createMockFetchResponse(
          { success: true },
          { status: 200 }
        ))
      );

      let currentLoad = 50; // Starting load (req/sec)
      const loadIncrement = 50; // Increase by 50 req/sec each step
      const stepDuration = 5; // seconds per step
      const maxLoad = 1000; // Maximum load to test
      const targetSuccessRate = 95; // Target success rate percentage

      let breakingPoint = 0;
      let lastSuccessRate = 100;

      while (currentLoad <= maxLoad && lastSuccessRate >= targetSuccessRate) {
        const requests: Promise<any>[] = [];
        let stepSuccessCount = 0;
        let stepErrorCount = 0;

        // Run load for step duration
        for (let second = 0; second < stepDuration; second++) {
          const batch = Array.from({ length: currentLoad }, () =>
            requestExecutor.execute(endpoint)
              .then(() => stepSuccessCount++)
              .catch(() => stepErrorCount++)
          );
          
          requests.push(...batch);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await Promise.allSettled(requests);

        const totalRequests = currentLoad * stepDuration;
        lastSuccessRate = (stepSuccessCount / totalRequests) * 100;

        console.log(`Load: ${currentLoad} req/sec, Success Rate: ${lastSuccessRate.toFixed(2)}%`);

        if (lastSuccessRate < targetSuccessRate) {
          breakingPoint = currentLoad - loadIncrement; // Previous load was the breaking point
          break;
        }

        currentLoad += loadIncrement;
      }

      // System should handle at least 200 req/sec
      expect(breakingPoint).toBeGreaterThanOrEqual(200);

      console.log('Stress Test Results:', {
        breakingPoint: `${breakingPoint} req/sec`,
        targetSuccessRate: `${targetSuccessRate}%`,
        lastTestedLoad: `${currentLoad} req/sec`,
      });
    });

    it('should handle resource exhaustion gracefully', async () => {
      // Simulate large number of workspaces and collections
      const numWorkspaces = 100;
      const collectionsPerWorkspace = 10;
      const endpointsPerCollection = 50;

      const startTime = performance.now();
      const memoryStart = process.memoryUsage().heapUsed / 1024 / 1024;

      // Create workspaces
      const workspaces = await Promise.all(
        Array.from({ length: numWorkspaces }, (_, i) => {
          const workspace = TestDataFactory.createMockWorkspace({
            id: `ws-${i}`,
            name: `Workspace ${i}`,
          });
          storage.saveWorkspace = jest.fn().mockResolvedValue(workspace);
          return workspaceManager.createWorkspace(workspace);
        })
      );

      // Create collections with endpoints
      const collections = [];
      for (const workspace of workspaces) {
        const workspaceCollections = await Promise.all(
          Array.from({ length: collectionsPerWorkspace }, (_, i) => {
            const collection = TestDataFactory.createMockCollection({
              id: `col-${workspace.id}-${i}`,
              name: `Collection ${i}`,
              workspaceId: workspace.id,
              endpoints: Array.from({ length: endpointsPerCollection }, (_, j) =>
                TestDataFactory.createMockEndpoint({
                  id: `ep-${workspace.id}-${i}-${j}`,
                  name: `Endpoint ${j}`,
                })
              ),
            });
            storage.saveCollection = jest.fn().mockResolvedValue(collection);
            return collectionManager.createCollection(collection);
          })
        );
        collections.push(...workspaceCollections);
      }

      const duration = performance.now() - startTime;
      const memoryEnd = process.memoryUsage().heapUsed / 1024 / 1024;
      const memoryUsed = memoryEnd - memoryStart;

      const totalEntities = numWorkspaces + (numWorkspaces * collectionsPerWorkspace) + 
                          (numWorkspaces * collectionsPerWorkspace * endpointsPerCollection);

      // System should handle large number of entities
      expect(workspaces).toHaveLength(numWorkspaces);
      expect(collections).toHaveLength(numWorkspaces * collectionsPerWorkspace);
      expect(duration).toBeLessThan(30000); // Complete within 30 seconds
      expect(memoryUsed).toBeLessThan(1000); // Use less than 1GB of memory

      console.log('Resource Exhaustion Test Results:', {
        totalEntities,
        duration: `${duration.toFixed(2)}ms`,
        memoryUsed: `${memoryUsed.toFixed(2)}MB`,
        entitiesPerSecond: (totalEntities / (duration / 1000)).toFixed(2),
      });
    });
  });

  describe('Endurance Testing', () => {
    it('should maintain performance over extended period', async () => {
      const testDuration = 60; // seconds
      const requestRate = 50; // req/sec
      const checkInterval = 10; // Check metrics every 10 seconds

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/endurance-test',
        method: 'GET',
      });

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve(MockFactory.createMockFetchResponse(
          { success: true },
          { status: 200 }
        ))
      );

      const performanceMetrics: Array<{
        timestamp: number;
        avgResponseTime: number;
        successRate: number;
        memoryUsage: number;
      }> = [];

      const startTime = performance.now();
      let intervalRequests: number[] = [];
      let intervalSuccess = 0;
      let intervalTotal = 0;

      for (let second = 0; second < testDuration; second++) {
        const requests = Array.from({ length: requestRate }, () => {
          const requestStart = performance.now();
          intervalTotal++;
          
          return requestExecutor.execute(endpoint)
            .then(() => {
              intervalSuccess++;
              intervalRequests.push(performance.now() - requestStart);
            })
            .catch(() => {
              intervalRequests.push(performance.now() - requestStart);
            });
        });

        await Promise.all(requests);
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Collect metrics at intervals
        if ((second + 1) % checkInterval === 0) {
          const avgResponseTime = intervalRequests.reduce((a, b) => a + b, 0) / intervalRequests.length;
          const successRate = (intervalSuccess / intervalTotal) * 100;
          const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024;

          performanceMetrics.push({
            timestamp: second + 1,
            avgResponseTime,
            successRate,
            memoryUsage,
          });

          // Reset interval metrics
          intervalRequests = [];
          intervalSuccess = 0;
          intervalTotal = 0;
        }
      }

      const totalDuration = performance.now() - startTime;

      // Check for performance degradation
      const firstMetric = performanceMetrics[0];
      const lastMetric = performanceMetrics[performanceMetrics.length - 1];
      
      const responseTimeDegradation = ((lastMetric.avgResponseTime - firstMetric.avgResponseTime) / firstMetric.avgResponseTime) * 100;
      const memoryGrowth = lastMetric.memoryUsage - firstMetric.memoryUsage;

      // Performance should not degrade significantly over time
      expect(responseTimeDegradation).toBeLessThan(50); // Less than 50% degradation
      expect(memoryGrowth).toBeLessThan(100); // Less than 100MB memory growth
      expect(lastMetric.successRate).toBeGreaterThan(95); // Maintain >95% success rate

      console.log('Endurance Test Results:', {
        testDuration: `${testDuration} seconds`,
        totalRequests: testDuration * requestRate,
        responseTimeDegradation: `${responseTimeDegradation.toFixed(2)}%`,
        memoryGrowth: `${memoryGrowth.toFixed(2)}MB`,
        performanceMetrics,
      });
    });

    it('should handle memory leaks detection', async () => {
      const iterations = 100;
      const requestsPerIteration = 10;
      
      const memorySnapshots: number[] = [];
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      memorySnapshots.push(initialMemory);

      for (let i = 0; i < iterations; i++) {
        // Create and execute requests
        const endpoints = Array.from({ length: requestsPerIteration }, (_, j) =>
          TestDataFactory.createMockEndpoint({
            id: `leak-test-${i}-${j}`,
            url: `https://api.example.com/leak-test/${i}/${j}`,
            body: { data: new Array(1000).fill(`data-${i}-${j}`) }, // Large payload
          })
        );

        (global.fetch as jest.Mock).mockResolvedValue(
          MockFactory.createMockFetchResponse(
            { data: new Array(1000).fill('response') },
            { status: 200 }
          )
        );

        await Promise.all(
          endpoints.map(endpoint => requestExecutor.execute(endpoint))
        );

        // Clear references
        endpoints.length = 0;

        // Take memory snapshot every 10 iterations
        if ((i + 1) % 10 === 0) {
          if (global.gc) {
            global.gc();
          }
          const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
          memorySnapshots.push(currentMemory);
        }
      }

      // Analyze memory trend
      let increasingTrend = 0;
      for (let i = 1; i < memorySnapshots.length; i++) {
        if (memorySnapshots[i] > memorySnapshots[i - 1]) {
          increasingTrend++;
        }
      }

      const memoryGrowth = memorySnapshots[memorySnapshots.length - 1] - memorySnapshots[0];
      const growthRate = (increasingTrend / (memorySnapshots.length - 1)) * 100;

      // Memory should not continuously increase (allow some fluctuation)
      expect(growthRate).toBeLessThan(70); // Less than 70% increasing trend
      expect(memoryGrowth).toBeLessThan(200); // Less than 200MB total growth

      console.log('Memory Leak Test Results:', {
        iterations,
        totalRequests: iterations * requestsPerIteration,
        initialMemory: `${initialMemory.toFixed(2)}MB`,
        finalMemory: `${memorySnapshots[memorySnapshots.length - 1].toFixed(2)}MB`,
        memoryGrowth: `${memoryGrowth.toFixed(2)}MB`,
        growthRate: `${growthRate.toFixed(2)}%`,
      });
    });
  });

  describe('Realistic Usage Patterns', () => {
    it('should handle mixed workload patterns', async () => {
      // Simulate realistic API usage patterns
      const workloadPatterns = [
        { type: 'GET', weight: 60, avgSize: 1024 },      // 60% read operations
        { type: 'POST', weight: 20, avgSize: 4096 },     // 20% create operations
        { type: 'PUT', weight: 15, avgSize: 2048 },      // 15% update operations
        { type: 'DELETE', weight: 5, avgSize: 256 },     // 5% delete operations
      ];

      const totalRequests = 1000;
      const requests: Promise<any>[] = [];
      const requestsByType: Record<string, number> = {};

      for (let i = 0; i < totalRequests; i++) {
        // Select request type based on weights
        const random = Math.random() * 100;
        let cumulativeWeight = 0;
        let selectedPattern = workloadPatterns[0];

        for (const pattern of workloadPatterns) {
          cumulativeWeight += pattern.weight;
          if (random <= cumulativeWeight) {
            selectedPattern = pattern;
            break;
          }
        }

        requestsByType[selectedPattern.type] = (requestsByType[selectedPattern.type] || 0) + 1;

        const endpoint = TestDataFactory.createMockEndpoint({
          method: selectedPattern.type as any,
          url: `https://api.example.com/mixed/${selectedPattern.type.toLowerCase()}/${i}`,
          body: selectedPattern.type !== 'GET' && selectedPattern.type !== 'DELETE' 
            ? { data: 'x'.repeat(selectedPattern.avgSize) }
            : undefined,
        });

        (global.fetch as jest.Mock).mockResolvedValue(
          MockFactory.createMockFetchResponse(
            { success: true, type: selectedPattern.type },
            { status: selectedPattern.type === 'POST' ? 201 : 200 }
          )
        );

        requests.push(requestExecutor.execute(endpoint));
      }

      const startTime = performance.now();
      const results = await Promise.allSettled(requests);
      const duration = performance.now() - startTime;

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const successRate = (successCount / totalRequests) * 100;
      const throughput = (totalRequests / (duration / 1000)); // requests per second

      // Verify workload distribution
      const getPercentage = (requestsByType['GET'] / totalRequests) * 100;
      const postPercentage = (requestsByType['POST'] / totalRequests) * 100;

      expect(successRate).toBeGreaterThan(95); // >95% success rate
      expect(throughput).toBeGreaterThan(50); // >50 req/sec throughput
      expect(getPercentage).toBeGreaterThan(50); // GET requests should be majority
      expect(getPercentage).toBeLessThan(70); // But not too skewed

      console.log('Mixed Workload Test Results:', {
        totalRequests,
        successRate: `${successRate.toFixed(2)}%`,
        throughput: `${throughput.toFixed(2)} req/sec`,
        duration: `${duration.toFixed(2)}ms`,
        requestDistribution: requestsByType,
      });
    });

    it('should handle concurrent user sessions', async () => {
      const numUsers = 50;
      const actionsPerUser = 20;
      const thinkTime = 500; // ms between user actions

      // Simulate different user behaviors
      const userBehaviors = [
        { type: 'power', actionsPerMinute: 30 },    // Power users
        { type: 'regular', actionsPerMinute: 10 },  // Regular users
        { type: 'casual', actionsPerMinute: 3 },    // Casual users
      ];

      const userSessions = Array.from({ length: numUsers }, (_, i) => {
        const behavior = userBehaviors[i % userBehaviors.length];
        return {
          userId: `user-${i}`,
          behavior,
          workspace: TestDataFactory.createMockWorkspace({ id: `ws-user-${i}` }),
          environment: TestDataFactory.createMockEnvironment({ id: `env-user-${i}` }),
        };
      });

      // Mock storage for user sessions
      storage.getWorkspace = jest.fn().mockImplementation((id) => 
        Promise.resolve(userSessions.find(s => s.workspace.id === id)?.workspace)
      );
      storage.getEnvironment = jest.fn().mockImplementation((id) =>
        Promise.resolve(userSessions.find(s => s.environment.id === id)?.environment)
      );

      (global.fetch as jest.Mock).mockImplementation(() =>
        new Promise(resolve => {
          setTimeout(() => {
            resolve(MockFactory.createMockFetchResponse(
              { success: true },
              { status: 200 }
            ));
          }, Math.random() * 100 + 50); // Variable response time
        })
      );

      const startTime = performance.now();
      
      // Simulate concurrent user sessions
      const userPromises = userSessions.map(async (session) => {
        const results = [];
        
        for (let action = 0; action < actionsPerUser; action++) {
          const endpoint = TestDataFactory.createMockEndpoint({
            url: `https://api.example.com/user/${session.userId}/action/${action}`,
            method: Math.random() > 0.7 ? 'POST' : 'GET',
          });

          try {
            const result = await requestExecutor.execute(endpoint, {
              environmentId: session.environment.id,
            });
            results.push({ success: true, action });
          } catch (error) {
            results.push({ success: false, action });
          }

          // Simulate think time between actions
          const delay = thinkTime / (session.behavior.actionsPerMinute / 10);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        return results;
      });

      const allResults = await Promise.all(userPromises);
      const duration = performance.now() - startTime;

      const totalActions = numUsers * actionsPerUser;
      const successfulActions = allResults.flat().filter(r => r.success).length;
      const successRate = (successfulActions / totalActions) * 100;
      const avgActionsPerSecond = totalActions / (duration / 1000);

      expect(successRate).toBeGreaterThan(90); // >90% success rate
      expect(avgActionsPerSecond).toBeGreaterThan(10); // >10 actions/sec

      console.log('Concurrent Users Test Results:', {
        numUsers,
        totalActions,
        successRate: `${successRate.toFixed(2)}%`,
        avgActionsPerSecond: `${avgActionsPerSecond.toFixed(2)}`,
        duration: `${duration.toFixed(2)}ms`,
      });
    });

    it('should handle API rate limiting scenarios', async () => {
      const rateLimit = 100; // requests per minute
      const testDuration = 60; // seconds
      let requestCount = 0;
      let rateLimitedCount = 0;
      let successCount = 0;

      (global.fetch as jest.Mock).mockImplementation(() => {
        requestCount++;
        
        // Simulate rate limiting
        if (requestCount > rateLimit) {
          rateLimitedCount++;
          return Promise.resolve(
            MockFactory.createMockFetchResponse(
              { error: 'Rate limit exceeded' },
              { 
                status: 429,
                headers: {
                  'X-RateLimit-Limit': String(rateLimit),
                  'X-RateLimit-Remaining': '0',
                  'X-RateLimit-Reset': String(Date.now() + 60000),
                },
              }
            )
          );
        }

        successCount++;
        return Promise.resolve(
          MockFactory.createMockFetchResponse(
            { success: true },
            { 
              status: 200,
              headers: {
                'X-RateLimit-Limit': String(rateLimit),
                'X-RateLimit-Remaining': String(rateLimit - requestCount),
              },
            }
          )
        );
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/rate-limited',
        method: 'GET',
      });

      const requests: Promise<any>[] = [];
      const requestsPerSecond = 3; // Try to exceed rate limit

      for (let second = 0; second < testDuration; second++) {
        for (let i = 0; i < requestsPerSecond; i++) {
          requests.push(
            requestExecutor.execute(endpoint)
              .catch(error => {
                // Handle rate limit errors gracefully
                if (error.status === 429) {
                  return { rateLimited: true };
                }
                throw error;
              })
          );
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const results = await Promise.allSettled(requests);
      const totalRequests = requestsPerSecond * testDuration;

      expect(rateLimitedCount).toBeGreaterThan(0); // Should hit rate limit
      expect(successCount).toBeLessThanOrEqual(rateLimit); // Shouldn't exceed limit
      expect(results.length).toBe(totalRequests); // All requests should complete

      console.log('Rate Limiting Test Results:', {
        totalRequests,
        successCount,
        rateLimitedCount,
        rateLimit: `${rateLimit} req/min`,
        attemptedRate: `${requestsPerSecond * 60} req/min`,
      });
    });
  });

  describe('Load Test Analytics', () => {
    it('should generate comprehensive performance report', async () => {
      const testScenarios = [
        { name: 'Light Load', rps: 10, duration: 5 },
        { name: 'Medium Load', rps: 50, duration: 5 },
        { name: 'Heavy Load', rps: 100, duration: 5 },
        { name: 'Peak Load', rps: 200, duration: 3 },
      ];

      const report: any = {
        scenarios: [],
        summary: {
          totalRequests: 0,
          totalDuration: 0,
          overallSuccessRate: 0,
          peakThroughput: 0,
        },
      };

      for (const scenario of testScenarios) {
        const scenarioMetrics = {
          name: scenario.name,
          targetRPS: scenario.rps,
          actualRPS: 0,
          totalRequests: 0,
          successCount: 0,
          errorCount: 0,
          avgResponseTime: 0,
          p50ResponseTime: 0,
          p95ResponseTime: 0,
          p99ResponseTime: 0,
          minResponseTime: Number.MAX_VALUE,
          maxResponseTime: 0,
        };

        const responseTimes: number[] = [];
        const endpoint = TestDataFactory.createMockEndpoint({
          url: `https://api.example.com/load-test/${scenario.name.toLowerCase().replace(' ', '-')}`,
        });

        (global.fetch as jest.Mock).mockImplementation(() =>
          new Promise(resolve => {
            const responseTime = Math.random() * 100 + 20;
            setTimeout(() => {
              resolve(MockFactory.createMockFetchResponse({ success: true }, { status: 200 }));
            }, responseTime);
          })
        );

        const startTime = performance.now();

        for (let second = 0; second < scenario.duration; second++) {
          const requests = Array.from({ length: scenario.rps }, () => {
            const requestStart = performance.now();
            scenarioMetrics.totalRequests++;
            
            return requestExecutor.execute(endpoint)
              .then(() => {
                const responseTime = performance.now() - requestStart;
                responseTimes.push(responseTime);
                scenarioMetrics.successCount++;
                scenarioMetrics.minResponseTime = Math.min(scenarioMetrics.minResponseTime, responseTime);
                scenarioMetrics.maxResponseTime = Math.max(scenarioMetrics.maxResponseTime, responseTime);
              })
              .catch(() => {
                scenarioMetrics.errorCount++;
              });
          });

          await Promise.all(requests);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const duration = performance.now() - startTime;
        
        // Calculate metrics
        responseTimes.sort((a, b) => a - b);
        scenarioMetrics.actualRPS = scenarioMetrics.totalRequests / (duration / 1000);
        scenarioMetrics.avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length || 0;
        scenarioMetrics.p50ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.5)] || 0;
        scenarioMetrics.p95ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.95)] || 0;
        scenarioMetrics.p99ResponseTime = responseTimes[Math.floor(responseTimes.length * 0.99)] || 0;

        report.scenarios.push(scenarioMetrics);
        report.summary.totalRequests += scenarioMetrics.totalRequests;
        report.summary.totalDuration += duration;
        report.summary.peakThroughput = Math.max(report.summary.peakThroughput, scenarioMetrics.actualRPS);
      }

      // Calculate overall metrics
      const totalSuccess = report.scenarios.reduce((sum: number, s: any) => sum + s.successCount, 0);
      report.summary.overallSuccessRate = (totalSuccess / report.summary.totalRequests) * 100;

      // Verify performance across scenarios
      expect(report.summary.overallSuccessRate).toBeGreaterThan(90);
      expect(report.scenarios[0].avgResponseTime).toBeLessThan(200); // Light load should be fast
      expect(report.scenarios[report.scenarios.length - 1].actualRPS).toBeGreaterThan(100); // Should handle peak load

      console.log('Performance Report:', JSON.stringify(report, null, 2));
    });
  });
});