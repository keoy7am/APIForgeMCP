/**
 * Environment Services Module
 * 
 * Provides comprehensive environment variable management including:
 * - Variable storage and retrieval with encryption support
 * - Variable replacement with {{variable}} syntax
 * - Multiple scopes (global, workspace, environment)
 * - Type validation and conversion
 */

export { EnvironmentManager, EnvironmentVariableSchema, EnvironmentConfigSchema } from './environment-manager.service';
export { EncryptionService } from './encryption.service';
export { VariableReplacementService } from './variable-replacement.service';

// Re-export environment types for convenience
export type {
  EnvironmentVariable,
  EnvironmentVariableType,
  EnvironmentConfig,
  VariableReplacementOptions,
  VariableReplacementResult,
  VariableReplacement,
} from '../../types';