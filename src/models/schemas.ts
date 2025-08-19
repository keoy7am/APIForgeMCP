/**
 * Zod schemas for APIForge MCP Server
 * 
 * These schemas provide runtime validation and type inference
 */

import { z } from 'zod';

/**
 * HTTP Method schema
 */
export const HttpMethodSchema = z.enum([
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
]);

/**
 * Authentication schemas
 */
export const AuthenticationTypeSchema = z.enum([
  'none', 'basic', 'bearer', 'apikey', 'oauth2'
]);

export const BasicAuthCredentialsSchema = z.object({
  username: z.string(),
  password: z.string(),
});

export const BearerTokenCredentialsSchema = z.object({
  token: z.string(),
});

export const ApiKeyCredentialsSchema = z.object({
  key: z.string(),
  value: z.string(),
  location: z.enum(['header', 'query', 'body', 'cookie']),
});

export const OAuth2CredentialsSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  tokenType: z.string().optional(),
  expiresAt: z.date().optional(),
});

export const AuthConfigSchema = z.object({
  type: AuthenticationTypeSchema,
  credentials: z.union([
    BasicAuthCredentialsSchema,
    BearerTokenCredentialsSchema,
    ApiKeyCredentialsSchema,
    OAuth2CredentialsSchema,
  ]).optional(),
});

/**
 * Retry configuration schema
 */
export const RetryConfigSchema = z.object({
  maxAttempts: z.number().min(1).max(10),
  delayMs: z.number().min(0),
  backoffMultiplier: z.number().min(1).optional(),
  retryOnStatusCodes: z.array(z.number()).optional(),
});

/**
 * Workspace schemas
 */
export const WorkspaceConfigSchema = z.object({
  name: z.string().min(1).max(100),
  projectPath: z.string(),
  description: z.string().max(500).optional(),
  config: z.record(z.any()).optional(),
});

export const WorkspaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  projectPath: z.string(),
  description: z.string().max(500).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  config: z.record(z.any()),
});

/**
 * API Endpoint schemas
 */
export const ApiEndpointSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  method: HttpMethodSchema,
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  queryParams: z.record(z.string()).optional(),
  body: z.any().optional(),
  authentication: AuthConfigSchema.optional(),
  timeout: z.number().min(1000).max(300000).optional(), // 1s to 5min
  retryConfig: RetryConfigSchema.optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const ApiEndpointCreateSchema = ApiEndpointSchema.omit({
  id: true,
  workspaceId: true,
  createdAt: true,
  updatedAt: true,
});

export const ApiEndpointUpdateSchema = ApiEndpointCreateSchema.partial();

/**
 * Request and Response schemas
 */
export const RequestDataSchema = z.object({
  method: HttpMethodSchema,
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  queryParams: z.record(z.string()).optional(),
  body: z.any().optional(),
  timestamp: z.date(),
});

export const ResponseDataSchema = z.object({
  status: z.number().min(100).max(599),
  statusText: z.string(),
  headers: z.record(z.string()),
  body: z.any().optional(),
  size: z.number().optional(),
  timestamp: z.date(),
});

export const RequestResultSchema = z.object({
  success: z.boolean(),
  request: RequestDataSchema,
  response: ResponseDataSchema.optional(),
  duration: z.number().min(0),
  error: z.string().optional(),
  timestamp: z.date(),
});

/**
 * Request History schema
 */
export const RequestHistorySchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  endpointId: z.string().uuid(),
  request: RequestDataSchema,
  response: ResponseDataSchema,
  duration: z.number().min(0),
  status: z.enum(['success', 'failure']),
  error: z.string().optional(),
  timestamp: z.date(),
});

/**
 * Environment schema
 */
export const EnvironmentSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(100),
  variables: z.record(z.any()),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Batch execution schemas
 */
export const BatchOptionsSchema = z.object({
  parallel: z.boolean().optional(),
  concurrency: z.number().min(1).max(20).optional(),
  stopOnError: z.boolean().optional(),
  delayBetweenRequests: z.number().min(0).optional(),
});

export const BatchResultSchema = z.object({
  success: z.boolean(),
  results: z.array(RequestResultSchema),
  errors: z.array(z.string()),
  duration: z.number().min(0),
  abortedAt: z.number().optional(),
});

/**
 * History filter schema
 */
export const HistoryFilterSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  endpointId: z.string().uuid().optional(),
  status: z.enum(['success', 'failure']).optional(),
  from: z.date().optional(),
  to: z.date().optional(),
  limit: z.number().min(1).max(1000).optional(),
  offset: z.number().min(0).optional(),
});

/**
 * Validation schemas
 */
export const AssertionSchema = z.object({
  name: z.string(),
  type: z.enum(['status', 'contains', 'jsonPath', 'custom']),
  expected: z.any().optional(),
  value: z.any().optional(),
  path: z.string().optional(),
  handler: z.function().optional(),
});

export const AssertionResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  actual: z.any().optional(),
  expected: z.any().optional(),
});

export const ValidationErrorSchema = z.object({
  type: z.enum(['schema', 'assertion']),
  message: z.string(),
  path: z.string().optional(),
  assertion: z.string().optional(),
});

export const ValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationErrorSchema),
  response: z.any(),
});

/**
 * Server configuration schema
 */
export const ServerConfigSchema = z.object({
  dataDirectory: z.string(),
  maxHistorySize: z.number().min(10).max(10000),
  defaultTimeout: z.number().min(1000).max(300000),
  maxConcurrency: z.number().min(1).max(100),
  enableLogging: z.boolean(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
});

/**
 * OpenAPI import schemas
 */
export const OpenAPIImportResultSchema = z.object({
  success: z.boolean(),
  endpoints: z.array(ApiEndpointSchema),
  errors: z.array(z.string()),
  skipped: z.array(z.string()),
  summary: z.object({
    total: z.number(),
    imported: z.number(),
    failed: z.number(),
    skipped: z.number(),
  }),
});

/**
 * Variables schema for request execution
 */
export const VariablesSchema = z.record(z.any());

/**
 * Utility function to create a schema with default timestamps
 */
export function withTimestamps<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  return schema.extend({
    createdAt: z.date().default(() => new Date()),
    updatedAt: z.date().default(() => new Date()),
  });
}

/**
 * Type inference helpers
 */
export type WorkspaceInput = z.infer<typeof WorkspaceConfigSchema>;
export type WorkspaceData = z.infer<typeof WorkspaceSchema>;
export type ApiEndpointInput = z.infer<typeof ApiEndpointCreateSchema>;
export type ApiEndpointData = z.infer<typeof ApiEndpointSchema>;
export type ApiEndpointUpdate = z.infer<typeof ApiEndpointUpdateSchema>;
export type RequestData = z.infer<typeof RequestDataSchema>;
export type ResponseData = z.infer<typeof ResponseDataSchema>;
export type RequestResult = z.infer<typeof RequestResultSchema>;
export type RequestHistory = z.infer<typeof RequestHistorySchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;
export type BatchOptions = z.infer<typeof BatchOptionsSchema>;
export type BatchResult = z.infer<typeof BatchResultSchema>;
export type HistoryFilter = z.infer<typeof HistoryFilterSchema>;
export type Variables = z.infer<typeof VariablesSchema>;
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type OpenAPIImportResult = z.infer<typeof OpenAPIImportResultSchema>;