import { z } from 'zod';
import { HttpMethodSchema, AuthConfigSchema, RetryConfigSchema } from '../../models/schemas';

/**
 * Request tool schemas for MCP protocol
 */

export const ExecuteRequestSchema = z.object({
  endpoint: z.object({
    method: HttpMethodSchema,
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    queryParams: z.record(z.string()).optional(),
    body: z.any().optional(),
    authentication: AuthConfigSchema.optional(),
    timeout: z.number().optional(),
    retryConfig: RetryConfigSchema.optional(),
  }),
  variables: z.record(z.any()).optional(),
});

export const ExecuteRequestByIdSchema = z.object({
  endpointId: z.string().uuid(),
  variables: z.record(z.any()).optional(),
});

export const ExecuteCollectionSchema = z.object({
  endpoints: z.array(z.object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    name: z.string(),
    method: HttpMethodSchema,
    url: z.string().url(),
    headers: z.record(z.string()).optional(),
    queryParams: z.record(z.string()).optional(),
    body: z.any().optional(),
    authentication: AuthConfigSchema.optional(),
    timeout: z.number().optional(),
    retryConfig: RetryConfigSchema.optional(),
    tags: z.array(z.string()).optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })),
  options: z.object({
    parallel: z.boolean().optional(),
    concurrency: z.number().min(1).max(10).optional(),
    stopOnError: z.boolean().optional(),
    delayBetweenRequests: z.number().min(0).optional(),
  }).optional(),
});

export const ValidateResponseSchema = z.object({
  response: z.object({
    status: z.number(),
    statusText: z.string(),
    headers: z.record(z.string()),
    body: z.any(),
    size: z.number().optional(),
    timestamp: z.date(),
  }),
  expectedStatus: z.union([z.number(), z.array(z.number())]).optional(),
  expectedBody: z.any().optional(),
});