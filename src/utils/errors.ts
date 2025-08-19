/**
 * Base error class for APIForge MCP Server
 */
export class APIForgeError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: any
  ) {
    super(message);
    this.name = 'APIForgeError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintain proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, APIForgeError);
    }
  }
}

/**
 * Workspace-related errors
 */
export class WorkspaceNotFoundError extends APIForgeError {
  constructor(workspaceId: string) {
    super(
      `Workspace ${workspaceId} not found`,
      'WORKSPACE_NOT_FOUND',
      404,
      { workspaceId }
    );
  }
}

export class WorkspaceAlreadyExistsError extends APIForgeError {
  constructor(name: string) {
    super(
      `Workspace with name '${name}' already exists`,
      'WORKSPACE_ALREADY_EXISTS',
      409,
      { name }
    );
  }
}

/**
 * Endpoint-related errors
 */
export class EndpointNotFoundError extends APIForgeError {
  constructor(endpointId: string) {
    super(
      `Endpoint ${endpointId} not found`,
      'ENDPOINT_NOT_FOUND',
      404,
      { endpointId }
    );
  }
}

/**
 * Request execution errors
 */
export class RequestExecutionError extends APIForgeError {
  constructor(
    message: string,
    public endpoint?: any,
    public originalError?: Error
  ) {
    super(
      message,
      'REQUEST_EXECUTION_FAILED',
      500,
      { 
        endpoint: endpoint?.id || endpoint?.url,
        originalError: originalError?.message 
      }
    );
  }
}

/**
 * Storage-related errors
 */
export class StorageError extends APIForgeError {
  constructor(message: string, originalError?: Error) {
    super(
      `Storage error: ${message}`,
      'STORAGE_ERROR',
      500,
      { originalError: originalError?.message }
    );
  }
}

/**
 * Validation errors
 */
export class ValidationError extends APIForgeError {
  constructor(message: string, field?: string, value?: any) {
    super(
      `Validation error: ${message}`,
      'VALIDATION_ERROR',
      400,
      { field, value }
    );
  }
}

/**
 * HTTP-related errors
 */
export class HTTPError extends APIForgeError {
  constructor(
    message: string,
    statusCode: number = 500,
    public readonly url?: string,
    public readonly method?: string,
    public readonly response?: any
  ) {
    super(
      message,
      'HTTP_ERROR',
      statusCode,
      { url, method, response }
    );
  }
}

export class RequestTimeoutError extends APIForgeError {
  constructor(timeout: number, url?: string) {
    super(
      `Request timed out after ${timeout}ms`,
      'REQUEST_TIMEOUT',
      408,
      { timeout, url }
    );
  }
}

export class RequestBodyError extends APIForgeError {
  constructor(message: string, bodyType?: string) {
    super(
      `Request body error: ${message}`,
      'REQUEST_BODY_ERROR',
      400,
      { bodyType }
    );
  }
}

export class ResponseParsingError extends APIForgeError {
  constructor(message: string, contentType?: string, statusCode?: number) {
    super(
      `Response parsing error: ${message}`,
      'RESPONSE_PARSING_ERROR',
      502,
      { contentType, statusCode }
    );
  }
}

/**
 * Authentication-related errors
 */
export class AuthenticationError extends APIForgeError {
  constructor(
    message: string,
    public readonly authType?: string,
    public readonly isExpired?: boolean
  ) {
    super(
      `Authentication error: ${message}`,
      'AUTHENTICATION_ERROR',
      401,
      { authType, isExpired }
    );
  }
}

export class AuthorizationError extends APIForgeError {
  constructor(message: string, requiredScope?: string) {
    super(
      `Authorization error: ${message}`,
      'AUTHORIZATION_ERROR',
      403,
      { requiredScope }
    );
  }
}

export class TokenExpiredError extends APIForgeError {
  constructor(tokenType: string = 'access_token') {
    super(
      `${tokenType} has expired`,
      'TOKEN_EXPIRED',
      401,
      { tokenType, isExpired: true }
    );
  }
}

/**
 * Environment-related errors
 */
export class EnvironmentError extends APIForgeError {
  constructor(message: string, variableName?: string) {
    super(
      `Environment error: ${message}`,
      'ENVIRONMENT_ERROR',
      500,
      { variableName }
    );
  }
}

export class VariableNotFoundError extends APIForgeError {
  constructor(variableName: string) {
    super(
      `Variable '${variableName}' not found`,
      'VARIABLE_NOT_FOUND',
      404,
      { variableName }
    );
  }
}

export class VariableReplacementError extends APIForgeError {
  constructor(message: string, variable?: string, value?: string) {
    super(
      `Variable replacement failed: ${message}`,
      'VARIABLE_REPLACEMENT_ERROR',
      500,
      { variable, value }
    );
  }
}

export class EncryptionError extends APIForgeError {
  constructor(message: string, operation?: 'encrypt' | 'decrypt') {
    super(
      `Encryption error: ${message}`,
      'ENCRYPTION_ERROR',
      500,
      { operation }
    );
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends APIForgeError {
  constructor(message: string, configKey?: string) {
    super(
      `Configuration error: ${message}`,
      'CONFIGURATION_ERROR',
      500,
      { configKey }
    );
  }
}

export class InvalidConfigurationError extends APIForgeError {
  constructor(configKey: string, expectedType?: string, actualValue?: any) {
    super(
      `Invalid configuration for '${configKey}'${expectedType ? ` (expected ${expectedType})` : ''}`,
      'INVALID_CONFIGURATION',
      500,
      { configKey, expectedType, actualValue }
    );
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends APIForgeError {
  constructor(
    public readonly limit: number,
    public readonly resetTime?: Date,
    public readonly retryAfter?: number
  ) {
    super(
      `Rate limit exceeded: ${limit} requests`,
      'RATE_LIMIT_EXCEEDED',
      429,
      { limit, resetTime, retryAfter }
    );
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends APIForgeError {
  constructor(message: string, details?: any) {
    super(
      `Network error: ${message}`,
      'NETWORK_ERROR',
      500,
      details
    );
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends APIForgeError {
  constructor(message: string, timeout?: number) {
    super(
      `Timeout error: ${message}`,
      'TIMEOUT_ERROR',
      408,
      { timeout }
    );
  }
}

/**
 * Error categories for classification
 */
export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  VALIDATION = 'validation',
  CONFIGURATION = 'configuration',
  STORAGE = 'storage',
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Error context interface
 */
export interface ErrorContext {
  timestamp: Date;
  userId?: string;
  workspaceId?: string;
  endpointId?: string;
  requestId?: string;
  severity: ErrorSeverity;
  component: string;
  operation?: string;
  metadata?: Record<string, any>;
}

/**
 * Enhanced error interface
 */
export interface EnhancedError extends Error {
  code: string;
  statusCode: number;
  details?: any;
  context?: ErrorContext;
  cause?: Error;
}

/**
 * MCP Error Response interface
 */
export interface MCPErrorResponse {
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

/**
 * Enhanced global error handler for the MCP server
 */
export class ErrorHandler {
  private static errorStats = new Map<string, number>();
  private static recentErrors: Array<{ error: EnhancedError; timestamp: Date }> = [];
  private static maxRecentErrors = 100;

  /**
   * Handle general errors and convert to MCP response format
   */
  static handle(error: Error, context?: Partial<ErrorContext>): MCPErrorResponse {
    const enhancedError = this.enhanceError(error, context);
    this.recordError(enhancedError);
    
    if (error instanceof APIForgeError) {
      return {
        error: {
          code: error.code,
          message: error.message,
          details: {
            ...error.details,
            context: enhancedError.context,
            timestamp: enhancedError.context?.timestamp,
          },
        },
      };
    }

    // Handle Zod validation errors
    if (error.name === 'ZodError') {
      return {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Input validation failed',
          details: {
            validationErrors: (error as any).errors,
            context: enhancedError.context,
            timestamp: enhancedError.context?.timestamp,
          },
        },
      };
    }

    // Handle network errors
    if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
      return {
        error: {
          code: 'NETWORK_ERROR',
          message: 'Network connection failed',
          details: {
            originalError: error.message,
            context: enhancedError.context,
            timestamp: enhancedError.context?.timestamp,
          },
        },
      };
    }

    // Handle timeout errors
    if (error.message.includes('timeout') || error.name === 'TimeoutError') {
      return {
        error: {
          code: 'TIMEOUT_ERROR',
          message: 'Operation timed out',
          details: {
            originalError: error.message,
            context: enhancedError.context,
            timestamp: enhancedError.context?.timestamp,
          },
        },
      };
    }

    // Unknown error
    console.error('Unexpected error:', error);
    return {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: {
          originalError: process.env.NODE_ENV === 'development' ? error.stack : error.message,
          context: enhancedError.context,
          timestamp: enhancedError.context?.timestamp,
        },
      },
    };
  }

  /**
   * Handle tool execution errors specifically
   */
  static handleToolError(error: Error, context?: Partial<ErrorContext>): any {
    const response = this.handle(error, {
      ...context,
      component: context?.component || 'tool',
      severity: context?.severity || ErrorSeverity.MEDIUM,
    });
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
      isError: true,
    };
  }

  /**
   * Create a standardized error response
   */
  static createErrorResponse(
    code: string,
    message: string,
    details?: any,
    context?: Partial<ErrorContext>
  ): MCPErrorResponse {
    return {
      error: {
        code,
        message,
        details: {
          ...details,
          context: {
            timestamp: new Date(),
            severity: ErrorSeverity.MEDIUM,
            component: 'unknown',
            ...context,
          },
        },
      },
    };
  }

  /**
   * Enhance error with context and tracking information
   */
  private static enhanceError(error: Error, context?: Partial<ErrorContext>): EnhancedError {
    const enhancedError = error as EnhancedError;
    
    if (!enhancedError.context) {
      enhancedError.context = {
        timestamp: new Date(),
        severity: this.determineSeverity(error),
        component: 'unknown',
        ...context,
      };
    }

    // Set default code and statusCode if not present
    if (!enhancedError.code) {
      enhancedError.code = error instanceof APIForgeError ? error.code : 'UNKNOWN_ERROR';
    }
    
    if (!enhancedError.statusCode) {
      enhancedError.statusCode = error instanceof APIForgeError ? error.statusCode : 500;
    }

    return enhancedError;
  }

  /**
   * Determine error severity based on error type and content
   */
  private static determineSeverity(error: Error): ErrorSeverity {
    if (error instanceof ValidationError || error.name === 'ZodError') {
      return ErrorSeverity.LOW;
    }
    
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return ErrorSeverity.MEDIUM;
    }
    
    if (error instanceof RequestExecutionError || error instanceof HTTPError) {
      return ErrorSeverity.MEDIUM;
    }
    
    if (error instanceof StorageError || error instanceof EncryptionError) {
      return ErrorSeverity.HIGH;
    }
    
    if (error.message.includes('ECONNREFUSED') || error.message.includes('timeout')) {
      return ErrorSeverity.HIGH;
    }
    
    return ErrorSeverity.MEDIUM;
  }

  /**
   * Record error for statistics and monitoring
   */
  private static recordError(error: EnhancedError): void {
    const code = error.code || 'UNKNOWN_ERROR';
    this.errorStats.set(code, (this.errorStats.get(code) || 0) + 1);
    
    // Store recent errors (with rotation)
    this.recentErrors.push({ error, timestamp: new Date() });
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors.shift();
    }
    
    // Log high severity errors immediately
    if (error.context?.severity === ErrorSeverity.HIGH || error.context?.severity === ErrorSeverity.CRITICAL) {
      console.error('[HIGH SEVERITY ERROR]', {
        code: error.code,
        message: error.message,
        context: error.context,
        stack: error.stack,
      });
    }
  }

  /**
   * Get error statistics
   */
  static getErrorStats(): Record<string, number> {
    return Object.fromEntries(this.errorStats.entries());
  }

  /**
   * Get recent errors
   */
  static getRecentErrors(limit?: number): Array<{ error: EnhancedError; timestamp: Date }> {
    const errors = this.recentErrors.slice();
    return limit ? errors.slice(-limit) : errors;
  }

  /**
   * Clear error statistics and recent errors
   */
  static clearStats(): void {
    this.errorStats.clear();
    this.recentErrors.length = 0;
  }

  /**
   * Check if error is recoverable
   */
  static isRecoverable(error: Error): boolean {
    if (error instanceof ValidationError) return true;
    if (error instanceof RateLimitError) return true;
    if (error instanceof RequestTimeoutError) return true;
    if (error instanceof HTTPError && error.statusCode >= 500) return true;
    if (error.message.includes('ECONNREFUSED')) return true;
    
    return false;
  }

  /**
   * Get suggested retry delay for recoverable errors
   */
  static getRetryDelay(error: Error, attemptNumber: number = 1): number {
    if (error instanceof RateLimitError && error.retryAfter) {
      return error.retryAfter * 1000;
    }
    
    if (error instanceof RequestTimeoutError) {
      return Math.min(1000 * Math.pow(2, attemptNumber), 30000); // Exponential backoff, max 30s
    }
    
    if (error instanceof HTTPError && error.statusCode >= 500) {
      return Math.min(500 * Math.pow(2, attemptNumber), 10000); // Exponential backoff, max 10s
    }
    
    return 1000; // Default 1 second
  }

  /**
   * Wrap async function with error handling
   */
  static async wrapAsync<T>(
    fn: () => Promise<T>,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      throw this.enhanceError(error as Error, context);
    }
  }

  /**
   * Create error from HTTP response
   */
  static fromHttpResponse(response: Response, body?: any, method?: string): HTTPError {
    const error = new HTTPError(
      `HTTP ${response.status}: ${response.statusText}`,
      response.status,
      response.url,
      method || 'GET',
      body
    );
    
    return error;
  }

  /**
   * Create a standardized error with code and message
   */
  static createError(
    code: string,
    message: string,
    details?: any
  ): APIForgeError {
    return new APIForgeError(message, code, 500, details);
  }
}