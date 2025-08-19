import { v4 as uuidv4 } from 'uuid';
import { IStorage, ApiEndpoint, HttpMethod } from '../types';
import { 
  ApiEndpointSchema, 
  ApiEndpointCreateSchema, 
  ApiEndpointUpdateSchema,
  type ApiEndpointInput,
  type ApiEndpointUpdate 
} from '../models/schemas';
import { 
  EndpointNotFoundError, 
  ValidationError,
  WorkspaceNotFoundError 
} from '../utils/errors';
import { WorkspaceManager } from './workspace.service';
import { Logger } from '../utils/logger';

/**
 * Endpoint Registry Service
 * 
 * Manages API endpoint CRUD operations within workspace isolation.
 * Provides endpoint storage, retrieval, and management capabilities.
 */
export class EndpointRegistry {
  private storage: IStorage;
  private workspaceManager: WorkspaceManager;
  private logger: Logger;

  constructor(storage: IStorage, workspaceManager: WorkspaceManager) {
    this.storage = storage;
    this.workspaceManager = workspaceManager;
    this.logger = new Logger('EndpointRegistry');
  }

  /**
   * Add a new endpoint to the current workspace
   */
  async addEndpoint(endpointInput: ApiEndpointInput): Promise<ApiEndpoint> {
    try {
      // Ensure there's a current workspace
      const workspace = this.workspaceManager.requireCurrentWorkspace();

      // Validate input
      const validatedInput = ApiEndpointCreateSchema.parse(endpointInput);

      // Check for duplicate names in the workspace
      await this.checkDuplicateName(workspace.id, validatedInput.name);

      // Create endpoint object
      const endpoint: ApiEndpoint = {
        id: uuidv4(),
        workspaceId: workspace.id,
        ...validatedInput,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Validate the complete endpoint object
      const validatedEndpoint = ApiEndpointSchema.parse(endpoint);

      // Save to storage
      const savedEndpoint = await this.storage.saveEndpoint(validatedEndpoint);
      
      this.logger.info(
        `Added endpoint: ${savedEndpoint.name} (${savedEndpoint.method} ${savedEndpoint.url})`
      );
      
      return savedEndpoint;
      
    } catch (error) {
      this.logger.error('Failed to add endpoint:', error);
      throw error;
    }
  }

  /**
   * Get endpoint by ID
   */
  async getEndpoint(endpointId: string): Promise<ApiEndpoint> {
    try {
      // Validate ID format
      if (!this.isValidUUID(endpointId)) {
        throw new ValidationError('Invalid endpoint ID format');
      }

      const endpoint = await this.storage.getEndpoint(endpointId);
      if (!endpoint) {
        throw new EndpointNotFoundError(endpointId);
      }

      // Verify workspace access
      await this.verifyWorkspaceAccess(endpoint.workspaceId);

      return endpoint;
      
    } catch (error) {
      this.logger.error(`Failed to get endpoint ${endpointId}:`, error);
      throw error;
    }
  }

  /**
   * List endpoints in a workspace (defaults to current workspace)
   */
  async listEndpoints(
    workspaceId?: string, 
    tags?: string[]
  ): Promise<ApiEndpoint[]> {
    try {
      // Determine target workspace
      const targetWorkspaceId = workspaceId || 
        this.workspaceManager.getCurrentWorkspace()?.id;

      if (!targetWorkspaceId) {
        throw new ValidationError('No workspace specified and no current workspace set');
      }

      // Verify workspace access
      await this.verifyWorkspaceAccess(targetWorkspaceId);

      // Get endpoints from storage
      let endpoints = await this.storage.getEndpointsByWorkspace(targetWorkspaceId);

      // Filter by tags if specified
      if (tags && tags.length > 0) {
        endpoints = endpoints.filter(endpoint => 
          endpoint.tags && 
          tags.some(tag => endpoint.tags!.includes(tag))
        );
      }

      // Sort by name for consistent ordering
      endpoints.sort((a, b) => a.name.localeCompare(b.name));

      this.logger.debug(
        `Listed ${endpoints.length} endpoints for workspace ${targetWorkspaceId}`
      );

      return endpoints;
      
    } catch (error) {
      this.logger.error('Failed to list endpoints:', error);
      throw error;
    }
  }

  /**
   * Update an existing endpoint
   */
  async updateEndpoint(
    endpointId: string, 
    updates: ApiEndpointUpdate
  ): Promise<ApiEndpoint> {
    try {
      // Get existing endpoint
      const endpoint = await this.getEndpoint(endpointId);

      // Validate updates
      const validatedUpdates = ApiEndpointUpdateSchema.parse(updates);

      // Check for duplicate names if name is being updated
      if (validatedUpdates.name && validatedUpdates.name !== endpoint.name) {
        await this.checkDuplicateName(endpoint.workspaceId, validatedUpdates.name, endpointId);
      }

      // Create updated endpoint
      const updatedEndpoint: ApiEndpoint = {
        ...endpoint,
        ...validatedUpdates,
        id: endpoint.id, // Ensure ID doesn't change
        workspaceId: endpoint.workspaceId, // Ensure workspace doesn't change
        updatedAt: new Date(),
      };

      // Validate the updated endpoint
      const validatedEndpoint = ApiEndpointSchema.parse(updatedEndpoint);

      // Save to storage
      const savedEndpoint = await this.storage.updateEndpoint(endpointId, validatedEndpoint);
      
      this.logger.info(`Updated endpoint: ${savedEndpoint.name} (${endpointId})`);
      
      return savedEndpoint;
      
    } catch (error) {
      this.logger.error(`Failed to update endpoint ${endpointId}:`, error);
      throw error;
    }
  }

  /**
   * Delete an endpoint
   */
  async deleteEndpoint(endpointId: string): Promise<void> {
    try {
      // Verify endpoint exists and user has access
      const endpoint = await this.getEndpoint(endpointId);

      // Delete from storage
      await this.storage.deleteEndpoint(endpointId);
      
      this.logger.info(`Deleted endpoint: ${endpoint.name} (${endpointId})`);
      
    } catch (error) {
      this.logger.error(`Failed to delete endpoint ${endpointId}:`, error);
      throw error;
    }
  }

  /**
   * Search endpoints by name or URL pattern
   */
  async searchEndpoints(
    query: string,
    workspaceId?: string
  ): Promise<ApiEndpoint[]> {
    try {
      // Get all endpoints for the workspace
      const endpoints = await this.listEndpoints(workspaceId);

      // Filter based on query (case-insensitive)
      const filteredEndpoints = endpoints.filter(endpoint => {
        const queryLower = query.toLowerCase();
        return (
          endpoint.name.toLowerCase().includes(queryLower) ||
          endpoint.url.toLowerCase().includes(queryLower) ||
          endpoint.description?.toLowerCase().includes(queryLower) ||
          endpoint.tags?.some(tag => tag.toLowerCase().includes(queryLower))
        );
      });

      this.logger.debug(`Found ${filteredEndpoints.length} endpoints matching query: ${query}`);

      return filteredEndpoints;
      
    } catch (error) {
      this.logger.error(`Failed to search endpoints with query "${query}":`, error);
      throw error;
    }
  }

  /**
   * Get endpoints by method
   */
  async getEndpointsByMethod(
    method: HttpMethod,
    workspaceId?: string
  ): Promise<ApiEndpoint[]> {
    try {
      // Get all endpoints for the workspace
      const endpoints = await this.listEndpoints(workspaceId);

      // Filter by method
      const filteredEndpoints = endpoints.filter(endpoint => 
        endpoint.method === method
      );

      this.logger.debug(
        `Found ${filteredEndpoints.length} ${method} endpoints`
      );

      return filteredEndpoints;
      
    } catch (error) {
      this.logger.error(`Failed to get endpoints by method ${method}:`, error);
      throw error;
    }
  }

  /**
   * Get all unique tags across endpoints in a workspace
   */
  async getTags(workspaceId?: string): Promise<string[]> {
    try {
      // Get all endpoints for the workspace
      const endpoints = await this.listEndpoints(workspaceId);

      // Collect all unique tags
      const tagSet = new Set<string>();
      endpoints.forEach(endpoint => {
        endpoint.tags?.forEach(tag => tagSet.add(tag));
      });

      const tags = Array.from(tagSet).sort();

      this.logger.debug(`Found ${tags.length} unique tags`);

      return tags;
      
    } catch (error) {
      this.logger.error('Failed to get tags:', error);
      throw error;
    }
  }

  /**
   * Bulk operations
   */
  async bulkDelete(endpointIds: string[]): Promise<{
    deleted: string[];
    failed: { id: string; error: string }[];
  }> {
    const result = {
      deleted: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    for (const endpointId of endpointIds) {
      try {
        await this.deleteEndpoint(endpointId);
        result.deleted.push(endpointId);
      } catch (error) {
        result.failed.push({
          id: endpointId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.logger.info(
      `Bulk delete completed: ${result.deleted.length} deleted, ${result.failed.length} failed`
    );

    return result;
  }

  /**
   * Duplicate an endpoint
   */
  async duplicateEndpoint(
    endpointId: string,
    newName?: string
  ): Promise<ApiEndpoint> {
    try {
      // Get original endpoint
      const originalEndpoint = await this.getEndpoint(endpointId);

      // Create new endpoint data
      const duplicateData: ApiEndpointInput = {
        name: newName || `${originalEndpoint.name} (Copy)`,
        description: originalEndpoint.description,
        method: originalEndpoint.method,
        url: originalEndpoint.url,
        headers: originalEndpoint.headers ? { ...originalEndpoint.headers } : undefined,
        queryParams: originalEndpoint.queryParams ? { ...originalEndpoint.queryParams } : undefined,
        body: originalEndpoint.body,
        authentication: originalEndpoint.authentication ? { ...originalEndpoint.authentication } : undefined,
        timeout: originalEndpoint.timeout,
        retryConfig: originalEndpoint.retryConfig ? { ...originalEndpoint.retryConfig } : undefined,
        tags: originalEndpoint.tags ? [...originalEndpoint.tags] : undefined,
      };

      // Create the duplicate
      const duplicatedEndpoint = await this.addEndpoint(duplicateData);

      this.logger.info(
        `Duplicated endpoint: ${originalEndpoint.name} -> ${duplicatedEndpoint.name}`
      );

      return duplicatedEndpoint;
      
    } catch (error) {
      this.logger.error(`Failed to duplicate endpoint ${endpointId}:`, error);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Check for duplicate endpoint names in a workspace
   */
  private async checkDuplicateName(
    workspaceId: string, 
    name: string, 
    excludeEndpointId?: string
  ): Promise<void> {
    const endpoints = await this.storage.getEndpointsByWorkspace(workspaceId);
    
    const duplicate = endpoints.find(endpoint => 
      endpoint.name === name && endpoint.id !== excludeEndpointId
    );

    if (duplicate) {
      throw new ValidationError(
        `Endpoint with name '${name}' already exists in this workspace`
      );
    }
  }

  /**
   * Verify user has access to workspace
   */
  private async verifyWorkspaceAccess(workspaceId: string): Promise<void> {
    const hasAccess = await this.workspaceManager.hasAccessToWorkspace(workspaceId);
    if (!hasAccess) {
      throw new WorkspaceNotFoundError(workspaceId);
    }
  }

  /**
   * Validate UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}