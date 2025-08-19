/**
 * End-to-End tests for MCP Tools
 * Tests complete workflows from workspace creation through API execution
 */

import { jest } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
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
  EncryptionService
} from '../../src/services';
import { Storage } from '../../src/storage';
import { TestDataFactory, MockFactory, TestAssertions } from '../utils/test-utils';
import { TestDataManager, testIsolationHelpers } from '../utils/test-isolation';
import { 
  Workspace,
  Collection,
  ApiEndpoint,
  Environment,
  Variables,
  RequestData,
  ResponseData,
  ImportResult
} from '../../src/types';
import fs from 'fs/promises';
import path from 'path';

describe('MCP Tools E2E', () => {
  let server: Server;
  let transport: StdioServerTransport;
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
  let testDataManager: TestDataManager;
  
  let testWorkspaceId: string;
  let testCollectionId: string;
  let testEnvironmentId: string;
  let testDataDir: string;

  beforeAll(async () => {
    // Setup test data directory using isolation helper
    testDataManager = new TestDataManager();
    testDataDir = await testDataManager.init('e2e');

    // Initialize storage with test directory
    storage = new Storage(testDataDir);
    await storage.initialize();

    // Initialize services
    encryptionService = new EncryptionService();
    authService = new AuthenticationService();
    variableReplacementService = new VariableReplacementService();
    errorHandler = new ErrorHandler(console, {
      recordError: jest.fn(),
      incrementCounter: jest.fn(),
      recordTiming: jest.fn(),
    });
    errorRecoveryService = new ErrorRecoveryService(console);
    
    workspaceManager = new WorkspaceManager(storage);
    collectionManager = new CollectionManager(storage);
    environmentManager = new EnvironmentManager(storage, encryptionService);
    requestExecutor = new RequestExecutor({
      authService,
      environmentManager,
      variableReplacementService,
      errorHandler,
      errorRecoveryService,
      storage,
      logger: console,
    });
    apiImporter = new APIImporter(storage);

    // Initialize MCP server
    server = new Server(
      {
        name: 'apiforge-test',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Setup transport
    transport = new StdioServerTransport();
  });

  afterAll(async () => {
    // Cleanup test data using isolation helper
    await testDataManager.cleanup();
    await testIsolationHelpers.afterAll();
  });

  describe('Complete Workspace Workflow', () => {
    it('should create and manage a complete workspace', async () => {
      // Step 1: Create workspace
      const workspace = await workspaceManager.createWorkspace({
        name: 'E2E Test Workspace',
        description: 'Workspace for E2E testing',
      });

      expect(workspace).toMatchObject({
        id: expect.any(String),
        name: 'E2E Test Workspace',
        description: 'Workspace for E2E testing',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      testWorkspaceId = workspace.id;

      // Step 2: Create collection
      const collection = await collectionManager.createCollection({
        name: 'Test API Collection',
        description: 'Collection for testing APIs',
        workspaceId: testWorkspaceId,
      });

      expect(collection).toMatchObject({
        id: expect.any(String),
        name: 'Test API Collection',
        workspaceId: testWorkspaceId,
      });

      testCollectionId = collection.id;

      // Step 3: Create environment
      const environment = await environmentManager.createEnvironment({
        name: 'Test Environment',
        workspaceId: testWorkspaceId,
        variables: {
          BASE_URL: { name: 'BASE_URL', value: 'https://api.example.com', encrypted: false },
          API_KEY: { name: 'API_KEY', value: 'test-api-key', encrypted: false },
          SECRET: { name: 'SECRET', value: 'secret-value', encrypted: true },
        },
      });

      expect(environment).toMatchObject({
        id: expect.any(String),
        name: 'Test Environment',
        workspaceId: testWorkspaceId,
      });

      testEnvironmentId = environment.id;

      // Verify workspace listing
      const workspaces = await workspaceManager.listWorkspaces();
      expect(workspaces).toContainEqual(expect.objectContaining({
        id: testWorkspaceId,
        name: 'E2E Test Workspace',
      }));
    });

    it('should add and execute API endpoints', async () => {
      // Add endpoints to collection
      const endpoints: ApiEndpoint[] = [
        {
          id: 'endpoint-1',
          name: 'Get Users',
          method: 'GET',
          url: '{{BASE_URL}}/users',
          headers: {
            'Accept': 'application/json',
            'X-API-Key': '{{API_KEY}}',
          },
          collectionId: testCollectionId,
        },
        {
          id: 'endpoint-2',
          name: 'Create User',
          method: 'POST',
          url: '{{BASE_URL}}/users',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': '{{API_KEY}}',
          },
          body: {
            name: 'John Doe',
            email: 'john@example.com',
          },
          collectionId: testCollectionId,
        },
        {
          id: 'endpoint-3',
          name: 'Protected Endpoint',
          method: 'GET',
          url: '{{BASE_URL}}/protected',
          headers: {
            'X-Secret': '{{SECRET}}',
          },
          authentication: {
            type: 'bearer',
            credentials: {
              token: '{{API_KEY}}',
            },
          },
          collectionId: testCollectionId,
        },
      ];

      for (const endpoint of endpoints) {
        await collectionManager.addEndpoint(testCollectionId, endpoint);
      }

      // Verify endpoints were added
      const collection = await collectionManager.getCollection(testCollectionId);
      expect(collection?.endpoints).toHaveLength(3);

      // Mock fetch for testing
      global.fetch = jest.fn().mockImplementation((url, options) => {
        if (url.includes('/users') && options.method === 'GET') {
          return MockFactory.createMockFetchResponse(
            { users: [{ id: 1, name: 'User 1' }] },
            { status: 200 }
          );
        }
        if (url.includes('/users') && options.method === 'POST') {
          return MockFactory.createMockFetchResponse(
            { id: 2, name: 'John Doe', email: 'john@example.com' },
            { status: 201 }
          );
        }
        if (url.includes('/protected')) {
          return MockFactory.createMockFetchResponse(
            { message: 'Protected data' },
            { status: 200 }
          );
        }
        return MockFactory.createMockFetchResponse(
          { error: 'Not found' },
          { status: 404 }
        );
      });

      // Execute GET request
      const getResult = await requestExecutor.execute(endpoints[0], {
        environmentId: testEnvironmentId,
      });

      expect(getResult).toMatchObject({
        status: 200,
        body: { users: [{ id: 1, name: 'User 1' }] },
      });

      // Execute POST request
      const postResult = await requestExecutor.execute(endpoints[1], {
        environmentId: testEnvironmentId,
      });

      expect(postResult).toMatchObject({
        status: 201,
        body: { id: 2, name: 'John Doe', email: 'john@example.com' },
      });

      // Execute protected request with encryption
      const protectedResult = await requestExecutor.execute(endpoints[2], {
        environmentId: testEnvironmentId,
        encryptionKey: 'test-encryption-key-32-characters',
      });

      expect(protectedResult).toMatchObject({
        status: 200,
        body: { message: 'Protected data' },
      });
    });
  });

  describe('API Import Workflow', () => {
    it('should import OpenAPI specification', async () => {
      const openApiSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Test API',
          version: '1.0.0',
        },
        servers: [
          {
            url: 'https://api.test.com/v1',
            description: 'Test server',
          },
        ],
        paths: {
          '/items': {
            get: {
              operationId: 'getItems',
              summary: 'Get all items',
              responses: {
                '200': {
                  description: 'Success',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: { type: 'object' },
                      },
                    },
                  },
                },
              },
            },
            post: {
              operationId: 'createItem',
              summary: 'Create an item',
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        description: { type: 'string' },
                      },
                    },
                  },
                },
              },
              responses: {
                '201': {
                  description: 'Created',
                },
              },
            },
          },
          '/items/{id}': {
            get: {
              operationId: 'getItem',
              summary: 'Get item by ID',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: { type: 'string' },
                },
              ],
              responses: {
                '200': {
                  description: 'Success',
                },
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

      // Save spec to file
      const specPath = path.join(testDataDir, 'openapi.json');
      await fs.writeFile(specPath, JSON.stringify(openApiSpec));

      // Import the spec
      const importResult = await apiImporter.importFromOpenAPI(specPath, {
        workspaceId: testWorkspaceId,
        collectionName: 'Imported API',
      });

      expect(importResult).toMatchObject({
        success: true,
        collectionId: expect.any(String),
        endpointsImported: 3,
      });

      // Verify imported collection
      const importedCollection = await collectionManager.getCollection(importResult.collectionId!);
      expect(importedCollection).toBeDefined();
      expect(importedCollection?.endpoints).toHaveLength(3);
      expect(importedCollection?.endpoints[0]).toMatchObject({
        method: 'GET',
        url: 'https://api.test.com/v1/items',
        name: 'Get all items',
      });
    });

    it('should import Postman collection', async () => {
      const postmanCollection = {
        info: {
          name: 'Postman Test Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Users',
            item: [
              {
                name: 'Get Users',
                request: {
                  method: 'GET',
                  header: [
                    {
                      key: 'Accept',
                      value: 'application/json',
                    },
                  ],
                  url: {
                    raw: '{{base_url}}/users',
                    host: ['{{base_url}}'],
                    path: ['users'],
                  },
                },
              },
              {
                name: 'Create User',
                request: {
                  method: 'POST',
                  header: [
                    {
                      key: 'Content-Type',
                      value: 'application/json',
                    },
                  ],
                  body: {
                    mode: 'raw',
                    raw: JSON.stringify({
                      name: 'New User',
                      email: 'user@example.com',
                    }),
                  },
                  url: {
                    raw: '{{base_url}}/users',
                    host: ['{{base_url}}'],
                    path: ['users'],
                  },
                },
              },
            ],
          },
        ],
        variable: [
          {
            key: 'base_url',
            value: 'https://api.example.com',
          },
        ],
        auth: {
          type: 'bearer',
          bearer: [
            {
              key: 'token',
              value: '{{auth_token}}',
            },
          ],
        },
      };

      // Save collection to file
      const collectionPath = path.join(testDataDir, 'postman.json');
      await fs.writeFile(collectionPath, JSON.stringify(postmanCollection));

      // Import the collection
      const importResult = await apiImporter.importFromPostman(collectionPath, {
        workspaceId: testWorkspaceId,
      });

      expect(importResult).toMatchObject({
        success: true,
        collectionId: expect.any(String),
        endpointsImported: 2,
        variablesImported: 1,
      });

      // Verify imported endpoints
      const collection = await collectionManager.getCollection(importResult.collectionId!);
      expect(collection?.endpoints).toHaveLength(2);
      expect(collection?.endpoints[0]).toMatchObject({
        method: 'GET',
        name: 'Get Users',
      });
    });
  });

  describe('Error Handling and Recovery Workflow', () => {
    it('should handle network errors with retry', async () => {
      let attempts = 0;
      global.fetch = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ECONNREFUSED');
        }
        return MockFactory.createMockFetchResponse(
          { success: true },
          { status: 200 }
        );
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/unreliable',
        collectionId: testCollectionId,
      });

      const result = await requestExecutor.execute(endpoint, {
        retryStrategy: {
          maxAttempts: 3,
          baseDelay: 100,
          backoffMultiplier: 2,
        },
      });

      expect(result.status).toBe(200);
      expect(attempts).toBe(3);
    });

    it('should handle authentication refresh', async () => {
      let tokenRefreshed = false;
      
      global.fetch = jest.fn().mockImplementation((url, options) => {
        const authHeader = options.headers?.['Authorization'];
        
        if (!tokenRefreshed && authHeader === 'Bearer expired-token') {
          return MockFactory.createMockFetchResponse(
            { error: 'Token expired' },
            { status: 401 }
          );
        }
        
        if (authHeader === 'Bearer new-token') {
          return MockFactory.createMockFetchResponse(
            { data: 'success' },
            { status: 200 }
          );
        }
        
        throw new Error('Unexpected state');
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/auth-test',
        authentication: {
          type: 'bearer',
          credentials: {
            token: 'expired-token',
            refreshToken: 'refresh-token',
          },
        },
        collectionId: testCollectionId,
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

    it('should apply circuit breaker for repeated failures', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://failing.service.com/api',
        collectionId: testCollectionId,
      });

      // Trigger circuit breaker with repeated failures
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

      // Circuit should be open now - next request should fail immediately
      await TestAssertions.expectRejectsWithError(
        requestExecutor.execute(endpoint, { serviceId: 'failing-service' }),
        Error,
        'Circuit breaker is open'
      );
    });
  });

  describe('Environment and Variable Management', () => {
    it('should handle complex variable replacement', async () => {
      // Create environment with nested variables
      const complexEnv = await environmentManager.createEnvironment({
        name: 'Complex Environment',
        workspaceId: testWorkspaceId,
        variables: {
          PROTOCOL: { name: 'PROTOCOL', value: 'https', encrypted: false },
          HOST: { name: 'HOST', value: 'api.complex.com', encrypted: false },
          VERSION: { name: 'VERSION', value: 'v2', encrypted: false },
          BASE_URL: { name: 'BASE_URL', value: '{{PROTOCOL}}://{{HOST}}/{{VERSION}}', encrypted: false },
          API_KEY: { name: 'API_KEY', value: 'complex-api-key', encrypted: true },
          AUTH_HEADER: { name: 'AUTH_HEADER', value: 'Bearer {{API_KEY}}', encrypted: false },
        },
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        url: '{{BASE_URL}}/users',
        headers: {
          'Authorization': '{{AUTH_HEADER}}',
          'X-API-Version': '{{VERSION}}',
        },
        collectionId: testCollectionId,
      });

      global.fetch = jest.fn().mockResolvedValue(
        MockFactory.createMockFetchResponse({ success: true }, { status: 200 })
      );

      await requestExecutor.execute(endpoint, {
        environmentId: complexEnv.id,
        encryptionKey: 'test-encryption-key-32-characters',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.complex.com/v2/users',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer complex-api-key',
            'X-API-Version': 'v2',
          }),
        })
      );
    });

    it('should handle environment cloning and export', async () => {
      // Clone environment
      const clonedEnv = await environmentManager.cloneEnvironment(testEnvironmentId, {
        name: 'Cloned Environment',
        workspaceId: testWorkspaceId,
      });

      expect(clonedEnv).toMatchObject({
        id: expect.any(String),
        name: 'Cloned Environment',
        workspaceId: testWorkspaceId,
      });

      // Export environment
      const exportData = await environmentManager.exportEnvironment(clonedEnv.id);
      expect(exportData).toMatchObject({
        name: 'Cloned Environment',
        variables: expect.any(Object),
      });

      // Import to new environment
      const importedEnv = await environmentManager.importEnvironment(exportData, {
        workspaceId: testWorkspaceId,
        name: 'Imported Environment',
      });

      expect(importedEnv).toMatchObject({
        name: 'Imported Environment',
        workspaceId: testWorkspaceId,
      });
    });
  });

  describe('Collection Management and Organization', () => {
    it('should handle collection folders and organization', async () => {
      const collection = await collectionManager.createCollection({
        name: 'Organized Collection',
        workspaceId: testWorkspaceId,
        folders: [
          {
            id: 'folder-1',
            name: 'Authentication',
            description: 'Auth endpoints',
          },
          {
            id: 'folder-2',
            name: 'Users',
            description: 'User management',
          },
        ],
      });

      // Add endpoints to folders
      const authEndpoint = TestDataFactory.createMockEndpoint({
        name: 'Login',
        method: 'POST',
        url: 'https://api.example.com/auth/login',
        folderId: 'folder-1',
        collectionId: collection.id,
      });

      const userEndpoint = TestDataFactory.createMockEndpoint({
        name: 'Get User Profile',
        method: 'GET',
        url: 'https://api.example.com/users/profile',
        folderId: 'folder-2',
        collectionId: collection.id,
      });

      await collectionManager.addEndpoint(collection.id, authEndpoint);
      await collectionManager.addEndpoint(collection.id, userEndpoint);

      // Verify organization
      const updatedCollection = await collectionManager.getCollection(collection.id);
      expect(updatedCollection?.folders).toHaveLength(2);
      expect(updatedCollection?.endpoints.filter(e => e.folderId === 'folder-1')).toHaveLength(1);
      expect(updatedCollection?.endpoints.filter(e => e.folderId === 'folder-2')).toHaveLength(1);
    });

    it('should handle collection duplication', async () => {
      const originalCollection = await collectionManager.getCollection(testCollectionId);
      
      const duplicatedCollection = await collectionManager.duplicateCollection(testCollectionId, {
        name: 'Duplicated Collection',
        workspaceId: testWorkspaceId,
      });

      expect(duplicatedCollection).toMatchObject({
        id: expect.any(String),
        name: 'Duplicated Collection',
        workspaceId: testWorkspaceId,
        endpoints: expect.arrayContaining(
          originalCollection!.endpoints.map(e => 
            expect.objectContaining({
              method: e.method,
              url: e.url,
              name: e.name,
            })
          )
        ),
      });
    });
  });

  describe('History and Analytics', () => {
    it('should track request history', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/history-test',
        collectionId: testCollectionId,
      });

      global.fetch = jest.fn()
        .mockResolvedValueOnce(MockFactory.createMockFetchResponse({ success: true }, { status: 200 }))
        .mockResolvedValueOnce(MockFactory.createMockFetchResponse({ error: 'Bad request' }, { status: 400 }))
        .mockResolvedValueOnce(MockFactory.createMockFetchResponse({ success: true }, { status: 200 }));

      // Execute multiple requests
      for (let i = 0; i < 3; i++) {
        try {
          await requestExecutor.execute(endpoint, {
            recordHistory: true,
          });
        } catch (error) {
          // Expected for failed requests
        }
      }

      // Get history
      const history = await storage.getHistory({ endpointId: endpoint.id });
      expect(history).toHaveLength(3);
      expect(history.filter(h => h.status === 'success')).toHaveLength(2);
      expect(history.filter(h => h.status === 'error')).toHaveLength(1);
    });

    it('should provide analytics and statistics', async () => {
      const endpoints = [
        TestDataFactory.createMockEndpoint({
          url: 'https://api.example.com/analytics1',
          collectionId: testCollectionId,
        }),
        TestDataFactory.createMockEndpoint({
          url: 'https://api.example.com/analytics2',
          collectionId: testCollectionId,
        }),
      ];

      global.fetch = jest.fn().mockImplementation(() => {
        const delay = Math.random() * 500;
        return new Promise(resolve => {
          setTimeout(() => {
            resolve(MockFactory.createMockFetchResponse({ success: true }, { status: 200 }));
          }, delay);
        });
      });

      // Execute multiple requests
      const results = await Promise.all(
        endpoints.flatMap(endpoint =>
          Array(5).fill(null).map(() =>
            requestExecutor.execute(endpoint, { recordHistory: true })
          )
        )
      );

      // Get analytics
      const analytics = await storage.getAnalytics({
        collectionId: testCollectionId,
        timeframe: '1d',
      });

      expect(analytics).toMatchObject({
        totalRequests: 10,
        successRate: 100,
        averageResponseTime: expect.any(Number),
        endpoints: expect.arrayContaining([
          expect.objectContaining({
            url: 'https://api.example.com/analytics1',
            requestCount: 5,
          }),
          expect.objectContaining({
            url: 'https://api.example.com/analytics2',
            requestCount: 5,
          }),
        ]),
      });
    });
  });

  describe('MCP Server Integration', () => {
    it('should handle MCP tool invocations', async () => {
      // Register tools with the server
      server.setRequestHandler(async (request) => {
        switch (request.method) {
          case 'tools/list':
            return {
              tools: [
                {
                  name: 'workspace.create',
                  description: 'Create a new workspace',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
                {
                  name: 'endpoint.execute',
                  description: 'Execute an API endpoint',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      endpointId: { type: 'string' },
                      environmentId: { type: 'string' },
                    },
                  },
                },
              ],
            };

          case 'tools/call':
            const { name, arguments: args } = request.params;
            
            if (name === 'workspace.create') {
              const workspace = await workspaceManager.createWorkspace(args);
              return { content: [{ type: 'text', text: JSON.stringify(workspace) }] };
            }
            
            if (name === 'endpoint.execute') {
              const endpoint = await collectionManager.getEndpoint(args.endpointId);
              if (endpoint) {
                const result = await requestExecutor.execute(endpoint, {
                  environmentId: args.environmentId,
                });
                return { content: [{ type: 'text', text: JSON.stringify(result) }] };
              }
            }
            
            throw new Error(`Unknown tool: ${name}`);

          default:
            throw new Error(`Unknown method: ${request.method}`);
        }
      });

      // Simulate MCP client calling tools
      const toolsList = await server.handleRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      });

      expect(toolsList).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: {
          tools: expect.arrayContaining([
            expect.objectContaining({ name: 'workspace.create' }),
            expect.objectContaining({ name: 'endpoint.execute' }),
          ]),
        },
      });

      // Create workspace via MCP
      const createResult = await server.handleRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'workspace.create',
          arguments: {
            name: 'MCP Created Workspace',
            description: 'Created via MCP',
          },
        },
      });

      expect(createResult).toMatchObject({
        jsonrpc: '2.0',
        id: 2,
        result: {
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.stringContaining('MCP Created Workspace'),
            }),
          ]),
        },
      });
    });

    it('should handle MCP resource management', async () => {
      server.setRequestHandler(async (request) => {
        switch (request.method) {
          case 'resources/list':
            const workspaces = await workspaceManager.listWorkspaces();
            return {
              resources: workspaces.map(ws => ({
                uri: `workspace://${ws.id}`,
                name: ws.name,
                description: ws.description,
                mimeType: 'application/json',
              })),
            };

          case 'resources/read':
            const { uri } = request.params;
            const workspaceId = uri.replace('workspace://', '');
            const workspace = await workspaceManager.getWorkspace(workspaceId);
            return {
              contents: [
                {
                  uri,
                  mimeType: 'application/json',
                  text: JSON.stringify(workspace, null, 2),
                },
              ],
            };

          default:
            throw new Error(`Unknown method: ${request.method}`);
        }
      });

      // List resources
      const resourcesList = await server.handleRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'resources/list',
        params: {},
      });

      expect(resourcesList).toMatchObject({
        jsonrpc: '2.0',
        id: 3,
        result: {
          resources: expect.arrayContaining([
            expect.objectContaining({
              uri: expect.stringMatching(/^workspace:\/\/.+/),
              name: expect.any(String),
            }),
          ]),
        },
      });

      // Read specific resource
      const readResult = await server.handleRequest({
        jsonrpc: '2.0',
        id: 4,
        method: 'resources/read',
        params: {
          uri: `workspace://${testWorkspaceId}`,
        },
      });

      expect(readResult).toMatchObject({
        jsonrpc: '2.0',
        id: 4,
        result: {
          contents: expect.arrayContaining([
            expect.objectContaining({
              uri: `workspace://${testWorkspaceId}`,
              mimeType: 'application/json',
              text: expect.stringContaining('E2E Test Workspace'),
            }),
          ]),
        },
      });
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large collections efficiently', async () => {
      const largeCollection = await collectionManager.createCollection({
        name: 'Large Collection',
        workspaceId: testWorkspaceId,
      });

      // Add many endpoints
      const endpoints = Array.from({ length: 100 }, (_, i) =>
        TestDataFactory.createMockEndpoint({
          id: `endpoint-${i}`,
          name: `Endpoint ${i}`,
          url: `https://api.example.com/endpoint${i}`,
          collectionId: largeCollection.id,
        })
      );

      const startTime = Date.now();
      
      await Promise.all(
        endpoints.map(endpoint =>
          collectionManager.addEndpoint(largeCollection.id, endpoint)
        )
      );

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all endpoints were added
      const collection = await collectionManager.getCollection(largeCollection.id);
      expect(collection?.endpoints).toHaveLength(100);
    });

    it('should handle concurrent requests efficiently', async () => {
      const endpoints = Array.from({ length: 20 }, (_, i) =>
        TestDataFactory.createMockEndpoint({
          url: `https://api.example.com/concurrent${i}`,
          collectionId: testCollectionId,
        })
      );

      global.fetch = jest.fn().mockResolvedValue(
        MockFactory.createMockFetchResponse({ success: true }, { status: 200 })
      );

      const startTime = Date.now();

      const results = await Promise.all(
        endpoints.map(endpoint => requestExecutor.execute(endpoint))
      );

      const duration = Date.now() - startTime;

      expect(results).toHaveLength(20);
      expect(results.every(r => r.status === 200)).toBe(true);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    it('should handle large response payloads', async () => {
      const largeData = {
        items: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          data: `Item ${i}`.repeat(100),
          metadata: {
            created: new Date().toISOString(),
            tags: Array(10).fill(`tag${i}`),
          },
        })),
      };

      global.fetch = jest.fn().mockResolvedValue(
        MockFactory.createMockFetchResponse(largeData, { status: 200 })
      );

      const endpoint = TestDataFactory.createMockEndpoint({
        url: 'https://api.example.com/large-data',
        collectionId: testCollectionId,
      });

      const memoryBefore = process.memoryUsage().heapUsed;
      const result = await requestExecutor.execute(endpoint);
      const memoryAfter = process.memoryUsage().heapUsed;

      expect(result.status).toBe(200);
      expect(result.body.items).toHaveLength(1000);

      // Memory increase should be reasonable
      const memoryIncrease = (memoryAfter - memoryBefore) / 1024 / 1024; // MB
      expect(memoryIncrease).toBeLessThan(100); // Less than 100MB increase
    });
  });
});