/**
 * Batch Execution Strategies
 * Different strategies for executing batches of API requests
 */

import type {
  ApiEndpoint,
  RequestResult,
  BatchExecutionOptions,
  BatchExecutionResult,
  BatchExecutionStrategy,
  BatchQueueItem,
  BatchItemResult,
} from '../../types';

/**
 * Simple Sequential Strategy
 * Executes requests one after another
 */
export class SequentialStrategy implements BatchExecutionStrategy {
  name = 'sequential';

  prepare(endpoints: ApiEndpoint[], _options: BatchExecutionOptions): BatchQueueItem[] {
    return endpoints.map((endpoint, index) => ({
      id: `${endpoint.id}-${index}`,
      endpoint,
      priority: index,
      status: 'pending' as const,
      dependencies: index > 0 && endpoints[index - 1] ? [`${endpoints[index - 1].id}-${index - 1}`] : undefined,
    }));
  }

  async execute(
    queue: BatchQueueItem[],
    executor: (endpoint: ApiEndpoint) => Promise<RequestResult>,
    options: BatchExecutionOptions
  ): Promise<BatchExecutionResult> {
    const results: BatchItemResult[] = [];
    const startTime = new Date();
    
    for (const item of queue) {
      if (item.status === 'skipped') continue;
      
      item.status = 'executing';
      const itemStartTime = new Date();
      
      try {
        const result = await executor(item.endpoint);
        const itemEndTime = new Date();
        
        results.push({
          endpointId: item.endpoint.id,
          endpointName: item.endpoint.name,
          index: item.priority,
          request: result.request,
          response: result.response,
          result,
          duration: itemEndTime.getTime() - itemStartTime.getTime(),
          startTime: itemStartTime,
          endTime: itemEndTime,
        });
        
        item.status = 'completed';
        
        if (this.onItemComplete) {
          const lastResult = results[results.length - 1];
          if (lastResult) {
            this.onItemComplete(item, lastResult);
          }
        }
        
        // Stop on error if configured
        if (options.stopOnError && !result.success) {
          // Mark remaining items as skipped
          queue.forEach(q => {
            if (q.status === 'pending') q.status = 'skipped';
          });
          break;
        }
        
        // Delay between requests
        if (options.delayBetweenRequests && item !== queue[queue.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, options.delayBetweenRequests));
        }
      } catch (error) {
        item.status = 'failed';
        
        if (this.onError) {
          this.onError(item, error as Error);
        }
        
        if (options.stopOnError) {
          // Mark remaining items as skipped
          queue.forEach(q => {
            if (q.status === 'pending') q.status = 'skipped';
          });
          break;
        }
      }
    }
    
    const endTime = new Date();
    return this.createResult(queue, results, options, startTime, endTime);
  }

  onItemComplete?: (item: BatchQueueItem, result: BatchItemResult) => void;
  onError?: (item: BatchQueueItem, error: Error) => void;

  private createResult(
    queue: BatchQueueItem[],
    results: BatchItemResult[],
    options: BatchExecutionOptions,
    startTime: Date,
    endTime: Date
  ): BatchExecutionResult {
    const successful = results.filter(r => r.result.success).length;
    const failed = results.filter(r => !r.result.success).length;
    const skipped = queue.filter(q => q.status === 'skipped').length;
    const total = queue.length;
    
    return {
      id: `batch-${Date.now()}`,
      workspaceId: queue[0]?.endpoint.workspaceId || '',
      success: failed === 0 && skipped === 0,
      results,
      summary: {
        total,
        successful,
        failed,
        skipped,
        averageDuration: results.length > 0
          ? results.reduce((sum, r) => sum + r.duration, 0) / results.length
          : 0,
        totalDuration: endTime.getTime() - startTime.getTime(),
      },
      options,
      startTime,
      endTime,
      aborted: false,
      errors: [],
    };
  }
}

/**
 * Parallel Strategy with Concurrency Control
 * Executes multiple requests simultaneously with a concurrency limit
 */
export class ParallelStrategy implements BatchExecutionStrategy {
  name = 'parallel';
  
  prepare(endpoints: ApiEndpoint[], _options: BatchExecutionOptions): BatchQueueItem[] {
    return endpoints.map((endpoint, index) => ({
      id: `${endpoint.id}-${index}`,
      endpoint,
      priority: 0, // All have same priority in parallel execution
      status: 'pending' as const,
    }));
  }

  async execute(
    queue: BatchQueueItem[],
    executor: (endpoint: ApiEndpoint) => Promise<RequestResult>,
    options: BatchExecutionOptions
  ): Promise<BatchExecutionResult> {
    const concurrency = options.concurrency || 5;
    const results: BatchItemResult[] = new Array(queue.length);
    const startTime = new Date();
    
    // Create execution promises with concurrency control
    const executing: Set<Promise<void>> = new Set();
    const pending = [...queue];
    
    while (pending.length > 0 || executing.size > 0) {
      // Start new executions up to concurrency limit
      while (executing.size < concurrency && pending.length > 0) {
        const item = pending.shift()!;
        const index = queue.indexOf(item);
        
        const execution = this.executeItem(item, index, executor, results)
          .then(() => {
            executing.delete(execution);
            if (this.onItemComplete && results[index]) {
              this.onItemComplete(item, results[index]);
            }
          })
          .catch(error => {
            executing.delete(execution);
            if (this.onError) {
              this.onError(item, error);
            }
          });
        
        executing.add(execution);
      }
      
      // Wait for at least one to complete
      if (executing.size > 0) {
        await Promise.race(executing);
      }
    }
    
    const endTime = new Date();
    return this.createResult(queue, results.filter(Boolean), options, startTime, endTime);
  }

  private async executeItem(
    item: BatchQueueItem,
    index: number,
    executor: (endpoint: ApiEndpoint) => Promise<RequestResult>,
    results: BatchItemResult[]
  ): Promise<void> {
    item.status = 'executing';
    const itemStartTime = new Date();
    
    try {
      const result = await executor(item.endpoint);
      const itemEndTime = new Date();
      
      results[index] = {
        endpointId: item.endpoint.id,
        endpointName: item.endpoint.name,
        index,
        request: result.request,
        response: result.response,
        result,
        duration: itemEndTime.getTime() - itemStartTime.getTime(),
        startTime: itemStartTime,
        endTime: itemEndTime,
      };
      
      item.status = 'completed';
    } catch (error) {
      item.status = 'failed';
      throw error;
    }
  }

  onItemComplete?: (item: BatchQueueItem, result: BatchItemResult) => void;
  onError?: (item: BatchQueueItem, error: Error) => void;

  private createResult(
    queue: BatchQueueItem[],
    results: BatchItemResult[],
    options: BatchExecutionOptions,
    startTime: Date,
    endTime: Date
  ): BatchExecutionResult {
    const successful = results.filter(r => r.result.success).length;
    const failed = results.filter(r => !r.result.success).length;
    const skipped = queue.filter(q => q.status === 'skipped').length;
    const total = queue.length;
    
    return {
      id: `batch-${Date.now()}`,
      workspaceId: queue[0]?.endpoint.workspaceId || '',
      success: failed === 0 && skipped === 0,
      results,
      summary: {
        total,
        successful,
        failed,
        skipped,
        averageDuration: results.length > 0
          ? results.reduce((sum, r) => sum + r.duration, 0) / results.length
          : 0,
        totalDuration: endTime.getTime() - startTime.getTime(),
      },
      options,
      startTime,
      endTime,
      aborted: false,
      errors: [],
    };
  }
}

/**
 * Priority-based Strategy
 * Executes requests based on priority with dependency support
 */
export class PriorityStrategy implements BatchExecutionStrategy {
  name = 'priority';
  
  prepare(endpoints: ApiEndpoint[], _options: BatchExecutionOptions): BatchQueueItem[] {
    // Sort by priority (tags can indicate priority)
    const priorityMap: Record<string, number> = {
      'critical': 100,
      'high': 75,
      'medium': 50,
      'low': 25,
    };
    
    return endpoints
      .map((endpoint, index) => {
        // Determine priority from tags
        const priorityTag = endpoint.tags?.find(tag => 
          Object.keys(priorityMap).includes(tag.toLowerCase())
        );
        const priority = priorityTag ? priorityMap[priorityTag.toLowerCase()] ?? 50 : 50;
        
        return {
          id: `${endpoint.id}-${index}`,
          endpoint,
          priority,
          status: 'pending' as const,
        };
      })
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)); // Higher priority first
  }

  async execute(
    queue: BatchQueueItem[],
    executor: (endpoint: ApiEndpoint) => Promise<RequestResult>,
    options: BatchExecutionOptions
  ): Promise<BatchExecutionResult> {
    const concurrency = options.concurrency || 5;
    const results: BatchItemResult[] = [];
    const startTime = new Date();
    
    // Group by priority
    const priorityGroups = new Map<number, BatchQueueItem[]>();
    queue.forEach(item => {
      const group = priorityGroups.get(item.priority) || [];
      group.push(item);
      priorityGroups.set(item.priority, group);
    });
    
    // Sort priority levels
    const priorities = Array.from(priorityGroups.keys()).sort((a, b) => b - a);
    
    // Execute each priority group
    for (const priority of priorities) {
      const group = priorityGroups.get(priority)!;
      
      // Execute group in parallel with concurrency control
      const groupResults = await this.executeGroup(group, executor, concurrency);
      results.push(...groupResults);
      
      // Check for stop on error
      if (options.stopOnError && groupResults.some(r => !r.result.success)) {
        // Mark remaining items as skipped
        priorities.slice(priorities.indexOf(priority) + 1).forEach(p => {
          const skippedGroup = priorityGroups.get(p)!;
          skippedGroup.forEach(item => item.status = 'skipped');
        });
        break;
      }
    }
    
    const endTime = new Date();
    return this.createResult(queue, results, options, startTime, endTime);
  }

  private async executeGroup(
    group: BatchQueueItem[],
    executor: (endpoint: ApiEndpoint) => Promise<RequestResult>,
    concurrency: number
  ): Promise<BatchItemResult[]> {
    const results: BatchItemResult[] = [];
    const executing: Promise<BatchItemResult>[] = [];
    const pending = [...group];
    
    while (pending.length > 0 || executing.length > 0) {
      // Start new executions up to concurrency limit
      while (executing.length < concurrency && pending.length > 0) {
        const item = pending.shift()!;
        const promise = this.executeItem(item, executor);
        executing.push(promise);
      }
      
      // Wait for at least one to complete
      if (executing.length > 0) {
        const result = await Promise.race(executing);
        results.push(result);
        const index = results.length - 1; // Just use the result position
        executing.splice(index, 1);
      }
    }
    
    return results;
  }

  private async executeItem(
    item: BatchQueueItem,
    executor: (endpoint: ApiEndpoint) => Promise<RequestResult>
  ): Promise<BatchItemResult> {
    item.status = 'executing';
    const itemStartTime = new Date();
    
    try {
      const result = await executor(item.endpoint);
      const itemEndTime = new Date();
      
      item.status = 'completed';
      
      return {
        endpointId: item.endpoint.id,
        endpointName: item.endpoint.name,
        index: 0, // Will be set later
        request: result.request,
        response: result.response,
        result,
        duration: itemEndTime.getTime() - itemStartTime.getTime(),
        startTime: itemStartTime,
        endTime: itemEndTime,
      };
    } catch (error) {
      item.status = 'failed';
      throw error;
    }
  }

  private createResult(
    queue: BatchQueueItem[],
    results: BatchItemResult[],
    options: BatchExecutionOptions,
    startTime: Date,
    endTime: Date
  ): BatchExecutionResult {
    const successful = results.filter(r => r.result.success).length;
    const failed = results.filter(r => !r.result.success).length;
    const skipped = queue.filter(q => q.status === 'skipped').length;
    const total = queue.length;
    
    return {
      id: `batch-${Date.now()}`,
      workspaceId: queue[0]?.endpoint.workspaceId || '',
      success: failed === 0 && skipped === 0,
      results,
      summary: {
        total,
        successful,
        failed,
        skipped,
        averageDuration: results.length > 0
          ? results.reduce((sum, r) => sum + r.duration, 0) / results.length
          : 0,
        totalDuration: endTime.getTime() - startTime.getTime(),
      },
      options,
      startTime,
      endTime,
      aborted: false,
      errors: [],
    };
  }
}

/**
 * Strategy Factory
 */
export class BatchStrategyFactory {
  private strategies: Map<string, BatchExecutionStrategy> = new Map();

  constructor() {
    this.registerStrategy(new SequentialStrategy());
    this.registerStrategy(new ParallelStrategy());
    this.registerStrategy(new PriorityStrategy());
  }

  /**
   * Register a strategy
   */
  registerStrategy(strategy: BatchExecutionStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  /**
   * Get a strategy by name
   */
  getStrategy(name: string): BatchExecutionStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Get all available strategies
   */
  getAvailableStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }
}