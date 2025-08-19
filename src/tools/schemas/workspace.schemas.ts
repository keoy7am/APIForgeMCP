import { z } from 'zod';

/**
 * Workspace tool schemas for MCP protocol
 */

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  projectPath: z.string(),
  description: z.string().optional(),
  config: z.record(z.any()).optional(),
});

export const ListWorkspacesSchema = z.object({});

export const SwitchWorkspaceSchema = z.object({
  workspaceId: z.string().uuid(),
});

export const GetCurrentWorkspaceSchema = z.object({});

export const UpdateWorkspaceSchema = z.object({
  workspaceId: z.string().uuid(),
  updates: z.object({
    name: z.string().min(1).max(100).optional(),
    projectPath: z.string().optional(),
    description: z.string().optional(),
    config: z.record(z.any()).optional(),
  }),
});

export const DeleteWorkspaceSchema = z.object({
  workspaceId: z.string().uuid(),
});