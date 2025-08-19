/**
 * Integration tests for RequestExecutor
 * Tests complete integration of HTTP, Authentication, and Environment services
 */

import { jest } from '@jest/globals';
import { RequestExecutor } from '../../src/services';
import { AuthenticationService } from '../../src/services/auth/authentication.service';
import { EnvironmentManager } from '../../src/services/environment';
import { VariableReplacementService } from '../../src/services/environment';
import { EncryptionService } from '../../src/services/environment';
import { ErrorHandler } from '../../src/services/error';
import { ErrorRecoveryService } from '../../src/services/error';
import { RequestBodyProcessor } from '../../src/services/http/request-body-processor';
import { ResponseParser } from '../../src/services/http/response-parser';
import { TestDataFactory, MockFactory, TestAssertions } from '../utils/test-utils';
import { ApiEndpoint, RequestData, ResponseData, Variables } from '../../src/types';
import { NetworkError, TimeoutError, AuthenticationError } from '../../src/services/error';

describe('RequestExecutor Integration', () => {
  let requestExecutor: RequestExecutor;
  let authService: AuthenticationService;
  let environmentManager: EnvironmentManager;
  let variableReplacementService: VariableReplacementService;
  let encryptionService: EncryptionService;
  let errorHandler: ErrorHandler;
  let errorRecoveryService: ErrorRecoveryService;
  let requestBodyProcessor: RequestBodyProcessor;
  let responseParser: ResponseParser;
  let mockStorage: any;
  let mockLogger: any;
  let mockMetrics: any;

  beforeEach(() => {
    // Initialize mocks
    mockStorage = MockFactory.createMockStorage();
    mockLogger = MockFactory.createMockLogger();
    mockMetrics = {
      recordError: jest.fn(),
      incrementCounter: jest.fn(),
      recordTiming: jest.fn(),
    };

    // Initialize services
    encryptionService = new EncryptionService();
    authService = new AuthenticationService();
    variableReplacementService = new VariableReplacementService();
    environmentManager = new EnvironmentManager(mockStorage, encryptionService);
    errorHandler = new ErrorHandler(mockLogger, mockMetrics);
    errorRecoveryService = new ErrorRecoveryService(mockLogger);
    requestBodyProcessor = new RequestBodyProcessor();
    responseParser = new ResponseParser();

    // Initialize RequestExecutor with all dependencies
    requestExecutor = new RequestExecutor({
      authService,
      environmentManager,
      variableReplacementService,
      errorHandler,
      errorRecoveryService,
      requestBodyProcessor,
      responseParser,
      storage: mockStorage,
      logger: mockLogger,
    });

    // Setup fetch mock
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Complete Request Execution Flow', () => {
    it('should execute a simple GET request successfully', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: {
          'Accept': 'application/json',
        },
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { users: [{ id: 1, name: 'John' }] },
        { status: 200, statusText: 'OK' }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await requestExecutor.execute(endpoint);

      expect(result).toMatchObject({
        status: 200,
        statusText: 'OK',
        body: { users: [{ id: 1, name: 'John' }] },
        size: expect.any(Number),
        timestamp: expect.any(Date),
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Accept': 'application/json',
          }),
        })
      );
    });

    it('should execute a POST request with JSON body', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          name: 'Jane Doe',
          email: 'jane@example.com',
        },
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { id: 2, name: 'Jane Doe', email: 'jane@example.com' },
        { status: 201, statusText: 'Created' }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const result = await requestExecutor.execute(endpoint);

      expect(result.status).toBe(201);
      expect(result.body).toEqual({
        id: 2,
        name: 'Jane Doe',
        email: 'jane@example.com',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            name: 'Jane Doe',
            email: 'jane@example.com',
          }),
        })
      );
    });
  });

  describe('Authentication Integration', () => {
    it('should apply Basic authentication to request', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/protected',
        authentication: {
          type: 'basic',
          credentials: {
            username: 'admin',
            password: 'secret123',
          },
        },
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { message: 'Authorized' },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await requestExecutor.execute(endpoint);

      const expectedAuth = Buffer.from('admin:secret123').toString('base64');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${expectedAuth}`,
          }),
        })
      );
    });

    it('should apply Bearer token authentication', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/protected',
        authentication: {
          type: 'bearer',
          credentials: {
            token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          },
        },
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { message: 'Authorized' },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await requestExecutor.execute(endpoint);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          }),
        })
      );
    });

    it('should apply API key authentication', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/data',
        authentication: {
          type: 'apikey',
          credentials: {
            key: 'X-API-Key',
            value: 'sk_live_abc123',
            location: 'header',
          },
        },
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { data: 'test' },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await requestExecutor.execute(endpoint);

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'sk_live_abc123',
          }),
        })
      );
    });

    it('should handle OAuth2 authentication with token refresh', async () => {
      const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/oauth-protected',
        authentication: {
          type: 'oauth2',
          credentials: {
            accessToken: 'expired-token',
            refreshToken: 'refresh-token-123',
            tokenType: 'Bearer',
            expiresAt: expiredDate,
          },
        },
      });

      // Mock token refresh
      const newToken = 'new-access-token';
      authService.refreshOAuth2Token = jest.fn().mockResolvedValue({
        accessToken: newToken,
        expiresAt: new Date(Date.now() + 3600000),
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { message: 'Success' },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await requestExecutor.execute(endpoint);

      expect(authService.refreshOAuth2Token).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/oauth-protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${newToken}`,
          }),
        })
      );
    });
  });

  describe('Environment Variable Integration', () => {
    beforeEach(async () => {
      // Setup environment with variables
      const variables: Variables = {
        BASE_URL: 'https://api.example.com',
        API_VERSION: 'v2',
        API_KEY: 'test-api-key-123',
        USER_ID: '12345',
        TIMEOUT: '5000',
      };

      mockStorage.getEnvironment.mockResolvedValue({
        name: 'test-env',
        variables: Object.entries(variables).reduce((acc, [key, value]) => ({
          ...acc,
          [key]: TestDataFactory.createMockEnvironmentVariable({
            name: key,
            value,
          }),
        }), {}),
      });
    });

    it('should replace variables in URL', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: '{{BASE_URL}}/{{API_VERSION}}/users/{{USER_ID}}',
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { id: '12345', name: 'Test User' },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await requestExecutor.execute(endpoint, { environmentId: 'test-env' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/v2/users/12345',
        expect.any(Object)
      );
    });

    it('should replace variables in headers', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: '{{BASE_URL}}/data',
        headers: {
          'X-API-Key': '{{API_KEY}}',
          'X-User-ID': '{{USER_ID}}',
        },
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { data: 'test' },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await requestExecutor.execute(endpoint, { environmentId: 'test-env' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key-123',
            'X-User-ID': '12345',
          }),
        })
      );
    });

    it('should replace variables in request body', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'POST',
        url: '{{BASE_URL}}/users',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          userId: '{{USER_ID}}',
          apiVersion: '{{API_VERSION}}',
          config: {
            timeout: '{{TIMEOUT}}',
            baseUrl: '{{BASE_URL}}',
          },
        },
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { success: true },
        { status: 201 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await requestExecutor.execute(endpoint, { environmentId: 'test-env' });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/users',
        expect.objectContaining({
          body: JSON.stringify({
            userId: '12345',
            apiVersion: 'v2',
            config: {
              timeout: '5000',
              baseUrl: 'https://api.example.com',
            },
          }),
        })
      );
    });

    it('should handle encrypted environment variables', async () => {
      const encryptedValue = await encryptionService.encrypt('super-secret-key', 'test-key-32-chars');
      
      mockStorage.getEnvironment.mockResolvedValue({
        name: 'secure-env',
        variables: {
          SECRET_KEY: TestDataFactory.createMockEnvironmentVariable({
            name: 'SECRET_KEY',
            value: encryptedValue,
            encrypted: true,
          }),
        },
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/secure',
        headers: {
          'X-Secret-Key': '{{SECRET_KEY}}',
        },
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { secure: true },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Mock decryption
      encryptionService.decrypt = jest.fn().mockResolvedValue('super-secret-key');

      await requestExecutor.execute(endpoint, { 
        environmentId: 'secure-env',
        encryptionKey: 'test-key-32-chars',
      });

      expect(encryptionService.decrypt).toHaveBeenCalledWith(encryptedValue, 'test-key-32-chars');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.example.com/secure',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Secret-Key': 'super-secret-key',
          }),
        })
      );
    });
  });

  describe('Error Handling and Recovery Integration', () => {
    it('should retry failed requests with exponential backoff', async () => {
      let attempts = 0;
      (global.fetch as jest.Mock).mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new NetworkError('Connection failed');
        }
        return MockFactory.createMockFetchResponse(
          { success: true },
          { status: 200 }
        );
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/unreliable',
      });

      jest.useFakeTimers();

      const promise = requestExecutor.execute(endpoint, {
        retryStrategy: {
          maxAttempts: 3,
          baseDelay: 100,
          backoffMultiplier: 2,
          retryableErrors: [NetworkError],
        },
      });

      // Advance timers for retries
      jest.advanceTimersByTime(100); // First retry
      await Promise.resolve();
      
      jest.advanceTimersByTime(200); // Second retry
      await Promise.resolve();

      const result = await promise;

      jest.useRealTimers();

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ success: true });
      expect(attempts).toBe(3);
    });

    it('should handle timeout errors', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/slow',
        timeout: 1000, // 1 second timeout
      });

      // Mock slow response
      (global.fetch as jest.Mock).mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(MockFactory.createMockFetchResponse({ data: 'slow' }, { status: 200 }));
          }, 2000); // 2 second delay
        });
      });

      jest.useFakeTimers();

      const promise = requestExecutor.execute(endpoint);

      jest.advanceTimersByTime(1000);

      await TestAssertions.expectRejectsWithError(
        promise,
        TimeoutError,
        'Request timeout'
      );

      jest.useRealTimers();
    });

    it('should apply circuit breaker for repeated failures', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://failing.service.com/api',
      });

      (global.fetch as jest.Mock).mockRejectedValue(new NetworkError('Service unavailable'));

      // Trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        try {
          await requestExecutor.execute(endpoint, {
            serviceId: 'failing-service',
            circuitBreakerConfig: {
              failureThreshold: 3,
              resetTimeout: 5000,
            },
          });
        } catch (error) {
          // Expected failures
        }
      }

      // Circuit should be open now
      await TestAssertions.expectRejectsWithError(
        requestExecutor.execute(endpoint, { serviceId: 'failing-service' }),
        Error,
        'Circuit breaker is open'
      );
    });

    it('should handle authentication errors with retry', async () => {
      let tokenRefreshed = false;
      
      (global.fetch as jest.Mock).mockImplementation((url, options) => {
        const authHeader = options.headers?.['Authorization'];
        
        if (!tokenRefreshed && authHeader === 'Bearer old-token') {
          return MockFactory.createMockFetchResponse(
            { error: 'Token expired' },
            { status: 401, statusText: 'Unauthorized' }
          );
        }
        
        if (authHeader === 'Bearer new-token') {
          return MockFactory.createMockFetchResponse(
            { data: 'success' },
            { status: 200 }
          );
        }
        
        throw new Error('Unexpected auth state');
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/auth-retry',
        authentication: {
          type: 'bearer',
          credentials: {
            token: 'old-token',
            refreshToken: 'refresh-token',
          },
        },
      });

      // Mock token refresh
      authService.refreshOAuth2Token = jest.fn().mockImplementation(() => {
        tokenRefreshed = true;
        return Promise.resolve({
          accessToken: 'new-token',
          expiresAt: new Date(Date.now() + 3600000),
        });
      });

      const result = await requestExecutor.execute(endpoint, {
        authRetry: true,
      });

      expect(result.status).toBe(200);
      expect(result.body).toEqual({ data: 'success' });
      expect(authService.refreshOAuth2Token).toHaveBeenCalled();
    });

    it('should collect and report error statistics', async () => {
      const endpoints = [
        TestDataFactory.createMockEndpoint({ url: 'https://api1.example.com' }),
        TestDataFactory.createMockEndpoint({ url: 'https://api2.example.com' }),
        TestDataFactory.createMockEndpoint({ url: 'https://api3.example.com' }),
      ];

      // Setup mixed responses
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(MockFactory.createMockFetchResponse({ success: true }, { status: 200 }))
        .mockRejectedValueOnce(new NetworkError('Connection failed'))
        .mockResolvedValueOnce(MockFactory.createMockFetchResponse({ error: 'Bad request' }, { status: 400 }));

      // Execute requests and collect results
      const results = await Promise.allSettled(
        endpoints.map(endpoint => requestExecutor.execute(endpoint))
      );

      // Get error statistics
      const stats = errorHandler.getErrorStats();

      expect(stats.totalErrors).toBeGreaterThanOrEqual(1);
      expect(stats.byCategory.network).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Complex Integration Scenarios', () => {
    it('should handle complete API workflow with all features', async () => {
      // Setup encrypted environment variables
      const encryptedApiKey = await encryptionService.encrypt('secret-api-key', 'encryption-key-32');
      
      mockStorage.getEnvironment.mockResolvedValue({
        name: 'production',
        variables: {
          BASE_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'BASE_URL',
            value: 'https://api.production.com',
          }),
          API_KEY: TestDataFactory.createMockEnvironmentVariable({
            name: 'API_KEY',
            value: encryptedApiKey,
            encrypted: true,
          }),
          USER_ID: TestDataFactory.createMockEnvironmentVariable({
            name: 'USER_ID',
            value: 'prod-user-123',
          }),
        },
      });

      // Create complex endpoint with all features
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'POST',
        url: '{{BASE_URL}}/users/{{USER_ID}}/actions',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': '{{API_KEY}}',
        },
        body: {
          action: 'update',
          data: {
            userId: '{{USER_ID}}',
            timestamp: new Date().toISOString(),
            changes: {
              name: 'Updated Name',
              email: 'updated@example.com',
            },
          },
        },
        authentication: {
          type: 'bearer',
          credentials: {
            token: 'bearer-token-123',
          },
        },
        timeout: 5000,
      });

      // Mock successful response
      const mockResponse = MockFactory.createMockFetchResponse(
        {
          success: true,
          userId: 'prod-user-123',
          changes: {
            name: 'Updated Name',
            email: 'updated@example.com',
          },
        },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // Mock decryption
      encryptionService.decrypt = jest.fn().mockResolvedValue('secret-api-key');

      // Execute with all options
      const result = await requestExecutor.execute(endpoint, {
        environmentId: 'production',
        encryptionKey: 'encryption-key-32',
        retryStrategy: {
          maxAttempts: 3,
          baseDelay: 100,
        },
        validateResponse: true,
        recordHistory: true,
      });

      // Verify complete integration
      expect(result.status).toBe(200);
      expect(result.body.success).toBe(true);

      // Verify variable replacement
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.production.com/users/prod-user-123/actions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': 'secret-api-key',
            'Authorization': 'Bearer bearer-token-123',
          }),
          body: expect.stringContaining('prod-user-123'),
        })
      );

      // Verify encryption was handled
      expect(encryptionService.decrypt).toHaveBeenCalledWith(encryptedApiKey, 'encryption-key-32');

      // Verify history was recorded
      expect(mockStorage.saveHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: endpoint.id,
          status: 'success',
        })
      );
    });

    it('should handle batch request execution with mixed results', async () => {
      const endpoints = [
        TestDataFactory.createMockEndpoint({
          id: 'endpoint-1',
          url: 'https://api.example.com/endpoint1',
        }),
        TestDataFactory.createMockEndpoint({
          id: 'endpoint-2',
          url: 'https://api.example.com/endpoint2',
        }),
        TestDataFactory.createMockEndpoint({
          id: 'endpoint-3',
          url: 'https://api.example.com/endpoint3',
        }),
      ];

      // Setup mixed responses
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce(MockFactory.createMockFetchResponse({ data: 'success1' }, { status: 200 }))
        .mockRejectedValueOnce(new NetworkError('Connection failed'))
        .mockResolvedValueOnce(MockFactory.createMockFetchResponse({ data: 'success3' }, { status: 200 }));

      // Execute batch with parallel processing
      const batchResult = await requestExecutor.executeBatch(endpoints, {
        parallel: true,
        concurrency: 2,
        stopOnError: false,
      });

      expect(batchResult.successCount).toBe(2);
      expect(batchResult.failureCount).toBe(1);
      expect(batchResult.results).toHaveLength(3);
      expect(batchResult.results[0].status).toBe('success');
      expect(batchResult.results[1].status).toBe('error');
      expect(batchResult.results[2].status).toBe('success');
    });

    it('should validate response against schema', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/validated',
        responseValidation: {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'number' },
              name: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
            required: ['id', 'name', 'email'],
          },
        },
      });

      const invalidResponse = MockFactory.createMockFetchResponse(
        {
          id: '123', // Should be number
          name: 'Test User',
          // Missing required email field
        },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(invalidResponse);

      await TestAssertions.expectRejectsWithError(
        requestExecutor.execute(endpoint, { validateResponse: true }),
        ValidationError,
        'Response validation failed'
      );
    });

    it('should handle request with custom headers and query parameters', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/search',
        headers: {
          'Accept': 'application/json',
          'Accept-Language': 'en-US',
          'X-Request-ID': '{{REQUEST_ID}}',
        },
        queryParams: {
          q: 'search term',
          limit: '10',
          offset: '{{OFFSET}}',
          apiKey: '{{API_KEY}}',
        },
      });

      mockStorage.getEnvironment.mockResolvedValue({
        name: 'test',
        variables: {
          REQUEST_ID: TestDataFactory.createMockEnvironmentVariable({
            name: 'REQUEST_ID',
            value: 'req-123456',
          }),
          OFFSET: TestDataFactory.createMockEnvironmentVariable({
            name: 'OFFSET',
            value: '20',
          }),
          API_KEY: TestDataFactory.createMockEnvironmentVariable({
            name: 'API_KEY',
            value: 'test-key',
          }),
        },
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { results: [] },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      await requestExecutor.execute(endpoint, { environmentId: 'test' });

      // Verify URL with query parameters
      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const url = new URL(callArgs[0]);
      
      expect(url.hostname).toBe('api.example.com');
      expect(url.pathname).toBe('/search');
      expect(url.searchParams.get('q')).toBe('search term');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('offset')).toBe('20');
      expect(url.searchParams.get('apiKey')).toBe('test-key');

      // Verify headers
      expect(callArgs[1].headers).toMatchObject({
        'Accept': 'application/json',
        'Accept-Language': 'en-US',
        'X-Request-ID': 'req-123456',
      });
    });
  });

  describe('Performance and Resource Management', () => {
    it('should handle concurrent requests efficiently', async () => {
      const endpoints = Array.from({ length: 10 }, (_, i) =>
        TestDataFactory.createMockEndpoint({
          id: `endpoint-${i}`,
          url: `https://api.example.com/endpoint${i}`,
        })
      );

      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve(MockFactory.createMockFetchResponse({ success: true }, { status: 200 }))
      );

      const startTime = Date.now();

      const results = await Promise.all(
        endpoints.map(endpoint => requestExecutor.execute(endpoint))
      );

      const duration = Date.now() - startTime;

      expect(results).toHaveLength(10);
      expect(results.every(r => r.status === 200)).toBe(true);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should manage memory efficiently for large responses', async () => {
      const largeData = {
        items: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          data: `Item ${i}`,
          metadata: { timestamp: new Date().toISOString() },
        })),
      };

      const endpoint = TestDataFactory.createMockEndpoint({
        method: 'GET',
        url: 'https://api.example.com/large-dataset',
      });

      const mockResponse = MockFactory.createMockFetchResponse(largeData, { status: 200 });
      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      const memoryBefore = process.memoryUsage().heapUsed;
      const result = await requestExecutor.execute(endpoint);
      const memoryAfter = process.memoryUsage().heapUsed;

      expect(result.status).toBe(200);
      expect(result.body.items).toHaveLength(10000);
      
      // Memory increase should be reasonable
      const memoryIncrease = (memoryAfter - memoryBefore) / 1024 / 1024; // MB
      expect(memoryIncrease).toBeLessThan(50); // Less than 50MB increase
    });

    it('should cache request results when enabled', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        id: 'cached-endpoint',
        method: 'GET',
        url: 'https://api.example.com/cacheable',
      });

      const mockResponse = MockFactory.createMockFetchResponse(
        { data: 'cached', timestamp: Date.now() },
        { status: 200 }
      );

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

      // First request
      const result1 = await requestExecutor.execute(endpoint, { 
        cacheEnabled: true,
        cacheTTL: 60000, // 1 minute
      });

      // Second request (should use cache)
      const result2 = await requestExecutor.execute(endpoint, { 
        cacheEnabled: true,
        cacheTTL: 60000,
      });

      expect(result1).toEqual(result2);
      expect(global.fetch).toHaveBeenCalledTimes(1); // Only one actual request
    });
  });
});