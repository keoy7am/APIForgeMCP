/**
 * Authentication Services Module
 * 
 * Provides comprehensive authentication support for HTTP requests
 * including Basic Auth, Bearer Token, API Key, and OAuth2.
 */

export { AuthenticationService } from './authentication.service';
export type { AuthenticationResult } from './authentication.service';

export {
  BasicAuthCredentialsSchema,
  BearerTokenCredentialsSchema,
  ApiKeyCredentialsSchema,
  OAuth2CredentialsSchema,
} from './authentication.service';

// Re-export authentication types from main types
export type {
  AuthConfig,
  AuthenticationType,
  BasicAuthCredentials,
  BearerTokenCredentials,
  ApiKeyCredentials,
  OAuth2Credentials,
} from '../../types';