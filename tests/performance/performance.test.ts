/**
 * Performance tests for APIForge MCP Server
 * Tests system performance, response times, and resource usage
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
import { ApiEndpoint, RequestData, ResponseData } from '../../src/types';

describe('Performance Tests', () => {
  let requestExecutor: RequestExecutor;
  let workspaceManager: WorkspaceManager;
  let collectionManager: CollectionManager;
  let environmentManager: EnvironmentManager;
  let storage: Storage;
  let mockLogger: any;

  beforeEach(() => {
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

    // Mock fetch for consistent performance testing
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Request Execution Performance', () => {
    it('should execute single request within 100ms', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/test',
        method: 'GET',
      });

      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ data: 'test' }, { status: 200 })
      );

      const startTime = performance.now();
      await requestExecutor.execute(endpoint);
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle 100 concurrent requests efficiently', async () => {
      const endpoints = Array.from({ length: 100 }, (_, i) =>
        TestDataFactory.createMockEndpoint({
          id: `endpoint-${i}`,
          url: `https://api.example.com/endpoint${i}`,
          method: 'GET',
        })
      );

      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ success: true }, { status: 200 })
      );

      const startTime = performance.now();
      
      const results = await Promise.all(
        endpoints.map(endpoint => requestExecutor.execute(endpoint))
      );

      const duration = performance.now() - startTime;

      expect(results).toHaveLength(100);
      expect(results.every(r => r.status === 200)).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      // Calculate average time per request
      const avgTimePerRequest = duration / 100;
      expect(avgTimePerRequest).toBeLessThan(50); // Average should be less than 50ms
    });

    it('should maintain performance with complex request processing', async () => {
      const complexEndpoint = TestDataFactory.createMockEndpoint({
        method: 'POST',
        url: 'https://api.example.com/complex',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer token',
          'X-Custom-Header': 'value',
        },
        body: {
          data: Array.from({ length: 100 }, (_, i) => ({
            id: i,
            name: `Item ${i}`,
            metadata: { timestamp: new Date().toISOString() },
          })),
        },
        authentication: {
          type: 'bearer',
          credentials: {
            token: 'test-token',
          },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ processed: true }, { status: 200 })
      );

      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await requestExecutor.execute(complexEndpoint);
        times.push(performance.now() - startTime);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      
      expect(avgTime).toBeLessThan(200); // Average should be less than 200ms
      expect(maxTime).toBeLessThan(500); // Max should be less than 500ms
    });
  });

  describe('Variable Replacement Performance', () => {
    it('should efficiently replace variables in large payloads', async () => {
      const environment = TestDataFactory.createMockEnvironment({
        variables: Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [
            `VAR_${i}`,
            TestDataFactory.createMockEnvironmentVariable({
              name: `VAR_${i}`,
              value: `value_${i}`,
            }),
          ])
        ),
      });

      storage.getEnvironment = jest.fn().mockResolvedValue(environment);

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/{{VAR_0}}/{{VAR_1}}/{{VAR_2}}',
        headers: Object.fromEntries(
          Array.from({ length: 20 }, (_, i) => [
            `Header-${i}`,
            `{{VAR_${i}}}`,
          ])
        ),
        body: {
          nested: {
            deep: {
              values: Array.from({ length: 50 }, (_, i) => `{{VAR_${i}}}`),
            },
          },
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ success: true }, { status: 200 })
      );

      const startTime = performance.now();
      await requestExecutor.execute(endpoint, {
        environmentId: environment.id,
      });
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(300); // Should complete within 300ms
    });

    it('should handle recursive variable replacement efficiently', async () => {
      const environment = TestDataFactory.createMockEnvironment({
        variables: {
          PROTOCOL: TestDataFactory.createMockEnvironmentVariable({
            name: 'PROTOCOL',
            value: 'https',
          }),
          HOST: TestDataFactory.createMockEnvironmentVariable({
            name: 'HOST',
            value: 'api.example.com',
          }),
          BASE_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'BASE_URL',
            value: '{{PROTOCOL}}://{{HOST}}',
          }),
          API_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'API_URL',
            value: '{{BASE_URL}}/api',
          }),
          FULL_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'FULL_URL',
            value: '{{API_URL}}/v1',
          }),
        },
      });

      storage.getEnvironment = jest.fn().mockResolvedValue(environment);

      const endpoint = TestDataFactory.createMockEndpoint({
        url: '{{FULL_URL}}/users',
      });

      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ success: true }, { status: 200 })
      );

      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        await requestExecutor.execute(endpoint, {
          environmentId: environment.id,
        });
        times.push(performance.now() - startTime);
      }

      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      expect(avgTime).toBeLessThan(50); // Average should be less than 50ms
    });
  });

  describe('Collection Management Performance', () => {
    it('should handle large collections efficiently', async () => {
      const largeCollection = TestDataFactory.createMockCollection({
        id: 'large-collection',
        name: 'Large Collection',
        endpoints: Array.from({ length: 1000 }, (_, i) =>
          TestDataFactory.createMockEndpoint({
            id: `endpoint-${i}`,
            name: `Endpoint ${i}`,
            url: `https://api.example.com/endpoint${i}`,
          })
        ),
      });

      storage.saveCollection = jest.fn().mockResolvedValue(largeCollection);
      storage.getCollection = jest.fn().mockResolvedValue(largeCollection);

      const startTime = performance.now();
      
      // Save collection
      await collectionManager.createCollection(largeCollection);
      
      // Retrieve collection
      const retrieved = await collectionManager.getCollection(largeCollection.id);
      
      // List endpoints
      const endpoints = retrieved?.endpoints || [];
      
      const duration = performance.now() - startTime;

      expect(endpoints).toHaveLength(1000);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should search endpoints quickly in large collections', async () => {
      const endpoints = Array.from({ length: 5000 }, (_, i) =>
        TestDataFactory.createMockEndpoint({
          id: `endpoint-${i}`,
          name: `Endpoint ${i}`,
          url: `https://api.example.com/endpoint${i}`,
          tags: [`tag${i % 10}`, `group${i % 20}`],
        })
      );

      const collection = TestDataFactory.createMockCollection({
        id: 'search-test',
        endpoints,
      });

      storage.getCollection = jest.fn().mockResolvedValue(collection);

      const startTime = performance.now();
      
      // Search by tag
      const filtered = endpoints.filter(e => e.tags?.includes('tag5'));
      
      const duration = performance.now() - startTime;

      expect(filtered.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(50); // Should complete within 50ms
    });
  });

  describe('Encryption Performance', () => {
    it('should encrypt/decrypt data efficiently', async () => {
      const encryptionService = new EncryptionService();
      const key = 'test-encryption-key-32-characters';
      const data = JSON.stringify({
        large: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: `Item ${i}`.repeat(10),
        })),
      });

      const iterations = 10;
      const encryptTimes: number[] = [];
      const decryptTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const encryptStart = performance.now();
        const encrypted = await encryptionService.encrypt(data, key);
        encryptTimes.push(performance.now() - encryptStart);

        const decryptStart = performance.now();
        const decrypted = await encryptionService.decrypt(encrypted, key);
        decryptTimes.push(performance.now() - decryptStart);

        expect(decrypted).toBe(data);
      }

      const avgEncryptTime = encryptTimes.reduce((sum, time) => sum + time, 0) / encryptTimes.length;
      const avgDecryptTime = decryptTimes.reduce((sum, time) => sum + time, 0) / decryptTimes.length;

      expect(avgEncryptTime).toBeLessThan(100); // Average encryption less than 100ms
      expect(avgDecryptTime).toBeLessThan(100); // Average decryption less than 100ms
    });

    it('should handle multiple encrypted fields efficiently', async () => {
      const encryptionService = new EncryptionService();
      const environmentManager = new EnvironmentManager(storage, encryptionService);
      const key = 'test-encryption-key-32-characters';

      const environment = TestDataFactory.createMockEnvironment({
        variables: Object.fromEntries(
          Array.from({ length: 50 }, (_, i) => [
            `SECRET_${i}`,
            TestDataFactory.createMockEnvironmentVariable({
              name: `SECRET_${i}`,
              value: `encrypted_value_${i}`,
              encrypted: true,
            }),
          ])
        ),
      });

      storage.getEnvironment = jest.fn().mockResolvedValue(environment);
      storage.saveEnvironment = jest.fn().mockResolvedValue(environment);

      const startTime = performance.now();
      
      // Encrypt all variables
      for (const [name, variable] of Object.entries(environment.variables)) {
        if (variable.encrypted) {
          variable.value = await encryptionService.encrypt(variable.value, key);
        }
      }

      // Decrypt all variables
      for (const [name, variable] of Object.entries(environment.variables)) {
        if (variable.encrypted) {
          await encryptionService.decrypt(variable.value, key);
        }
      }

      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });

  describe('Error Recovery Performance', () => {
    it('should handle retry logic efficiently', async () => {
      const errorRecoveryService = new ErrorRecoveryService(mockLogger);
      let attempts = 0;
      
      const failingOperation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      jest.useFakeTimers();
      
      const startTime = Date.now();
      
      const promise = errorRecoveryService.executeWithRetry(failingOperation, {
        maxAttempts: 3,
        baseDelay: 100,
        backoffMultiplier: 2,
      });

      // Fast-forward through retries
      jest.advanceTimersByTime(100); // First retry
      await Promise.resolve();
      jest.advanceTimersByTime(200); // Second retry
      await Promise.resolve();

      const result = await promise;
      const duration = Date.now() - startTime;

      jest.useRealTimers();

      expect(result).toBe('success');
      expect(attempts).toBe(3);
      // Total delay should be around 300ms (100 + 200)
      expect(duration).toBeLessThanOrEqual(400);
    });

    it('should manage circuit breaker state efficiently', async () => {
      const errorRecoveryService = new ErrorRecoveryService(mockLogger);
      const failingOperation = jest.fn().mockRejectedValue(new Error('Service down'));
      
      const services = Array.from({ length: 10 }, (_, i) => `service-${i}`);
      const startTime = performance.now();

      // Trigger circuit breakers for all services
      await Promise.allSettled(
        services.map(async (service) => {
          for (let i = 0; i < 3; i++) {
            try {
              await errorRecoveryService.executeWithCircuitBreaker(
                failingOperation,
                service,
                { failureThreshold: 3 }
              );
            } catch (error) {
              // Expected failures
            }
          }
        })
      );

      // Check all circuit states
      const states = services.map(service =>
        errorRecoveryService.getCircuitBreakerState(service)
      );

      const duration = performance.now() - startTime;

      expect(states.every(state => state.state === 'open')).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });

  describe('Memory Usage', () => {
    it('should maintain reasonable memory usage for large operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Create large data structures
      const workspaces = Array.from({ length: 100 }, (_, i) =>
        TestDataFactory.createMockWorkspace({
          id: `workspace-${i}`,
          name: `Workspace ${i}`,
        })
      );

      const collections = Array.from({ length: 100 }, (_, i) =>
        TestDataFactory.createMockCollection({
          id: `collection-${i}`,
          name: `Collection ${i}`,
          endpoints: Array.from({ length: 50 }, (_, j) =>
            TestDataFactory.createMockEndpoint({
              id: `endpoint-${i}-${j}`,
              name: `Endpoint ${i}-${j}`,
            })
          ),
        })
      );

      // Store all data
      for (const workspace of workspaces) {
        storage.saveWorkspace = jest.fn().mockResolvedValue(workspace);
        await workspaceManager.createWorkspace(workspace);
      }

      for (const collection of collections) {
        storage.saveCollection = jest.fn().mockResolvedValue(collection);
        await collectionManager.createCollection(collection);
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      expect(memoryIncrease).toBeLessThan(100); // Should use less than 100MB
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
        const afterGCMemory = process.memoryUsage().heapUsed;
        const afterGCIncrease = (afterGCMemory - initialMemory) / 1024 / 1024;
        expect(afterGCIncrease).toBeLessThan(50); // Should be less than 50MB after GC
      }
    });

    it('should not leak memory during repeated operations', async () => {
      const iterations = 100;
      const memorySnapshots: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const endpoint = TestDataFactory.createMockEndpoint({
          id: `endpoint-${i}`,
          url: `https://api.example.com/test${i}`,
        });

        (global.fetch as jest.Mock).mockResolvedValue(
          MockFactory.createMockFetchResponse({ data: `result-${i}` }, { status: 200 })
        );

        await requestExecutor.execute(endpoint);

        if (i % 10 === 0) {
          memorySnapshots.push(process.memoryUsage().heapUsed);
        }
      }

      // Check that memory doesn't continuously increase
      let increasingTrend = 0;
      for (let i = 1; i < memorySnapshots.length; i++) {
        if (memorySnapshots[i] > memorySnapshots[i - 1]) {
          increasingTrend++;
        }
      }

      // Allow some increase but not continuous growth
      expect(increasingTrend).toBeLessThan(memorySnapshots.length * 0.7);
    });
  });

  describe('API Import Performance', () => {
    it('should import large OpenAPI specs efficiently', async () => {
      const apiImporter = new APIImporter(storage);
      
      const largeOpenAPISpec = {
        openapi: '3.0.0',
        info: { title: 'Large API', version: '1.0.0' },
        servers: [{ url: 'https://api.example.com' }],
        paths: Object.fromEntries(
          Array.from({ length: 500 }, (_, i) => [
            `/endpoint${i}`,
            {
              get: {
                operationId: `getEndpoint${i}`,
                summary: `Get endpoint ${i}`,
                responses: {
                  '200': { description: 'Success' },
                },
              },
              post: {
                operationId: `postEndpoint${i}`,
                summary: `Post endpoint ${i}`,
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          data: { type: 'string' },
                        },
                      },
                    },
                  },
                },
                responses: {
                  '201': { description: 'Created' },
                },
              },
            },
          ])
        ),
      };

      storage.saveCollection = jest.fn().mockImplementation(collection =>
        Promise.resolve(collection)
      );

      const startTime = performance.now();
      
      const result = await apiImporter.importFromOpenAPI(largeOpenAPISpec, {
        workspaceId: 'test-workspace',
      });

      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.endpointsImported).toBe(1000); // 500 paths * 2 methods
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle complex Postman collections efficiently', async () => {
      const apiImporter = new APIImporter(storage);
      
      const complexPostmanCollection = {
        info: {
          name: 'Complex Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: Array.from({ length: 100 }, (_, i) => ({
          name: `Folder ${i}`,
          item: Array.from({ length: 10 }, (_, j) => ({
            name: `Request ${i}-${j}`,
            request: {
              method: 'GET',
              url: {
                raw: `https://api.example.com/folder${i}/request${j}`,
              },
              header: Array.from({ length: 5 }, (_, k) => ({
                key: `Header-${k}`,
                value: `Value-${k}`,
              })),
            },
          })),
        })),
        variable: Array.from({ length: 50 }, (_, i) => ({
          key: `var_${i}`,
          value: `value_${i}`,
        })),
      };

      storage.saveCollection = jest.fn().mockImplementation(collection =>
        Promise.resolve(collection)
      );
      storage.saveEnvironment = jest.fn().mockImplementation(env =>
        Promise.resolve(env)
      );

      const startTime = performance.now();
      
      const result = await apiImporter.importFromPostman(complexPostmanCollection, {
        workspaceId: 'test-workspace',
      });

      const duration = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.endpointsImported).toBe(1000); // 100 folders * 10 requests
      expect(result.variablesImported).toBe(50);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Response Time Benchmarks', () => {
    it('should meet P50, P95, P99 response time targets', async () => {
      const iterations = 1000;
      const responseTimes: number[] = [];

      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ data: 'test' }, { status: 200 })
      );

      for (let i = 0; i < iterations; i++) {
        const endpoint = TestDataFactory.createMockEndpoint({
          url: `https://api.example.com/test${i}`,
          method: 'GET',
        });

        const startTime = performance.now();
        await requestExecutor.execute(endpoint);
        responseTimes.push(performance.now() - startTime);
      }

      // Sort response times for percentile calculation
      responseTimes.sort((a, b) => a - b);

      const p50 = responseTimes[Math.floor(iterations * 0.5)];
      const p95 = responseTimes[Math.floor(iterations * 0.95)];
      const p99 = responseTimes[Math.floor(iterations * 0.99)];

      expect(p50).toBeLessThan(20);  // P50 < 20ms
      expect(p95).toBeLessThan(50);  // P95 < 50ms
      expect(p99).toBeLessThan(100); // P99 < 100ms
    });
  });
});