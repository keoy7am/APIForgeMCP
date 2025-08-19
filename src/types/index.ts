/**
 * Type definitions for APIForge MCP Server
 */

/**
 * HTTP Methods supported by the API testing tool
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/**
 * Authentication configuration types
 */
export type AuthenticationType = 'none' | 'basic' | 'bearer' | 'apikey' | 'oauth2';

export interface BasicAuthCredentials {
  username: string;
  password: string;
}

export interface BearerTokenCredentials {
  token: string;
}

export interface ApiKeyCredentials {
  key: string;
  value: string;
  location: 'header' | 'query' | 'body' | 'cookie';
}

export interface OAuth2Credentials {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  expiresAt?: Date;
}

export interface AuthConfig {
  type: AuthenticationType;
  credentials?: BasicAuthCredentials | BearerTokenCredentials | ApiKeyCredentials | OAuth2Credentials;
}

/**
 * Retry configuration for failed requests
 */
export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier?: number;
  retryOnStatusCodes?: number[];
}

/**
 * Workspace configuration
 */
export interface WorkspaceConfig {
  name: string;
  projectPath: string;
  description?: string;
  settings?: Record<string, any>;
}

/**
 * Workspace entity
 */
export interface Workspace {
  id: string;
  name: string;
  projectPath: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  config: Record<string, any>;
}

/**
 * API Endpoint entity
 */
export interface ApiEndpoint {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: any;
  authentication?: AuthConfig;
  timeout?: number;
  retryConfig?: RetryConfig;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
  collectionId?: string;
  folderId?: string;
  metadata?: Record<string, any>;
}

/**
 * Request data structure
 */
export interface RequestData {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  queryParams?: Record<string, string>;
  body?: any;
  timestamp: Date;
}

/**
 * Response data structure
 */
export interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: any;
  size?: number;
  timestamp: Date;
}

/**
 * Request execution result
 */
export interface RequestResult {
  success: boolean;
  request: RequestData;
  response?: ResponseData;
  duration: number;
  error?: string;
  timestamp: Date;
}

/**
 * Request history entry
 */
export interface RequestHistory {
  id: string;
  workspaceId: string;
  endpointId?: string;
  endpointName?: string;
  request: RequestData;
  response: ResponseData;
  duration: number;
  status: 'success' | 'failure' | 'error' | 'timeout' | 'cancelled';
  error?: string | { code: string; message: string; details?: any };
  timestamp: Date;
  performance?: {
    dnsLookup?: number;
    tcpConnection?: number;
    tlsHandshake?: number;
    firstByte?: number;
    download?: number;
    total: number;
  };
  metadata?: {
    environmentId?: string;
    environmentName?: string;
    tags?: string[];
    notes?: string;
  };
}

/**
 * Environment variables
 */
export interface Environment {
  id: string;
  workspaceId: string;
  name: string;
  variables: Record<string, any>;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Batch execution options
 */
export interface BatchOptions {
  parallel?: boolean;
  concurrency?: number;
  stopOnError?: boolean;
  delayBetweenRequests?: number;
}

/**
 * Batch execution result
 */
export interface BatchResult {
  success: boolean;
  results: RequestResult[];
  errors: Error[];
  duration: number;
  abortedAt?: number;
}

/**
 * Request history filter
 */
export interface HistoryFilter {
  workspaceId?: string;
  endpointId?: string;
  status?: 'success' | 'failure';
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Response validation assertion
 */
export interface Assertion {
  name: string;
  type: 'status' | 'contains' | 'jsonPath' | 'custom';
  expected?: any;
  value?: any;
  path?: string;
  handler?: (response: any) => Promise<AssertionResult>;
}

/**
 * Assertion result
 */
export interface AssertionResult {
  success: boolean;
  message: string;
  actual?: any;
  expected?: any;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  response: any;
  results?: ValidationRuleResult[];
  summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    errors: number;
    warnings: number;
  };
  duration?: number;
  timestamp?: Date;
}

/**
 * Individual rule result
 */
export interface ValidationRuleResult {
  ruleId: string;
  ruleName: string;
  ruleType?: string;
  passed: boolean;
  skipped?: boolean;
  skipReason?: string;
  severity?: 'error' | 'warning' | 'info';
  errors?: ValidationError[];
  duration?: number;
  details?: {
    expected?: any;
    actual?: any;
    path?: string;
    message?: string;
  };
}

/**
 * Validation error
 */
export interface ValidationError {
  type: 'schema' | 'assertion';
  code?: string;
  message: string;
  path?: string;
  assertion?: string;
  expected?: any;
  actual?: any;
  context?: Record<string, any>;
}

/**
 * Variable replacement context
 */
export interface Variables {
  [key: string]: any;
}

/**
 * Environment variable types and configurations
 */
export type EnvironmentVariableType = 'string' | 'number' | 'boolean' | 'secret';

export interface EnvironmentVariable {
  name: string;
  value: any;
  type: EnvironmentVariableType;
  encrypted: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnvironmentConfig {
  globalVariables: Record<string, EnvironmentVariable>;
  workspaceVariables: Record<string, EnvironmentVariable>;
  environmentVariables: Record<string, EnvironmentVariable>;
  encryptionEnabled: boolean;
  encryptionKey?: string;
}

export interface VariableReplacementOptions {
  enableRecursive: boolean;
  maxDepth: number;
  escapePattern?: string;
  customVariables?: Variables;
  environmentName?: string;
  workspaceId?: string;
}

export interface VariableReplacementResult {
  originalValue: any;
  processedValue: any;
  replacements: VariableReplacement[];
  errors: string[];
  warnings: string[];
}

export interface VariableReplacement {
  variable: string;
  originalValue: string;
  replacedValue: any;
  source: 'global' | 'workspace' | 'environment' | 'custom';
  position?: { start: number; end: number };
}

/**
 * Storage interface for persistence layer
 */
export interface IStorage {
  // Initialization
  initialize(): Promise<void>;
  close(): Promise<void>;

  // Workspace operations
  saveWorkspace(workspace: Workspace): Promise<Workspace>;
  getWorkspace(id: string): Promise<Workspace | null>;
  findWorkspaceByName(name: string): Promise<Workspace | null>;
  listWorkspaces(): Promise<Workspace[]>;
  deleteWorkspace(id: string): Promise<void>;

  // Endpoint operations
  saveEndpoint(endpoint: ApiEndpoint): Promise<ApiEndpoint>;
  getEndpoint(id: string): Promise<ApiEndpoint | null>;
  getEndpointsByWorkspace(workspaceId: string): Promise<ApiEndpoint[]>;
  updateEndpoint(id: string, updates: Partial<ApiEndpoint>): Promise<ApiEndpoint>;
  deleteEndpoint(id: string): Promise<void>;

  // History operations
  saveHistory(history: RequestHistory): Promise<void>;
  getHistory(filter: HistoryFilter): Promise<RequestHistory[]>;
  deleteHistory(workspaceId: string): Promise<void>;

  // Environment operations
  saveEnvironment(environment: Environment): Promise<Environment>;
  getEnvironment(id: string): Promise<Environment | null>;
  getEnvironmentsByWorkspace(workspaceId: string): Promise<Environment[]>;
  deleteEnvironment(id: string): Promise<void>;

  // Collection operations
  saveCollection(collection: Collection): Promise<Collection>;
  getCollection(id: string): Promise<Collection | null>;
  listCollections(): Promise<Collection[]>;
  deleteCollection(id: string): Promise<void>;
}

/**
 * Memory information
 */
export interface MemoryInfo {
  rss: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
}

/**
 * Server configuration
 */
export interface ServerConfig {
  dataDirectory: string;
  maxHistorySize: number;
  defaultTimeout: number;
  maxConcurrency: number;
  enableLogging: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Collection folder structure
 */
export interface CollectionFolder {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  endpoints: string[]; // endpoint IDs
  subFolders: string[]; // folder IDs
  createdAt: Date;
  updatedAt: Date;
}

/**
 * API Collection entity
 */
export interface Collection {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  endpoints: ApiEndpoint[];
  folders: CollectionFolder[];
  variables?: Variables;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * OpenAPI import result
 */
export interface OpenAPIImportResult {
  success: boolean;
  endpoints: ApiEndpoint[];
  errors: string[];
  skipped: string[];
  summary: {
    total: number;
    imported: number;
    failed: number;
    skipped: number;
  };
}

// Export history types
export * from './history.types';

// Export batch types
export * from './batch.types';

// Export validation types
export * from './validation.types';

// Export performance types
export * from './performance.types';

/**
 * Logger interface
 */
export interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  child(context: string): Logger;
}

/**
 * Error handler interface
 */
export interface ErrorHandler {
  handle(error: Error, context?: any): any;
  createError(code: string, message: string, details?: any): Error;
  isRecoverable(error: Error): boolean;
}

/**
 * File storage interface
 */
export interface FileStorage {
  readData<T>(path: string): Promise<T | null>;
  writeData<T>(path: string, data: T): Promise<void>;
  exists(path: string): Promise<boolean>;
  delete(path: string): Promise<void>;
}

/**
 * Performance configuration interface
 */
export interface PerformanceConfig {
  cache?: {
    enabled: boolean;
    maxSize: number;
    ttl: number;
  };
  monitoring?: {
    enabled: boolean;
    interval: number;
  };
  optimization?: {
    enabled: boolean;
    strategies: string[];
  };
}

/**
 * Health check interface
 */
export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  details?: any;
  timestamp: Date;
}