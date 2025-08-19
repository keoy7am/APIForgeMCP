/**
 * Batch Executor Service
 * Handles execution of multiple API requests in batch mode
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  ApiEndpoint,
  RequestResult,
  BatchExecutionOptions,
  BatchExecutionResult,
  BatchItemResult,
  BatchProgress,
  BatchExecutionState,
} from '../../types';
import type { RequestExecutor } from '../request.service';
import type { HistoryService } from '../history/history.service';
import type { ErrorHandler } from '../error';

/**
 * Batch Executor Service
 */
export class BatchExecutor {
  private requestExecutor: RequestExecutor;
  private historyService: HistoryService;
  private logger: any;
  private currentState: BatchExecutionState | null = null;
  private defaultConcurrency = 5;
  private maxConcurrency = 20;

  constructor(
    requestExecutor: RequestExecutor,
    historyService: HistoryService,
    _errorHandler: ErrorHandler,
    logger: any
  ) {
    this.requestExecutor = requestExecutor;
    this.historyService = historyService;
    this.logger = logger;
  }

  /**
   * Execute a batch of endpoints
   */
  async executeBatch(
    endpoints: ApiEndpoint[],
    options: BatchExecutionOptions = {}
  ): Promise<BatchExecutionResult> {
    const batchId = uuidv4();
    const startTime = new Date();
    
    this.logger.info(`Starting batch execution ${batchId} with ${endpoints.length} endpoints`);

    // Initialize execution state
    const state: BatchExecutionState = {
      id: batchId,
      isExecuting: true,
      progress: this.initializeProgress(endpoints.length, startTime),
      partialResults: [],
      cancellable: true,
      abortController: new AbortController(),
    };
    
    this.currentState = state;

    try {
      // Prepare execution options
      const executionOptions = this.prepareOptions(options);
      
      // Execute based on mode
      const results = executionOptions.mode === 'parallel'
        ? await this.executeParallel(endpoints, executionOptions, state)
        : await this.executeSequential(endpoints, executionOptions, state);

      // Create final result
      const endTime = new Date();
      const executionResult = this.createExecutionResult(
        batchId,
        endpoints[0]?.workspaceId || '',
        results,
        executionOptions,
        startTime,
        endTime,
        false
      );

      // Record in history if successful
      if (executionResult.summary.successful > 0) {
        await this.recordBatchHistory(executionResult);
      }

      this.logger.info(`Batch execution ${batchId} completed: ${executionResult.summary.successful}/${executionResult.summary.total} successful`);
      
      return executionResult;
    } catch (error) {
      const typedError = error as Error;
      this.logger.error(`Batch execution ${batchId} failed:`, typedError);
      
      // Create error result
      const endTime = new Date();
      return this.createExecutionResult(
        batchId,
        endpoints[0]?.workspaceId || '',
        state.partialResults,
        options,
        startTime,
        endTime,
        true,
        typedError.message
      );
    } finally {
      this.currentState = null;
    }
  }

  /**
   * Execute endpoints in parallel
   */
  private async executeParallel(
    endpoints: ApiEndpoint[],
    options: BatchExecutionOptions,
    state: BatchExecutionState
  ): Promise<BatchItemResult[]> {
    const concurrency = Math.min(
      options.concurrency || this.defaultConcurrency,
      this.maxConcurrency
    );
    
    this.logger.debug(`Executing batch in parallel with concurrency: ${concurrency}`);

    const results: BatchItemResult[] = [];
    const queue = [...endpoints];
    const executing: Promise<void>[] = [];

    // Process queue with concurrency limit
    while (queue.length > 0 || executing.length > 0) {
      // Check for abort
      if (state.abortController?.signal.aborted) {
        this.logger.info('Batch execution aborted');
        break;
      }

      // Start new executions up to concurrency limit
      while (executing.length < concurrency && queue.length > 0) {
        const endpoint = queue.shift()!;
        const index = endpoints.indexOf(endpoint);
        
        const execution = this.executeEndpoint(
          endpoint,
          index,
          options,
          state
        ).then(result => {
          results[index] = result;
          state.partialResults.push(result);
          this.updateProgress(state, result);
          
          // Check stop on error
          if (options.stopOnError && !result.result.success) {
            state.abortController?.abort();
          }
        });

        executing.push(execution);
      }

      // Wait for at least one to complete
      if (executing.length > 0) {
        await Promise.race(executing).then(() => {
          // Remove completed executions
          executing.splice(
            0,
            executing.length,
            ...executing.filter(p => p instanceof Promise)
          );
        });
      }
    }

    // Wait for remaining executions
    await Promise.all(executing);

    return results.filter(Boolean); // Remove any undefined entries
  }

  /**
   * Execute endpoints sequentially
   */
  private async executeSequential(
    endpoints: ApiEndpoint[],
    options: BatchExecutionOptions,
    state: BatchExecutionState
  ): Promise<BatchItemResult[]> {
    this.logger.debug('Executing batch in sequential mode');
    
    const results: BatchItemResult[] = [];
    
    for (let i = 0; i < endpoints.length; i++) {
      // Check for abort
      if (state.abortController?.signal.aborted) {
        this.logger.info('Batch execution aborted');
        break;
      }

      const endpoint = endpoints[i];
      if (!endpoint) {
        continue;
      }
      const result = await this.executeEndpoint(endpoint, i, options, state);
      
      results.push(result);
      state.partialResults.push(result);
      this.updateProgress(state, result);

      // Check stop on error
      if (options.stopOnError && !result.result.success) {
        this.logger.info(`Stopping batch execution due to error at index ${i}`);
        break;
      }

      // Add delay between requests if specified
      if (options.delayBetweenRequests && i < endpoints.length - 1) {
        await this.delay(options.delayBetweenRequests);
      }
    }

    return results;
  }

  /**
   * Execute a single endpoint
   */
  private async executeEndpoint(
    endpoint: ApiEndpoint,
    index: number,
    options: BatchExecutionOptions,
    state: BatchExecutionState
  ): Promise<BatchItemResult> {
    const startTime = new Date();
    
    // Update current in progress
    state.progress.current = {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      method: endpoint.method,
      url: endpoint.url,
    };
    
    // Notify progress
    if (options.onProgress) {
      options.onProgress(state.progress);
    }

    let result: RequestResult;
    let error: Error | undefined;
    let retryAttempts = 0;

    try {
      // Execute with retry logic
      result = await this.executeWithRetry(
        endpoint,
        options,
        (attempts) => { retryAttempts = attempts; }
      );
    } catch (err) {
      const typedErr = err as Error;
      error = typedErr;
      result = {
        success: false,
        request: {
          method: endpoint.method,
          url: endpoint.url,
          headers: endpoint.headers,
          queryParams: endpoint.queryParams,
          body: endpoint.body,
          timestamp: new Date(),
        },
        error: typedErr.message,
        duration: Date.now() - startTime.getTime(),
        timestamp: new Date(),
      };
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    return {
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      index,
      request: result.request,
      response: result.response,
      result,
      error,
      retryAttempts,
      duration,
      startTime,
      endTime,
    };
  }

  /**
   * Execute endpoint with retry logic
   */
  private async executeWithRetry(
    endpoint: ApiEndpoint,
    options: BatchExecutionOptions,
    onAttempt: (attempts: number) => void
  ): Promise<RequestResult> {
    const maxAttempts = options.retryFailedRequests
      ? (options.maxRetryAttempts || 3)
      : 1;
    
    let lastError: Error | undefined;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      onAttempt(attempt);
      
      try {
        const result = await this.requestExecutor.execute(endpoint, {
          variables: options.variables,
          environmentId: options.environmentId,
          timeout: options.timeout,
        });
        
        if (result.success || !options.retryFailedRequests) {
          return result;
        }
        
        lastError = new Error(result.error || 'Request failed');
        
        // Don't retry on client errors (4xx)
        if (result.response?.status && result.response.status >= 400 && result.response.status < 500) {
          return result;
        }
        
        // Add exponential backoff delay before retry
        if (attempt < maxAttempts) {
          await this.delay(Math.pow(2, attempt - 1) * 1000);
        }
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxAttempts) {
          await this.delay(Math.pow(2, attempt - 1) * 1000);
        }
      }
    }
    
    throw lastError || new Error('Max retry attempts reached');
  }

  /**
   * Update progress
   */
  private updateProgress(state: BatchExecutionState, result: BatchItemResult): void {
    const progress = state.progress;
    
    progress.completed++;
    if (result.result.success) {
      progress.successful++;
    } else {
      progress.failed++;
    }
    progress.pending = progress.total - progress.completed;
    progress.percentage = Math.round((progress.completed / progress.total) * 100);
    
    // Estimate time remaining
    const elapsed = Date.now() - progress.startTime.getTime();
    const averageTime = elapsed / progress.completed;
    progress.estimatedTimeRemaining = Math.round(averageTime * progress.pending);
    
    progress.currentTime = new Date();
  }

  /**
   * Initialize progress
   */
  private initializeProgress(total: number, startTime: Date): BatchProgress {
    return {
      total,
      completed: 0,
      successful: 0,
      failed: 0,
      pending: total,
      percentage: 0,
      startTime,
      currentTime: startTime,
    };
  }

  /**
   * Prepare execution options
   */
  private prepareOptions(options: BatchExecutionOptions): BatchExecutionOptions {
    return {
      mode: options.mode || 'sequential',
      concurrency: options.concurrency || this.defaultConcurrency,
      stopOnError: options.stopOnError !== undefined ? options.stopOnError : false,
      delayBetweenRequests: options.delayBetweenRequests || 0,
      timeout: options.timeout || 30000,
      retryFailedRequests: options.retryFailedRequests || false,
      maxRetryAttempts: options.maxRetryAttempts || 3,
      onProgress: options.onProgress,
      variables: options.variables || {},
      environmentId: options.environmentId,
    };
  }

  /**
   * Create execution result
   */
  private createExecutionResult(
    id: string,
    workspaceId: string,
    results: BatchItemResult[],
    options: BatchExecutionOptions,
    startTime: Date,
    endTime: Date,
    aborted: boolean,
    abortReason?: string
  ): BatchExecutionResult {
    const successful = results.filter(r => r.result.success).length;
    const failed = results.filter(r => !r.result.success).length;
    const total = results.length;
    const skipped = options.mode === 'sequential' && options.stopOnError
      ? Math.max(0, total - successful - failed)
      : 0;
    
    const durations = results.map(r => r.duration);
    const totalDuration = endTime.getTime() - startTime.getTime();
    const averageDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const errors = results
      .filter(r => r.error)
      .map(r => ({
        endpointId: r.endpointId,
        error: r.error!,
        timestamp: r.endTime,
      }));

    return {
      id,
      workspaceId,
      success: failed === 0 && !aborted,
      results,
      summary: {
        total,
        successful,
        failed,
        skipped,
        averageDuration,
        totalDuration,
      },
      options,
      startTime,
      endTime,
      aborted,
      abortReason,
      errors,
    };
  }

  /**
   * Record batch execution in history
   */
  private async recordBatchHistory(result: BatchExecutionResult): Promise<void> {
    try {
      // Record each successful request in history
      for (const item of result.results) {
        if (item.result.success && item.response) {
          await this.historyService.recordRequest(
            result.workspaceId,
            item.request,
            item.response,
            item.duration,
            {
              endpointId: item.endpointId,
              endpointName: item.endpointName,
              tags: ['batch', `batch-${result.id}`],
              notes: `Batch execution ${result.id}, item ${item.index} of ${result.summary.total}`,
            }
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to record batch history:', error);
      // Don't throw - history recording is not critical
    }
  }

  /**
   * Cancel current batch execution
   */
  async cancelBatch(): Promise<boolean> {
    if (this.currentState && this.currentState.cancellable) {
      this.logger.info(`Cancelling batch execution ${this.currentState.id}`);
      this.currentState.abortController?.abort();
      return true;
    }
    return false;
  }

  /**
   * Get current batch state
   */
  getCurrentState(): BatchExecutionState | null {
    return this.currentState;
  }

  /**
   * Helper to create delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}