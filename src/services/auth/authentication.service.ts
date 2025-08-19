import { z } from 'zod';
import { AuthConfig, RequestData } from '../../types';
import { Logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';

/**
 * Enhanced authentication credentials schemas
 */
export const BasicAuthCredentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string(),
});

export const BearerTokenCredentialsSchema = z.object({
  token: z.string().min(1),
});

export const ApiKeyCredentialsSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  location: z.enum(['header', 'query', 'body']),
});

export const OAuth2CredentialsSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().optional(),
  tokenType: z.string().default('Bearer'),
  expiresAt: z.date().optional(),
  scope: z.string().optional(),
});

/**
 * Authentication result interface
 */
export interface AuthenticationResult {
  headers: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: any;
  isValid: boolean;
  expiresAt?: Date;
  warnings?: string[];
}

/**
 * Authentication Service
 * 
 * Provides comprehensive authentication support for HTTP requests.
 * Supports Basic Auth, Bearer Token, API Key, and OAuth2 authentication methods.
 */
export class AuthenticationService {
  private logger: Logger;
  private tokenCache: Map<string, { token: string; expiresAt?: Date }>;

  constructor() {
    this.logger = new Logger('AuthenticationService');
    this.tokenCache = new Map();
  }

  /**
   * Apply authentication to a request
   */
  async applyAuthentication(
    request: RequestData,
    authConfig: AuthConfig
  ): Promise<RequestData> {
    try {
      if (!authConfig || authConfig.type === 'none') {
        return request;
      }

      this.logger.debug(`Applying ${authConfig.type} authentication`);

      const authResult = await this.processAuthentication(authConfig);
      
      if (!authResult.isValid) {
        throw new ValidationError('Authentication validation failed');
      }

      // Apply authentication to request
      const authenticatedRequest: RequestData = {
        ...request,
        headers: {
          ...request.headers,
          ...authResult.headers,
        },
      };

      // Apply query parameters if specified
      if (authResult.queryParams && Object.keys(authResult.queryParams).length > 0) {
        authenticatedRequest.queryParams = {
          ...request.queryParams,
          ...authResult.queryParams,
        };
      }

      // Apply body modifications if specified
      if (authResult.body && typeof request.body === 'object') {
        authenticatedRequest.body = {
          ...request.body,
          ...authResult.body,
        };
      }

      // Log warnings if any
      if (authResult.warnings && authResult.warnings.length > 0) {
        authResult.warnings.forEach(warning => 
          this.logger.warn(`Authentication warning: ${warning}`)
        );
      }

      this.logger.debug('Authentication applied successfully');
      return authenticatedRequest;

    } catch (error) {
      this.logger.error('Failed to apply authentication:', error);
      throw error;
    }
  }

  /**
   * Process authentication based on type
   */
  private async processAuthentication(authConfig: AuthConfig): Promise<AuthenticationResult> {
    switch (authConfig.type) {
      case 'basic':
        return this.processBasicAuth(authConfig);
      
      case 'bearer':
        return this.processBearerToken(authConfig);
      
      case 'apikey':
        return this.processApiKey(authConfig);
      
      case 'oauth2':
        return this.processOAuth2(authConfig);
      
      default:
        throw new ValidationError(`Unsupported authentication type: ${authConfig.type}`);
    }
  }

  /**
   * Process Basic Authentication
   */
  private processBasicAuth(authConfig: AuthConfig): AuthenticationResult {
    if (!authConfig.credentials) {
      throw new ValidationError('Basic auth credentials are required');
    }

    const credentials = BasicAuthCredentialsSchema.parse(authConfig.credentials);
    
    // Encode credentials
    const encoded = Buffer.from(
      `${credentials.username}:${credentials.password}`
    ).toString('base64');

    return {
      headers: {
        'Authorization': `Basic ${encoded}`,
      },
      isValid: true,
    };
  }

  /**
   * Process Bearer Token Authentication
   */
  private processBearerToken(authConfig: AuthConfig): AuthenticationResult {
    if (!authConfig.credentials) {
      throw new ValidationError('Bearer token credentials are required');
    }

    const credentials = BearerTokenCredentialsSchema.parse(authConfig.credentials);

    return {
      headers: {
        'Authorization': `Bearer ${credentials.token}`,
      },
      isValid: true,
    };
  }

  /**
   * Process API Key Authentication
   */
  private processApiKey(authConfig: AuthConfig): AuthenticationResult {
    if (!authConfig.credentials) {
      throw new ValidationError('API key credentials are required');
    }

    const credentials = ApiKeyCredentialsSchema.parse(authConfig.credentials);
    const result: AuthenticationResult = {
      headers: {},
      isValid: true,
    };

    switch (credentials.location) {
      case 'header':
        result.headers[credentials.key] = credentials.value;
        break;
      
      case 'query':
        result.queryParams = {
          [credentials.key]: credentials.value,
        };
        break;
      
      case 'body':
        result.body = {
          [credentials.key]: credentials.value,
        };
        break;
    }

    return result;
  }

  /**
   * Process OAuth2 Authentication
   */
  private processOAuth2(authConfig: AuthConfig): AuthenticationResult {
    if (!authConfig.credentials) {
      throw new ValidationError('OAuth2 credentials are required');
    }

    const credentials = OAuth2CredentialsSchema.parse(authConfig.credentials);
    const warnings: string[] = [];

    // Check token expiration
    if (credentials.expiresAt && credentials.expiresAt <= new Date()) {
      warnings.push('Access token has expired');
      
      if (!credentials.refreshToken) {
        throw new ValidationError('Access token expired and no refresh token available');
      }
      
      warnings.push('Token refresh required but not implemented in this version');
    }

    const tokenType = credentials.tokenType || 'Bearer';

    return {
      headers: {
        'Authorization': `${tokenType} ${credentials.accessToken}`,
      },
      isValid: true,
      expiresAt: credentials.expiresAt,
      warnings,
    };
  }

  /**
   * Validate authentication configuration
   */
  validateAuthConfig(authConfig: AuthConfig): boolean {
    try {
      if (!authConfig || authConfig.type === 'none') {
        return true;
      }

      switch (authConfig.type) {
        case 'basic':
          BasicAuthCredentialsSchema.parse(authConfig.credentials);
          break;
        
        case 'bearer':
          BearerTokenCredentialsSchema.parse(authConfig.credentials);
          break;
        
        case 'apikey':
          ApiKeyCredentialsSchema.parse(authConfig.credentials);
          break;
        
        case 'oauth2':
          OAuth2CredentialsSchema.parse(authConfig.credentials);
          break;
        
        default:
          return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if authentication needs refresh
   */
  needsRefresh(authConfig: AuthConfig): boolean {
    if (authConfig.type !== 'oauth2' || !authConfig.credentials) {
      return false;
    }

    try {
      const credentials = OAuth2CredentialsSchema.parse(authConfig.credentials);
      
      if (!credentials.expiresAt) {
        return false;
      }

      // Consider refresh needed if token expires within 5 minutes
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
      return credentials.expiresAt <= fiveMinutesFromNow;
    } catch {
      return false;
    }
  }

  /**
   * Extract authentication info from headers
   */
  extractAuthFromHeaders(headers: Record<string, string>): {
    type: string;
    value: string;
  } | null {
    const authHeader = headers['Authorization'] || headers['authorization'];
    
    if (!authHeader) {
      return null;
    }

    // Parse Bearer token
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    if (bearerMatch && bearerMatch[1]) {
      return { type: 'bearer', value: bearerMatch[1] };
    }

    // Parse Basic auth
    const basicMatch = authHeader.match(/^Basic\s+(.+)$/i);
    if (basicMatch && basicMatch[1]) {
      return { type: 'basic', value: basicMatch[1] };
    }

    // Generic token
    return { type: 'unknown', value: authHeader };
  }

  /**
   * Clear authentication cache
   */
  clearCache(): void {
    this.tokenCache.clear();
    this.logger.debug('Authentication cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.tokenCache.size,
      entries: Array.from(this.tokenCache.keys()),
    };
  }
}