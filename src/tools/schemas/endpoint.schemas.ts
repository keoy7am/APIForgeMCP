import { z } from 'zod';
import { HttpMethodSchema, AuthConfigSchema, RetryConfigSchema } from '../../models/schemas';

/**
 * Endpoint tool schemas for MCP protocol
 */

export const AddEndpointSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  method: HttpMethodSchema,
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
  queryParams: z.record(z.string()).optional(),
  body: z.any().optional(),
  authentication: AuthConfigSchema.optional(),
  timeout: z.number().min(1000).max(300000).optional(),
  retryConfig: RetryConfigSchema.optional(),
  tags: z.array(z.string()).optional(),
});

export const ListEndpointsSchema = z.object({
  workspaceId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
});

export const GetEndpointSchema = z.object({
  endpointId: z.string().uuid(),
});

export const UpdateEndpointSchema = z.object({
  endpointId: z.string().uuid(),
  updates: z.object({
    name: z.string().min(1).max(200).optional(),
    description: z.string().optional(),
    method: HttpMethodSchema.optional(),
    url: z.string().url().optional(),
    headers: z.record(z.string()).optional(),
    queryParams: z.record(z.string()).optional(),
    body: z.any().optional(),
    authentication: AuthConfigSchema.optional(),
    timeout: z.number().min(1000).max(300000).optional(),
    retryConfig: RetryConfigSchema.optional(),
    tags: z.array(z.string()).optional(),
  }),
});

export const DeleteEndpointSchema = z.object({
  endpointId: z.string().uuid(),
});

export const SearchEndpointsSchema = z.object({
  query: z.string().min(1),
  workspaceId: z.string().uuid().optional(),
});