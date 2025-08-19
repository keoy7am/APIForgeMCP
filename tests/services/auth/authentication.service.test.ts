/**
 * Tests for AuthenticationService
 */

import { jest } from '@jest/globals';
import { AuthenticationService } from '../../../src/services/auth/authentication.service';
import { TestDataFactory, MockFactory, TestAssertions } from '../../utils/test-utils';
import { AuthConfig, RequestData } from '../../../src/types';
import { ValidationError } from '../../../src/services/error';

describe('AuthenticationService', () => {
  let authService: AuthenticationService;

  beforeEach(() => {
    authService = new AuthenticationService();
  });

  describe('applyAuthentication', () => {
    let baseRequest: RequestData;

    beforeEach(() => {
      baseRequest = TestDataFactory.createMockRequest({
        method: 'GET',
        url: 'https://api.example.com/test',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    describe('No authentication', () => {
      it('should return request unchanged for no auth', async () => {
        const authConfig: AuthConfig = { type: 'none' };

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        expect(result).toEqual(baseRequest);
      });

      it('should handle undefined auth config', async () => {
        const result = await authService.applyAuthentication(baseRequest, undefined as any);

        expect(result).toEqual(baseRequest);
      });
    });

    describe('Basic Authentication', () => {
      it('should apply basic authentication correctly', async () => {
        const authConfig = TestDataFactory.createMockAuthConfig('basic', {
          credentials: {
            username: 'testuser',
            password: 'testpass',
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        const expectedAuth = Buffer.from('testuser:testpass').toString('base64');
        expect(result.headers['Authorization']).toBe(`Basic ${expectedAuth}`);
        expect(result.method).toBe(baseRequest.method);
        expect(result.url).toBe(baseRequest.url);
      });

      it('should handle special characters in credentials', async () => {
        const authConfig = TestDataFactory.createMockAuthConfig('basic', {
          credentials: {
            username: 'user@domain.com',
            password: 'p@$$w0rd!',
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        const expectedAuth = Buffer.from('user@domain.com:p@$$w0rd!').toString('base64');
        expect(result.headers['Authorization']).toBe(`Basic ${expectedAuth}`);
      });

      it('should handle empty password', async () => {
        const authConfig = TestDataFactory.createMockAuthConfig('basic', {
          credentials: {
            username: 'testuser',
            password: '',
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        const expectedAuth = Buffer.from('testuser:').toString('base64');
        expect(result.headers['Authorization']).toBe(`Basic ${expectedAuth}`);
      });

      it('should throw error for missing credentials', async () => {
        const authConfig: AuthConfig = {
          type: 'basic',
          credentials: undefined,
        };

        await TestAssertions.expectRejectsWithError(
          authService.applyAuthentication(baseRequest, authConfig),
          ValidationError,
          'Basic auth credentials are required'
        );
      });

      it('should throw error for invalid credentials', async () => {
        const authConfig: AuthConfig = {
          type: 'basic',
          credentials: {
            username: '',
            password: 'test',
          },
        };

        await expect(authService.applyAuthentication(baseRequest, authConfig))
          .rejects.toThrow();
      });
    });

    describe('Bearer Token Authentication', () => {
      it('should apply bearer token correctly', async () => {
        const authConfig = TestDataFactory.createMockAuthConfig('bearer', {
          credentials: {
            token: 'test-bearer-token-123',
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        expect(result.headers['Authorization']).toBe('Bearer test-bearer-token-123');
      });

      it('should handle JWT tokens', async () => {
        const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        const authConfig = TestDataFactory.createMockAuthConfig('bearer', {
          credentials: {
            token: jwtToken,
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        expect(result.headers['Authorization']).toBe(`Bearer ${jwtToken}`);
      });

      it('should throw error for missing token', async () => {
        const authConfig: AuthConfig = {
          type: 'bearer',
          credentials: undefined,
        };

        await TestAssertions.expectRejectsWithError(
          authService.applyAuthentication(baseRequest, authConfig),
          ValidationError,
          'Bearer token credentials are required'
        );
      });

      it('should throw error for empty token', async () => {
        const authConfig: AuthConfig = {
          type: 'bearer',
          credentials: {
            token: '',
          },
        };

        await expect(authService.applyAuthentication(baseRequest, authConfig))
          .rejects.toThrow();
      });
    });

    describe('API Key Authentication', () => {
      it('should apply API key in header', async () => {
        const authConfig = TestDataFactory.createMockAuthConfig('apikey', {
          credentials: {
            key: 'X-API-Key',
            value: 'test-api-key-value',
            location: 'header',
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        expect(result.headers['X-API-Key']).toBe('test-api-key-value');
        expect(result.headers['Content-Type']).toBe('application/json'); // Preserved
      });

      it('should apply API key in query parameters', async () => {
        const authConfig = TestDataFactory.createMockAuthConfig('apikey', {
          credentials: {
            key: 'api_key',
            value: 'test-query-key',
            location: 'query',
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        expect(result.queryParams).toEqual({
          ...baseRequest.queryParams,
          api_key: 'test-query-key',
        });
      });

      it('should apply API key in request body', async () => {
        const requestWithBody = {
          ...baseRequest,
          body: { existing: 'data' },
        };

        const authConfig = TestDataFactory.createMockAuthConfig('apikey', {
          credentials: {
            key: 'apiKey',
            value: 'test-body-key',
            location: 'body',
          },
        });

        const result = await authService.applyAuthentication(requestWithBody, authConfig);

        expect(result.body).toEqual({
          existing: 'data',
          apiKey: 'test-body-key',
        });
      });

      it('should handle multiple API keys', async () => {
        const authConfig1 = TestDataFactory.createMockAuthConfig('apikey', {
          credentials: {
            key: 'X-API-Key',
            value: 'header-key',
            location: 'header',
          },
        });

        const authConfig2 = TestDataFactory.createMockAuthConfig('apikey', {
          credentials: {
            key: 'api_secret',
            value: 'query-secret',
            location: 'query',
          },
        });

        let result = await authService.applyAuthentication(baseRequest, authConfig1);
        result = await authService.applyAuthentication(result, authConfig2);

        expect(result.headers['X-API-Key']).toBe('header-key');
        expect(result.queryParams).toEqual({
          ...baseRequest.queryParams,
          api_secret: 'query-secret',
        });
      });

      it('should throw error for missing credentials', async () => {
        const authConfig: AuthConfig = {
          type: 'apikey',
          credentials: undefined,
        };

        await TestAssertions.expectRejectsWithError(
          authService.applyAuthentication(baseRequest, authConfig),
          ValidationError,
          'API key credentials are required'
        );
      });

      it('should throw error for invalid location', async () => {
        const authConfig: AuthConfig = {
          type: 'apikey',
          credentials: {
            key: 'api_key',
            value: 'test-value',
            location: 'invalid' as any,
          },
        };

        await expect(authService.applyAuthentication(baseRequest, authConfig))
          .rejects.toThrow();
      });
    });

    describe('OAuth2 Authentication', () => {
      it('should apply OAuth2 token correctly', async () => {
        const authConfig = TestDataFactory.createMockAuthConfig('oauth2', {
          credentials: {
            accessToken: 'oauth2-access-token',
            tokenType: 'Bearer',
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        expect(result.headers['Authorization']).toBe('Bearer oauth2-access-token');
      });

      it('should handle custom token type', async () => {
        const authConfig = TestDataFactory.createMockAuthConfig('oauth2', {
          credentials: {
            accessToken: 'custom-token',
            tokenType: 'Custom',
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        expect(result.headers['Authorization']).toBe('Custom custom-token');
      });

      it('should default to Bearer token type', async () => {
        const authConfig = TestDataFactory.createMockAuthConfig('oauth2', {
          credentials: {
            accessToken: 'default-token',
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        expect(result.headers['Authorization']).toBe('Bearer default-token');
      });

      it('should handle expired token with warning', async () => {
        const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
        const authConfig = TestDataFactory.createMockAuthConfig('oauth2', {
          credentials: {
            accessToken: 'expired-token',
            expiresAt: expiredDate,
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        expect(result.headers['Authorization']).toBe('Bearer expired-token');
        // Should still apply the token but log warnings
      });

      it('should throw error for expired token without refresh', async () => {
        const expiredDate = new Date(Date.now() - 3600000); // 1 hour ago
        const authConfig = TestDataFactory.createMockAuthConfig('oauth2', {
          credentials: {
            accessToken: 'expired-token',
            expiresAt: expiredDate,
            refreshToken: undefined,
          },
        });

        await TestAssertions.expectRejectsWithError(
          authService.applyAuthentication(baseRequest, authConfig),
          ValidationError,
          'Access token expired and no refresh token available'
        );
      });

      it('should handle token with refresh token', async () => {
        const authConfig = TestDataFactory.createMockAuthConfig('oauth2', {
          credentials: {
            accessToken: 'access-token',
            refreshToken: 'refresh-token',
            tokenType: 'Bearer',
            scope: 'read write',
          },
        });

        const result = await authService.applyAuthentication(baseRequest, authConfig);

        expect(result.headers['Authorization']).toBe('Bearer access-token');
      });

      it('should throw error for missing credentials', async () => {
        const authConfig: AuthConfig = {
          type: 'oauth2',
          credentials: undefined,
        };

        await TestAssertions.expectRejectsWithError(
          authService.applyAuthentication(baseRequest, authConfig),
          ValidationError,
          'OAuth2 credentials are required'
        );
      });
    });

    describe('Unsupported authentication type', () => {
      it('should throw error for unsupported auth type', async () => {
        const authConfig: AuthConfig = {
          type: 'unsupported' as any,
          credentials: {},
        };

        await TestAssertions.expectRejectsWithError(
          authService.applyAuthentication(baseRequest, authConfig),
          ValidationError,
          'Unsupported authentication type: unsupported'
        );
      });
    });
  });

  describe('validateAuthConfig', () => {
    it('should validate none auth config', () => {
      const authConfig: AuthConfig = { type: 'none' };
      
      const result = authService.validateAuthConfig(authConfig);
      
      expect(result).toBe(true);
    });

    it('should validate undefined auth config', () => {
      const result = authService.validateAuthConfig(undefined as any);
      
      expect(result).toBe(true);
    });

    it('should validate basic auth config', () => {
      const authConfig = TestDataFactory.createMockAuthConfig('basic');
      
      const result = authService.validateAuthConfig(authConfig);
      
      expect(result).toBe(true);
    });

    it('should validate bearer auth config', () => {
      const authConfig = TestDataFactory.createMockAuthConfig('bearer');
      
      const result = authService.validateAuthConfig(authConfig);
      
      expect(result).toBe(true);
    });

    it('should validate apikey auth config', () => {
      const authConfig = TestDataFactory.createMockAuthConfig('apikey');
      
      const result = authService.validateAuthConfig(authConfig);
      
      expect(result).toBe(true);
    });

    it('should validate oauth2 auth config', () => {
      const authConfig = TestDataFactory.createMockAuthConfig('oauth2');
      
      const result = authService.validateAuthConfig(authConfig);
      
      expect(result).toBe(true);
    });

    it('should reject invalid basic auth config', () => {
      const authConfig: AuthConfig = {
        type: 'basic',
        credentials: {
          username: '', // Invalid: empty username
          password: 'test',
        },
      };
      
      const result = authService.validateAuthConfig(authConfig);
      
      expect(result).toBe(false);
    });

    it('should reject unsupported auth type', () => {
      const authConfig: AuthConfig = {
        type: 'unsupported' as any,
        credentials: {},
      };
      
      const result = authService.validateAuthConfig(authConfig);
      
      expect(result).toBe(false);
    });
  });

  describe('needsRefresh', () => {
    it('should return false for non-OAuth2 auth', () => {
      const authConfig = TestDataFactory.createMockAuthConfig('basic');
      
      const result = authService.needsRefresh(authConfig);
      
      expect(result).toBe(false);
    });

    it('should return false for OAuth2 without expiration', () => {
      const authConfig = TestDataFactory.createMockAuthConfig('oauth2', {
        credentials: {
          accessToken: 'token',
          expiresAt: undefined,
        },
      });
      
      const result = authService.needsRefresh(authConfig);
      
      expect(result).toBe(false);
    });

    it('should return true for soon-to-expire token', () => {
      const soonExpire = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes from now
      const authConfig = TestDataFactory.createMockAuthConfig('oauth2', {
        credentials: {
          accessToken: 'token',
          expiresAt: soonExpire,
        },
      });
      
      const result = authService.needsRefresh(authConfig);
      
      expect(result).toBe(true);
    });

    it('should return false for far-future expiration', () => {
      const farFuture = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
      const authConfig = TestDataFactory.createMockAuthConfig('oauth2', {
        credentials: {
          accessToken: 'token',
          expiresAt: farFuture,
        },
      });
      
      const result = authService.needsRefresh(authConfig);
      
      expect(result).toBe(false);
    });

    it('should handle invalid OAuth2 credentials', () => {
      const authConfig: AuthConfig = {
        type: 'oauth2',
        credentials: {
          accessToken: '', // Invalid
        },
      };
      
      const result = authService.needsRefresh(authConfig);
      
      expect(result).toBe(false);
    });
  });

  describe('extractAuthFromHeaders', () => {
    it('should extract Bearer token', () => {
      const headers = {
        Authorization: 'Bearer test-token-123',
      };
      
      const result = authService.extractAuthFromHeaders(headers);
      
      expect(result).toEqual({
        type: 'bearer',
        value: 'test-token-123',
      });
    });

    it('should extract Basic auth', () => {
      const headers = {
        Authorization: 'Basic dGVzdDpwYXNz', // test:pass encoded
      };
      
      const result = authService.extractAuthFromHeaders(headers);
      
      expect(result).toEqual({
        type: 'basic',
        value: 'dGVzdDpwYXNz',
      });
    });

    it('should handle case-insensitive headers', () => {
      const headers = {
        authorization: 'bearer lowercase-token',
      };
      
      const result = authService.extractAuthFromHeaders(headers);
      
      expect(result).toEqual({
        type: 'bearer',
        value: 'lowercase-token',
      });
    });

    it('should handle unknown auth type', () => {
      const headers = {
        Authorization: 'Custom custom-token',
      };
      
      const result = authService.extractAuthFromHeaders(headers);
      
      expect(result).toEqual({
        type: 'unknown',
        value: 'Custom custom-token',
      });
    });

    it('should return null for missing auth header', () => {
      const headers = {
        'Content-Type': 'application/json',
      };
      
      const result = authService.extractAuthFromHeaders(headers);
      
      expect(result).toBeNull();
    });

    it('should return null for empty headers', () => {
      const result = authService.extractAuthFromHeaders({});
      
      expect(result).toBeNull();
    });
  });

  describe('Cache management', () => {
    it('should provide cache statistics', () => {
      const stats = authService.getCacheStats();
      
      expect(stats).toEqual({
        size: 0,
        entries: [],
      });
    });

    it('should clear cache', () => {
      authService.clearCache();
      
      const stats = authService.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete authentication workflow', async () => {
      const request = TestDataFactory.createMockRequest({
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: { name: 'Test User' },
      });

      // Apply multiple authentication layers
      const bearerAuth = TestDataFactory.createMockAuthConfig('bearer');
      const apiKeyAuth = TestDataFactory.createMockAuthConfig('apikey');

      let authenticatedRequest = await authService.applyAuthentication(request, bearerAuth);
      authenticatedRequest = await authService.applyAuthentication(authenticatedRequest, apiKeyAuth);

      expect(authenticatedRequest.headers).toMatchObject({
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer test-bearer-token',
        'X-API-Key': 'test-api-key',
      });

      expect(authenticatedRequest.body).toEqual(request.body);
      expect(authenticatedRequest.method).toBe(request.method);
      expect(authenticatedRequest.url).toBe(request.url);
    });

    it('should validate and apply complex OAuth2 scenario', async () => {
      const request = TestDataFactory.createMockRequest();
      const authConfig = TestDataFactory.createMockAuthConfig('oauth2', {
        credentials: {
          accessToken: 'complex-oauth2-token',
          refreshToken: 'refresh-token',
          tokenType: 'Bearer',
          scope: 'read write admin',
          expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
        },
      });

      // Validate config
      expect(authService.validateAuthConfig(authConfig)).toBe(true);
      
      // Check if refresh needed
      expect(authService.needsRefresh(authConfig)).toBe(false);
      
      // Apply authentication
      const result = await authService.applyAuthentication(request, authConfig);
      
      expect(result.headers['Authorization']).toBe('Bearer complex-oauth2-token');
      
      // Extract and verify
      const extracted = authService.extractAuthFromHeaders(result.headers);
      expect(extracted).toEqual({
        type: 'bearer',
        value: 'complex-oauth2-token',
      });
    });
  });
});