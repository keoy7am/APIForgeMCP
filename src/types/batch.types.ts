/**
 * Batch Execution Types
 */

import type { ApiEndpoint, RequestResult, RequestData, ResponseData } from './index';

/**
 * Batch execution mode
 */
export type BatchExecutionMode = 'parallel' | 'sequential';

/**
 * Batch execution options
 */
export interface BatchExecutionOptions {
  /**
   * Execution mode
   */
  mode?: BatchExecutionMode;
  
  /**
   * Maximum concurrent requests for parallel mode
   */
  concurrency?: number;
  
  /**
   * Stop on first error
   */
  stopOnError?: boolean;
  
  /**
   * Delay between requests in ms (sequential mode)
   */
  delayBetweenRequests?: number;
  
  /**
   * Request timeout in ms
   */
  timeout?: number;
  
  /**
   * Retry failed requests
   */
  retryFailedRequests?: boolean;
  
  /**
   * Maximum retry attempts
   */
  maxRetryAttempts?: number;
  
  /**
   * Progress callback
   */
  onProgress?: (progress: BatchProgress) => void;
  
  /**
   * Variables for request substitution
   */
  variables?: Record<string, any>;
  
  /**
   * Environment ID to use
   */
  environmentId?: string;
}

/**
 * Batch execution progress
 */
export interface BatchProgress {
  /**
   * Total number of requests
   */
  total: number;
  
  /**
   * Number of completed requests
   */
  completed: number;
  
  /**
   * Number of successful requests
   */
  successful: number;
  
  /**
   * Number of failed requests
   */
  failed: number;
  
  /**
   * Number of pending requests
   */
  pending: number;
  
  /**
   * Current request being executed
   */
  current?: {
    endpointId: string;
    endpointName: string;
    method: string;
    url: string;
  };
  
  /**
   * Percentage complete (0-100)
   */
  percentage: number;
  
  /**
   * Estimated time remaining in ms
   */
  estimatedTimeRemaining?: number;
  
  /**
   * Start time
   */
  startTime: Date;
  
  /**
   * Current time
   */
  currentTime: Date;
}

/**
 * Individual batch item result
 */
export interface BatchItemResult {
  /**
   * Endpoint ID
   */
  endpointId: string;
  
  /**
   * Endpoint name
   */
  endpointName: string;
  
  /**
   * Execution order index
   */
  index: number;
  
  /**
   * Request data
   */
  request: RequestData;
  
  /**
   * Response data (if successful)
   */
  response?: ResponseData;
  
  /**
   * Request result
   */
  result: RequestResult;
  
  /**
   * Error if failed
   */
  error?: Error;
  
  /**
   * Number of retry attempts
   */
  retryAttempts?: number;
  
  /**
   * Execution duration in ms
   */
  duration: number;
  
  /**
   * Start time
   */
  startTime: Date;
  
  /**
   * End time
   */
  endTime: Date;
}

/**
 * Batch execution result
 */
export interface BatchExecutionResult {
  /**
   * Batch execution ID
   */
  id: string;
  
  /**
   * Workspace ID
   */
  workspaceId: string;
  
  /**
   * Overall success status
   */
  success: boolean;
  
  /**
   * Individual results
   */
  results: BatchItemResult[];
  
  /**
   * Summary statistics
   */
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    averageDuration: number;
    totalDuration: number;
  };
  
  /**
   * Execution options used
   */
  options: BatchExecutionOptions;
  
  /**
   * Start time
   */
  startTime: Date;
  
  /**
   * End time
   */
  endTime: Date;
  
  /**
   * Was execution aborted?
   */
  aborted: boolean;
  
  /**
   * Abort reason if aborted
   */
  abortReason?: string;
  
  /**
   * Errors encountered
   */
  errors: Array<{
    endpointId: string;
    error: Error;
    timestamp: Date;
  }>;
}

/**
 * Batch execution state
 */
export interface BatchExecutionState {
  /**
   * Current execution ID
   */
  id: string;
  
  /**
   * Is batch currently executing?
   */
  isExecuting: boolean;
  
  /**
   * Current progress
   */
  progress: BatchProgress;
  
  /**
   * Partial results collected so far
   */
  partialResults: BatchItemResult[];
  
  /**
   * Can the batch be cancelled?
   */
  cancellable: boolean;
  
  /**
   * Abort controller for cancellation
   */
  abortController?: AbortController;
}

/**
 * Batch queue item
 */
export interface BatchQueueItem {
  /**
   * Queue item ID
   */
  id: string;
  
  /**
   * Endpoint to execute
   */
  endpoint: ApiEndpoint;
  
  /**
   * Priority (higher = more priority)
   */
  priority: number;
  
  /**
   * Status
   */
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  
  /**
   * Dependencies (other item IDs that must complete first)
   */
  dependencies?: string[];
}

/**
 * Batch execution strategy
 */
export interface BatchExecutionStrategy {
  /**
   * Strategy name
   */
  name: string;
  
  /**
   * Prepare batch for execution
   */
  prepare(endpoints: ApiEndpoint[], options: BatchExecutionOptions): BatchQueueItem[];
  
  /**
   * Execute batch
   */
  execute(
    queue: BatchQueueItem[],
    executor: (endpoint: ApiEndpoint) => Promise<RequestResult>,
    options: BatchExecutionOptions
  ): Promise<BatchExecutionResult>;
  
  /**
   * Handle progress updates
   */
  onProgress?(progress: BatchProgress): void;
  
  /**
   * Handle item completion
   */
  onItemComplete?(item: BatchQueueItem, result: BatchItemResult): void;
  
  /**
   * Handle errors
   */
  onError?(item: BatchQueueItem, error: Error): void;
}

/**
 * Batch collection
 */
export interface BatchCollection {
  /**
   * Collection ID
   */
  id: string;
  
  /**
   * Collection name
   */
  name: string;
  
  /**
   * Description
   */
  description?: string;
  
  /**
   * Endpoints in the collection
   */
  endpoints: ApiEndpoint[];
  
  /**
   * Default execution options
   */
  defaultOptions?: BatchExecutionOptions;
  
  /**
   * Tags
   */
  tags?: string[];
  
  /**
   * Created date
   */
  createdAt: Date;
  
  /**
   * Updated date
   */
  updatedAt: Date;
}

/**
 * Batch schedule
 */
export interface BatchSchedule {
  /**
   * Schedule ID
   */
  id: string;
  
  /**
   * Schedule name
   */
  name: string;
  
  /**
   * Batch collection ID
   */
  collectionId: string;
  
  /**
   * Cron expression
   */
  cronExpression: string;
  
  /**
   * Is schedule active?
   */
  active: boolean;
  
  /**
   * Execution options
   */
  options: BatchExecutionOptions;
  
  /**
   * Last execution time
   */
  lastExecutionTime?: Date;
  
  /**
   * Next execution time
   */
  nextExecutionTime?: Date;
  
  /**
   * Last execution result
   */
  lastExecutionResult?: BatchExecutionResult;
}