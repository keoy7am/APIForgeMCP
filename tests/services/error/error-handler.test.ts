/**
 * Tests for ErrorHandler
 */

import { jest } from '@jest/globals';
import { TestDataFactory, MockFactory, TestAssertions } from '../../utils/test-utils';
import { 
  ErrorHandler,
  APIForgeError,
  ValidationError,
  NetworkError,
  AuthenticationError,
  ConfigurationError,
  TimeoutError,
  RateLimitError,
  ErrorSeverity,
  ErrorCategory,
  ErrorContext
} from '../../../src/services/error';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let mockLogger: any;
  let mockMetrics: any;

  beforeEach(() => {
    mockLogger = MockFactory.createMockLogger();
    mockMetrics = {
      recordError: jest.fn(),
      incrementCounter: jest.fn(),
      recordTiming: jest.fn(),
    };
    
    errorHandler = new ErrorHandler(mockLogger, mockMetrics);
  });

  describe('Error Classification', () => {
    describe('classifyError', () => {
      it('should classify network errors correctly', () => {
        const networkErrors = [
          new Error('ECONNREFUSED'),
          new Error('ENOTFOUND'),
          new Error('ECONNRESET'),
          new Error('ETIMEDOUT'),
          new Error('Network request failed'),
        ];

        networkErrors.forEach(error => {
          const classification = errorHandler.classifyError(error);
          expect(classification.category).toBe(ErrorCategory.NETWORK);
          expect(classification.severity).toBe(ErrorSeverity.HIGH);
        });
      });

      it('should classify authentication errors correctly', () => {
        const authErrors = [
          new Error('Unauthorized'),
          new Error('Invalid credentials'),
          new Error('Token expired'),
          new Error('403 Forbidden'),
          new Error('401 Unauthorized'),
        ];

        authErrors.forEach(error => {
          const classification = errorHandler.classifyError(error);
          expect(classification.category).toBe(ErrorCategory.AUTHENTICATION);
          expect(classification.severity).toBeOneOf([ErrorSeverity.HIGH, ErrorSeverity.MEDIUM]);
        });
      });

      it('should classify validation errors correctly', () => {
        const validationErrors = [
          new ValidationError('Invalid input format'),
          new Error('Required field missing'),
          new Error('Invalid email format'),
          new Error('Value out of range'),
        ];

        validationErrors.forEach(error => {
          const classification = errorHandler.classifyError(error);
          expect(classification.category).toBe(ErrorCategory.VALIDATION);
          expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
        });
      });

      it('should classify configuration errors correctly', () => {
        const configErrors = [
          new ConfigurationError('Missing environment variable'),
          new Error('Invalid configuration'),
          new Error('Config file not found'),
          new Error('Database connection string invalid'),
        ];

        configErrors.forEach(error => {
          const classification = errorHandler.classifyError(error);
          expect(classification.category).toBe(ErrorCategory.CONFIGURATION);
          expect(classification.severity).toBeOneOf([ErrorSeverity.HIGH, ErrorSeverity.CRITICAL]);
        });
      });

      it('should classify timeout errors correctly', () => {
        const timeoutErrors = [
          new TimeoutError('Request timeout'),
          new Error('Operation timed out'),
          new Error('Connection timeout'),
        ];

        timeoutErrors.forEach(error => {
          const classification = errorHandler.classifyError(error);
          expect(classification.category).toBe(ErrorCategory.TIMEOUT);
          expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
        });
      });

      it('should classify rate limit errors correctly', () => {
        const rateLimitErrors = [
          new RateLimitError('Rate limit exceeded'),
          new Error('Too many requests'),
          new Error('429 Too Many Requests'),
        ];

        rateLimitErrors.forEach(error => {
          const classification = errorHandler.classifyError(error);
          expect(classification.category).toBe(ErrorCategory.RATE_LIMIT);
          expect(classification.severity).toBe(ErrorSeverity.MEDIUM);
        });
      });

      it('should classify unknown errors as system errors', () => {
        const unknownErrors = [
          new Error('Something went wrong'),
          new TypeError('Cannot read property of undefined'),
          new ReferenceError('Variable not defined'),
        ];

        unknownErrors.forEach(error => {
          const classification = errorHandler.classifyError(error);
          expect(classification.category).toBe(ErrorCategory.SYSTEM);
          expect(classification.severity).toBe(ErrorSeverity.HIGH);
        });
      });

      it('should handle custom error classes', () => {
        const customError = new APIForgeError(
          'Custom error message',
          'CUSTOM_ERROR',
          ErrorCategory.BUSINESS,
          ErrorSeverity.LOW
        );

        const classification = errorHandler.classifyError(customError);
        expect(classification.category).toBe(ErrorCategory.BUSINESS);
        expect(classification.severity).toBe(ErrorSeverity.LOW);
      });
    });

    describe('determineSeverity', () => {
      it('should determine critical severity for system failures', () => {
        const criticalErrors = [
          'Database connection lost',
          'Out of memory',
          'Disk full',
          'Service unavailable',
        ];

        criticalErrors.forEach(message => {
          const severity = errorHandler.determineSeverity(new Error(message));
          expect(severity).toBe(ErrorSeverity.CRITICAL);
        });
      });

      it('should determine high severity for security issues', () => {
        const securityErrors = [
          'Authentication failed',
          'Access denied',
          'Invalid token',
          'Security violation',
        ];

        securityErrors.forEach(message => {
          const severity = errorHandler.determineSeverity(new Error(message));
          expect(severity).toBe(ErrorSeverity.HIGH);
        });
      });

      it('should consider error frequency in severity calculation', () => {
        const error = new Error('Frequent error');
        
        // First occurrence - medium severity
        const firstSeverity = errorHandler.determineSeverity(error, { frequency: 1 });
        expect(firstSeverity).toBe(ErrorSeverity.MEDIUM);
        
        // High frequency - elevated severity
        const highFreqSeverity = errorHandler.determineSeverity(error, { frequency: 10 });
        expect(highFreqSeverity).toBe(ErrorSeverity.HIGH);
      });
    });
  });

  describe('Error Context Management', () => {
    describe('createErrorContext', () => {
      it('should create comprehensive error context', () => {
        const error = new Error('Test error');
        const requestContext = {
          method: 'POST',
          url: 'https://api.example.com/users',
          headers: { 'content-type': 'application/json' },
          body: { name: 'John Doe' },
        };

        const context = errorHandler.createErrorContext(error, {
          request: requestContext,
          user: { id: '123', email: 'user@example.com' },
          operation: 'createUser',
        });

        expect(context).toMatchObject({
          timestamp: expect.any(Date),
          error: {
            name: 'Error',
            message: 'Test error',
            stack: expect.any(String),
          },
          request: requestContext,
          user: { id: '123', email: 'user@example.com' },
          operation: 'createUser',
          environment: expect.any(Object),
          system: expect.any(Object),
        });
      });

      it('should include system information', () => {
        const error = new Error('System error');
        const context = errorHandler.createErrorContext(error);

        expect(context.system).toMatchObject({
          platform: expect.any(String),
          nodeVersion: expect.any(String),
          memoryUsage: expect.any(Object),
          uptime: expect.any(Number),
        });
      });

      it('should include environment information', () => {
        const error = new Error('Environment error');
        const context = errorHandler.createErrorContext(error);

        expect(context.environment).toMatchObject({
          nodeEnv: expect.any(String),
          timezone: expect.any(String),
          locale: expect.any(String),
        });
      });

      it('should sanitize sensitive data', () => {
        const error = new Error('Data error');
        const requestContext = {
          headers: {
            'authorization': 'Bearer secret-token',
            'x-api-key': 'secret-key',
            'content-type': 'application/json',
          },
          body: {
            username: 'user123',
            password: 'secret-password',
            data: 'normal data',
          },
        };

        const context = errorHandler.createErrorContext(error, {
          request: requestContext,
        });

        expect(context.request.headers.authorization).toBe('[REDACTED]');
        expect(context.request.headers['x-api-key']).toBe('[REDACTED]');
        expect(context.request.headers['content-type']).toBe('application/json');
        expect(context.request.body.password).toBe('[REDACTED]');
        expect(context.request.body.username).toBe('user123');
        expect(context.request.body.data).toBe('normal data');
      });

      it('should handle circular references in context data', () => {
        const error = new Error('Circular reference error');
        const circularObj: any = { name: 'test' };
        circularObj.self = circularObj;

        const context = errorHandler.createErrorContext(error, {
          circularData: circularObj,
        });

        expect(context.circularData).toBeDefined();
        expect(typeof context.circularData).toBe('object');
      });
    });

    describe('enrichErrorContext', () => {
      it('should enrich context with additional information', () => {
        const baseContext = errorHandler.createErrorContext(new Error('Base error'));
        
        const enrichedContext = errorHandler.enrichErrorContext(baseContext, {
          correlationId: 'req-123456',
          userAgent: 'APIForge/1.0.0',
          ipAddress: '192.168.1.1',
          sessionId: 'session-789',
        });

        expect(enrichedContext).toMatchObject({
          ...baseContext,
          correlationId: 'req-123456',
          userAgent: 'APIForge/1.0.0',
          ipAddress: '192.168.1.1',
          sessionId: 'session-789',
        });
      });

      it('should merge nested objects correctly', () => {
        const baseContext = errorHandler.createErrorContext(new Error('Base error'));
        
        const enrichedContext = errorHandler.enrichErrorContext(baseContext, {
          request: {
            timeout: 30000,
            retries: 3,
          },
          user: {
            role: 'admin',
            permissions: ['read', 'write'],
          },
        });

        expect(enrichedContext.request).toMatchObject({
          ...baseContext.request,
          timeout: 30000,
          retries: 3,
        });

        expect(enrichedContext.user).toMatchObject({
          ...baseContext.user,
          role: 'admin',
          permissions: ['read', 'write'],
        });
      });
    });
  });

  describe('Error Handling and Processing', () => {
    describe('handleError', () => {
      it('should handle errors with full processing pipeline', async () => {
        const error = new ValidationError('Invalid email format');
        const context = { operation: 'validateUser', input: 'invalid-email' };

        const result = await errorHandler.handleError(error, context);

        expect(result).toMatchObject({
          id: expect.any(String),
          timestamp: expect.any(Date),
          error: expect.objectContaining({
            name: 'ValidationError',
            message: 'Invalid email format',
          }),
          classification: expect.objectContaining({
            category: ErrorCategory.VALIDATION,
            severity: ErrorSeverity.MEDIUM,
          }),
          context: expect.any(Object),
          recoveryActions: expect.any(Array),
        });

        expect(mockLogger.error).toHaveBeenCalled();
        expect(mockMetrics.recordError).toHaveBeenCalled();
      });

      it('should generate recovery actions based on error type', async () => {
        const networkError = new NetworkError('Connection refused');
        const result = await errorHandler.handleError(networkError);

        const recoveryActions = result.recoveryActions;
        expect(recoveryActions).toContainEqual(
          expect.objectContaining({
            type: 'retry',
            description: expect.stringContaining('retry'),
          })
        );
        expect(recoveryActions).toContainEqual(
          expect.objectContaining({
            type: 'fallback',
            description: expect.stringContaining('alternative'),
          })
        );
      });

      it('should track error frequency and patterns', async () => {
        const error = new Error('Repeated error');
        
        // Handle same error multiple times
        await errorHandler.handleError(error, { operation: 'test' });
        await errorHandler.handleError(error, { operation: 'test' });
        await errorHandler.handleError(error, { operation: 'test' });

        const stats = errorHandler.getErrorStats();
        expect(stats.totalErrors).toBe(3);
        expect(stats.byCategory.system).toBe(3);
        expect(stats.byOperation.test).toBe(3);
      });

      it('should escalate high-frequency errors', async () => {
        const error = new Error('Frequent error');
        
        // Simulate high frequency
        for (let i = 0; i < 10; i++) {
          await errorHandler.handleError(error);
        }

        const lastResult = await errorHandler.handleError(error);
        expect(lastResult.escalated).toBe(true);
        expect(lastResult.classification.severity).toBe(ErrorSeverity.HIGH);
      });

      it('should apply circuit breaker logic', async () => {
        const error = new NetworkError('Service unavailable');
        
        // Trigger circuit breaker with repeated failures
        for (let i = 0; i < 5; i++) {
          await errorHandler.handleError(error, { service: 'api-service' });
        }

        const circuitState = errorHandler.getCircuitState('api-service');
        expect(circuitState.isOpen).toBe(true);
        expect(circuitState.failures).toBe(5);
      });
    });

    describe('generateRecoveryActions', () => {
      it('should generate appropriate actions for network errors', () => {
        const networkError = new NetworkError('Connection timeout');
        const actions = errorHandler.generateRecoveryActions(networkError);

        expect(actions).toContainEqual(
          expect.objectContaining({
            type: 'retry',
            priority: 'high',
            automated: true,
          })
        );

        expect(actions).toContainEqual(
          expect.objectContaining({
            type: 'fallback',
            description: expect.stringContaining('alternative endpoint'),
          })
        );
      });

      it('should generate appropriate actions for validation errors', () => {
        const validationError = new ValidationError('Invalid input format');
        const actions = errorHandler.generateRecoveryActions(validationError);

        expect(actions).toContainEqual(
          expect.objectContaining({
            type: 'validation',
            description: expect.stringContaining('validate input'),
          })
        );

        expect(actions).toContainEqual(
          expect.objectContaining({
            type: 'user_action',
            description: expect.stringContaining('correct the input'),
          })
        );
      });

      it('should generate appropriate actions for authentication errors', () => {
        const authError = new AuthenticationError('Token expired');
        const actions = errorHandler.generateRecoveryActions(authError);

        expect(actions).toContainEqual(
          expect.objectContaining({
            type: 'authentication',
            description: expect.stringContaining('refresh token'),
          })
        );

        expect(actions).toContainEqual(
          expect.objectContaining({
            type: 'user_action',
            description: expect.stringContaining('re-authenticate'),
          })
        );
      });

      it('should generate context-aware actions', () => {
        const error = new Error('Database error');
        const context = {
          operation: 'database_query',
          retryCount: 2,
          maxRetries: 3,
        };

        const actions = errorHandler.generateRecoveryActions(error, context);

        expect(actions).toContainEqual(
          expect.objectContaining({
            type: 'retry',
            parameters: expect.objectContaining({
              remainingRetries: 1,
            }),
          })
        );
      });
    });
  });

  describe('Error Reporting and Metrics', () => {
    describe('reportError', () => {
      it('should report errors with appropriate log levels', () => {
        const errors = [
          { error: new Error('Low severity'), severity: ErrorSeverity.LOW },
          { error: new Error('Medium severity'), severity: ErrorSeverity.MEDIUM },
          { error: new Error('High severity'), severity: ErrorSeverity.HIGH },
          { error: new Error('Critical severity'), severity: ErrorSeverity.CRITICAL },
        ];

        errors.forEach(({ error, severity }) => {
          const context = errorHandler.createErrorContext(error);
          context.classification = { category: ErrorCategory.SYSTEM, severity };
          
          errorHandler.reportError(context);
        });

        expect(mockLogger.info).toHaveBeenCalledTimes(1); // LOW
        expect(mockLogger.warn).toHaveBeenCalledTimes(1); // MEDIUM
        expect(mockLogger.error).toHaveBeenCalledTimes(2); // HIGH + CRITICAL
      });

      it('should include structured data in logs', () => {
        const error = new ValidationError('Test validation error');
        const context = errorHandler.createErrorContext(error, {
          operation: 'validateInput',
          input: { field: 'value' },
        });

        errorHandler.reportError(context);

        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Error occurred: Test validation error',
          expect.objectContaining({
            errorId: expect.any(String),
            category: ErrorCategory.VALIDATION,
            severity: ErrorSeverity.MEDIUM,
            operation: 'validateInput',
          })
        );
      });

      it('should send critical errors to external monitoring', () => {
        const mockExternalReporter = jest.fn();
        errorHandler.addExternalReporter(mockExternalReporter);

        const criticalError = new Error('Critical system failure');
        const context = errorHandler.createErrorContext(criticalError);
        context.classification = { 
          category: ErrorCategory.SYSTEM, 
          severity: ErrorSeverity.CRITICAL 
        };

        errorHandler.reportError(context);

        expect(mockExternalReporter).toHaveBeenCalledWith(context);
      });
    });

    describe('metrics recording', () => {
      it('should record error metrics', async () => {
        const error = new NetworkError('Connection failed');
        await errorHandler.handleError(error);

        expect(mockMetrics.recordError).toHaveBeenCalledWith(
          expect.objectContaining({
            category: ErrorCategory.NETWORK,
            severity: ErrorSeverity.HIGH,
          })
        );

        expect(mockMetrics.incrementCounter).toHaveBeenCalledWith(
          'errors_total',
          expect.objectContaining({
            category: ErrorCategory.NETWORK,
            severity: ErrorSeverity.HIGH,
          })
        );
      });

      it('should track error trends over time', async () => {
        const errors = [
          new ValidationError('Validation 1'),
          new ValidationError('Validation 2'),
          new NetworkError('Network 1'),
          new AuthenticationError('Auth 1'),
        ];

        for (const error of errors) {
          await errorHandler.handleError(error);
        }

        const trends = errorHandler.getErrorTrends('1h');
        expect(trends).toMatchObject({
          timeframe: '1h',
          data: expect.arrayContaining([
            expect.objectContaining({
              timestamp: expect.any(Date),
              category: expect.any(String),
              count: expect.any(Number),
            }),
          ]),
        });
      });
    });
  });

  describe('Error Recovery and Suggestions', () => {
    describe('suggestFixes', () => {
      it('should suggest specific fixes for common errors', () => {
        const commonErrors = [
          {
            error: new Error('ECONNREFUSED'),
            expectedSuggestions: ['Check if the service is running', 'Verify network connectivity'],
          },
          {
            error: new ValidationError('Email format invalid'),
            expectedSuggestions: ['Use a valid email format', 'Check input validation rules'],
          },
          {
            error: new AuthenticationError('Token expired'),
            expectedSuggestions: ['Refresh the authentication token', 'Re-authenticate the user'],
          },
        ];

        commonErrors.forEach(({ error, expectedSuggestions }) => {
          const suggestions = errorHandler.suggestFixes(error);
          
          expectedSuggestions.forEach(expectedSuggestion => {
            expect(suggestions).toContainEqual(
              expect.objectContaining({
                description: expect.stringContaining(expectedSuggestion.toLowerCase()),
              })
            );
          });
        });
      });

      it('should prioritize suggestions by effectiveness', () => {
        const error = new NetworkError('Connection timeout');
        const suggestions = errorHandler.suggestFixes(error);

        // First suggestion should be highest priority
        expect(suggestions[0].priority).toBe('high');
        expect(suggestions[0].automated).toBe(true);

        // Suggestions should be ordered by priority
        const priorities = suggestions.map(s => s.priority);
        const priorityOrder = ['high', 'medium', 'low'];
        
        let lastPriorityIndex = -1;
        priorities.forEach(priority => {
          const currentIndex = priorityOrder.indexOf(priority);
          expect(currentIndex).toBeGreaterThanOrEqual(lastPriorityIndex);
          lastPriorityIndex = currentIndex;
        });
      });

      it('should include automated fix scripts when available', () => {
        const error = new ConfigurationError('Missing environment variable: API_KEY');
        const suggestions = errorHandler.suggestFixes(error);

        const automatedSuggestion = suggestions.find(s => s.automated);
        expect(automatedSuggestion).toBeDefined();
        expect(automatedSuggestion?.script).toBeDefined();
        expect(typeof automatedSuggestion?.script).toBe('string');
      });
    });

    describe('executeAutomatedFix', () => {
      it('should execute safe automated fixes', async () => {
        const error = new ConfigurationError('Cache not initialized');
        const suggestions = errorHandler.suggestFixes(error);
        const automatedFix = suggestions.find(s => s.automated && s.safe);

        if (automatedFix) {
          const result = await errorHandler.executeAutomatedFix(automatedFix);
          expect(result).toMatchObject({
            success: expect.any(Boolean),
            message: expect.any(String),
            executedAt: expect.any(Date),
          });
        }
      });

      it('should not execute unsafe automated fixes', async () => {
        const unsafeFix = {
          id: 'unsafe-fix',
          description: 'Delete all data',
          automated: true,
          safe: false,
          script: 'rm -rf /',
          priority: 'low' as const,
        };

        await TestAssertions.expectRejectsWithError(
          errorHandler.executeAutomatedFix(unsafeFix),
          ValidationError,
          'Unsafe automated fix rejected'
        );
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should handle complete error workflow', async () => {
      // Simulate a complex API request error
      const networkError = new NetworkError('Connection timeout to payment service');
      const requestContext = {
        operation: 'processPayment',
        method: 'POST',
        url: 'https://payment.api.com/charge',
        headers: { 'authorization': 'Bearer token123' },
        body: { amount: 10000, currency: 'USD' },
        user: { id: '12345', email: 'user@example.com' },
        correlationId: 'req-payment-789',
      };

      // Handle the error
      const result = await errorHandler.handleError(networkError, requestContext);

      // Verify comprehensive error processing
      expect(result).toMatchObject({
        id: expect.any(String),
        timestamp: expect.any(Date),
        error: expect.objectContaining({
          name: 'NetworkError',
          message: 'Connection timeout to payment service',
        }),
        classification: expect.objectContaining({
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.HIGH,
        }),
        context: expect.objectContaining({
          operation: 'processPayment',
          correlationId: 'req-payment-789',
          request: expect.objectContaining({
            method: 'POST',
            url: 'https://payment.api.com/charge',
            headers: { authorization: '[REDACTED]' }, // Sensitive data redacted
          }),
        }),
        recoveryActions: expect.arrayContaining([
          expect.objectContaining({
            type: 'retry',
            priority: 'high',
            automated: true,
          }),
          expect.objectContaining({
            type: 'fallback',
            description: expect.stringContaining('alternative'),
          }),
        ]),
      });

      // Verify logging and metrics
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error occurred: Connection timeout to payment service',
        expect.objectContaining({
          errorId: result.id,
          operation: 'processPayment',
          correlationId: 'req-payment-789',
        })
      );

      expect(mockMetrics.recordError).toHaveBeenCalledWith(
        expect.objectContaining({
          category: ErrorCategory.NETWORK,
          severity: ErrorSeverity.HIGH,
        })
      );

      // Check error statistics
      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.byCategory.network).toBe(1);
      expect(stats.byOperation.processPayment).toBe(1);
    });

    it('should handle error cascades and circuit breaker activation', async () => {
      const serviceError = new Error('Database service unavailable');
      const serviceName = 'user-database';

      // Simulate repeated failures to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        await errorHandler.handleError(serviceError, { 
          service: serviceName,
          operation: 'getUserProfile',
        });
      }

      // Check circuit breaker state
      const circuitState = errorHandler.getCircuitState(serviceName);
      expect(circuitState.isOpen).toBe(true);
      expect(circuitState.failures).toBe(6);
      expect(circuitState.lastFailure).toBeInstanceOf(Date);

      // Next error should include circuit breaker context
      const nextResult = await errorHandler.handleError(serviceError, {
        service: serviceName,
        operation: 'getUserProfile',
      });

      expect(nextResult.context.circuitBreaker).toMatchObject({
        state: 'open',
        service: serviceName,
        failures: 7,
      });

      expect(nextResult.recoveryActions).toContainEqual(
        expect.objectContaining({
          type: 'circuit_breaker',
          description: expect.stringContaining('Circuit breaker is open'),
        })
      );
    });
  });
});