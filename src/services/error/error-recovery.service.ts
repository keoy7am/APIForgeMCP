import { Logger } from '../../utils/logger';
import { 
  ErrorHandler, 
  APIForgeError,
  AuthenticationError,
  EncryptionError
} from '../../utils/errors';

/**
 * Recovery strategy type
 */
export type RecoveryStrategy = 
  | 'retry'
  | 'fallback'
  | 'circuit-breaker'
  | 'cache'
  | 'skip'
  | 'manual';

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
  maxAttempts: number;
  baseDelay: number;
  backoffMultiplier: number;
  maxDelay?: number;
  jitter?: boolean;
  retryableErrors?: Array<typeof Error>;
  timeout?: number;
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  successes: number;
  lastFailure?: Date;
  nextAttempt?: Date;
}

/**
 * Recovery policy
 */
export interface RecoveryPolicy {
  retryStrategy?: RetryStrategy;
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeout: number;
    halfOpenMaxAttempts?: number;
  };
  fallback?: {
    value?: any;
    handler?: (error: Error) => Promise<any>;
  };
  errorSpecificPolicies?: Map<typeof Error, RecoveryPolicy>;
}

/**
 * Recovery statistics
 */
export interface RecoveryStats {
  totalAttempts: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  averageRecoveryTime: number;
  errorDistribution: Record<string, number>;
  circuitBreakerActivations: number;
}

/**
 * Recovery configuration
 */
export interface RecoveryConfig {
  strategy: RecoveryStrategy;
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
  fallbackValue?: any;
  customHandler?: (error: Error, attempt: number) => Promise<any>;
}

/**
 * Recovery result
 */
export interface RecoveryResult<T = any> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  strategy: RecoveryStrategy;
  duration: number;
  metadata?: Record<string, any>;
}

/**
 * Error Recovery Service
 * 
 * Provides intelligent error recovery mechanisms including:
 * - Retry logic with exponential backoff
 * - Circuit breaker pattern
 * - Fallback strategies
 * - Error categorization and routing
 */
export class ErrorRecoveryService {
  private logger: Logger;
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private retryStats = new Map<string, { attempts: number; successes: number; failures: number }>();
  private policies = new Map<string, RecoveryPolicy>();
  private recoveryStats: Map<string, RecoveryStats> = new Map();
  private recoveryTimes: number[] = [];
  
  private defaultConfig: RecoveryConfig = {
    strategy: 'retry',
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000,
  };

  constructor(logger?: Logger) {
    this.logger = logger || new Logger('ErrorRecoveryService');
  }

  /**
   * Execute function with retry strategy
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    strategy: RetryStrategy
  ): Promise<T> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let attempts = 0;
    
    while (attempts < strategy.maxAttempts) {
      attempts++;
      
      try {
        this.logger.debug(`Retry attempt ${attempts}/${strategy.maxAttempts}`);
        const result = await operation();
        
        // Record successful recovery
        const duration = Date.now() - startTime;
        this.recordRecoverySuccess('retry', duration);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        this.logger.warn(`Attempt ${attempts} failed`, {
          error: lastError.message,
          remaining: strategy.maxAttempts - attempts,
        });
        
        // Check if error is retryable
        if (strategy.retryableErrors && strategy.retryableErrors.length > 0 && lastError) {
          const isRetryable = strategy.retryableErrors.some(ErrorType => 
            lastError! instanceof ErrorType || (lastError!.constructor && lastError!.constructor === ErrorType)
          );
          
          if (!isRetryable) {
            this.logger.error('Non-retryable error encountered', { error: lastError.message });
            break;
          }
        }
        
        // Check if we should try again
        if (attempts < strategy.maxAttempts) {
          const delay = this.calculateRetryDelay(attempts, strategy);
          this.logger.debug(`Waiting ${delay}ms before retry`);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed
    this.recordRecoveryFailure('retry', Date.now() - startTime, lastError!);
    throw lastError;
  }

  /**
   * Execute function with circuit breaker
   */
  async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    serviceId: string,
    config: { failureThreshold?: number; resetTimeout?: number } = {}
  ): Promise<T> {
    const threshold = config.failureThreshold || 5;
    const resetTimeout = config.resetTimeout || 60000;
    
    // Initialize circuit breaker state if not exists
    if (!this.circuitBreakers.has(serviceId)) {
      this.circuitBreakers.set(serviceId, {
        state: 'closed',
        failures: 0,
        successes: 0,
      });
    }
    
    const breaker = this.circuitBreakers.get(serviceId)!;
    
    // Check if circuit breaker is open
    if (breaker.state === 'open') {
      if (breaker.nextAttempt && Date.now() >= breaker.nextAttempt.getTime()) {
        // Transition to half-open
        breaker.state = 'half-open';
        this.logger.debug(`Circuit breaker transitioning to half-open for ${serviceId}`);
      } else {
        throw new APIForgeError('Circuit breaker is open', 'CIRCUIT_BREAKER_OPEN', 503);
      }
    }
    
    try {
      const result = await operation();
      
      // Success - update circuit breaker
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
        breaker.failures = 0;
        this.logger.info(`Circuit breaker closed for ${serviceId}`);
      }
      
      breaker.successes++;
      return result;
      
    } catch (error) {
      // Failure - update circuit breaker
      breaker.failures++;
      breaker.lastFailure = new Date();
      
      if (breaker.state === 'half-open') {
        // Return to open state
        breaker.state = 'open';
        breaker.nextAttempt = new Date(Date.now() + resetTimeout);
        this.logger.warn(`Circuit breaker reopened for ${serviceId}`);
      } else if (breaker.failures >= threshold) {
        // Open circuit breaker
        breaker.state = 'open';
        breaker.nextAttempt = new Date(Date.now() + resetTimeout);
        this.recordCircuitBreakerActivation(serviceId);
        this.logger.warn(`Circuit breaker opened for ${serviceId}`, {
          failures: breaker.failures,
          threshold,
        });
      }
      
      throw error;
    }
  }

  /**
   * Execute function with policy
   */
  async executeWithPolicy<T>(
    operation: () => Promise<T>,
    policy: RecoveryPolicy
  ): Promise<T> {
    // Try with retry strategy first
    if (policy.retryStrategy) {
      try {
        return await this.executeWithRetry(operation, policy.retryStrategy);
      } catch (error) {
        // Check for error-specific policies
        if (policy.errorSpecificPolicies) {
          for (const [ErrorType, specificPolicy] of policy.errorSpecificPolicies) {
            if (error instanceof ErrorType) {
              return this.executeWithPolicy(operation, specificPolicy);
            }
          }
        }
        
        // Try fallback if available
        if (policy.fallback) {
          if (policy.fallback.handler) {
            return await policy.fallback.handler(error as Error);
          }
          if (policy.fallback.value !== undefined) {
            return policy.fallback.value;
          }
        }
        
        throw error;
      }
    }
    
    // No retry strategy, execute directly
    return operation();
  }

  /**
   * Create retry strategy
   */
  createRetryStrategy(type: 'exponential' | 'linear' | 'fixed', config: Partial<RetryStrategy> = {}): RetryStrategy {
    const baseStrategy: RetryStrategy = {
      maxAttempts: 3,
      baseDelay: 1000,
      backoffMultiplier: 2,
      jitter: false,
      ...config,
    };
    
    switch (type) {
      case 'exponential':
        return {
          ...baseStrategy,
          backoffMultiplier: config.backoffMultiplier || 2,
        };
      case 'linear':
        return {
          ...baseStrategy,
          backoffMultiplier: 1,
        };
      case 'fixed':
        return {
          ...baseStrategy,
          backoffMultiplier: 1,
          maxDelay: config.baseDelay || 1000,
        };
      default:
        return baseStrategy;
    }
  }

  /**
   * Create recovery policy
   */
  createRecoveryPolicy(config: Partial<RecoveryPolicy> = {}): RecoveryPolicy {
    return {
      retryStrategy: {
        maxAttempts: 3,
        baseDelay: 1000,
        backoffMultiplier: 2,
      },
      circuitBreaker: {
        failureThreshold: 5,
        resetTimeout: 60000,
      },
      ...config,
    };
  }

  /**
   * Get recovery statistics
   */
  getRecoveryStats(serviceId?: string): RecoveryStats | Record<string, RecoveryStats> {
    if (serviceId) {
      if (!this.recoveryStats.has(serviceId)) {
        this.recoveryStats.set(serviceId, {
          totalAttempts: 0,
          successfulRecoveries: 0,
          failedRecoveries: 0,
          averageRecoveryTime: 0,
          errorDistribution: {},
          circuitBreakerActivations: 0,
        });
      }
      return this.recoveryStats.get(serviceId)!;
    }
    
    // Aggregate all stats
    const aggregated: RecoveryStats = {
      totalAttempts: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageRecoveryTime: 0,
      errorDistribution: {},
      circuitBreakerActivations: 0,
    };
    
    for (const stats of this.recoveryStats.values()) {
      aggregated.totalAttempts += stats.totalAttempts;
      aggregated.successfulRecoveries += stats.successfulRecoveries;
      aggregated.failedRecoveries += stats.failedRecoveries;
      aggregated.circuitBreakerActivations += stats.circuitBreakerActivations;
      
      for (const [error, count] of Object.entries(stats.errorDistribution)) {
        aggregated.errorDistribution[error] = (aggregated.errorDistribution[error] || 0) + count;
      }
    }
    
    if (this.recoveryTimes.length > 0) {
      aggregated.averageRecoveryTime = 
        this.recoveryTimes.reduce((a, b) => a + b, 0) / this.recoveryTimes.length;
    }
    
    return aggregated;
  }

  /**
   * Get health metrics
   */
  getHealthMetrics(): Record<string, any> {
    const stats = this.getRecoveryStats() as RecoveryStats;
    const health = this.healthCheck();
    
    const circuitBreakerStates: Record<string, any> = {};
    for (const [id, state] of this.circuitBreakers) {
      circuitBreakerStates[id] = {
        state: state.state,
        failures: state.failures,
        successes: state.successes,
        lastFailure: state.lastFailure,
      };
    }
    
    return {
      recovery: stats,
      circuitBreakers: circuitBreakerStates,
      health: health.healthy,
      issues: health.issues,
      timestamp: new Date(),
    };
  }

  /**
   * Reset stats for specific service or all
   */
  resetStats(serviceId?: string): void {
    if (serviceId) {
      this.retryStats.delete(serviceId);
      this.circuitBreakers.delete(serviceId);
      this.recoveryStats.delete(serviceId);
      this.logger.info(`Recovery statistics reset for service: ${serviceId}`);
    } else {
      this.retryStats.clear();
      this.circuitBreakers.clear();
      this.recoveryStats.clear();
      this.recoveryTimes = [];
      this.logger.info('All recovery statistics reset');
    }
  }

  /**
   * Execute function with error recovery (internal method)
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    config: Partial<RecoveryConfig> = {},
    operationId?: string
  ): Promise<RecoveryResult<T>> {
    const finalConfig: RecoveryConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    const id = operationId || this.generateOperationId();
    
    this.logger.debug(`Starting recovery operation: ${id}`, { strategy: finalConfig.strategy });

    // Check circuit breaker
    if (finalConfig.enableCircuitBreaker && this.isCircuitBreakerOpen(id)) {
      const error = new APIForgeError(
        'Circuit breaker is open',
        'CIRCUIT_BREAKER_OPEN',
        503
      );
      
      return {
        success: false,
        error,
        attempts: 0,
        strategy: 'circuit-breaker',
        duration: Date.now() - startTime,
      };
    }

    let lastError: Error | undefined;
    let attempts = 0;
    
    while (attempts < finalConfig.maxAttempts) {
      attempts++;
      
      try {
        this.logger.debug(`Attempt ${attempts}/${finalConfig.maxAttempts} for operation: ${id}`);
        
        const result = await operation();
        
        // Success - reset circuit breaker and record stats
        this.recordSuccess(id);
        this.resetCircuitBreaker(id);
        
        return {
          success: true,
          result,
          attempts,
          strategy: finalConfig.strategy,
          duration: Date.now() - startTime,
        };
        
      } catch (error) {
        lastError = error as Error;
        
        this.logger.warn(`Attempt ${attempts} failed for operation: ${id}`, {
          error: lastError.message,
          strategy: finalConfig.strategy,
        });
        
        // Record failure
        this.recordFailure(id, lastError);
        
        // Check if error is recoverable
        if (!this.isRecoverable(lastError, finalConfig)) {
          this.logger.error(`Non-recoverable error for operation: ${id}`, { error: lastError.message });
          break;
        }
        
        // Check if we should try again
        if (attempts < finalConfig.maxAttempts) {
          const delay = this.calculateDelay(attempts, finalConfig, lastError);
          this.logger.debug(`Waiting ${delay}ms before retry for operation: ${id}`);
          await this.sleep(delay);
        }
      }
    }

    // All retries failed - apply fallback strategy
    const fallbackResult = await this.applyFallbackStrategy(
      lastError!,
      finalConfig,
      id,
      attempts,
      startTime
    );

    return fallbackResult;
  }

  /**
   * Private helper methods
   */
  private calculateRetryDelay(attempt: number, strategy: RetryStrategy): number {
    let delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attempt - 1);
    
    if (strategy.maxDelay) {
      delay = Math.min(delay, strategy.maxDelay);
    }
    
    if (strategy.jitter) {
      const jitter = Math.random() * 0.1 * delay;
      delay += jitter;
    }
    
    return Math.floor(delay);
  }

  private recordRecoverySuccess(strategy: string, duration: number): void {
    const stats = this.getOrCreateStats(strategy);
    stats.totalAttempts++;
    stats.successfulRecoveries++;
    this.recoveryTimes.push(duration);
  }

  private recordRecoveryFailure(strategy: string, duration: number, error: Error): void {
    const stats = this.getOrCreateStats(strategy);
    stats.totalAttempts++;
    stats.failedRecoveries++;
    
    const errorName = error.constructor.name;
    stats.errorDistribution[errorName] = (stats.errorDistribution[errorName] || 0) + 1;
    
    this.recoveryTimes.push(duration);
  }

  private recordCircuitBreakerActivation(serviceId: string): void {
    const stats = this.getOrCreateStats(serviceId);
    stats.circuitBreakerActivations++;
  }

  private getOrCreateStats(id: string): RecoveryStats {
    if (!this.recoveryStats.has(id)) {
      this.recoveryStats.set(id, {
        totalAttempts: 0,
        successfulRecoveries: 0,
        failedRecoveries: 0,
        averageRecoveryTime: 0,
        errorDistribution: {},
        circuitBreakerActivations: 0,
      });
    }
    return this.recoveryStats.get(id)!;
  }

  /**
   * Apply fallback strategy when retries fail
   */
  private async applyFallbackStrategy(
    error: Error,
    config: RecoveryConfig,
    operationId: string,
    attempts: number,
    startTime: number
  ): Promise<RecoveryResult> {
    this.updateCircuitBreaker(operationId, error);
    
    // Try custom handler first
    if (config.customHandler) {
      try {
        this.logger.debug(`Applying custom fallback handler for operation: ${operationId}`);
        const result = await config.customHandler(error, attempts);
        
        return {
          success: true,
          result,
          attempts,
          strategy: 'fallback',
          duration: Date.now() - startTime,
          metadata: { fallbackType: 'custom' },
        };
      } catch (handlerError) {
        this.logger.warn(`Custom fallback handler failed for operation: ${operationId}`, {
          error: (handlerError as Error).message,
        });
      }
    }
    
    // Apply default fallback value
    if (config.fallbackValue !== undefined) {
      this.logger.debug(`Applying default fallback value for operation: ${operationId}`);
      
      return {
        success: true,
        result: config.fallbackValue,
        attempts,
        strategy: 'fallback',
        duration: Date.now() - startTime,
        metadata: { fallbackType: 'default' },
      };
    }
    
    // No fallback available - return failure
    return {
      success: false,
      error,
      attempts,
      strategy: config.strategy,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Check if error is recoverable
   */
  private isRecoverable(error: Error, config: any): boolean {
    // Always respect explicit configuration
    if (config.strategy === 'skip') return false;
    if (config.strategy === 'manual') return false;
    
    // Use ErrorHandler's built-in logic
    if (!ErrorHandler.isRecoverable(error)) {
      return false;
    }
    
    // Additional recovery logic for specific error types
    if (error instanceof AuthenticationError && error.isExpired) {
      return false; // Expired tokens need manual intervention
    }
    
    if (error instanceof EncryptionError) {
      return false; // Encryption errors usually need manual intervention
    }
    
    return true;
  }

  /**
   * Calculate delay for next retry
   */
  private calculateDelay(attempt: number, config: RecoveryConfig, error: Error): number {
    let delay = ErrorHandler.getRetryDelay(error, attempt);
    
    // Apply configured backoff if not using error-specific delay
    if (delay === 1000) { // Default delay
      delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );
    }
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return Math.floor(delay + jitter);
  }

  /**
   * Circuit breaker methods
   */
  private isCircuitBreakerOpen(operationId: string): boolean {
    const state = this.circuitBreakers.get(operationId);
    if (!state) return false;
    
    const now = new Date();
    
    if (state.state === 'open') {
      if (state.nextAttempt && now >= state.nextAttempt) {
        state.state = 'half-open';
        this.logger.debug(`Circuit breaker transitioning to half-open: ${operationId}`);
        return false;
      }
      return true;
    }
    
    return false;
  }

  private updateCircuitBreaker(operationId: string, _error: Error): void {
    if (!this.circuitBreakers.has(operationId)) {
      this.circuitBreakers.set(operationId, {
        state: 'closed',
        failures: 0,
        successes: 0,
        lastFailure: new Date(),
        nextAttempt: new Date(),
      });
    }
    
    const state = this.circuitBreakers.get(operationId)!;
    state.failures++;
    state.lastFailure = new Date();
    
    if (state.failures >= this.defaultConfig.circuitBreakerThreshold) {
      state.state = 'open';
      state.nextAttempt = new Date(Date.now() + this.defaultConfig.circuitBreakerTimeout);
      
      this.logger.warn(`Circuit breaker opened for operation: ${operationId}`, {
        failures: state.failures,
        threshold: this.defaultConfig.circuitBreakerThreshold,
      });
    }
  }

  private resetCircuitBreaker(operationId: string): void {
    const state = this.circuitBreakers.get(operationId);
    if (state) {
      state.failures = 0;
      state.state = 'closed';
      
      this.logger.debug(`Circuit breaker reset for operation: ${operationId}`);
    }
  }

  /**
   * Statistics tracking
   */
  private recordSuccess(operationId: string): void {
    if (!this.retryStats.has(operationId)) {
      this.retryStats.set(operationId, { attempts: 0, successes: 0, failures: 0 });
    }
    
    const stats = this.retryStats.get(operationId)!;
    stats.successes++;
    stats.attempts++;
  }

  private recordFailure(operationId: string, _error: Error): void {
    if (!this.retryStats.has(operationId)) {
      this.retryStats.set(operationId, { attempts: 0, successes: 0, failures: 0 });
    }
    
    const stats = this.retryStats.get(operationId)!;
    stats.failures++;
    stats.attempts++;
  }

  /**
   * Health check for error recovery service
   */
  public healthCheck(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check for too many open circuit breakers
    const openCircuits = Array.from(this.circuitBreakers.values())
      .filter(state => state.state === 'open').length;
    
    if (openCircuits > 5) {
      issues.push(`Too many open circuit breakers: ${openCircuits}`);
    }
    
    // Check failure rates
    const highFailureOperations = Array.from(this.retryStats.entries())
      .filter(([_, stats]) => {
        const failureRate = stats.failures / stats.attempts;
        return stats.attempts > 10 && failureRate > 0.5;
      });
    
    if (highFailureOperations.length > 0) {
      issues.push(`High failure rate operations: ${highFailureOperations.map(([id]) => id).join(', ')}`);
    }
    
    return {
      healthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Utility methods
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create recovery config for specific error types
   */
  static createConfigForErrorType(errorType: string): Partial<RecoveryConfig> {
    switch (errorType) {
      case 'HTTP_ERROR':
        return {
          strategy: 'retry',
          maxAttempts: 3,
          baseDelay: 1000,
          backoffMultiplier: 2,
        };
      
      case 'REQUEST_TIMEOUT':
        return {
          strategy: 'retry',
          maxAttempts: 2,
          baseDelay: 2000,
          backoffMultiplier: 1.5,
        };
      
      case 'RATE_LIMIT_EXCEEDED':
        return {
          strategy: 'retry',
          maxAttempts: 3,
          baseDelay: 5000,
          backoffMultiplier: 2,
        };
      
      case 'AUTHENTICATION_ERROR':
        return {
          strategy: 'manual',
          maxAttempts: 1,
        };
      
      case 'VALIDATION_ERROR':
        return {
          strategy: 'skip',
          maxAttempts: 1,
        };
      
      default:
        return {
          strategy: 'retry',
          maxAttempts: 2,
          baseDelay: 1000,
        };
    }
  }
  
  /**
   * Get the circuit breaker state for a service
   */
  getCircuitBreakerState(serviceId: string): CircuitBreakerState {
    if (!this.circuitBreakers.has(serviceId)) {
      this.circuitBreakers.set(serviceId, {
        state: 'closed',
        failures: 0,
        successes: 0,
      });
    }
    return this.circuitBreakers.get(serviceId)!;
  }
  
  /**
   * Open the circuit breaker for a service
   */
  openCircuitBreaker(serviceId: string): void {
    const breaker = this.getCircuitBreakerState(serviceId);
    breaker.state = 'open';
    breaker.lastFailure = new Date();
    breaker.nextAttempt = new Date(Date.now() + 60000); // Default 60s reset timeout
    this.logger.warn(`Circuit breaker opened for ${serviceId}`);
  }
  
  /**
   * Set the circuit breaker state for a service
   */
  setCircuitBreakerState(serviceId: string, state: 'closed' | 'open' | 'half-open'): void {
    const breaker = this.getCircuitBreakerState(serviceId);
    breaker.state = state;
    if (state === 'closed') {
      breaker.failures = 0;
      breaker.successes = 0;
      delete breaker.lastFailure;
      delete breaker.nextAttempt;
    }
    this.logger.debug(`Circuit breaker state set to ${state} for ${serviceId}`);
  }
}