/**
 * Tests for Import Services
 */

import { jest } from '@jest/globals';
import { ImportService } from '../../../src/services/import/import.service';
import { OpenAPIImporter } from '../../../src/services/import/openapi-importer.service';
import { PostmanImporter } from '../../../src/services/import/postman-importer.service';
import { TestDataFactory, MockFactory } from '../../utils/test-utils';

describe('Import Services', () => {
  let importService: ImportService;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = MockFactory.createMockLogger();
    importService = new ImportService(mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ImportService', () => {
    describe('Format Detection', () => {
      it('should detect OpenAPI 3.0 format', async () => {
        const openApiSpec = {
          openapi: '3.0.0',
          info: {
            title: 'Test API',
            version: '1.0.0',
          },
          paths: {
            '/users': {
              get: {
                summary: 'Get users',
                responses: {
                  '200': {
                    description: 'Success',
                  },
                },
              },
            },
          },
        };

        const result = await importService.importFromData(
          openApiSpec,
          'test-workspace',
          'auto'
        );

        expect(result.format).toBe('openapi');
        expect(result.version).toBe('3.0.0');
        expect(result.metadata.title).toBe('Test API');
      });

      it('should detect Postman Collection format', async () => {
        const postmanCollection = {
          info: {
            name: 'Test Collection',
            schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
          },
          item: [
            {
              name: 'Get Users',
              request: {
                method: 'GET',
                url: 'https://api.example.com/users',
              },
            },
          ],
        };

        const result = await importService.importFromData(
          postmanCollection,
          'test-workspace',
          'auto'
        );

        expect(result.format).toBe('postman');
        expect(result.metadata.title).toBe('Test Collection');
      });

      it('should throw error for unknown format', async () => {
        const unknownFormat = {
          some: 'data',
          without: 'proper structure',
        };

        await expect(
          importService.importFromData(unknownFormat, 'test-workspace', 'auto')
        ).rejects.toThrow('Unable to detect format');
      });
    });

    describe('Endpoint Validation', () => {
      it('should validate imported endpoints', () => {
        const endpoints = [
          TestDataFactory.createMockEndpoint({
            name: 'Valid Endpoint',
            method: 'GET',
            url: 'https://api.example.com/users',
            workspaceId: 'ws-123',
          }),
          {
            // Missing name
            method: 'POST',
            url: 'https://api.example.com/users',
            workspaceId: 'ws-123',
          } as any,
          {
            name: 'Invalid Method',
            method: 'INVALID' as any,
            url: 'https://api.example.com/users',
            workspaceId: 'ws-123',
          } as any,
        ];

        const result = importService.validateEndpoints(endpoints);

        expect(result.valid).toHaveLength(1);
        expect(result.invalid).toHaveLength(2);
        expect(result.invalid[0].errors).toContain('Missing endpoint name');
        expect(result.invalid[1].errors).toContain('Invalid HTTP method: INVALID');
      });
    });
  });

  describe('OpenAPIImporter', () => {
    let openApiImporter: OpenAPIImporter;

    beforeEach(() => {
      openApiImporter = new OpenAPIImporter(mockLogger, 'test-workspace');
    });

    it('should import basic OpenAPI spec', async () => {
      const spec = {
        openapi: '3.0.0',
        info: {
          title: 'User API',
          version: '1.0.0',
          description: 'API for user management',
        },
        servers: [
          {
            url: 'https://api.example.com/v1',
          },
        ],
        paths: {
          '/users': {
            get: {
              operationId: 'getUsers',
              summary: 'Get all users',
              responses: {
                '200': {
                  description: 'List of users',
                },
              },
            },
            post: {
              operationId: 'createUser',
              summary: 'Create a new user',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
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
          '/users/{userId}': {
            get: {
              operationId: 'getUser',
              summary: 'Get user by ID',
              parameters: [
                {
                  name: 'userId',
                  in: 'path',
                  required: true,
                  schema: {
                    type: 'string',
                  },
                },
              ],
              responses: {
                '200': {
                  description: 'User details',
                },
                '404': {
                  description: 'User not found',
                },
              },
            },
          },
        },
      };

      const endpoints = await openApiImporter.import(spec);

      expect(endpoints).toHaveLength(3);
      
      // Check GET /users
      const getUsers = endpoints.find(e => e.name === 'getUsers');
      expect(getUsers).toBeDefined();
      expect(getUsers?.method).toBe('GET');
      expect(getUsers?.url).toBe('https://api.example.com/v1/users');

      // Check POST /users
      const createUser = endpoints.find(e => e.name === 'createUser');
      expect(createUser).toBeDefined();
      expect(createUser?.method).toBe('POST');
      expect(createUser?.body).toEqual({
        name: 'string',
        email: 'user@example.com',
      });

      // Check GET /users/{userId}
      const getUser = endpoints.find(e => e.name === 'getUser');
      expect(getUser).toBeDefined();
      expect(getUser?.method).toBe('GET');
      expect(getUser?.url).toBe('https://api.example.com/v1/users/{{userId}}');
    });

    it('should handle authentication schemes', async () => {
      const spec = {
        openapi: '3.0.0',
        info: {
          title: 'Secure API',
          version: '1.0.0',
        },
        servers: [
          {
            url: 'https://api.example.com',
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
              name: 'X-API-Key',
              in: 'header',
            },
          },
        },
        security: [
          {
            bearerAuth: [],
          },
        ],
        paths: {
          '/protected': {
            get: {
              summary: 'Protected endpoint',
              responses: {
                '200': {
                  description: 'Success',
                },
              },
            },
          },
          '/api-key-protected': {
            get: {
              summary: 'API key protected',
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

      const endpoints = await openApiImporter.import(spec);

      expect(endpoints).toHaveLength(2);

      // Check bearer auth endpoint
      const bearerEndpoint = endpoints[0];
      expect(bearerEndpoint.authentication?.type).toBe('bearer');
      expect(bearerEndpoint.authentication?.credentials).toHaveProperty('token');

      // Check API key endpoint
      const apiKeyEndpoint = endpoints[1];
      expect(apiKeyEndpoint.authentication?.type).toBe('apikey');
      expect(apiKeyEndpoint.authentication?.credentials).toMatchObject({
        key: 'X-API-Key',
        location: 'header',
      });
    });

    it('should generate examples from schema', async () => {
      const spec = {
        openapi: '3.0.0',
        info: {
          title: 'Example API',
          version: '1.0.0',
        },
        paths: {
          '/example': {
            post: {
              requestBody: {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'integer', minimum: 1 },
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        active: { type: 'boolean' },
                        tags: {
                          type: 'array',
                          items: { type: 'string' },
                        },
                        metadata: {
                          type: 'object',
                          properties: {
                            created: { type: 'string', format: 'date-time' },
                            updated: { type: 'string', format: 'date-time' },
                          },
                        },
                      },
                    },
                  },
                },
              },
              responses: {
                '200': {
                  description: 'Success',
                },
              },
            },
          },
        },
      };

      const endpoints = await openApiImporter.import(spec);

      expect(endpoints).toHaveLength(1);
      const endpoint = endpoints[0];
      
      expect(endpoint.body).toEqual({
        id: 1,
        name: 'string',
        email: 'user@example.com',
        active: false,
        tags: ['string'],
        metadata: {
          created: '2025-01-01T00:00:00Z',
          updated: '2025-01-01T00:00:00Z',
        },
      });
    });
  });

  describe('PostmanImporter', () => {
    let postmanImporter: PostmanImporter;

    beforeEach(() => {
      postmanImporter = new PostmanImporter(mockLogger, 'test-workspace');
    });

    it('should import basic Postman collection', async () => {
      const collection = {
        info: {
          name: 'User Management',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
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
              url: 'https://api.example.com/users',
              body: {
                mode: 'raw',
                raw: JSON.stringify({
                  name: 'John Doe',
                  email: 'john@example.com',
                }),
                options: {
                  raw: {
                    language: 'json',
                  },
                },
              },
            },
          },
        ],
      };

      const endpoints = await postmanImporter.import(collection);

      expect(endpoints).toHaveLength(2);

      // Check GET request
      const getEndpoint = endpoints.find(e => e.name === 'Get Users');
      expect(getEndpoint).toBeDefined();
      expect(getEndpoint?.method).toBe('GET');
      expect(getEndpoint?.url).toBe('https://api.example.com/users');

      // Check POST request
      const postEndpoint = endpoints.find(e => e.name === 'Create User');
      expect(postEndpoint).toBeDefined();
      expect(postEndpoint?.method).toBe('POST');
      expect(postEndpoint?.body).toEqual({
        name: 'John Doe',
        email: 'john@example.com',
      });
    });

    it('should handle folders', async () => {
      const collection = {
        info: {
          name: 'API Collection',
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
                  url: 'https://api.example.com/users',
                },
              },
              {
                name: 'Create User',
                request: {
                  method: 'POST',
                  url: 'https://api.example.com/users',
                },
              },
            ],
          },
          {
            name: 'Products',
            item: [
              {
                name: 'Get Products',
                request: {
                  method: 'GET',
                  url: 'https://api.example.com/products',
                },
              },
            ],
          },
        ],
      };

      const endpoints = await postmanImporter.import(collection);

      expect(endpoints).toHaveLength(3);

      // Check folder paths are used as tags
      const userEndpoints = endpoints.filter(e => e.tags?.includes('Users'));
      expect(userEndpoints).toHaveLength(2);

      const productEndpoints = endpoints.filter(e => e.tags?.includes('Products'));
      expect(productEndpoints).toHaveLength(1);
    });

    it('should handle authentication', async () => {
      const collection = {
        info: {
          name: 'Auth Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        auth: {
          type: 'bearer',
          bearer: [
            {
              key: 'token',
              value: 'test-token-123',
              type: 'string',
            },
          ],
        },
        item: [
          {
            name: 'Protected Endpoint',
            request: {
              method: 'GET',
              url: 'https://api.example.com/protected',
            },
          },
          {
            name: 'API Key Endpoint',
            request: {
              method: 'GET',
              url: 'https://api.example.com/apikey',
              auth: {
                type: 'apikey',
                apikey: [
                  { key: 'key', value: 'X-API-Key', type: 'string' },
                  { key: 'value', value: 'my-api-key', type: 'string' },
                  { key: 'in', value: 'header', type: 'string' },
                ],
              },
            },
          },
        ],
      };

      const endpoints = await postmanImporter.import(collection);

      expect(endpoints).toHaveLength(2);

      // Check bearer auth (inherited from collection)
      const bearerEndpoint = endpoints[0];
      expect(bearerEndpoint.authentication?.type).toBe('bearer');
      expect(bearerEndpoint.authentication?.credentials).toMatchObject({
        token: 'test-token-123',
      });

      // Check API key auth (endpoint specific)
      const apiKeyEndpoint = endpoints[1];
      expect(apiKeyEndpoint.authentication?.type).toBe('apikey');
      expect(apiKeyEndpoint.authentication?.credentials).toMatchObject({
        key: 'X-API-Key',
        value: 'my-api-key',
        location: 'header',
      });
    });

    it('should handle variables', async () => {
      const collection = {
        info: {
          name: 'Variable Test',
          schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        variable: [
          {
            key: 'baseUrl',
            value: 'https://api.example.com',
          },
          {
            key: 'version',
            value: 'v1',
          },
        ],
        item: [
          {
            name: 'Get Users',
            request: {
              method: 'GET',
              url: '{{baseUrl}}/{{version}}/users',
            },
          },
        ],
      };

      const endpoints = await postmanImporter.import(collection);

      expect(endpoints).toHaveLength(1);
      
      // Variables should be replaced with actual values
      expect(endpoints[0].url).toBe('https://api.example.com/v1/users');
    });
  });
});