/**
 * History-related type definitions
 */

import { HttpMethod, RequestData, ResponseData } from './index';

/**
 * Request history entry
 */
export interface RequestHistory {
  id: string;
  workspaceId: string;
  endpointId?: string;
  endpointName?: string;
  timestamp: Date;
  request: RequestData;
  response: ResponseData;
  duration: number; // in milliseconds
  status: 'success' | 'failure' | 'error' | 'timeout' | 'cancelled';
  error?: string | {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    environmentId?: string;
    environmentName?: string;
    userId?: string;
    userAgent?: string;
    ipAddress?: string;
    tags?: string[];
    notes?: string;
  };
  performance?: {
    dnsLookup?: number;
    tcpConnection?: number;
    tlsHandshake?: number;
    firstByte?: number;
    download?: number;
    total: number;
  };
}

/**
 * History query filters
 */
export interface HistoryQueryFilters {
  workspaceId?: string;
  endpointId?: string;
  method?: HttpMethod | HttpMethod[];
  status?: RequestHistory['status'] | RequestHistory['status'][];
  startDate?: Date;
  endDate?: Date;
  minDuration?: number;
  maxDuration?: number;
  statusCode?: number | number[];
  url?: string; // partial match
  tags?: string[];
  environmentId?: string;
  searchTerm?: string; // search in url, endpoint name, notes
}

/**
 * History query options
 */
export interface HistoryQueryOptions {
  filters?: HistoryQueryFilters;
  sortBy?: 'timestamp' | 'duration' | 'status' | 'statusCode' | 'endpointName';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  includeHeaders?: boolean;
}

/**
 * History query result
 */
export interface HistoryQueryResult {
  entries: RequestHistory[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/**
 * History statistics
 */
export interface HistoryStatistics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageDuration: number;
  medianDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  p99Duration: number;
  requestsPerMinute: number;
  errorRate: number;
  timeRange: {
    start: Date;
    end: Date;
  };
  topEndpoints: Array<{
    endpointId: string;
    endpointName: string;
    count: number;
    averageDuration: number;
    errorRate: number;
  }>;
  statusCodeDistribution: Record<number, number>;
  methodDistribution: Record<HttpMethod, number>;
  errorDistribution: Record<string, number>;
  performanceMetrics?: {
    averageDnsLookup: number;
    averageTcpConnection: number;
    averageTlsHandshake: number;
    averageFirstByte: number;
    averageDownload: number;
  };
}

/**
 * History aggregation options
 */
export interface HistoryAggregationOptions {
  groupBy?: 'hour' | 'day' | 'week' | 'month' | 'endpoint' | 'status' | 'method';
  metrics?: Array<'count' | 'duration' | 'errorRate' | 'successRate'>;
  timeRange?: {
    start: Date;
    end: Date;
  };
  timezone?: string;
}

/**
 * History aggregation result
 */
export interface HistoryAggregationResult {
  groups: Array<{
    key: string | Date;
    label: string;
    count: number;
    metrics: {
      averageDuration?: number;
      errorRate?: number;
      successRate?: number;
      totalDuration?: number;
      minDuration?: number;
      maxDuration?: number;
    };
  }>;
  summary: {
    totalGroups: number;
    totalRequests: number;
    timeRange?: {
      start: Date;
      end: Date;
    };
  };
}

/**
 * History export options
 */
export interface HistoryExportOptions {
  format: 'json' | 'csv' | 'har' | 'postman';
  filters?: HistoryQueryFilters;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  includeHeaders?: boolean;
  includePerfMetrics?: boolean;
  maxEntries?: number;
}

/**
 * History retention policy
 */
export interface HistoryRetentionPolicy {
  enabled: boolean;
  maxAge?: number; // days
  maxEntries?: number;
  maxSizeMB?: number;
  excludeTags?: string[]; // entries with these tags won't be deleted
  excludeErrors?: boolean; // keep all error entries
  archiveBeforeDelete?: boolean;
  archivePath?: string;
}

/**
 * History comparison
 */
export interface HistoryComparison {
  entryId1: string;
  entryId2: string;
  differences: {
    request: {
      url?: { old: string; new: string };
      method?: { old: HttpMethod; new: HttpMethod };
      headers?: Array<{
        key: string;
        old?: string;
        new?: string;
        type: 'added' | 'removed' | 'modified';
      }>;
      body?: {
        type: 'added' | 'removed' | 'modified' | 'identical';
        changes?: any;
      };
    };
    response: {
      status?: { old: number; new: number };
      duration?: { old: number; new: number; percentChange: number };
      size?: { old: number; new: number; percentChange: number };
      headers?: Array<{
        key: string;
        old?: string;
        new?: string;
        type: 'added' | 'removed' | 'modified';
      }>;
      body?: {
        type: 'added' | 'removed' | 'modified' | 'identical';
        changes?: any;
      };
    };
  };
  summary: {
    requestChanged: boolean;
    responseChanged: boolean;
    performanceImproved: boolean;
    durationChange: number; // percentage
    sizeChange: number; // percentage
  };
}