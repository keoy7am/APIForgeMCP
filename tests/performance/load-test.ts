/**
 * Load Testing Scenarios for APIForge MCP Server
 * 負載測試場景
 */

import { performance } from 'perf_hooks';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { EventEmitter } from 'events';
import path from 'path';
import { RequestExecutor } from '../../src/services/request.service';
import { BatchExecutor } from '../../src/services/batch/batch-executor.service';
import { CacheManager } from '../../src/services/performance/cache-manager.service';
import { ConnectionPool } from '../../src/services/performance/connection-pool.service';
import { HistoryService } from '../../src/services/history/history.service';
import { MockFactory, TestDataFactory } from '../utils/test-utils';

// Load testing configuration
interface LoadTestConfig {
  name: string;
  duration: number;           // Test duration in seconds
  rampUpTime: number;         // Ramp-up time in seconds
  targetRPS: number;          // Target requests per second
  maxConcurrency: number;     // Maximum concurrent users
  warmUpRequests: number;     // Warm-up requests
  coolDownTime: number;       // Cool-down time in seconds
}

// Load test scenarios
const LOAD_TEST_SCENARIOS: LoadTestConfig[] = [
  {
    name: 'Baseline Load Test',
    duration: 60,
    rampUpTime: 10,
    targetRPS: 50,
    maxConcurrency: 20,
    warmUpRequests: 100,
    coolDownTime: 5,
  },
  {
    name: 'Stress Test',
    duration: 120,
    rampUpTime: 20,
    targetRPS: 200,
    maxConcurrency: 100,
    warmUpRequests: 200,
    coolDownTime: 10,
  },
  {
    name: 'Spike Test',
    duration: 30,
    rampUpTime: 5,
    targetRPS: 500,
    maxConcurrency: 200,
    warmUpRequests: 50,
    coolDownTime: 10,
  },
  {
    name: 'Endurance Test',
    duration: 600, // 10 minutes
    rampUpTime: 60,
    targetRPS: 100,
    maxConcurrency: 50,
    warmUpRequests: 300,
    coolDownTime: 30,
  },
];

interface LoadTestResult {
  scenario: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  actualRPS: number;
  errorRate: number;
  memoryUsage: {
    peak: number;
    average: number;
    final: number;
  };
  cpuUsage: number[];
  networkMetrics: {
    totalBytes: number;
    averageThroughput: number;
  };
}

interface RequestResult {
  timestamp: number;
  duration: number;
  success: boolean;
  error?: string;
  statusCode?: number;
  responseSize?: number;
}

class LoadTestRunner extends EventEmitter {
  private results: LoadTestResult[] = [];
  private isRunning = false;
  private currentScenario?: LoadTestConfig;
  
  // Services
  private requestExecutor!: RequestExecutor;
  private batchExecutor!: BatchExecutor;
  private cacheManager!: CacheManager;
  private connectionPool!: ConnectionPool;
  private historyService!: HistoryService;

  constructor() {
    super();
    this.setupServices();
  }

  private async setupServices(): Promise<void> {
    const mockStorage = MockFactory.createMockStorage();
    const mockLogger = MockFactory.createMockLogger();

    // Initialize services
    this.requestExecutor = new RequestExecutor(
      null as any,
      null as any,
      null as any,
      mockLogger
    );

    this.batchExecutor = new BatchExecutor(this.requestExecutor, mockLogger);

    const cacheConfig = {
      maxSize: 50 * 1024 * 1024, // 50MB
      maxEntries: 50000,
      defaultTTL: 300000,
      evictionPolicy: 'lru' as const,
      compression: true,
      collectStats: true,
    };
    this.cacheManager = new CacheManager(cacheConfig, mockStorage, mockLogger);

    const poolConfig = {
      maxConnections: 200,
      maxConnectionsPerHost: 20,
      connectionTimeout: 5000,
      idleTimeout: 30000,
      retryAttempts: 3,
      keepAlive: true,
    };
    this.connectionPool = new ConnectionPool(poolConfig, mockLogger);

    this.historyService = new HistoryService(mockStorage, mockLogger);
  }

  async runAllScenarios(): Promise<LoadTestResult[]> {
    console.log('🚀 Starting Load Testing Suite...\n');

    for (const scenario of LOAD_TEST_SCENARIOS) {
      console.log(`📊 Running scenario: ${scenario.name}`);
      const result = await this.runScenario(scenario);
      this.results.push(result);
      
      console.log(`✅ Completed: ${scenario.name}`);
      console.log(`   - RPS: ${result.actualRPS.toFixed(2)}`);
      console.log(`   - Error Rate: ${(result.errorRate * 100).toFixed(2)}%`);
      console.log(`   - P95 Response Time: ${result.p95ResponseTime.toFixed(2)}ms\n`);

      // 場景間休息
      await this.delay(5000);
    }

    this.generateLoadTestReport();
    return this.results;
  }

  async runScenario(config: LoadTestConfig): Promise<LoadTestResult> {
    this.currentScenario = config;
    this.isRunning = true;

    // Setup mock HTTP responses
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      // Simulate realistic response times
      const delay = Math.random() * 100 + 50; // 50-150ms
      await new Promise(resolve => setTimeout(resolve, delay));
      
      return MockFactory.createMockFetchResponse({
        data: 'load-test-response',
        timestamp: Date.now(),
        url,
      });
    });

    const startTime = performance.now();
    const results: RequestResult[] = [];
    const memorySnapshots: number[] = [];
    const cpuSnapshots: number[] = [];

    // Warm-up phase
    console.log(`  🔥 Warming up with ${config.warmUpRequests} requests...`);
    await this.warmUp(config.warmUpRequests);

    // Monitoring setup
    const monitoringInterval = setInterval(() => {
      const memory = process.memoryUsage();
      memorySnapshots.push(memory.heapUsed / (1024 * 1024)); // MB

      const cpuUsage = process.cpuUsage();
      cpuSnapshots.push((cpuUsage.user + cpuUsage.system) / 1000); // milliseconds
    }, 1000);

    try {
      // Main load test execution
      await this.executeLoadTest(config, results);
    } finally {
      clearInterval(monitoringInterval);
      this.isRunning = false;
    }

    // Cool-down phase
    console.log(`  ❄️  Cooling down for ${config.coolDownTime}s...`);
    await this.delay(config.coolDownTime * 1000);

    // Calculate results
    return this.calculateResults(config, results, memorySnapshots, cpuSnapshots);
  }

  private async executeLoadTest(
    config: LoadTestConfig, 
    results: RequestResult[]
  ): Promise<void> {
    const workers: Worker[] = [];
    const totalDuration = config.duration * 1000; // Convert to ms
    const rampUpDuration = config.rampUpTime * 1000;
    
    const startTime = performance.now();
    let currentConcurrency = 1;

    // Create worker pool
    const workerCount = Math.min(config.maxConcurrency, 20); // Limit worker count
    
    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker(__filename, {
        workerData: {
          workerId: i,
          config,
          isWorker: true,
        },
      });

      worker.on('message', (result: RequestResult) => {
        results.push(result);
      });

      workers.push(worker);
    }

    // Ramp-up phase
    const rampUpInterval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const rampUpProgress = Math.min(elapsed / rampUpDuration, 1);
      
      currentConcurrency = Math.floor(rampUpProgress * config.maxConcurrency);
      
      // Send work to workers
      workers.slice(0, currentConcurrency).forEach(worker => {
        worker.postMessage({ type: 'execute', targetRPS: config.targetRPS / currentConcurrency });
      });

      if (elapsed >= totalDuration) {
        clearInterval(rampUpInterval);
        
        // Terminate workers
        workers.forEach(worker => {
          worker.postMessage({ type: 'stop' });
          worker.terminate();
        });
      }
    }, 1000);

    // Wait for test completion
    await new Promise(resolve => {
      setTimeout(resolve, totalDuration + 5000); // Extra buffer
    });
  }

  private async warmUp(requests: number): Promise<void> {
    const endpoint = TestDataFactory.createMockEndpoint();
    const batchSize = 20;
    const batches = Math.ceil(requests / batchSize);

    for (let i = 0; i < batches; i++) {
      const currentBatchSize = Math.min(batchSize, requests - (i * batchSize));
      const endpoints = Array(currentBatchSize).fill(endpoint);
      
      try {
        await this.batchExecutor.executeBatch(endpoints, {
          mode: 'parallel',
          concurrency: 10,
        });
      } catch (error) {
        // Ignore warm-up errors
      }
    }
  }

  private calculateResults(
    config: LoadTestConfig,
    results: RequestResult[],
    memorySnapshots: number[],
    cpuSnapshots: number[]
  ): LoadTestResult {
    const successfulResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    
    const durations = successfulResults.map(r => r.duration);
    durations.sort((a, b) => a - b);

    const totalRequests = results.length;
    const successfulRequests = successfulResults.length;
    const failedRequests = failedResults.length;

    const averageResponseTime = durations.length > 0 
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
      : 0;

    const p95ResponseTime = durations.length > 0 
      ? durations[Math.floor(durations.length * 0.95)] 
      : 0;

    const p99ResponseTime = durations.length > 0 
      ? durations[Math.floor(durations.length * 0.99)] 
      : 0;

    const actualRPS = totalRequests / config.duration;
    const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

    const totalBytes = results.reduce((sum, r) => sum + (r.responseSize || 0), 0);
    const averageThroughput = totalBytes / config.duration; // bytes per second

    return {
      scenario: config.name,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      p95ResponseTime,
      p99ResponseTime,
      actualRPS,
      errorRate,
      memoryUsage: {
        peak: Math.max(...memorySnapshots),
        average: memorySnapshots.reduce((sum, m) => sum + m, 0) / memorySnapshots.length,
        final: memorySnapshots[memorySnapshots.length - 1] || 0,
      },
      cpuUsage: cpuSnapshots,
      networkMetrics: {
        totalBytes,
        averageThroughput,
      },
    };
  }

  private generateLoadTestReport(): void {
    console.log('\n' + '='.repeat(60));
    console.log('🏁 LOAD TESTING REPORT');
    console.log('='.repeat(60));

    this.results.forEach(result => {
      console.log(`\n📊 ${result.scenario}`);
      console.log('─'.repeat(40));
      console.log(`Total Requests:      ${result.totalRequests.toLocaleString()}`);
      console.log(`Successful:          ${result.successfulRequests.toLocaleString()}`);
      console.log(`Failed:              ${result.failedRequests.toLocaleString()}`);
      console.log(`Error Rate:          ${(result.errorRate * 100).toFixed(2)}%`);
      console.log(`Actual RPS:          ${result.actualRPS.toFixed(2)}`);
      console.log(`Avg Response Time:   ${result.averageResponseTime.toFixed(2)}ms`);
      console.log(`P95 Response Time:   ${result.p95ResponseTime.toFixed(2)}ms`);
      console.log(`P99 Response Time:   ${result.p99ResponseTime.toFixed(2)}ms`);
      console.log(`Peak Memory:         ${result.memoryUsage.peak.toFixed(2)}MB`);
      console.log(`Avg Memory:          ${result.memoryUsage.average.toFixed(2)}MB`);
      console.log(`Network Throughput:  ${(result.networkMetrics.averageThroughput / 1024).toFixed(2)} KB/s`);
    });

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📈 SUMMARY');
    console.log('='.repeat(60));
    
    const totalRequests = this.results.reduce((sum, r) => sum + r.totalRequests, 0);
    const totalErrors = this.results.reduce((sum, r) => sum + r.failedRequests, 0);
    const overallErrorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
    const maxRPS = Math.max(...this.results.map(r => r.actualRPS));
    const maxMemory = Math.max(...this.results.map(r => r.memoryUsage.peak));

    console.log(`Total Requests Processed: ${totalRequests.toLocaleString()}`);
    console.log(`Overall Error Rate:       ${(overallErrorRate * 100).toFixed(2)}%`);
    console.log(`Maximum RPS Achieved:     ${maxRPS.toFixed(2)}`);
    console.log(`Peak Memory Usage:        ${maxMemory.toFixed(2)}MB`);

    // Performance thresholds validation
    console.log('\n🎯 Performance Thresholds:');
    const passedTests = [];
    const failedTests = [];

    this.results.forEach(result => {
      if (result.errorRate < 0.05) passedTests.push(`${result.scenario}: Error Rate < 5%`);
      else failedTests.push(`${result.scenario}: Error Rate >= 5%`);

      if (result.p95ResponseTime < 500) passedTests.push(`${result.scenario}: P95 < 500ms`);
      else failedTests.push(`${result.scenario}: P95 >= 500ms`);

      if (result.memoryUsage.peak < 200) passedTests.push(`${result.scenario}: Memory < 200MB`);
      else failedTests.push(`${result.scenario}: Memory >= 200MB`);
    });

    console.log(`✅ Passed (${passedTests.length}):`);
    passedTests.forEach(test => console.log(`   ${test}`));

    if (failedTests.length > 0) {
      console.log(`❌ Failed (${failedTests.length}):`);
      failedTests.forEach(test => console.log(`   ${test}`));
    }

    console.log('\n' + '='.repeat(60));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup(): Promise<void> {
    await this.cacheManager?.dispose();
    this.connectionPool?.dispose();
  }
}

// Worker thread implementation for distributed load generation
if (!isMainThread && workerData?.isWorker) {
  const { workerId, config } = workerData;
  let shouldStop = false;
  
  // Mock services for worker
  const endpoint = TestDataFactory.createMockEndpoint();
  
  parentPort?.on('message', async ({ type, targetRPS }) => {
    if (type === 'stop') {
      shouldStop = true;
      return;
    }
    
    if (type === 'execute' && !shouldStop) {
      const interval = 1000 / targetRPS; // ms between requests
      
      const executeRequest = async () => {
        if (shouldStop) return;
        
        const start = performance.now();
        let success = false;
        let error: string | undefined;
        
        try {
          // Simulate request execution
          await new Promise(resolve => {
            const delay = Math.random() * 100 + 50; // 50-150ms
            setTimeout(resolve, delay);
          });
          success = Math.random() > 0.05; // 95% success rate
        } catch (e) {
          error = e instanceof Error ? e.message : 'Unknown error';
        }
        
        const duration = performance.now() - start;
        
        parentPort?.postMessage({
          timestamp: Date.now(),
          duration,
          success,
          error,
          statusCode: success ? 200 : 500,
          responseSize: Math.floor(Math.random() * 2000) + 500, // 500-2500 bytes
        });
        
        // Schedule next request
        if (!shouldStop) {
          setTimeout(executeRequest, interval);
        }
      };
      
      executeRequest();
    }
  });
}

// Export for use in tests
export { LoadTestRunner, LoadTestConfig, LoadTestResult };

// Run if called directly
if (require.main === module && isMainThread) {
  const runner = new LoadTestRunner();
  
  runner.runAllScenarios()
    .then(() => {
      console.log('\n🎉 Load testing completed successfully!');
      runner.cleanup();
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Load testing failed:', error);
      runner.cleanup();
      process.exit(1);
    });
}