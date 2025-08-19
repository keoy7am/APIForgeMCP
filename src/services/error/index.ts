// Error Recovery Service
export { ErrorRecoveryService } from './error-recovery.service';
export type { 
  RecoveryStrategy, 
  RecoveryConfig, 
  RecoveryResult,
  RetryStrategy,
  CircuitBreakerState,
  RecoveryPolicy,
  RecoveryStats
} from './error-recovery.service';

// Re-export error utilities for convenience
export {
  ErrorHandler,
  APIForgeError,
  WorkspaceNotFoundError,
  WorkspaceAlreadyExistsError,
  EndpointNotFoundError,
  RequestExecutionError,
  StorageError,
  ValidationError,
  HTTPError,
  RequestTimeoutError,
  RequestBodyError,
  ResponseParsingError,
  AuthenticationError,
  AuthorizationError,
  TokenExpiredError,
  EnvironmentError,
  VariableNotFoundError,
  VariableReplacementError,
  EncryptionError,
  ConfigurationError,
  InvalidConfigurationError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  ErrorCategory,
  ErrorSeverity,
} from '../../utils/errors';

export type {
  MCPErrorResponse,
  ErrorContext,
  EnhancedError,
} from '../../utils/errors';