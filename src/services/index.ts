/**
 * Services module exports
 */

export { WorkspaceManager } from './workspace.service';
export { EndpointRegistry } from './endpoint.service';
export { RequestExecutor } from './request.service';

// Collection management
export { CollectionManager } from './collection.service';

// API import
export { APIImporter } from './api-import.service';

// Import services (OpenAPI/Postman)
export { ImportService } from './import/import.service';
export { OpenAPIImporter } from './import/openapi-importer.service';
export { PostmanImporter } from './import/postman-importer.service';

// Authentication services
export { AuthenticationService } from './auth';

// HTTP processing services
export { RequestBodyProcessor, ResponseParser, ResponseUtils } from './http';

// Environment management services
export { EnvironmentManager, EncryptionService, VariableReplacementService } from './environment';

// Error handling services
export { ErrorHandler, ErrorRecoveryService } from './error';

// History services
export { HistoryService } from './history/history.service';
export { FileHistoryStorage } from './history/history-storage';
export { HistoryAnalyticsService } from './history/history-analytics.service';

// Batch execution services
export { BatchExecutor } from './batch/batch-executor.service';
export {
  SequentialStrategy,
  ParallelStrategy,
  PriorityStrategy,
  BatchStrategyFactory,
} from './batch/batch-strategies';

// Validation services
export { ResponseValidator } from './validation/response-validator.service';
export { ValidationProfileService } from './validation/validation-profile.service';
export {
  AssertionLibrary,
  createAssertions,
  CommonAssertions,
} from './validation/assertion-library';

// Performance optimization services
export { CacheManager } from './performance/cache-manager.service';
export { ConnectionPool } from './performance/connection-pool.service';
export { PerformanceMonitor } from './performance/performance-monitor.service';
export {
  RateLimiter,
  SlidingWindowRateLimiter,
  TokenBucketRateLimiter,
} from './performance/rate-limiter.service';

// Phase 4: Advanced performance services
export { PerformanceDashboard } from './performance/performance-dashboard.service';
export { OptimizationConfigService } from './performance/optimization-config.service';
export { ConfigManager } from './performance/config-manager.service';