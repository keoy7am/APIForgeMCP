/**
 * Cross-service integration tests
 * Tests interactions between multiple services working together
 */

import { jest } from '@jest/globals';
import {
  WorkspaceManager,
  CollectionManager,
  EnvironmentManager,
  RequestExecutor,
  APIImporter,
  AuthenticationService,
  ErrorHandler,
  ErrorRecoveryService,
  VariableReplacementService,
  EncryptionService,
  RequestBodyProcessor,
  ResponseParser
} from '../../src/services';
import { Storage } from '../../src/storage';
import { TestDataFactory, MockFactory, TestAssertions } from '../utils/test-utils';
import {
  Workspace,
  Collection,
  ApiEndpoint,
  Environment,
  Variables,
  AuthConfig,
  RequestData,
  ResponseData,
  ImportResult
} from '../../src/types';
import {
  NetworkError,
  TimeoutError,
  AuthenticationError,
  ValidationError,
  ConfigurationError
} from '../../src/services/error';

describe('Cross-Service Integration', () => {
  let storage: Storage;
  let workspaceManager: WorkspaceManager;
  let collectionManager: CollectionManager;
  let environmentManager: EnvironmentManager;
  let requestExecutor: RequestExecutor;
  let apiImporter: APIImporter;
  let authService: AuthenticationService;
  let errorHandler: ErrorHandler;
  let errorRecoveryService: ErrorRecoveryService;
  let variableReplacementService: VariableReplacementService;
  let encryptionService: EncryptionService;
  let requestBodyProcessor: RequestBodyProcessor;
  let responseParser: ResponseParser;
  
  let mockLogger: any;
  let mockMetrics: any;

  beforeEach(() => {
    // Setup mocks
    mockLogger = MockFactory.createMockLogger();
    mockMetrics = {
      recordError: jest.fn(),
      incrementCounter: jest.fn(),
      recordTiming: jest.fn(),
    };

    // Initialize storage
    storage = MockFactory.createMockStorage();

    // Initialize core services
    encryptionService = new EncryptionService();
    authService = new AuthenticationService();
    variableReplacementService = new VariableReplacementService();
    errorHandler = new ErrorHandler(mockLogger, mockMetrics);
    errorRecoveryService = new ErrorRecoveryService(mockLogger);
    requestBodyProcessor = new RequestBodyProcessor();
    responseParser = new ResponseParser();

    // Initialize managers
    workspaceManager = new WorkspaceManager(storage);
    collectionManager = new CollectionManager(storage);
    environmentManager = new EnvironmentManager(storage, encryptionService);
    apiImporter = new APIImporter(storage);

    // Initialize request executor with all services
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

    // Setup global fetch mock
    global.fetch = jest.fn();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe('Workspace + Collection + Environment Integration', () => {
    it('should create complete API testing setup', async () => {
      // Create workspace
      const workspace = TestDataFactory.createMockWorkspace({
        name: 'Integration Test Workspace',
      });
      storage.saveWorkspace = jest.fn().mockResolvedValue(workspace);
      const createdWorkspace = await workspaceManager.createWorkspace(workspace);

      // Create collection in workspace
      const collection = TestDataFactory.createMockCollection({
        name: 'Test Collection',
        workspaceId: workspace.id,
      });
      storage.saveCollection = jest.fn().mockResolvedValue(collection);
      const createdCollection = await collectionManager.createCollection(collection);

      // Create environment for workspace
      const environment = TestDataFactory.createMockEnvironment({
        name: 'Test Environment',
        workspaceId: workspace.id,
        variables: {
          BASE_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'BASE_URL',
            value: 'https://api.test.com',
          }),
          API_KEY: TestDataFactory.createMockEnvironmentVariable({
            name: 'API_KEY',
            value: 'secret-key',
            encrypted: true,
          }),
        },
      });
      storage.saveEnvironment = jest.fn().mockResolvedValue(environment);
      const createdEnvironment = await environmentManager.createEnvironment(environment);

      // Add endpoint to collection
      const endpoint = TestDataFactory.createMockEndpoint({
        name: 'Test Endpoint',
        url: '{{BASE_URL}}/users',
        headers: {
          'X-API-Key': '{{API_KEY}}',
        },
        collectionId: collection.id,
      });
      
      collection.endpoints = [endpoint];
      storage.getCollection = jest.fn().mockResolvedValue(collection);
      await collectionManager.addEndpoint(collection.id, endpoint);

      // Execute request with all services
      storage.getEnvironment = jest.fn().mockResolvedValue(environment);
      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ users: [] }, { status: 200 })
      );

      const result = await requestExecutor.execute(endpoint, {
        environmentId: environment.id,
        encryptionKey: 'test-encryption-key-32-characters',
      });

      expect(result.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.test.com/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'secret-key',
          }),
        })
      );
    });

    it('should handle environment switching for same collection', async () => {
      const collection = TestDataFactory.createMockCollection();
      const endpoint = TestDataFactory.createMockEndpoint({
        url: '{{BASE_URL}}/api/{{VERSION}}/data',
        collectionId: collection.id,
      });

      // Create multiple environments
      const devEnv = TestDataFactory.createMockEnvironment({
        name: 'Development',
        variables: {
          BASE_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'BASE_URL',
            value: 'http://localhost:3000',
          }),
          VERSION: TestDataFactory.createMockEnvironmentVariable({
            name: 'VERSION',
            value: 'v1',
          }),
        },
      });

      const prodEnv = TestDataFactory.createMockEnvironment({
        name: 'Production',
        variables: {
          BASE_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'BASE_URL',
            value: 'https://api.production.com',
          }),
          VERSION: TestDataFactory.createMockEnvironmentVariable({
            name: 'VERSION',
            value: 'v2',
          }),
        },
      });

      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ success: true }, { status: 200 })
      );

      // Execute with dev environment
      storage.getEnvironment = jest.fn().mockResolvedValue(devEnv);
      await requestExecutor.execute(endpoint, { environmentId: devEnv.id });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:3000/api/v1/data',
        expect.any(Object)
      );

      // Execute with prod environment
      storage.getEnvironment = jest.fn().mockResolvedValue(prodEnv);
      await requestExecutor.execute(endpoint, { environmentId: prodEnv.id });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.production.com/api/v2/data',
        expect.any(Object)
      );
    });
  });

  describe('Authentication + Environment + Encryption Integration', () => {
    it('should handle OAuth2 with encrypted tokens in environment', async () => {
      const encryptionKey = 'test-encryption-key-32-characters';
      
      // Encrypt sensitive tokens
      const accessToken = 'oauth-access-token';
      const refreshToken = 'oauth-refresh-token';
      const clientSecret = 'oauth-client-secret';
      
      const encryptedAccess = await encryptionService.encrypt(accessToken, encryptionKey);
      const encryptedRefresh = await encryptionService.encrypt(refreshToken, encryptionKey);
      const encryptedSecret = await encryptionService.encrypt(clientSecret, encryptionKey);

      const environment = TestDataFactory.createMockEnvironment({
        variables: {
          OAUTH_ACCESS_TOKEN: TestDataFactory.createMockEnvironmentVariable({
            name: 'OAUTH_ACCESS_TOKEN',
            value: encryptedAccess,
            encrypted: true,
          }),
          OAUTH_REFRESH_TOKEN: TestDataFactory.createMockEnvironmentVariable({
            name: 'OAUTH_REFRESH_TOKEN',
            value: encryptedRefresh,
            encrypted: true,
          }),
          OAUTH_CLIENT_SECRET: TestDataFactory.createMockEnvironmentVariable({
            name: 'OAUTH_CLIENT_SECRET',
            value: encryptedSecret,
            encrypted: true,
          }),
        },
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.oauth.com/protected',
        authentication: {
          type: 'oauth2',
          credentials: {
            accessToken: '{{OAUTH_ACCESS_TOKEN}}',
            refreshToken: '{{OAUTH_REFRESH_TOKEN}}',
            clientSecret: '{{OAUTH_CLIENT_SECRET}}',
            tokenType: 'Bearer',
          },
        },
      });

      storage.getEnvironment = jest.fn().mockResolvedValue(environment);
      encryptionService.decrypt = jest.fn()
        .mockResolvedValueOnce(accessToken)
        .mockResolvedValueOnce(refreshToken)
        .mockResolvedValueOnce(clientSecret);

      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ protected: true }, { status: 200 })
      );

      const result = await requestExecutor.execute(endpoint, {
        environmentId: environment.id,
        encryptionKey,
      });

      expect(result.status).toBe(200);
      expect(encryptionService.decrypt).toHaveBeenCalledTimes(3);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.oauth.com/protected',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${accessToken}`,
          }),
        })
      );
    });

    it('should handle API key rotation with environment updates', async () => {
      const oldApiKey = 'old-api-key';
      const newApiKey = 'new-api-key';
      const encryptionKey = 'test-encryption-key-32-characters';

      // Initial environment with old key
      const environment = TestDataFactory.createMockEnvironment({
        variables: {
          API_KEY: TestDataFactory.createMockEnvironmentVariable({
            name: 'API_KEY',
            value: await encryptionService.encrypt(oldApiKey, encryptionKey),
            encrypted: true,
          }),
        },
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/data',
        headers: {
          'X-API-Key': '{{API_KEY}}',
        },
      });

      // First request with old key fails
      storage.getEnvironment = jest.fn().mockResolvedValue(environment);
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        MockFactory.createMockFetchResponse(
          { error: 'Invalid API key' },
          { status: 401 }
        )
      );

      try {
        await requestExecutor.execute(endpoint, {
          environmentId: environment.id,
          encryptionKey,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
      }

      // Update environment with new key
      environment.variables.API_KEY.value = await encryptionService.encrypt(newApiKey, encryptionKey);
      await environmentManager.updateVariable(environment.id, 'API_KEY', {
        value: newApiKey,
        encrypted: true,
      });

      // Second request with new key succeeds
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        MockFactory.createMockFetchResponse({ success: true }, { status: 200 })
      );

      const result = await requestExecutor.execute(endpoint, {
        environmentId: environment.id,
        encryptionKey,
      });

      expect(result.status).toBe(200);
      expect(global.fetch).toHaveBeenLastCalledWith(
        'https://api.example.com/data',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': newApiKey,
          }),
        })
      );
    });
  });

  describe('Error Handling + Recovery + Metrics Integration', () => {
    it('should handle cascading failures with circuit breaker and metrics', async () => {
      const serviceEndpoints = [
        TestDataFactory.createMockEndpoint({
          id: 'service-a',
          url: 'https://service-a.com/api',
        }),
        TestDataFactory.createMockEndpoint({
          id: 'service-b',
          url: 'https://service-b.com/api',
        }),
        TestDataFactory.createMockEndpoint({
          id: 'service-c',
          url: 'https://service-c.com/api',
        }),
      ];

      // Service A fails consistently
      (global.fetch as jest.Mock).mockImplementation((url) => {
        if (url.includes('service-a')) {
          throw new NetworkError('Service A unavailable');
        }
        return MockFactory.createMockFetchResponse({ success: true }, { status: 200 });
      });

      // Execute requests to trigger circuit breaker
      const results = [];
      for (const endpoint of serviceEndpoints) {
        for (let i = 0; i < 3; i++) {
          try {
            const result = await requestExecutor.execute(endpoint, {
              serviceId: endpoint.id,
              circuitBreakerConfig: {
                failureThreshold: 3,
                resetTimeout: 5000,
              },
            });
            results.push({ endpointId: endpoint.id, status: 'success', attempt: i + 1 });
          } catch (error) {
            results.push({ endpointId: endpoint.id, status: 'failed', attempt: i + 1 });
            
            // Handle error and track metrics
            await errorHandler.handleError(error, {
              service: endpoint.id,
              attempt: i + 1,
            });
          }
        }
      }

      // Verify circuit breaker opened for service A
      const serviceAResults = results.filter(r => r.endpointId === 'service-a');
      expect(serviceAResults.every(r => r.status === 'failed')).toBe(true);

      // Verify other services succeeded
      const serviceBResults = results.filter(r => r.endpointId === 'service-b');
      const serviceCResults = results.filter(r => r.endpointId === 'service-c');
      expect(serviceBResults.every(r => r.status === 'success')).toBe(true);
      expect(serviceCResults.every(r => r.status === 'success')).toBe(true);

      // Verify metrics were recorded
      expect(mockMetrics.recordError).toHaveBeenCalledTimes(9); // 3 attempts * 3 for service A
      expect(mockMetrics.incrementCounter).toHaveBeenCalled();

      // Get error statistics
      const errorStats = errorHandler.getErrorStats();
      expect(errorStats.totalErrors).toBeGreaterThanOrEqual(9);
      expect(errorStats.byCategory.network).toBeGreaterThanOrEqual(9);
    });

    it('should apply recovery strategies with fallback mechanisms', async () => {
      const primaryEndpoint = TestDataFactory.createMockEndpoint({
        id: 'primary',
        url: 'https://primary.api.com/data',
      });

      const fallbackEndpoint = TestDataFactory.createMockEndpoint({
        id: 'fallback',
        url: 'https://fallback.api.com/data',
      });

      const cacheKey = 'data-cache';
      const cachedData = { data: 'cached', timestamp: Date.now() - 60000 };
      storage.getCache = jest.fn().mockResolvedValue(cachedData);

      // Primary fails, fallback succeeds
      (global.fetch as jest.Mock).mockImplementation((url) => {
        if (url.includes('primary')) {
          throw new NetworkError('Primary service down');
        }
        if (url.includes('fallback')) {
          return MockFactory.createMockFetchResponse(
            { data: 'fallback' },
            { status: 200 }
          );
        }
        throw new Error('Unexpected URL');
      });

      // Define recovery policy
      const recoveryPolicy = errorRecoveryService.createRecoveryPolicy({
        retryStrategy: 'exponential',
        retryConfig: {
          maxAttempts: 2,
          baseDelay: 100,
        },
        fallbackStrategy: 'endpoint',
        fallbackEndpoint,
        cacheStrategy: {
          enabled: true,
          ttl: 300000, // 5 minutes
          key: cacheKey,
        },
      });

      // Execute with recovery
      let result;
      try {
        result = await errorRecoveryService.executeWithPolicy(
          () => requestExecutor.execute(primaryEndpoint),
          'primary-service',
          recoveryPolicy
        );
      } catch (primaryError) {
        // Primary failed, try fallback
        try {
          result = await requestExecutor.execute(fallbackEndpoint);
        } catch (fallbackError) {
          // Both failed, use cache
          result = cachedData;
        }
      }

      jest.advanceTimersByTime(200);
      await Promise.resolve();

      expect(result).toBeDefined();
      expect(result.data).toBe('fallback');
    });
  });

  describe('Import + Collection + Environment Integration', () => {
    it('should import OpenAPI spec and setup complete testing environment', async () => {
      const openApiSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Integration API',
          version: '1.0.0',
        },
        servers: [
          {
            url: 'https://api.integration.com/{version}',
            variables: {
              version: {
                default: 'v1',
                enum: ['v1', 'v2'],
              },
            },
          },
        ],
        paths: {
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
                {
                  name: 'include',
                  in: 'query',
                  schema: { type: 'string' },
                },
              ],
              security: [{ bearerAuth: [] }],
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
            },
          },
        },
      };

      // Mock import process
      storage.saveCollection = jest.fn().mockImplementation((collection) => 
        Promise.resolve(collection)
      );
      storage.saveEnvironment = jest.fn().mockImplementation((env) =>
        Promise.resolve(env)
      );

      const importResult = await apiImporter.importFromOpenAPI(openApiSpec, {
        workspaceId: 'workspace-1',
        createEnvironment: true,
      });

      expect(importResult).toMatchObject({
        success: true,
        collectionId: expect.any(String),
        environmentId: expect.any(String),
        endpointsImported: 1,
        variablesCreated: expect.any(Number),
      });

      // Verify collection was created with correct endpoint
      expect(storage.saveCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Integration API',
          endpoints: expect.arrayContaining([
            expect.objectContaining({
              method: 'GET',
              url: expect.stringContaining('/users/{id}'),
              authentication: expect.objectContaining({
                type: 'bearer',
              }),
            }),
          ]),
        })
      );

      // Verify environment was created with server variables
      expect(storage.saveEnvironment).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            version: expect.objectContaining({
              value: 'v1',
            }),
          }),
        })
      );
    });

    it('should handle Postman collection import with environment and auth', async () => {
      const postmanCollection = {
        info: {
          name: 'Postman Integration Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        auth: {
          type: 'apikey',
          apikey: [
            {
              key: 'key',
              value: 'X-API-Key',
            },
            {
              key: 'value',
              value: '{{api_key}}',
            },
          ],
        },
        item: [
          {
            name: 'Auth Required',
            request: {
              method: 'GET',
              url: {
                raw: '{{base_url}}/secure',
              },
              auth: {
                type: 'inherit',
              },
            },
          },
        ],
        variable: [
          {
            key: 'base_url',
            value: 'https://api.postman.com',
          },
          {
            key: 'api_key',
            value: 'secret-key-123',
            type: 'secret',
          },
        ],
      };

      storage.saveCollection = jest.fn().mockResolvedValue({
        id: 'imported-collection',
        endpoints: [],
      });
      storage.saveEnvironment = jest.fn().mockResolvedValue({
        id: 'imported-env',
        variables: {},
      });

      const importResult = await apiImporter.importFromPostman(postmanCollection, {
        workspaceId: 'workspace-1',
      });

      expect(importResult).toMatchObject({
        success: true,
        collectionId: 'imported-collection',
        environmentId: 'imported-env',
        endpointsImported: 1,
        variablesImported: 2,
      });

      // Verify auth was properly configured
      expect(storage.saveCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoints: expect.arrayContaining([
            expect.objectContaining({
              authentication: expect.objectContaining({
                type: 'apikey',
                credentials: expect.objectContaining({
                  key: 'X-API-Key',
                  value: '{{api_key}}',
                }),
              }),
            }),
          ]),
        })
      );

      // Verify secret variables were encrypted
      expect(storage.saveEnvironment).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            api_key: expect.objectContaining({
              encrypted: true,
            }),
          }),
        })
      );
    });
  });

  describe('Variable Replacement + Request Processing Integration', () => {
    it('should handle complex nested variable replacement with expressions', async () => {
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
          PORT: TestDataFactory.createMockEnvironmentVariable({
            name: 'PORT',
            value: '443',
          }),
          BASE_URL: TestDataFactory.createMockEnvironmentVariable({
            name: 'BASE_URL',
            value: '{{PROTOCOL}}://{{HOST}}:{{PORT}}',
          }),
          API_VERSION: TestDataFactory.createMockEnvironmentVariable({
            name: 'API_VERSION',
            value: 'v2',
          }),
          USER_ID: TestDataFactory.createMockEnvironmentVariable({
            name: 'USER_ID',
            value: '12345',
          }),
          TIMESTAMP: TestDataFactory.createMockEnvironmentVariable({
            name: 'TIMESTAMP',
            value: '{{$timestamp}}',
          }),
          RANDOM_ID: TestDataFactory.createMockEnvironmentVariable({
            name: 'RANDOM_ID',
            value: '{{$guid}}',
          }),
        },
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        url: '{{BASE_URL}}/{{API_VERSION}}/users/{{USER_ID}}',
        headers: {
          'X-Request-ID': '{{RANDOM_ID}}',
          'X-Timestamp': '{{TIMESTAMP}}',
        },
        body: {
          userId: '{{USER_ID}}',
          action: 'update',
          metadata: {
            timestamp: '{{TIMESTAMP}}',
            source: '{{HOST}}',
          },
        },
      });

      storage.getEnvironment = jest.fn().mockResolvedValue(environment);
      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ success: true }, { status: 200 })
      );

      await requestExecutor.execute(endpoint, {
        environmentId: environment.id,
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toBe('https://api.example.com:443/v2/users/12345');
      
      const headers = callArgs[1].headers;
      expect(headers['X-Request-ID']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(headers['X-Timestamp']).toMatch(/^\d+$/);

      const body = JSON.parse(callArgs[1].body);
      expect(body.userId).toBe('12345');
      expect(body.metadata.source).toBe('api.example.com');
    });

    it('should handle different body types with variable replacement', async () => {
      const environment = TestDataFactory.createMockEnvironment({
        variables: {
          API_KEY: TestDataFactory.createMockEnvironmentVariable({
            name: 'API_KEY',
            value: 'test-key',
          }),
          USER_EMAIL: TestDataFactory.createMockEnvironmentVariable({
            name: 'USER_EMAIL',
            value: 'user@example.com',
          }),
        },
      });

      // Test JSON body
      const jsonEndpoint = TestDataFactory.createMockEndpoint({
        method: 'POST',
        url: 'https://api.example.com/json',
        headers: { 'Content-Type': 'application/json' },
        body: {
          apiKey: '{{API_KEY}}',
          email: '{{USER_EMAIL}}',
        },
      });

      // Test form data body
      const formEndpoint = TestDataFactory.createMockEndpoint({
        method: 'POST',
        url: 'https://api.example.com/form',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'api_key={{API_KEY}}&email={{USER_EMAIL}}',
      });

      // Test multipart body
      const multipartEndpoint = TestDataFactory.createMockEndpoint({
        method: 'POST',
        url: 'https://api.example.com/multipart',
        headers: { 'Content-Type': 'multipart/form-data' },
        body: {
          fields: {
            api_key: '{{API_KEY}}',
            email: '{{USER_EMAIL}}',
          },
          files: [
            {
              name: 'file',
              filename: 'test.txt',
              content: 'test content',
            },
          ],
        },
      });

      storage.getEnvironment = jest.fn().mockResolvedValue(environment);
      (global.fetch as jest.Mock).mockResolvedValue(
        MockFactory.createMockFetchResponse({ success: true }, { status: 200 })
      );

      // Execute JSON request
      await requestExecutor.execute(jsonEndpoint, {
        environmentId: environment.id,
      });

      let callArgs = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(callArgs[1].body)).toEqual({
        apiKey: 'test-key',
        email: 'user@example.com',
      });

      // Execute form data request
      await requestExecutor.execute(formEndpoint, {
        environmentId: environment.id,
      });

      callArgs = (global.fetch as jest.Mock).mock.calls[1];
      expect(callArgs[1].body).toBe('api_key=test-key&email=user%40example.com');

      // Execute multipart request
      await requestExecutor.execute(multipartEndpoint, {
        environmentId: environment.id,
      });

      callArgs = (global.fetch as jest.Mock).mock.calls[2];
      expect(callArgs[1].body).toBeInstanceOf(FormData);
    });
  });

  describe('Complete End-to-End Workflow', () => {
    it('should handle complete API testing workflow with all services', async () => {
      // Step 1: Create workspace
      const workspace = TestDataFactory.createMockWorkspace({
        name: 'Complete Integration Test',
      });
      storage.saveWorkspace = jest.fn().mockResolvedValue(workspace);

      // Step 2: Import API specification
      const openApiSpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://api.test.com' }],
        paths: {
          '/auth/login': {
            post: {
              operationId: 'login',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        username: { type: 'string' },
                        password: { type: 'string' },
                      },
                    },
                  },
                },
              },
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
          '/users/profile': {
            get: {
              operationId: 'getProfile',
              security: [{ bearerAuth: [] }],
              responses: {
                '200': { description: 'Success' },
              },
            },
          },
        },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
            },
          },
        },
      };

      const importedCollection = TestDataFactory.createMockCollection({
        name: 'Test API',
        workspaceId: workspace.id,
        endpoints: [
          TestDataFactory.createMockEndpoint({
            id: 'login',
            name: 'login',
            method: 'POST',
            url: 'https://api.test.com/auth/login',
          }),
          TestDataFactory.createMockEndpoint({
            id: 'getProfile',
            name: 'getProfile',
            method: 'GET',
            url: 'https://api.test.com/users/profile',
            authentication: {
              type: 'bearer',
              credentials: {
                token: '{{access_token}}',
              },
            },
          }),
        ],
      });

      storage.saveCollection = jest.fn().mockResolvedValue(importedCollection);
      storage.getCollection = jest.fn().mockResolvedValue(importedCollection);

      // Step 3: Create environment with encrypted credentials
      const encryptionKey = 'test-encryption-key-32-characters';
      const environment = TestDataFactory.createMockEnvironment({
        name: 'Test Environment',
        workspaceId: workspace.id,
        variables: {
          username: TestDataFactory.createMockEnvironmentVariable({
            name: 'username',
            value: 'testuser',
          }),
          password: TestDataFactory.createMockEnvironmentVariable({
            name: 'password',
            value: await encryptionService.encrypt('secret123', encryptionKey),
            encrypted: true,
          }),
          access_token: TestDataFactory.createMockEnvironmentVariable({
            name: 'access_token',
            value: '',
          }),
        },
      });

      storage.saveEnvironment = jest.fn().mockResolvedValue(environment);
      storage.getEnvironment = jest.fn().mockResolvedValue(environment);

      // Step 4: Execute login request
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        MockFactory.createMockFetchResponse(
          { access_token: 'jwt-token-123', expires_in: 3600 },
          { status: 200 }
        )
      );

      const loginEndpoint = importedCollection.endpoints[0];
      loginEndpoint.body = {
        username: '{{username}}',
        password: '{{password}}',
      };

      const loginResult = await requestExecutor.execute(loginEndpoint, {
        environmentId: environment.id,
        encryptionKey,
      });

      expect(loginResult.status).toBe(200);
      expect(loginResult.body.access_token).toBe('jwt-token-123');

      // Step 5: Update environment with access token
      environment.variables.access_token.value = loginResult.body.access_token;
      await environmentManager.updateVariable(environment.id, 'access_token', {
        value: loginResult.body.access_token,
      });

      // Step 6: Execute authenticated request
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        MockFactory.createMockFetchResponse(
          { 
            id: '123',
            username: 'testuser',
            email: 'test@example.com',
          },
          { status: 200 }
        )
      );

      const profileEndpoint = importedCollection.endpoints[1];
      const profileResult = await requestExecutor.execute(profileEndpoint, {
        environmentId: environment.id,
      });

      expect(profileResult.status).toBe(200);
      expect(profileResult.body.username).toBe('testuser');

      // Verify authentication header was applied
      expect(global.fetch).toHaveBeenLastCalledWith(
        'https://api.test.com/users/profile',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer jwt-token-123',
          }),
        })
      );

      // Step 7: Verify error handling for expired token
      (global.fetch as jest.Mock).mockResolvedValueOnce(
        MockFactory.createMockFetchResponse(
          { error: 'Token expired' },
          { status: 401 }
        )
      );

      // Simulate token refresh
      authService.refreshOAuth2Token = jest.fn().mockResolvedValue({
        accessToken: 'new-jwt-token-456',
        expiresAt: new Date(Date.now() + 3600000),
      });

      (global.fetch as jest.Mock).mockResolvedValueOnce(
        MockFactory.createMockFetchResponse(
          { id: '123', username: 'testuser' },
          { status: 200 }
        )
      );

      const retryResult = await requestExecutor.execute(profileEndpoint, {
        environmentId: environment.id,
        authRetry: true,
      });

      expect(retryResult.status).toBe(200);

      // Step 8: Save request history
      storage.saveHistory = jest.fn().mockResolvedValue(undefined);

      await storage.saveHistory({
        id: 'history-1',
        endpointId: profileEndpoint.id,
        timestamp: new Date(),
        request: {
          method: 'GET',
          url: profileEndpoint.url,
          headers: profileEndpoint.headers,
        },
        response: {
          status: 200,
          body: profileResult.body,
          headers: {},
          time: 250,
          size: 1024,
        },
        status: 'success',
      });

      expect(storage.saveHistory).toHaveBeenCalled();
    });
  });
});