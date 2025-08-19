/**
 * Tests for APIImporter service
 */

import { jest } from '@jest/globals';
import { APIImporter } from '../../src/services/api-import.service';
import { TestDataFactory, MockFactory } from '../utils/test-utils';
import { ApiEndpoint, Collection } from '../../src/types';

describe('APIImporter', () => {
  let apiImporter: APIImporter;
  let mockStorage: any;
  let mockLogger: any;

  beforeEach(() => {
    mockStorage = MockFactory.createMockStorage();
    mockLogger = MockFactory.createMockLogger();
    apiImporter = new APIImporter(mockStorage, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenAPI Import', () => {
    it('should import a basic OpenAPI 3.0 specification', async () => {
      const openApiSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Sample API',
          version: '1.0.0',
          description: 'A sample API for testing',
        },
        servers: [
          {
            url: 'https://api.example.com/v1',
            description: 'Production server',
          },
        ],
        paths: {
          '/users': {
            get: {
              summary: 'Get all users',
              operationId: 'getUsers',
              responses: {
                '200': {
                  description: 'Successful response',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            id: { type: 'integer' },
                            name: { type: 'string' },
                            email: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            post: {
              summary: 'Create a new user',
              operationId: 'createUser',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string' },
                      },
                      required: ['name', 'email'],
                    },
                  },
                },
              },
              responses: {
                '201': {
                  description: 'User created',
                },
              },
            },
          },
          '/users/{id}': {
            get: {
              summary: 'Get user by ID',
              operationId: 'getUserById',
              parameters: [
                {
                  name: 'id',
                  in: 'path',
                  required: true,
                  schema: {
                    type: 'integer',
                  },
                },
              ],
              responses: {
                '200': {
                  description: 'User found',
                },
                '404': {
                  description: 'User not found',
                },
              },
            },
          },
        },
      };

      const result = await apiImporter.importOpenAPI(JSON.stringify(openApiSpec));

      expect(result.name).toBe('Sample API');
      expect(result.description).toBe('A sample API for testing');
      expect(result.endpoints).toHaveLength(3);

      // Check GET /users endpoint
      const getUsersEndpoint = result.endpoints.find(e => e.path === '/users' && e.method === 'GET');
      expect(getUsersEndpoint).toBeDefined();
      expect(getUsersEndpoint?.name).toBe('getUsers');
      expect(getUsersEndpoint?.url).toBe('https://api.example.com/v1/users');

      // Check POST /users endpoint
      const createUserEndpoint = result.endpoints.find(e => e.path === '/users' && e.method === 'POST');
      expect(createUserEndpoint).toBeDefined();
      expect(createUserEndpoint?.name).toBe('createUser');
      expect(createUserEndpoint?.body).toBeDefined();

      // Check GET /users/{id} endpoint
      const getUserByIdEndpoint = result.endpoints.find(e => e.path === '/users/{id}' && e.method === 'GET');
      expect(getUserByIdEndpoint).toBeDefined();
      expect(getUserByIdEndpoint?.name).toBe('getUserById');
      expect(getUserByIdEndpoint?.pathParams).toContainEqual({ name: 'id', value: '' });
    });

    it('should handle OpenAPI with authentication', async () => {
      const openApiSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Secure API',
          version: '1.0.0',
        },
        servers: [
          {
            url: 'https://secure.api.com',
          },
        ],
        security: [
          {
            bearerAuth: [],
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
            apiKey: {
              type: 'apiKey',
              in: 'header',
              name: 'X-API-Key',
            },
          },
        },
        paths: {
          '/protected': {
            get: {
              summary: 'Protected endpoint',
              security: [
                {
                  bearerAuth: [],
                },
              ],
              responses: {
                '200': {
                  description: 'Success',
                },
              },
            },
          },
          '/api-key-protected': {
            get: {
              summary: 'API key protected endpoint',
              security: [
                {
                  apiKey: [],
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
      };

      const result = await apiImporter.importOpenAPI(JSON.stringify(openApiSpec));

      expect(result.endpoints).toHaveLength(2);

      const bearerEndpoint = result.endpoints.find(e => e.path === '/protected');
      expect(bearerEndpoint?.authentication).toEqual({
        type: 'bearer',
        credentials: {
          token: '',
        },
      });

      const apiKeyEndpoint = result.endpoints.find(e => e.path === '/api-key-protected');
      expect(apiKeyEndpoint?.authentication).toEqual({
        type: 'apikey',
        credentials: {
          key: 'X-API-Key',
          value: '',
          location: 'header',
        },
      });
    });

    it('should handle invalid OpenAPI specification', async () => {
      const invalidSpec = {
        notOpenApi: true,
      };

      await expect(apiImporter.importOpenAPI(JSON.stringify(invalidSpec)))
        .rejects.toThrow('Invalid OpenAPI specification');
    });
  });

  describe('Postman Collection Import', () => {
    it('should import a basic Postman collection', async () => {
      const postmanCollection = {
        info: {
          name: 'My Postman Collection',
          description: 'A test collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
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
                raw: 'https://api.example.com/users?limit=10',
                protocol: 'https',
                host: ['api', 'example', 'com'],
                path: ['users'],
                query: [
                  {
                    key: 'limit',
                    value: '10',
                  },
                ],
              },
            },
            response: [],
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
                  name: 'John Doe',
                  email: 'john@example.com',
                }),
              },
              url: {
                raw: 'https://api.example.com/users',
                protocol: 'https',
                host: ['api', 'example', 'com'],
                path: ['users'],
              },
            },
            response: [],
          },
        ],
      };

      const result = await apiImporter.importPostmanCollection(JSON.stringify(postmanCollection));

      expect(result.name).toBe('My Postman Collection');
      expect(result.description).toBe('A test collection');
      expect(result.endpoints).toHaveLength(2);

      // Check GET request
      const getEndpoint = result.endpoints.find(e => e.method === 'GET');
      expect(getEndpoint?.name).toBe('Get Users');
      expect(getEndpoint?.url).toBe('https://api.example.com/users');
      expect(getEndpoint?.queryParams).toContainEqual({ key: 'limit', value: '10' });
      expect(getEndpoint?.headers).toHaveProperty('Accept', 'application/json');

      // Check POST request
      const postEndpoint = result.endpoints.find(e => e.method === 'POST');
      expect(postEndpoint?.name).toBe('Create User');
      expect(postEndpoint?.body).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
      });
      expect(postEndpoint?.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should handle Postman collection with folders', async () => {
      const postmanCollection = {
        info: {
          name: 'Nested Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'User Management',
            item: [
              {
                name: 'Get Users',
                request: {
                  method: 'GET',
                  url: {
                    raw: 'https://api.example.com/users',
                    protocol: 'https',
                    host: ['api', 'example', 'com'],
                    path: ['users'],
                  },
                },
              },
              {
                name: 'Create User',
                request: {
                  method: 'POST',
                  url: {
                    raw: 'https://api.example.com/users',
                    protocol: 'https',
                    host: ['api', 'example', 'com'],
                    path: ['users'],
                  },
                },
              },
            ],
          },
          {
            name: 'Product Management',
            item: [
              {
                name: 'Get Products',
                request: {
                  method: 'GET',
                  url: {
                    raw: 'https://api.example.com/products',
                    protocol: 'https',
                    host: ['api', 'example', 'com'],
                    path: ['products'],
                  },
                },
              },
            ],
          },
        ],
      };

      const result = await apiImporter.importPostmanCollection(JSON.stringify(postmanCollection));

      expect(result.name).toBe('Nested Collection');
      expect(result.endpoints).toHaveLength(3);
      expect(result.folders).toHaveLength(2);
      expect(result.folders).toContain('User Management');
      expect(result.folders).toContain('Product Management');

      const userEndpoints = result.endpoints.filter(e => e.folder === 'User Management');
      expect(userEndpoints).toHaveLength(2);

      const productEndpoints = result.endpoints.filter(e => e.folder === 'Product Management');
      expect(productEndpoints).toHaveLength(1);
    });

    it('should handle Postman collection with authentication', async () => {
      const postmanCollection = {
        info: {
          name: 'Auth Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        auth: {
          type: 'bearer',
          bearer: [
            {
              key: 'token',
              value: 'my-bearer-token',
              type: 'string',
            },
          ],
        },
        item: [
          {
            name: 'Protected Endpoint',
            request: {
              method: 'GET',
              url: {
                raw: 'https://api.example.com/protected',
                protocol: 'https',
                host: ['api', 'example', 'com'],
                path: ['protected'],
              },
            },
          },
          {
            name: 'API Key Endpoint',
            request: {
              method: 'GET',
              auth: {
                type: 'apikey',
                apikey: [
                  {
                    key: 'key',
                    value: 'X-API-Key',
                  },
                  {
                    key: 'value',
                    value: 'my-api-key',
                  },
                  {
                    key: 'in',
                    value: 'header',
                  },
                ],
              },
              url: {
                raw: 'https://api.example.com/api-key-protected',
                protocol: 'https',
                host: ['api', 'example', 'com'],
                path: ['api-key-protected'],
              },
            },
          },
        ],
      };

      const result = await apiImporter.importPostmanCollection(JSON.stringify(postmanCollection));

      // Check collection-level auth
      const protectedEndpoint = result.endpoints.find(e => e.name === 'Protected Endpoint');
      expect(protectedEndpoint?.authentication).toEqual({
        type: 'bearer',
        credentials: {
          token: 'my-bearer-token',
        },
      });

      // Check endpoint-level auth override
      const apiKeyEndpoint = result.endpoints.find(e => e.name === 'API Key Endpoint');
      expect(apiKeyEndpoint?.authentication).toEqual({
        type: 'apikey',
        credentials: {
          key: 'X-API-Key',
          value: 'my-api-key',
          location: 'header',
        },
      });
    });

    it('should handle invalid Postman collection', async () => {
      const invalidCollection = {
        notPostman: true,
      };

      await expect(apiImporter.importPostmanCollection(JSON.stringify(invalidCollection)))
        .rejects.toThrow('Invalid Postman collection');
    });
  });

  describe('Auto-detection', () => {
    it('should auto-detect and import OpenAPI specification', async () => {
      const openApiSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Auto-detected API',
          version: '1.0.0',
        },
        servers: [
          {
            url: 'https://api.example.com',
          },
        ],
        paths: {
          '/test': {
            get: {
              responses: {
                '200': {
                  description: 'Success',
                },
              },
            },
          },
        },
      };

      const result = await apiImporter.import(JSON.stringify(openApiSpec));
      expect(result.name).toBe('Auto-detected API');
      expect(result.endpoints).toHaveLength(1);
    });

    it('should auto-detect and import Postman collection', async () => {
      const postmanCollection = {
        info: {
          name: 'Auto-detected Collection',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: [
          {
            name: 'Test Request',
            request: {
              method: 'GET',
              url: {
                raw: 'https://api.example.com/test',
                protocol: 'https',
                host: ['api', 'example', 'com'],
                path: ['test'],
              },
            },
          },
        ],
      };

      const result = await apiImporter.import(JSON.stringify(postmanCollection));
      expect(result.name).toBe('Auto-detected Collection');
      expect(result.endpoints).toHaveLength(1);
    });

    it('should throw error for unrecognized format', async () => {
      const unknownFormat = {
        unknown: 'format',
      };

      await expect(apiImporter.import(JSON.stringify(unknownFormat)))
        .rejects.toThrow('Unrecognized API specification format');
    });
  });
});