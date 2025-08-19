/**
 * Tests for ErrorRecoveryService
 */

import { jest } from '@jest/globals';
import { ErrorRecoveryService } from '../../../src/services/error/error-recovery.service';
import { TestDataFactory, TestAssertions } from '../../utils/test-utils';
import { 
  NetworkError,
  TimeoutError,
  RateLimitError,
  AuthenticationError,
  RetryStrategy,
  CircuitBreakerState,
  RecoveryPolicy,
  RecoveryStats
} from '../../../src/services/error';

describe('ErrorRecoveryService', () => {
  let recoveryService: ErrorRecoveryService;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    
    recoveryService = new ErrorRecoveryService(mockLogger);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Retry Strategies', () => {
    describe('executeWithRetry', () => {
      it('should retry failed operations with exponential backoff', async () => {
        let attempts = 0;
        const failingOperation = jest.fn().mockImplementation(() => {
          attempts++;
          if (attempts < 3) {
            throw new NetworkError('Connection failed');
          }
          return 'success';
        });

        const strategy: RetryStrategy = {
          maxAttempts: 3,
          baseDelay: 100,
          backoffMultiplier: 2,
          jitter: false,
          retryableErrors: [NetworkError],
        };

        const promise = recoveryService.executeWithRetry(failingOperation, strategy);
        
        // Advance timers to trigger retries
        jest.advanceTimersByTime(100); // First retry after 100ms
        await Promise.resolve(); // Allow microtasks to run
        
        jest.advanceTimersByTime(200); // Second retry after 200ms
        await Promise.resolve();

        const result = await promise;

        expect(result).toBe('success');
        expect(failingOperation).toHaveBeenCalledTimes(3);
        expect(attempts).toBe(3);
      });

      it('should respect maximum retry attempts', async () => {
        const alwaysFailingOperation = jest.fn().mockImplementation(() => {
          throw new NetworkError('Always fails');
        });

        const strategy: RetryStrategy = {
          maxAttempts: 2,
          baseDelay: 10,
          backoffMultiplier: 1,
          retryableErrors: [NetworkError],
        };

        const promise = recoveryService.executeWithRetry(alwaysFailingOperation, strategy);
        
        jest.advanceTimersByTime(10);
        await Promise.resolve();

        await TestAssertions.expectRejectsWithError(
          promise,
          NetworkError,
          'Always fails'
        );

        expect(alwaysFailingOperation).toHaveBeenCalledTimes(2);
      });

      it('should apply jitter to retry delays', async () => {
        let attempts = 0;
        const failingOperation = jest.fn().mockImplementation(() => {
          attempts++;
          if (attempts < 3) {
            throw new NetworkError('Connection failed');
          }
          return 'success';
        });

        const strategy: RetryStrategy = {
          maxAttempts: 3,
          baseDelay: 100,
          backoffMultiplier: 2,
          jitter: true,
          jitterFactor: 0.5,
          retryableErrors: [NetworkError],
        };

        const startTime = Date.now();
        const promise = recoveryService.executeWithRetry(failingOperation, strategy);
        
        jest.advanceTimersByTime(150); // Should be somewhere between 50-150ms with jitter
        await Promise.resolve();
        
        jest.advanceTimersByTime(300); // Second retry with jitter
        await Promise.resolve();

        const result = await promise;
        expect(result).toBe('success');
      });

      it('should not retry non-retryable errors', async () => {
        const operation = jest.fn().mockImplementation(() => {
          throw new AuthenticationError('Invalid credentials');
        });

        const strategy: RetryStrategy = {
          maxAttempts: 3,
          baseDelay: 10,
          retryableErrors: [NetworkError, TimeoutError], // Auth errors not retryable
        };

        await TestAssertions.expectRejectsWithError(
          recoveryService.executeWithRetry(operation, strategy),
          AuthenticationError,
          'Invalid credentials'
        );

        expect(operation).toHaveBeenCalledTimes(1); // No retries
      });

      it('should respect timeout limits', async () => {
        jest.useFakeTimers();
        
        const slowOperation = jest.fn().mockImplementation(() => {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve('success'), 1000);
            // Simulate timeout by rejecting after timeout period
            setTimeout(() => reject(new TimeoutError('Operation timeout')), 500);
          });
        });

        const strategy: RetryStrategy = {
          maxAttempts: 3,
          baseDelay: 10,
          timeout: 500, // 500ms timeout
          retryableErrors: [TimeoutError],
        };

        const promise = recoveryService.executeWithRetry(slowOperation, strategy);
        
        // Fast-forward time to trigger timeout
        jest.advanceTimersByTime(500);
        await Promise.resolve(); // Allow microtasks to run
        
        await TestAssertions.expectRejectsWithError(
          promise,
          TimeoutError,
          'Operation timeout'
        );
        
        jest.useRealTimers();
      }, 10000);

      it('should handle custom retry conditions', async () => {
        let attempts = 0;
        const operation = jest.fn().mockImplementation(() => {
          attempts++;
          throw new Error(`Attempt ${attempts}`);
        });

        const strategy: RetryStrategy = {
          maxAttempts: 3,
          baseDelay: 10,
          retryCondition: (error: Error) => error.message.includes('Attempt'),
        };

        const promise = recoveryService.executeWithRetry(operation, strategy);
        
        jest.advanceTimersByTime(10);
        await Promise.resolve();
        
        jest.advanceTimersByTime(10);
        await Promise.resolve();

        await TestAssertions.expectRejectsWithError(
          promise,
          Error,
          'Attempt 3'
        );

        expect(operation).toHaveBeenCalledTimes(3);
      });

      it('should track retry statistics', async () => {
        let attempts = 0;
        const operation = jest.fn().mockImplementation(() => {
          attempts++;
          if (attempts < 2) {
            throw new NetworkError('Connection failed');
          }
          return 'success';
        });

        const strategy: RetryStrategy = {
          maxAttempts: 3,
          baseDelay: 10,
          retryableErrors: [NetworkError],
        };

        const promise = recoveryService.executeWithRetry(operation, strategy, {
          operationId: 'test-operation',
        });
        
        jest.advanceTimersByTime(10);
        await Promise.resolve();

        await promise;

        const stats = recoveryService.getRecoveryStats('test-operation') as RecoveryStats;
        expect(stats).toMatchObject({
          totalAttempts: expect.any(Number),
          successfulRecoveries: expect.any(Number),
          failedRecoveries: expect.any(Number),
          averageRecoveryTime: expect.any(Number),
        });
      });
    });

    describe('createRetryStrategy', () => {
      it('should create exponential backoff strategy', () => {
        const strategy = recoveryService.createRetryStrategy('exponential', {
          maxAttempts: 5,
          baseDelay: 1000,
          maxDelay: 10000,
        });

        expect(strategy).toMatchObject({
          maxAttempts: 5,
          baseDelay: 1000,
          backoffMultiplier: 2,
          maxDelay: 10000,
          jitter: true,
        });
      });

      it('should create linear backoff strategy', () => {
        const strategy = recoveryService.createRetryStrategy('linear', {
          maxAttempts: 3,
          baseDelay: 500,
        });

        expect(strategy).toMatchObject({
          maxAttempts: 3,
          baseDelay: 500,
          backoffMultiplier: 1,
          jitter: false,
        });
      });

      it('should create fixed delay strategy', () => {
        const strategy = recoveryService.createRetryStrategy('fixed', {
          maxAttempts: 4,
          baseDelay: 200,
        });

        expect(strategy).toMatchObject({
          maxAttempts: 4,
          baseDelay: 200,
          backoffMultiplier: 1,
          jitter: false,
        });
      });

      it('should include error-specific configurations', () => {
        const strategy = recoveryService.createRetryStrategy('exponential', {
          maxAttempts: 3,
          retryableErrors: [NetworkError, TimeoutError],
          retryCondition: (error) => !error.message.includes('permanent'),
        });

        expect(strategy.retryableErrors).toEqual([NetworkError, TimeoutError]);
        expect(strategy.retryCondition).toBeDefined();
      });
    });
  });

  describe('Circuit Breaker', () => {
    describe('executeWithCircuitBreaker', () => {
      it('should track failures and open circuit breaker', async () => {
        const failingOperation = jest.fn().mockImplementation(() => {
          throw new NetworkError('Service unavailable');
        });

        const serviceName = 'test-service';
        const config = {
          failureThreshold: 3,
          timeoutThreshold: 1000,
          resetTimeout: 5000,
        };

        // Execute failing operations to trigger circuit breaker
        for (let i = 0; i < 3; i++) {
          try {
            await recoveryService.executeWithCircuitBreaker(
              failingOperation, 
              serviceName, 
              config
            );
          } catch (error) {
            // Expected to fail
          }
        }

        const circuitState = recoveryService.getCircuitBreakerState(serviceName);
        expect(circuitState.state).toBe('open');
        expect(circuitState.failures).toBe(3);
        expect(circuitState.lastFailure).toBeInstanceOf(Date);
      });

      it('should reject requests when circuit breaker is open', async () => {
        const operation = jest.fn().mockResolvedValue('success');
        const serviceName = 'test-service';

        // Manually set circuit breaker to open state
        recoveryService.openCircuitBreaker(serviceName);

        await TestAssertions.expectRejectsWithError(
          recoveryService.executeWithCircuitBreaker(operation, serviceName),
          Error,
          'Circuit breaker is open'
        );

        expect(operation).not.toHaveBeenCalled();
      });

      it('should transition to half-open state after reset timeout', async () => {
        const serviceName = 'test-service';
        const config = {
          failureThreshold: 2,
          resetTimeout: 1000,
        };

        // Trigger circuit breaker
        const failingOperation = jest.fn().mockRejectedValue(new Error('Failure'));
        
        for (let i = 0; i < 2; i++) {
          try {
            await recoveryService.executeWithCircuitBreaker(
              failingOperation, 
              serviceName, 
              config
            );
          } catch (error) {
            // Expected
          }
        }

        expect(recoveryService.getCircuitBreakerState(serviceName).state).toBe('open');

        // Advance time past reset timeout
        jest.advanceTimersByTime(1000);

        const state = recoveryService.getCircuitBreakerState(serviceName);
        expect(state.state).toBe('half-open');
      });

      it('should close circuit breaker on successful operation in half-open state', async () => {
        const serviceName = 'test-service';
        const successfulOperation = jest.fn().mockResolvedValue('success');

        // Set to half-open state
        recoveryService.setCircuitBreakerState(serviceName, 'half-open');

        const result = await recoveryService.executeWithCircuitBreaker(
          successfulOperation, 
          serviceName
        );

        expect(result).toBe('success');
        expect(recoveryService.getCircuitBreakerState(serviceName).state).toBe('closed');
      });

      it('should reopen circuit breaker on failure in half-open state', async () => {
        const serviceName = 'test-service';
        const failingOperation = jest.fn().mockRejectedValue(new Error('Still failing'));

        // Set to half-open state
        recoveryService.setCircuitBreakerState(serviceName, 'half-open');

        try {
          await recoveryService.executeWithCircuitBreaker(
            failingOperation, 
            serviceName
          );
        } catch (error) {
          // Expected
        }

        expect(recoveryService.getCircuitBreakerState(serviceName).state).toBe('open');
      });

      it('should reset failure count on successful operations', async () => {
        const serviceName = 'test-service';
        const config = { failureThreshold: 3 };
        
        // Add some failures
        const failingOperation = jest.fn().mockRejectedValue(new Error('Failure'));
        for (let i = 0; i < 2; i++) {
          try {
            await recoveryService.executeWithCircuitBreaker(
              failingOperation, 
              serviceName, 
              config
            );
          } catch (error) {
            // Expected
          }
        }

        expect(recoveryService.getCircuitBreakerState(serviceName).failures).toBe(2);

        // Successful operation should reset count
        const successfulOperation = jest.fn().mockResolvedValue('success');
        await recoveryService.executeWithCircuitBreaker(
          successfulOperation, 
          serviceName, 
          config
        );

        expect(recoveryService.getCircuitBreakerState(serviceName).failures).toBe(0);
      });
    });

    describe('circuit breaker configuration', () => {
      it('should support custom failure thresholds', async () => {
        const serviceName = 'custom-service';
        const config = { failureThreshold: 5 };
        const failingOperation = jest.fn().mockRejectedValue(new Error('Failure'));

        // Should not open until 5 failures
        for (let i = 0; i < 4; i++) {
          try {
            await recoveryService.executeWithCircuitBreaker(
              failingOperation, 
              serviceName, 
              config
            );
          } catch (error) {
            // Expected
          }
        }

        expect(recoveryService.getCircuitBreakerState(serviceName).state).toBe('closed');

        // 5th failure should open it
        try {
          await recoveryService.executeWithCircuitBreaker(
            failingOperation, 
            serviceName, 
            config
          );
        } catch (error) {
          // Expected
        }

        expect(recoveryService.getCircuitBreakerState(serviceName).state).toBe('open');
      });

      it('should support timeout-based circuit breaking', async () => {
        jest.useFakeTimers();
        
        const serviceName = 'timeout-service';
        const config = { 
          failureThreshold: 10, // High threshold
          timeoutThreshold: 100, // 100ms timeout
        };

        const slowOperation = jest.fn().mockImplementation(() => {
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve('success'), 200); // 200ms operation
            setTimeout(() => reject(new TimeoutError('Operation timeout')), 100); // Timeout at 100ms
          });
        });

        const promise = recoveryService.executeWithCircuitBreaker(
          slowOperation, 
          serviceName, 
          config
        );
        
        jest.advanceTimersByTime(100);
        await Promise.resolve();
        
        try {
          await promise;
        } catch (error) {
          // Expected timeout
        }

        const state = recoveryService.getCircuitBreakerState(serviceName);
        expect(state.failures).toBe(1);
        
        jest.useRealTimers();
      }, 10000);
    });
  });

  describe('Recovery Policies', () => {
    describe('createRecoveryPolicy', () => {
      it('should create comprehensive recovery policy', () => {
        const policy = recoveryService.createRecoveryPolicy({
          retryStrategy: 'exponential',
          retryConfig: {
            maxAttempts: 3,
            baseDelay: 1000,
          },
          circuitBreakerConfig: {
            failureThreshold: 5,
            resetTimeout: 30000,
          },
          fallbackStrategy: 'cache',
          timeoutMs: 10000,
        });

        expect(policy).toMatchObject({
          retryStrategy: expect.objectContaining({
            maxAttempts: 3,
            baseDelay: 1000,
          }),
          circuitBreakerConfig: expect.objectContaining({
            failureThreshold: 5,
            resetTimeout: 30000,
          }),
          fallbackStrategy: 'cache',
          timeoutMs: 10000,
        });
      });

      it('should support error-specific policies', () => {
        const policy = recoveryService.createRecoveryPolicy({
          errorPolicies: {
            [NetworkError.name]: {
              retryStrategy: 'exponential',
              retryConfig: { maxAttempts: 5 },
            },
            [RateLimitError.name]: {
              retryStrategy: 'fixed',
              retryConfig: { maxAttempts: 3, baseDelay: 5000 },
            },
          },
        });

        expect(policy.errorPolicies).toBeDefined();
        expect(policy.errorPolicies[NetworkError.name]).toMatchObject({
          retryStrategy: 'exponential',
          retryConfig: { maxAttempts: 5 },
        });
      });
    });

    describe('executeWithPolicy', () => {
      it('should apply recovery policy to operations', async () => {
        let attempts = 0;
        const operation = jest.fn().mockImplementation(() => {
          attempts++;
          if (attempts < 3) {
            throw new NetworkError('Connection failed');
          }
          return 'success';
        });

        const policy: RecoveryPolicy = {
          retryStrategy: recoveryService.createRetryStrategy('exponential', {
            maxAttempts: 3,
            baseDelay: 10,
            retryableErrors: [NetworkError],
          }),
          circuitBreakerConfig: {
            failureThreshold: 5,
          },
          timeoutMs: 5000,
        };

        const promise = recoveryService.executeWithPolicy(
          operation, 
          'test-service', 
          policy
        );
        
        jest.advanceTimersByTime(10);
        await Promise.resolve();
        
        jest.advanceTimersByTime(20);
        await Promise.resolve();

        const result = await promise;
        expect(result).toBe('success');
        expect(operation).toHaveBeenCalledTimes(3);
      });

      it('should apply error-specific policies', async () => {
        const rateLimitOperation = jest.fn().mockImplementation(() => {
          throw new RateLimitError('Rate limit exceeded');
        });

        const policy: RecoveryPolicy = {
          retryStrategy: recoveryService.createRetryStrategy('exponential', {
            maxAttempts: 2,
            baseDelay: 10,
          }),
          errorPolicies: {
            [RateLimitError.name]: {
              retryStrategy: 'fixed',
              retryConfig: {
                maxAttempts: 3,
                baseDelay: 1000,
              },
            },
          },
        };

        const promise = recoveryService.executeWithPolicy(
          rateLimitOperation, 
          'rate-limited-service', 
          policy
        );
        
        jest.advanceTimersByTime(1000);
        await Promise.resolve();
        
        jest.advanceTimersByTime(1000);
        await Promise.resolve();

        await TestAssertions.expectRejectsWithError(
          promise,
          RateLimitError,
          'Rate limit exceeded'
        );

        expect(rateLimitOperation).toHaveBeenCalledTimes(3); // Uses rate limit specific policy
      });

      it('should implement fallback strategies', async () => {
        const failingOperation = jest.fn().mockRejectedValue(new Error('Always fails'));
        const fallbackFunction = jest.fn().mockResolvedValue('fallback result');

        const policy: RecoveryPolicy = {
          retryStrategy: recoveryService.createRetryStrategy('fixed', {
            maxAttempts: 2,
            baseDelay: 10,
          }),
          fallbackStrategy: 'function',
          fallbackFunction,
        };

        const promise = recoveryService.executeWithPolicy(
          failingOperation, 
          'failing-service', 
          policy
        );
        
        jest.advanceTimersByTime(10);
        await Promise.resolve();

        const result = await promise;
        expect(result).toBe('fallback result');
        expect(fallbackFunction).toHaveBeenCalled();
      });
    });
  });

  describe('Recovery Statistics and Monitoring', () => {
    describe('getRecoveryStats', () => {
      it('should track comprehensive recovery statistics', async () => {
        jest.useFakeTimers();
        const serviceName = 'monitored-service';
        
        // Execute various operations to generate stats
        let attempts = 0;
        const operation = jest.fn().mockImplementation(() => {
          attempts++;
          if (attempts % 3 === 0) {
            return 'success';
          }
          throw new NetworkError('Intermittent failure');
        });

        const strategy = recoveryService.createRetryStrategy('exponential', {
          maxAttempts: 3,
          baseDelay: 10,
          retryableErrors: [NetworkError],
        });

        // Execute multiple operations
        for (let i = 0; i < 5; i++) {
          try {
            const promise = recoveryService.executeWithRetry(operation, strategy, {
              operationId: `${serviceName}-op-${i}`,
            });
            
            jest.advanceTimersByTime(50);
            await Promise.resolve();
            
            await promise;
          } catch (error) {
            // Some operations will fail
          }
        }

        const stats = recoveryService.getRecoveryStats(serviceName) as RecoveryStats;
        expect(stats).toMatchObject({
          totalAttempts: expect.any(Number),
          successfulRecoveries: expect.any(Number),
          failedRecoveries: expect.any(Number),
          averageRecoveryTime: expect.any(Number),
          errorDistribution: expect.any(Object),
          circuitBreakerActivations: expect.any(Number),
        });
        
        jest.useRealTimers();
      }, 10000);

      it('should track circuit breaker statistics', async () => {
        const serviceName = 'circuit-breaker-service';
        const failingOperation = jest.fn().mockRejectedValue(new Error('Service down'));

        // Trigger circuit breaker
        for (let i = 0; i < 3; i++) {
          try {
            await recoveryService.executeWithCircuitBreaker(
              failingOperation, 
              serviceName,
              { failureThreshold: 3 }
            );
          } catch (error) {
            // Expected
          }
        }

        const stats = recoveryService.getRecoveryStats(serviceName);
        expect(stats.circuitBreakerTrips).toBe(1);
        expect(stats.circuitBreakerState).toBe('open');
      });

      it('should provide performance metrics', async () => {
        const serviceName = 'performance-service';
        const operation = jest.fn().mockImplementation(() => {
          // Simulate operation duration
          return new Promise(resolve => {
            setTimeout(() => resolve('success'), 50);
          });
        });

        const promise = recoveryService.executeWithCircuitBreaker(operation, serviceName);
        jest.advanceTimersByTime(50);
        await promise;

        const stats = recoveryService.getRecoveryStats(serviceName);
        expect(stats).toMatchObject({
          averageOperationDuration: expect.any(Number),
          fastestOperation: expect.any(Number),
          slowestOperation: expect.any(Number),
        });
      });
    });

    describe('resetStats', () => {
      it('should reset statistics for a service', async () => {
        const serviceName = 'reset-service';
        const operation = jest.fn().mockResolvedValue('success');

        await recoveryService.executeWithCircuitBreaker(operation, serviceName);
        
        let stats = recoveryService.getRecoveryStats(serviceName);
        expect(stats.totalOperations).toBe(1);

        recoveryService.resetStats(serviceName);
        
        stats = recoveryService.getRecoveryStats(serviceName);
        expect(stats.totalOperations).toBe(0);
      });

      it('should reset all statistics when no service specified', async () => {
        const services = ['service1', 'service2', 'service3'];
        const operation = jest.fn().mockResolvedValue('success');

        // Execute operations on multiple services
        for (const service of services) {
          await recoveryService.executeWithCircuitBreaker(operation, service);
        }

        recoveryService.resetStats();

        // All services should have reset stats
        for (const service of services) {
          const stats = recoveryService.getRecoveryStats(service);
          expect(stats.totalOperations).toBe(0);
        }
      });
    });

    describe('getHealthMetrics', () => {
      it('should provide health metrics across all services', async () => {
        const services = ['healthy-service', 'unhealthy-service'];
        const healthyOp = jest.fn().mockResolvedValue('success');
        const unhealthyOp = jest.fn().mockRejectedValue(new Error('Failure'));

        // Healthy service
        await recoveryService.executeWithCircuitBreaker(healthyOp, services[0]);

        // Unhealthy service - trigger circuit breaker
        for (let i = 0; i < 3; i++) {
          try {
            await recoveryService.executeWithCircuitBreaker(
              unhealthyOp, 
              services[1],
              { failureThreshold: 3 }
            );
          } catch (error) {
            // Expected
          }
        }

        const healthMetrics = recoveryService.getHealthMetrics();
        expect(healthMetrics).toMatchObject({
          totalServices: 2,
          healthyServices: 1,
          unhealthyServices: 1,
          circuitBreakersOpen: 1,
          overallHealth: expect.any(Number),
          services: expect.arrayContaining([
            expect.objectContaining({
              name: 'healthy-service',
              health: 'healthy',
            }),
            expect.objectContaining({
              name: 'unhealthy-service',
              health: 'unhealthy',
            }),
          ]),
        });
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complex recovery workflow', async () => {
      const serviceName = 'complex-service';
      let operationCount = 0;
      
      const complexOperation = jest.fn().mockImplementation(() => {
        operationCount++;
        
        // Simulate different failure patterns
        if (operationCount <= 2) {
          throw new NetworkError('Connection timeout');
        } else if (operationCount === 3) {
          throw new RateLimitError('Rate limit exceeded');
        } else if (operationCount <= 5) {
          throw new TimeoutError('Operation timeout');
        }
        
        return 'final success';
      });

      const policy: RecoveryPolicy = {
        retryStrategy: recoveryService.createRetryStrategy('exponential', {
          maxAttempts: 3,
          baseDelay: 10,
          retryableErrors: [NetworkError, TimeoutError],
        }),
        circuitBreakerConfig: {
          failureThreshold: 10, // High threshold to avoid tripping
        },
        errorPolicies: {
          [RateLimitError.name]: {
            retryStrategy: 'fixed',
            retryConfig: {
              maxAttempts: 2,
              baseDelay: 100,
            },
          },
        },
        timeoutMs: 5000,
      };

      // First attempt - should retry NetworkError
      try {
        const promise1 = recoveryService.executeWithPolicy(
          complexOperation, 
          serviceName, 
          policy
        );
        
        jest.advanceTimersByTime(50);
        await Promise.resolve();
        
        await promise1;
      } catch (error) {
        expect(error).toBeInstanceOf(NetworkError);
      }

      // Second attempt - should handle RateLimitError with specific policy
      try {
        const promise2 = recoveryService.executeWithPolicy(
          complexOperation, 
          serviceName, 
          policy
        );
        
        jest.advanceTimersByTime(100);
        await Promise.resolve();
        
        await promise2;
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
      }

      // Third attempt - should eventually succeed after retrying TimeoutError
      const promise3 = recoveryService.executeWithPolicy(
        complexOperation, 
        serviceName, 
        policy
      );
      
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      
      const finalResult = await promise3;
      expect(finalResult).toBe('final success');

      // Verify comprehensive statistics
      const stats = recoveryService.getRecoveryStats(serviceName);
      expect(stats).toMatchObject({
        totalOperations: 3,
        successfulOperations: 1,
        failedOperations: 2,
        totalRetries: expect.any(Number),
        circuitBreakerState: 'closed',
      });
    });

    it('should coordinate multiple services with different policies', async () => {
      const services = [
        { name: 'critical-service', policy: 'aggressive' },
        { name: 'best-effort-service', policy: 'conservative' },
        { name: 'background-service', policy: 'minimal' },
      ];

      const operations = services.map(service => {
        return jest.fn().mockImplementation(() => {
          if (Math.random() < 0.3) { // 30% failure rate
            throw new NetworkError(`${service.name} failure`);
          }
          return `${service.name} success`;
        });
      });

      // Define different policies for different service tiers
      const policies = {
        aggressive: recoveryService.createRecoveryPolicy({
          retryStrategy: 'exponential',
          retryConfig: { maxAttempts: 5, baseDelay: 100 },
          circuitBreakerConfig: { failureThreshold: 3, resetTimeout: 1000 },
        }),
        conservative: recoveryService.createRecoveryPolicy({
          retryStrategy: 'linear',
          retryConfig: { maxAttempts: 3, baseDelay: 500 },
          circuitBreakerConfig: { failureThreshold: 5, resetTimeout: 5000 },
        }),
        minimal: recoveryService.createRecoveryPolicy({
          retryStrategy: 'fixed',
          retryConfig: { maxAttempts: 1, baseDelay: 1000 },
          circuitBreakerConfig: { failureThreshold: 10, resetTimeout: 10000 },
        }),
      };

      // Execute operations for each service
      const results = await Promise.allSettled(
        services.map(async (service, index) => {
          try {
            const promise = recoveryService.executeWithPolicy(
              operations[index],
              service.name,
              policies[service.policy as keyof typeof policies]
            );
            
            jest.advanceTimersByTime(2000);
            await Promise.resolve();
            
            return await promise;
          } catch (error) {
            return error;
          }
        })
      );

      // Verify that each service was handled according to its policy
      const healthMetrics = recoveryService.getHealthMetrics();
      expect(healthMetrics.totalServices).toBe(3);
      expect(healthMetrics.services).toHaveLength(3);

      // Critical service should have more retry attempts
      const criticalStats = recoveryService.getRecoveryStats('critical-service');
      const backgroundStats = recoveryService.getRecoveryStats('background-service');
      
      if (criticalStats.totalRetries > 0 && backgroundStats.totalRetries > 0) {
        expect(criticalStats.averageRetryCount).toBeGreaterThan(backgroundStats.averageRetryCount);
      }
    });
  });
});