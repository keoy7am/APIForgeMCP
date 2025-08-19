import { 
  ApiEndpoint, 
  RequestResult, 
  RequestData, 
  ResponseData, 
  Variables,
  AuthConfig,
  BatchOptions,
  BatchResult 
} from '../types';
import { sslConfig } from '../config/ssl.config';
import { 
  RequestResultSchema,
  RequestDataSchema,
  ResponseDataSchema 
} from '../models/schemas';
import { 
  ErrorHandler,
  ErrorRecoveryService,
  ErrorSeverity,
  RequestExecutionError, 
  ValidationError,
  HTTPError,
  RequestTimeoutError,
  ResponseParsingError
} from './error';
import { EndpointRegistry } from './endpoint.service';
import { Logger } from '../utils/logger';
import { 
  RequestBodyProcessor, 
  ResponseParser,
  ResponseUtils
} from './http';
import { AuthenticationService } from './auth';
import { EnvironmentManager } from './environment';

/**
 * Request Executor Service
 * 
 * Handles HTTP request execution with support for:
 * - Variable replacement
 * - Authentication
 * - Retry mechanisms
 * - Batch execution
 * - Response validation
 */
export class RequestExecutor {
  private endpointRegistry: EndpointRegistry;
  private logger: Logger;
  private bodyProcessor: RequestBodyProcessor;
  private responseParser: ResponseParser;
  private authService: AuthenticationService;
  private environmentManager: EnvironmentManager;
  private errorRecovery: ErrorRecoveryService;

  constructor(endpointRegistry: EndpointRegistry, environmentManager?: EnvironmentManager) {
    this.endpointRegistry = endpointRegistry;
    this.logger = new Logger('RequestExecutor');
    this.bodyProcessor = new RequestBodyProcessor();
    this.responseParser = new ResponseParser();
    this.authService = new AuthenticationService();
    this.environmentManager = environmentManager || new EnvironmentManager();
    this.errorRecovery = new ErrorRecoveryService();
  }

  /**
   * Execute a request using an endpoint object
   */
  async execute(
    endpoint: Partial<ApiEndpoint>, 
    variables?: Variables
  ): Promise<RequestResult> {
    const startTime = Date.now();
    const operationId = `request_${endpoint.method}_${Date.now()}`;
    
    try {
      const recoveryResult = await this.errorRecovery.executeWithRecovery(
        async () => {
          // Process the endpoint with enhanced variable replacement
          const processedEndpoint = await this.processEndpointVariables(endpoint, variables);
          
          // Validate required fields
          this.validateEndpoint(processedEndpoint);
          
          // Build the request
          const requestData = await this.buildRequest(processedEndpoint);
          
          // Execute the request with enhanced error handling
          const response = await this.executeRequestWithRecovery(requestData);
          
          // Build result
          const result: RequestResult = {
            success: this.isSuccessStatus(response.status),
            request: requestData,
            response,
            duration: Date.now() - startTime,
            timestamp: new Date(),
          };
          
          return result;
        },
        {
          strategy: 'retry',
          maxAttempts: endpoint.retryConfig?.maxAttempts || 3,
          baseDelay: endpoint.retryConfig?.delayMs || 1000,
          backoffMultiplier: endpoint.retryConfig?.backoffMultiplier || 2,
          fallbackValue: undefined,
          customHandler: async (error: Error) => {
            // Custom fallback logic for request execution
            return this.createErrorResult(endpoint, error, Date.now() - startTime);
          },
        },
        operationId
      );
      
      if (recoveryResult.success && recoveryResult.result) {
        const validatedResult = RequestResultSchema.parse(recoveryResult.result);
        
        this.logger.info(
          `Request executed: ${endpoint.method} ${endpoint.url} - Success (${recoveryResult.duration}ms, ${recoveryResult.attempts} attempts)`
        );
        
        return validatedResult;
      } else {
        // Recovery failed, return error result
        const errorResult = recoveryResult.result || this.createErrorResult(
          endpoint, 
          recoveryResult.error || new Error('Unknown error'), 
          recoveryResult.duration
        );
        
        this.logger.error(
          `Request failed after recovery: ${endpoint.method} ${endpoint.url} - ${recoveryResult.error?.message} (${recoveryResult.attempts} attempts)`
        );
        
        // Don't validate error results with schema to avoid validation errors
        return errorResult;
      }
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const enhancedError = ErrorHandler.handle(error as Error, {
        component: 'RequestExecutor',
        operation: 'execute',
        severity: ErrorSeverity.HIGH,
        metadata: {
          method: endpoint.method,
          url: endpoint.url,
          operationId,
        },
      });
      
      this.logger.error(`Request execution failed: ${endpoint.method} ${endpoint.url}`, enhancedError);
      
      const errorResult = this.createErrorResult(endpoint, error as Error, duration);
      // Don't validate error results with schema to avoid validation errors
      return errorResult;
    }
  }

  /**
   * Execute a request by endpoint ID
   */
  async executeById(endpointId: string, variables?: Variables): Promise<RequestResult> {
    try {
      // Get endpoint from registry
      const endpoint = await this.endpointRegistry.getEndpoint(endpointId);
      
      // Execute the request
      return await this.execute(endpoint, variables);
      
    } catch (error) {
      this.logger.error(`Failed to execute endpoint ${endpointId}:`, error);
      throw error;
    }
  }

  /**
   * Execute multiple requests (batch execution)
   */
  async executeCollection(
    endpoints: ApiEndpoint[], 
    options: BatchOptions = {}
  ): Promise<BatchResult> {
    const startTime = Date.now();
    const {
      parallel = false,
      concurrency = 5,
      stopOnError = false,
      delayBetweenRequests = 0,
    } = options;

    this.logger.info(
      `Starting batch execution: ${endpoints.length} endpoints, parallel=${parallel}`
    );

    try {
      let results: RequestResult[];
      let errors: Error[] = [];

      if (parallel) {
        const batchResult = await this.executeParallel(
          endpoints, 
          concurrency, 
          stopOnError
        );
        results = batchResult.results;
        errors = batchResult.errors;
      } else {
        const batchResult = await this.executeSequential(
          endpoints, 
          stopOnError, 
          delayBetweenRequests
        );
        results = batchResult.results;
        errors = batchResult.errors;
      }

      const success = errors.length === 0;
      const duration = Date.now() - startTime;

      this.logger.info(
        `Batch execution completed: ${results.length} requests, ${errors.length} errors, ${duration}ms`
      );

      return {
        success,
        results,
        errors,
        duration,
      };

    } catch (error) {
      const enhancedError = ErrorHandler.handle(error as Error, {
        component: 'RequestExecutor',
        operation: 'executeCollection',
        severity: ErrorSeverity.HIGH,
        metadata: {
          endpointCount: endpoints.length,
          parallel,
          concurrency,
        },
      });
      
      this.logger.error('Batch execution failed:', enhancedError);
      throw new RequestExecutionError('Batch execution failed', undefined, error as Error);
    }
  }

  /**
   * Validate response against expected criteria
   */
  validateResponse(
    response: ResponseData, 
    expectedStatus?: number | number[],
    expectedBody?: any
  ): boolean {
    try {
      // Status validation
      if (expectedStatus !== undefined) {
        const statusArray = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
        if (!statusArray.includes(response.status)) {
          return false;
        }
      }

      // Body validation (basic)
      if (expectedBody !== undefined) {
        // Simple equality check - could be enhanced with schema validation
        return JSON.stringify(response.body) === JSON.stringify(expectedBody);
      }

      return true;
      
    } catch (error) {
      this.logger.error('Response validation failed:', error);
      return false;
    }
  }

  // Private helper methods

  /**
   * Process endpoint with enhanced variable replacement using EnvironmentManager
   */
  private async processEndpointVariables(
    endpoint: Partial<ApiEndpoint>, 
    customVariables?: Variables
  ): Promise<Partial<ApiEndpoint>> {
    try {
      // Use the environment manager for comprehensive variable replacement
      const replacementResult = await this.environmentManager.replaceVariables(
        endpoint,
        {
          customVariables,
          enableRecursive: true,
          maxDepth: 5,
        }
      );

      // Log replacement information
      if (replacementResult.replacements.length > 0) {
        this.logger.debug('Variable replacements applied', {
          count: replacementResult.replacements.length,
          variables: replacementResult.replacements.map(r => r.variable)
        });
      }

      // Log warnings and errors
      if (replacementResult.warnings.length > 0) {
        replacementResult.warnings.forEach(warning => 
          this.logger.warn(`Variable replacement warning: ${warning}`)
        );
      }

      if (replacementResult.errors.length > 0) {
        replacementResult.errors.forEach(error => 
          this.logger.error(`Variable replacement error: ${error}`)
        );
      }

      return replacementResult.processedValue;

    } catch (error) {
      this.logger.error('Enhanced variable replacement failed, falling back to basic replacement:', error);
      
      // Fallback to basic replacement
      return this.basicReplaceVariables(endpoint, customVariables);
    }
  }

  /**
   * Basic variable replacement as fallback
   */
  private basicReplaceVariables(endpoint: Partial<ApiEndpoint>, variables?: Variables): Partial<ApiEndpoint> {
    if (!variables) {
      return endpoint;
    }

    const processed = { ...endpoint };

    // Replace in URL
    if (processed.url) {
      processed.url = this.replaceStringVariables(processed.url, variables);
    }

    // Replace in headers
    if (processed.headers) {
      processed.headers = this.replaceObjectVariables(processed.headers, variables);
    }

    // Replace in query parameters
    if (processed.queryParams) {
      processed.queryParams = this.replaceObjectVariables(processed.queryParams, variables);
    }

    // Replace in body (if it's a string or object)
    if (processed.body) {
      if (typeof processed.body === 'string') {
        processed.body = this.replaceStringVariables(processed.body, variables);
      } else if (typeof processed.body === 'object') {
        processed.body = this.replaceObjectVariables(processed.body, variables);
      }
    }

    return processed;
  }

  /**
   * Replace variables in a string using {{variable}} syntax
   */
  private replaceStringVariables(text: string, variables: Variables): string {
    return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = variables[key];
      return value !== undefined ? String(value) : match;
    });
  }

  /**
   * Replace variables in an object
   */
  private replaceObjectVariables(obj: Record<string, any>, variables: Variables): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.replaceStringVariables(value, variables);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.replaceObjectVariables(value, variables);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  /**
   * Validate endpoint has required fields
   */
  private validateEndpoint(endpoint: Partial<ApiEndpoint>): void {
    if (!endpoint.method) {
      throw new ValidationError('HTTP method is required');
    }

    if (!endpoint.url) {
      throw new ValidationError('URL is required');
    }

    try {
      new URL(endpoint.url);
    } catch {
      throw new ValidationError('Invalid URL format');
    }
  }

  /**
   * Build request data from endpoint configuration
   */
  private async buildRequest(endpoint: Partial<ApiEndpoint>): Promise<RequestData> {
    // Build base request
    let requestData: RequestData = {
      method: endpoint.method!,
      url: this.buildUrl(endpoint),
      headers: endpoint.headers ? { ...endpoint.headers } : {},
      queryParams: endpoint.queryParams,
      body: endpoint.body,
      timestamp: new Date(),
    };

    // Apply authentication
    if (endpoint.authentication) {
      requestData = await this.applyAuthentication(requestData, endpoint.authentication);
    }

    // Ensure headers object exists
    if (!requestData.headers) {
      requestData.headers = {};
    }

    // Set default headers
    if (!requestData.headers['User-Agent']) {
      requestData.headers['User-Agent'] = 'APIForgeMCP/1.0.0';
    }

    // Set content type for requests with body
    if (requestData.body && !requestData.headers['Content-Type']) {
      if (typeof requestData.body === 'object') {
        requestData.headers['Content-Type'] = 'application/json';
      }
    }

    return RequestDataSchema.parse(requestData);
  }

  /**
   * Build full URL with query parameters
   */
  private buildUrl(endpoint: Partial<ApiEndpoint>): string {
    const url = new URL(endpoint.url!);
    
    if (endpoint.queryParams) {
      Object.entries(endpoint.queryParams).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    
    return url.toString();
  }

  /**
   * Apply authentication to request using AuthenticationService
   */
  private async applyAuthentication(
    request: RequestData, 
    auth: AuthConfig
  ): Promise<RequestData> {
    try {
      return await this.authService.applyAuthentication(request, auth);
    } catch (error) {
      this.logger.error('Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Execute request with enhanced error recovery
   */
  private async executeRequestWithRecovery(request: RequestData): Promise<ResponseData> {
    const operationId = `http_${request.method}_${Date.now()}`;
    
    const recoveryResult = await this.errorRecovery.executeWithRecovery(
      async () => {
        return await this.executeRequest(request);
      },
      {
        strategy: 'retry',
        maxAttempts: 3,
        baseDelay: 1000,
        backoffMultiplier: 1.5,
        enableCircuitBreaker: true,
        customHandler: async (error: Error, _attempt: number) => {
          // Enhanced error handling for specific HTTP scenarios
          if (error instanceof HTTPError) {
            // For server errors, we might want to retry with exponential backoff
            if (error.statusCode >= 500 && error.statusCode < 600) {
              throw error; // Let recovery service handle retry
            }
            // For client errors, don't retry
            if (error.statusCode >= 400 && error.statusCode < 500) {
              return this.createErrorResponse(error, request);
            }
          }
          
          if (error instanceof RequestTimeoutError) {
            // For timeouts, we can retry with longer timeout
            throw error; // Let recovery service handle retry
          }
          
          // For other errors, don't retry
          return this.createErrorResponse(error, request);
        },
      },
      operationId
    );
    
    if (recoveryResult.success && recoveryResult.result) {
      return recoveryResult.result;
    } else {
      throw recoveryResult.error || new RequestExecutionError(
        'Request execution failed after recovery attempts',
        request
      );
    }
  }

  /**
   * Execute the actual HTTP request with enhanced error handling
   */
  private async executeRequest(request: RequestData): Promise<ResponseData> {
    // Store original SSL setting for restoration
    let originalSSLValue: string | undefined;
    let sslModified = false;

    try {
      // Prepare base fetch options
      const options: RequestInit = {
        method: request.method,
        headers: request.headers ? { ...request.headers } : {},
        // Add timeout to prevent hanging requests
        signal: AbortSignal.timeout(30000), // 30 second timeout
      };

      // Handle SSL certificate validation using centralized configuration
      if (request.url.startsWith('https://')) {
        const sslSettings = sslConfig.getSSLSettings(request.url);
        
        // Apply SSL settings to Node.js environment
        // Note: Node.js native fetch respects NODE_TLS_REJECT_UNAUTHORIZED
        if (!sslSettings.rejectUnauthorized) {
          // Store original value and mark as modified
          originalSSLValue = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
          sslModified = true;
          
          // Temporarily set the environment variable for this request
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
          
          // Log warnings
          sslSettings.warnings.forEach(warning => {
            this.logger.warn(warning);
          });
        }
      }

      // Process request body using new processor
      if (this.shouldIncludeBody(request.method) && request.body) {
        try {
          const bodyData = this.bodyProcessor.createBodyData(request.body);
          const processed = await this.bodyProcessor.processBody(bodyData);
          
          options.body = processed.body;
          
          // Merge processed headers with existing headers
          if (options.headers && processed.headers) {
            Object.assign(options.headers, processed.headers);
          }
        } catch (error) {
          throw new RequestExecutionError(
            `Request body processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            request,
            error as Error
          );
        }
      }

      // Execute request with timeout handling
      let response: Response;
      try {
        response = await fetch(request.url, options);
      } catch (error) {
        if (error instanceof Error) {
          // Handle specific fetch errors
          if (error.name === 'AbortError') {
            throw new RequestTimeoutError(30000, request.url);
          }
          if (error.message.includes('ECONNREFUSED') || error.message.includes('ENOTFOUND')) {
            throw new HTTPError(
              `Network connection failed: ${error.message}`,
              502,
              request.url,
              request.method
            );
          }
          // Handle SSL/TLS certificate errors
          if (error.message.includes('CERT_') || error.message.includes('certificate') || 
              error.message.includes('SSL') || error.message.includes('TLS')) {
            throw new HTTPError(
              `SSL/TLS certificate error: ${error.message}. Consider using --ignore-certificate-errors for development.`,
              502,
              request.url,
              request.method
            );
          }
        }
        
        throw new HTTPError(
          `HTTP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          502,
          request.url,
          request.method
        );
      }
      
      // Check for HTTP error status codes
      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.text();
        } catch {
          errorBody = 'Unable to read error response';
        }
        
        throw new HTTPError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status,
          request.url,
          request.method,
          errorBody
        );
      }
      
      // Parse response using new parser with error handling
      let parsedResponse;
      try {
        parsedResponse = await this.responseParser.parseResponse(response);
      } catch (error) {
        throw new ResponseParsingError(
          `Response parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          response.headers.get('content-type') || undefined,
          response.status
        );
      }
      
      // Build response data
      const responseData: ResponseData = {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: parsedResponse.data,
        size: parsedResponse.size,
        timestamp: new Date(),
      };
      
      return ResponseDataSchema.parse(responseData);
      
    } catch (error) {
      // If it's already one of our custom errors, re-throw it
      if (error instanceof HTTPError || 
          error instanceof RequestTimeoutError || 
          error instanceof ResponseParsingError ||
          error instanceof RequestExecutionError) {
        throw error;
      }
      
      // Wrap unknown errors
      throw new RequestExecutionError(
        `HTTP request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        request,
        error as Error
      );
    } finally {
      // Restore original SSL setting if it was modified
      if (sslModified) {
        if (originalSSLValue === undefined) {
          delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        } else {
          process.env.NODE_TLS_REJECT_UNAUTHORIZED = originalSSLValue;
        }
      }
    }
  }

  /**
   * Check if HTTP method should include body
   */
  private shouldIncludeBody(method: string): boolean {
    return ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase());
  }

  /**
   * Check if status code indicates success
   */
  private isSuccessStatus(status: number): boolean {
    return ResponseUtils.isSuccessful(status);
  }

  /**
   * Execute requests in parallel with concurrency control
   */
  private async executeParallel(
    endpoints: ApiEndpoint[],
    concurrency: number,
    stopOnError: boolean
  ): Promise<{ results: RequestResult[]; errors: Error[] }> {
    const results: RequestResult[] = [];
    const errors: Error[] = [];
    
    // Execute in batches to control concurrency
    for (let i = 0; i < endpoints.length; i += concurrency) {
      const batch = endpoints.slice(i, i + concurrency);
      
      const promises = batch.map(async (endpoint, index) => {
        try {
          const result = await this.execute(endpoint);
          results[i + index] = result;
        } catch (error) {
          errors.push(error as Error);
          if (stopOnError) {
            throw error;
          }
        }
      });
      
      await Promise.all(promises);
    }
    
    return { results: results.filter(Boolean), errors };
  }

  /**
   * Execute requests sequentially
   */
  private async executeSequential(
    endpoints: ApiEndpoint[],
    stopOnError: boolean,
    delayBetweenRequests: number
  ): Promise<{ results: RequestResult[]; errors: Error[] }> {
    const results: RequestResult[] = [];
    const errors: Error[] = [];
    
    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      if (!endpoint) continue;
      
      try {
        const result = await this.execute(endpoint);
        results.push(result);
        
        // Add delay between requests if specified
        if (i < endpoints.length - 1 && delayBetweenRequests > 0) {
          await this.delay(delayBetweenRequests);
        }
        
      } catch (error) {
        errors.push(error as Error);
        if (stopOnError) {
          break;
        }
      }
    }
    
    return { results, errors };
  }

  /**
   * Delay execution for specified milliseconds
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create an error result for failed requests
   */
  private createErrorResult(
    endpoint: Partial<ApiEndpoint>,
    error: Error,
    duration: number
  ): RequestResult {
    // Determine appropriate HTTP status code based on error type
    let status = 500;
    let statusText = 'Internal Server Error';
    
    if (error instanceof HTTPError) {
      // Ensure status code is valid (>= 100)
      status = (!error.statusCode || error.statusCode < 100) ? 502 : error.statusCode;
      statusText = error.message;
    } else if (error instanceof RequestTimeoutError) {
      status = 504;
      statusText = 'Gateway Timeout';
    } else if (error.message.includes('ECONNREFUSED')) {
      status = 502;
      statusText = 'Bad Gateway - Connection Refused';
    } else if (error.message.includes('ENOTFOUND')) {
      status = 502;
      statusText = 'Bad Gateway - Host Not Found';
    }
    
    // Final safety check to ensure status is valid
    if (status < 100) {
      status = 502;
      statusText = 'Bad Gateway';
    }
    
    return {
      success: false,
      request: {
        method: endpoint.method || 'GET',
        url: endpoint.url || '',
        headers: endpoint.headers,
        queryParams: endpoint.queryParams,
        body: endpoint.body,
        timestamp: new Date(),
      },
      response: {
        status,
        statusText,
        headers: {},
        body: { error: error.message },
        timestamp: new Date(),
      },
      duration,
      error: error.message,
      timestamp: new Date(),
    };
  }

  /**
   * Create an error response for failed HTTP requests
   */
  private createErrorResponse(error: Error, _request: RequestData): ResponseData {
    let status = 500;
    if (error instanceof HTTPError) {
      // Ensure status code is valid (>= 100)
      status = (!error.statusCode || error.statusCode < 100) ? 502 : error.statusCode;
    }
    
    return {
      status,
      statusText: error.message,
      headers: {},
      body: {
        error: {
          message: error.message,
          code: error instanceof HTTPError ? error.code : 'REQUEST_FAILED',
          timestamp: new Date().toISOString(),
        },
      },
      size: 0,
      timestamp: new Date(),
    };
  }

  /**
   * Get error recovery statistics
   */
  getErrorRecoveryStats(): Record<string, any> {
    return this.errorRecovery.getRecoveryStats();
  }

  /**
   * Reset error recovery statistics
   */
  resetErrorRecoveryStats(): void {
    this.errorRecovery.resetStats();
  }

  /**
   * Health check for request executor
   */
  healthCheck(): { healthy: boolean; issues: string[] } {
    const recoveryHealth = this.errorRecovery.healthCheck();
    const authStats = this.authService.getCacheStats();
    
    const issues: string[] = [...recoveryHealth.issues];
    
    // Check auth cache size
    if (authStats.size > 1000) {
      issues.push(`Large authentication cache: ${authStats.size} entries`);
    }
    
    return {
      healthy: recoveryHealth.healthy && issues.length === 0,
      issues,
    };
  }

  // Environment Variable Management Methods

  /**
   * Set a global environment variable
   */
  async setGlobalVariable(name: string, value: any, type?: 'string' | 'number' | 'boolean' | 'secret', encrypt?: boolean): Promise<void> {
    await this.environmentManager.setGlobalVariable(name, value, type, { encrypt });
  }

  /**
   * Set a workspace environment variable
   */
  async setWorkspaceVariable(name: string, value: any, type?: 'string' | 'number' | 'boolean' | 'secret', encrypt?: boolean): Promise<void> {
    await this.environmentManager.setWorkspaceVariable(name, value, type, { encrypt });
  }

  /**
   * Set an environment-specific variable
   */
  async setEnvironmentVariable(name: string, value: any, type?: 'string' | 'number' | 'boolean' | 'secret', encrypt?: boolean): Promise<void> {
    await this.environmentManager.setEnvironmentVariable(name, value, type, { encrypt });
  }

  /**
   * Get an environment variable value
   */
  async getVariable(name: string): Promise<any> {
    return await this.environmentManager.getVariable(name);
  }

  /**
   * Get all environment variables
   */
  async getAllVariables(includeSecrets: boolean = false): Promise<Variables> {
    return await this.environmentManager.getAllVariables({ includeSecrets });
  }

  /**
   * Delete an environment variable
   */
  deleteVariable(name: string, scope?: 'global' | 'workspace' | 'environment'): boolean {
    return this.environmentManager.deleteVariable(name, scope);
  }

  /**
   * List all environment variables
   */
  listVariables(scope?: 'global' | 'workspace' | 'environment'): Array<{ name: string; type: string; encrypted: boolean; scope: string }> {
    return this.environmentManager.listVariables(scope);
  }

  /**
   * Configure encryption for environment variables
   */
  async setEncryptionConfig(enabled: boolean, encryptionKey?: string): Promise<void> {
    await this.environmentManager.setEncryptionConfig(enabled, encryptionKey);
  }

  /**
   * Get environment manager instance for advanced operations
   */
  getEnvironmentManager(): EnvironmentManager {
    return this.environmentManager;
  }

  /**
   * Validate variable syntax in data
   */
  validateVariableSyntax(data: any): { valid: boolean; errors: string[]; variables: string[] } {
    return this.environmentManager.validateVariableSyntax(data);
  }

  /**
   * Preview variable replacement without applying it
   */
  async previewVariableReplacement(data: any, customVariables?: Variables): Promise<any> {
    const result = await this.environmentManager.replaceVariables(data, { customVariables });
    return {
      preview: result.processedValue,
      replacements: result.replacements,
      warnings: result.warnings,
      errors: result.errors,
    };
  }
}