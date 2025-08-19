/**
 * Test utilities and helpers for APIForge MCP Server
 */

import { jest } from '@jest/globals';
import { 
  ApiEndpoint, 
  RequestData, 
  ResponseData, 
  Workspace,
  Variables,
  AuthConfig,
  EnvironmentVariable,
  Collection,
  EnvironmentConfig
} from '../../src/types';

/**
 * Test data factory for creating mock objects
 */
export class TestDataFactory {
  /**
   * Create a mock workspace
   */
  static createMockWorkspace(overrides: Partial<Workspace> = {}): Workspace {
    return {
      id: 'test-workspace-id',
      name: 'Test Workspace',
      projectPath: '/test/workspace',
      description: 'Test workspace for unit tests',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      config: {},
      ...overrides,
    };
  }

  /**
   * Create a mock API endpoint
   */
  static createMockEndpoint(overrides: Partial<ApiEndpoint> = {}): ApiEndpoint {
    return {
      id: 'test-endpoint-id',
      workspaceId: 'test-workspace-id',
      name: 'Test Endpoint',
      description: 'Test endpoint for unit tests',
      method: 'GET',
      url: 'https://api.example.com/test',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'APIForge-Test/1.0.0',
      },
      queryParams: {
        param1: 'value1',
        param2: 'value2',
      },
      body: null,
      authentication: {
        type: 'none',
      },
      timeout: 30000,
      tags: ['test'],
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  /**
   * Create a mock request data
   */
  static createMockRequest(overrides: Partial<RequestData> = {}): RequestData {
    return {
      method: 'GET',
      url: 'https://api.example.com/test',
      headers: {
        'Content-Type': 'application/json',
      },
      queryParams: {
        test: 'value',
      },
      body: null,
      timestamp: new Date('2025-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  /**
   * Create a mock response data
   */
  static createMockResponse(overrides: Partial<ResponseData> = {}): ResponseData {
    return {
      status: 200,
      statusText: 'OK',
      headers: {
        'content-type': 'application/json',
        'content-length': '100',
      },
      body: {
        success: true,
        message: 'Test response',
        data: { id: 1, name: 'test' },
      },
      size: 100,
      timestamp: new Date('2025-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  /**
   * Create mock variables
   */
  static createMockVariables(overrides: Partial<Variables> = {}): Variables {
    return {
      API_KEY: 'test-api-key-123',
      BASE_URL: 'https://api.example.com',
      USER_ID: '12345',
      SECRET_TOKEN: 'secret-token-456',
      ...overrides,
    };
  }

  /**
   * Create mock authentication config
   */
  static createMockAuthConfig(type: AuthConfig['type'] = 'basic', overrides: Partial<AuthConfig> = {}): AuthConfig {
    const configs = {
      none: { type: 'none' as const },
      basic: {
        type: 'basic' as const,
        credentials: {
          username: 'testuser',
          password: 'testpass',
        },
      },
      bearer: {
        type: 'bearer' as const,
        credentials: {
          token: 'test-bearer-token',
        },
      },
      apikey: {
        type: 'apikey' as const,
        credentials: {
          key: 'X-API-Key',
          value: 'test-api-key',
          location: 'header',
        },
      },
      oauth2: {
        type: 'oauth2' as const,
        credentials: {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          tokenType: 'Bearer',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        },
      },
    };

    return {
      ...configs[type],
      ...overrides,
    } as AuthConfig;
  }

  /**
   * Create mock environment variable
   */
  static createMockEnvironmentVariable(overrides: Partial<EnvironmentVariable> = {}): EnvironmentVariable {
    return {
      name: 'TEST_VAR',
      value: 'test-value',
      type: 'string',
      encrypted: false,
      description: 'Test environment variable',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  /**
   * Create a mock collection
   */
  static createMockCollection(overrides: Partial<Collection> = {}): Collection {
    return {
      id: 'test-collection-id',
      name: 'Test Collection',
      description: 'Test collection for unit tests',
      endpoints: [],
      folders: [],
      version: '1.0.0',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }

  /**
   * Create a mock environment
   */
  static createMockEnvironment(overrides: Partial<EnvironmentConfig> = {}): EnvironmentConfig {
    return {
      id: 'test-environment-id',
      name: 'Test Environment',
      workspaceId: 'test-workspace-id',
      variables: {},
      parentEnvironmentId: null,
      scope: 'workspace',
      description: 'Test environment for unit tests',
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
      ...overrides,
    };
  }
}

/**
 * Mock factory for creating Jest mocks
 */
export class MockFactory {
  /**
   * Create a mock fetch response
   */
  static createMockFetchResponse(data: any, options: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
    ok?: boolean;
  } = {}): Response {
    const {
      status = 200,
      statusText = 'OK',
      headers = { 'content-type': 'application/json' },
      ok = status >= 200 && status < 300,
    } = options;

    return {
      status,
      statusText,
      ok,
      headers: new Headers(headers),
      json: jest.fn().mockResolvedValue(data),
      text: jest.fn().mockResolvedValue(JSON.stringify(data)),
      blob: jest.fn().mockResolvedValue(new Blob([JSON.stringify(data)])),
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
      clone: jest.fn().mockReturnThis(),
      body: null,
      bodyUsed: false,
      redirected: false,
      type: 'basic',
      url: 'https://api.example.com/test',
    } as any;
  }

  /**
   * Create a mock storage interface
   */
  static createMockStorage() {
    return {
      // Workspace operations
      saveWorkspace: jest.fn(),
      getWorkspace: jest.fn(),
      findWorkspaceByName: jest.fn(),
      listWorkspaces: jest.fn(),
      deleteWorkspace: jest.fn(),

      // Endpoint operations
      saveEndpoint: jest.fn(),
      getEndpoint: jest.fn(),
      getEndpointsByWorkspace: jest.fn(),
      updateEndpoint: jest.fn(),
      deleteEndpoint: jest.fn(),

      // Environment operations
      saveEnvironment: jest.fn(),
      getEnvironment: jest.fn(),
      listEnvironments: jest.fn(),
      deleteEnvironment: jest.fn(),

      // History operations
      saveHistory: jest.fn(),
      getHistory: jest.fn(),
      deleteHistory: jest.fn(),
    };
  }

  /**
   * Create a mock logger
   */
  static createMockLogger() {
    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  }

  /**
   * Create a mock error handler
   */
  static createMockErrorHandler() {
    return {
      handleError: jest.fn(),
      getErrorContext: jest.fn(),
      clearErrorContext: jest.fn(),
      setErrorContext: jest.fn(),
      getErrorStats: jest.fn(),
      getSuggestions: jest.fn(),
      shouldRetry: jest.fn(),
      logError: jest.fn(),
    };
  }

  /**
   * Setup fetch mock with responses
   */
  static setupFetchMock(responses: Array<{
    url?: string | RegExp;
    method?: string;
    response: any;
    status?: number;
    delay?: number;
  }>) {
    const fetchMock = jest.fn();
    
    responses.forEach(({ url, method, response, status = 200, delay = 0 }) => {
      const mockResponse = MockFactory.createMockFetchResponse(response, { status });
      
      let shouldMatch: jest.MockImplementation<any, any>;
      
      if (url && method) {
        shouldMatch = (input: any, init?: any) => {
          const requestUrl = typeof input === 'string' ? input : input.url;
          const requestMethod = init?.method || 'GET';
          
          const urlMatch = url instanceof RegExp 
            ? url.test(requestUrl)
            : requestUrl.includes(url as string);
          
          return urlMatch && requestMethod.toLowerCase() === method.toLowerCase();
        };
      } else if (url) {
        shouldMatch = (input: any) => {
          const requestUrl = typeof input === 'string' ? input : input.url;
          return url instanceof RegExp 
            ? url.test(requestUrl)
            : requestUrl.includes(url as string);
        };
      } else {
        shouldMatch = () => true;
      }

      if (delay > 0) {
        fetchMock.mockImplementation((input, init) => {
          if (shouldMatch(input, init)) {
            return new Promise(resolve => {
              setTimeout(() => resolve(mockResponse), delay);
            });
          }
          return Promise.resolve(mockResponse);
        });
      } else {
        fetchMock.mockImplementation((input, init) => {
          if (shouldMatch(input, init)) {
            return Promise.resolve(mockResponse);
          }
          return Promise.resolve(mockResponse);
        });
      }
    });

    (global.fetch as jest.Mock) = fetchMock;
    return fetchMock;
  }
}

/**
 * Test assertion helpers
 */
export class TestAssertions {
  /**
   * Assert that an object has valid UUID
   */
  static expectValidUUID(value: string) {
    expect(value).toBeValidUUID();
  }

  /**
   * Assert that an object has valid date
   */
  static expectValidDate(value: any) {
    expect(value).toBeValidDate();
  }

  /**
   * Assert that a function was called with specific arguments
   */
  static expectCalledWith(mockFn: jest.Mock, ...args: any[]) {
    expect(mockFn).toHaveBeenCalledWith(...args);
  }

  /**
   * Assert that a promise rejects with specific error
   */
  static async expectRejectsWithError(promise: Promise<any>, errorClass: any, message?: string) {
    await expect(promise).rejects.toThrow(errorClass);
    if (message) {
      await expect(promise).rejects.toThrow(message);
    }
  }

  /**
   * Assert that an HTTP response has expected structure
   */
  static expectValidHttpResponse(response: ResponseData) {
    expect(response).toMatchObject({
      status: expect.any(Number),
      statusText: expect.any(String),
      headers: expect.any(Object),
      body: expect.anything(),
      size: expect.any(Number),
      timestamp: expect.any(Date),
    });
  }

  /**
   * Assert that a request has expected structure
   */
  static expectValidHttpRequest(request: RequestData) {
    expect(request).toMatchObject({
      method: expect.any(String),
      url: expect.any(String),
      headers: expect.any(Object),
      timestamp: expect.any(Date),
    });
  }
}

/**
 * Test cleanup utilities
 */
export class TestCleanup {
  /**
   * Reset all mocks and timers
   */
  static resetAll() {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  }

  /**
   * Clean up test environment
   */
  static cleanupEnvironment() {
    // Reset process.env to test state
    process.env.NODE_ENV = 'test';
    process.env.APIFORGE_TEST = 'true';
    
    // Clear any global state
    if (global.fetch && jest.isMockFunction(global.fetch)) {
      (global.fetch as jest.Mock).mockReset();
    }
  }
}