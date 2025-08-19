import { v4 as uuidv4 } from 'uuid';
import { IStorage, Workspace } from '../types';
import { 
  WorkspaceSchema, 
  WorkspaceConfigSchema,
  type WorkspaceInput 
} from '../models/schemas';
import { 
  WorkspaceNotFoundError, 
  WorkspaceAlreadyExistsError,
  ValidationError 
} from '../utils/errors';
import { Logger } from '../utils/logger';

/**
 * Workspace Manager Service
 * 
 * Manages workspace lifecycle including creation, switching, and deletion.
 * Provides workspace isolation for API endpoint management.
 */
export class WorkspaceManager {
  private storage: IStorage;
  private currentWorkspace: Workspace | null = null;
  private logger: Logger;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.logger = new Logger('WorkspaceManager');
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(config: WorkspaceInput): Promise<Workspace> {
    try {
      // Validate input
      const validatedConfig = WorkspaceConfigSchema.parse(config);
      
      // Check if workspace name already exists
      const existing = await this.storage.findWorkspaceByName(validatedConfig.name);
      if (existing) {
        throw new WorkspaceAlreadyExistsError(validatedConfig.name);
      }

      // Validate project path exists (basic check)
      await this.validateProjectPath(validatedConfig.projectPath);

      // Create workspace object
      const workspace: Workspace = {
        id: uuidv4(),
        name: validatedConfig.name,
        projectPath: validatedConfig.projectPath,
        description: validatedConfig.description,
        createdAt: new Date(),
        updatedAt: new Date(),
        config: validatedConfig.settings || {},
      };

      // Validate the complete workspace object
      const validatedWorkspace = WorkspaceSchema.parse(workspace);

      // Save to storage
      const savedWorkspace = await this.storage.saveWorkspace(validatedWorkspace);
      
      this.logger.info(`Created workspace: ${savedWorkspace.name} (${savedWorkspace.id})`);
      
      return savedWorkspace;
      
    } catch (error) {
      this.logger.error('Failed to create workspace:', error);
      throw error;
    }
  }

  /**
   * Switch to a different workspace
   */
  async switchWorkspace(workspaceId: string): Promise<void> {
    try {
      // Validate workspace ID format
      if (!this.isValidUUID(workspaceId)) {
        throw new ValidationError('Invalid workspace ID format');
      }

      // Get workspace from storage
      const workspace = await this.storage.getWorkspace(workspaceId);
      if (!workspace) {
        throw new WorkspaceNotFoundError(workspaceId);
      }

      // Switch to the new workspace
      const previousWorkspace = this.currentWorkspace;
      this.currentWorkspace = workspace;
      
      this.logger.info(
        `Switched workspace from ${previousWorkspace?.name || 'none'} to ${workspace.name}`
      );
      
    } catch (error) {
      this.logger.error(`Failed to switch to workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a workspace and all its data
   */
  async deleteWorkspace(workspaceId: string): Promise<void> {
    try {
      // Validate workspace ID format
      if (!this.isValidUUID(workspaceId)) {
        throw new ValidationError('Invalid workspace ID format');
      }

      // Check if workspace exists
      const workspace = await this.storage.getWorkspace(workspaceId);
      if (!workspace) {
        throw new WorkspaceNotFoundError(workspaceId);
      }

      // If this is the current workspace, clear the current workspace
      if (this.currentWorkspace?.id === workspaceId) {
        this.currentWorkspace = null;
        this.logger.info('Cleared current workspace as it was deleted');
      }

      // Delete from storage (this should also delete related data)
      await this.storage.deleteWorkspace(workspaceId);
      
      this.logger.info(`Deleted workspace: ${workspace.name} (${workspaceId})`);
      
    } catch (error) {
      this.logger.error(`Failed to delete workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * List all available workspaces
   */
  async listWorkspaces(): Promise<Workspace[]> {
    try {
      const workspaces = await this.storage.listWorkspaces();
      
      // Sort by name for consistent ordering
      workspaces.sort((a, b) => a.name.localeCompare(b.name));
      
      this.logger.debug(`Listed ${workspaces.length} workspaces`);
      
      return workspaces;
      
    } catch (error) {
      this.logger.error('Failed to list workspaces:', error);
      throw error;
    }
  }

  /**
   * Get the currently active workspace
   */
  getCurrentWorkspace(): Workspace | null {
    return this.currentWorkspace;
  }

  /**
   * Get workspace by ID
   */
  async getWorkspace(workspaceId: string): Promise<Workspace> {
    try {
      // Validate workspace ID format
      if (!this.isValidUUID(workspaceId)) {
        throw new ValidationError('Invalid workspace ID format');
      }

      const workspace = await this.storage.getWorkspace(workspaceId);
      if (!workspace) {
        throw new WorkspaceNotFoundError(workspaceId);
      }

      return workspace;
      
    } catch (error) {
      this.logger.error(`Failed to get workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Update workspace configuration
   */
  async updateWorkspace(
    workspaceId: string, 
    updates: Partial<WorkspaceInput>
  ): Promise<Workspace> {
    try {
      // Get existing workspace
      const workspace = await this.getWorkspace(workspaceId);

      // If name is being updated, check for conflicts
      if (updates.name && updates.name !== workspace.name) {
        const existing = await this.storage.findWorkspaceByName(updates.name);
        if (existing && existing.id !== workspaceId) {
          throw new WorkspaceAlreadyExistsError(updates.name);
        }
      }

      // Validate project path if being updated
      if (updates.projectPath) {
        await this.validateProjectPath(updates.projectPath);
      }

      // Create updated workspace
      const updatedWorkspace: Workspace = {
        ...workspace,
        ...updates,
        id: workspace.id, // Ensure ID doesn't change
        updatedAt: new Date(),
        config: {
          ...workspace.config,
          ...(updates.settings || {}),
        },
      };

      // Validate the updated workspace
      const validatedWorkspace = WorkspaceSchema.parse(updatedWorkspace);

      // Save to storage
      const savedWorkspace = await this.storage.saveWorkspace(validatedWorkspace);

      // Update current workspace if it's the one being modified
      if (this.currentWorkspace?.id === workspaceId) {
        this.currentWorkspace = savedWorkspace;
      }

      this.logger.info(`Updated workspace: ${savedWorkspace.name} (${workspaceId})`);
      
      return savedWorkspace;
      
    } catch (error) {
      this.logger.error(`Failed to update workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Check if current user has access to workspace (basic implementation)
   * In a more complex system, this would check user permissions
   */
  async hasAccessToWorkspace(workspaceId: string): Promise<boolean> {
    try {
      const workspace = await this.storage.getWorkspace(workspaceId);
      return workspace !== null;
    } catch (error) {
      this.logger.error(`Failed to check access to workspace ${workspaceId}:`, error);
      return false;
    }
  }

  /**
   * Get workspace statistics
   */
  async getWorkspaceStats(workspaceId: string): Promise<{
    endpointCount: number;
    historyCount: number;
    environmentCount: number;
    lastActivity: Date | null;
  }> {
    try {
      // Validate workspace exists
      await this.getWorkspace(workspaceId);

      // Get counts from storage
      const endpoints = await this.storage.getEndpointsByWorkspace(workspaceId);
      const environments = await this.storage.getEnvironmentsByWorkspace(workspaceId);
      const history = await this.storage.getHistory({ workspaceId, limit: 1 });

      const stats = {
        endpointCount: endpoints.length,
        historyCount: 0, // We'd need to modify storage interface to get total count
        environmentCount: environments.length,
        lastActivity: history.length > 0 && history[0] ? history[0].timestamp : null,
      };

      this.logger.debug(`Retrieved stats for workspace ${workspaceId}:`, stats);
      
      return stats;
      
    } catch (error) {
      this.logger.error(`Failed to get workspace stats for ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Ensure current workspace is set
   */
  requireCurrentWorkspace(): Workspace {
    if (!this.currentWorkspace) {
      throw new ValidationError('No workspace is currently selected. Please switch to a workspace first.');
    }
    return this.currentWorkspace;
  }

  // Private helper methods

  /**
   * Validate project path (basic implementation)
   */
  private async validateProjectPath(projectPath: string): Promise<void> {
    if (!projectPath || projectPath.trim() === '') {
      throw new ValidationError('Project path cannot be empty');
    }

    // Additional path validation can be added here
    // For example, checking if the path exists, is accessible, etc.
    
    // Basic path format validation
    if (projectPath.includes('..')) {
      throw new ValidationError('Project path cannot contain relative path components (..)');
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