import { WorkspaceManager } from '../src/services/workspace.service';
import { FileStorage } from '../src/storage/file-storage';
import { 
  WorkspaceAlreadyExistsError, 
  WorkspaceNotFoundError 
} from '../src/utils/errors';
import { Workspace } from '../src/types';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('WorkspaceManager', () => {
  let workspaceManager: WorkspaceManager;
  let storage: FileStorage;
  let testDataDir: string;

  beforeEach(async () => {
    // Use a unique temporary directory for each test
    testDataDir = path.join('./test-data', randomUUID());
    await fs.mkdir(testDataDir, { recursive: true });
    
    storage = new FileStorage(testDataDir);
    await storage.initialize();
    workspaceManager = new WorkspaceManager(storage);
  });

  afterEach(async () => {
    // Clean up test data
    await storage.close();
    
    // Remove test data directory
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore errors during cleanup
      console.warn(`Failed to cleanup test directory ${testDataDir}:`, error);
    }
  });

  describe('createWorkspace', () => {
    it('should create a new workspace', async () => {
      const config = {
        name: 'Test Workspace',
        projectPath: '/test/path',
        description: 'A test workspace',
      };

      const workspace = await workspaceManager.createWorkspace(config);

      expect(workspace).toMatchObject({
        name: config.name,
        projectPath: config.projectPath,
        description: config.description,
      });
      expect(workspace.id).toBeDefined();
      expect(workspace.createdAt).toBeInstanceOf(Date);
      expect(workspace.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw error for duplicate workspace names', async () => {
      const config = {
        name: 'Duplicate Workspace',
        projectPath: '/test/path',
      };

      // Create first workspace
      await workspaceManager.createWorkspace(config);

      // Try to create duplicate
      await expect(
        workspaceManager.createWorkspace(config)
      ).rejects.toThrow(WorkspaceAlreadyExistsError);
    });

    it('should validate required fields', async () => {
      await expect(
        workspaceManager.createWorkspace({
          name: '',
          projectPath: '/test/path',
        })
      ).rejects.toThrow();

      await expect(
        workspaceManager.createWorkspace({
          name: 'Test',
          projectPath: '',
        })
      ).rejects.toThrow();
    });
  });

  describe('switchWorkspace', () => {
    it('should switch to an existing workspace', async () => {
      const workspace = await workspaceManager.createWorkspace({
        name: 'Switch Test',
        projectPath: '/test/path',
      });

      await workspaceManager.switchWorkspace(workspace.id);

      const current = workspaceManager.getCurrentWorkspace();
      expect(current).toEqual(workspace);
    });

    it('should throw error for non-existent workspace', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      
      await expect(
        workspaceManager.switchWorkspace(fakeId)
      ).rejects.toThrow(WorkspaceNotFoundError);
    });

    it('should validate workspace ID format', async () => {
      await expect(
        workspaceManager.switchWorkspace('invalid-id')
      ).rejects.toThrow();
    });
  });

  describe('listWorkspaces', () => {
    it('should return empty list initially', async () => {
      const workspaces = await workspaceManager.listWorkspaces();
      expect(workspaces).toEqual([]);
    });

    it('should return all workspaces sorted by name', async () => {
      const configs = [
        { name: 'Zebra Workspace', projectPath: '/zebra' },
        { name: 'Alpha Workspace', projectPath: '/alpha' },
        { name: 'Beta Workspace', projectPath: '/beta' },
      ];

      const created: Workspace[] = [];
      for (const config of configs) {
        created.push(await workspaceManager.createWorkspace(config));
      }

      const workspaces = await workspaceManager.listWorkspaces();
      expect(workspaces).toHaveLength(3);
      
      // Should be sorted by name
      expect(workspaces[0].name).toBe('Alpha Workspace');
      expect(workspaces[1].name).toBe('Beta Workspace');
      expect(workspaces[2].name).toBe('Zebra Workspace');
    });
  });

  describe('deleteWorkspace', () => {
    it('should delete an existing workspace', async () => {
      const workspace = await workspaceManager.createWorkspace({
        name: 'Delete Test',
        projectPath: '/test/path',
      });

      await workspaceManager.deleteWorkspace(workspace.id);

      await expect(
        workspaceManager.getWorkspace(workspace.id)
      ).rejects.toThrow(WorkspaceNotFoundError);
    });

    it('should clear current workspace if deleting active workspace', async () => {
      const workspace = await workspaceManager.createWorkspace({
        name: 'Active Delete Test',
        projectPath: '/test/path',
      });

      await workspaceManager.switchWorkspace(workspace.id);
      expect(workspaceManager.getCurrentWorkspace()).toEqual(workspace);

      await workspaceManager.deleteWorkspace(workspace.id);
      expect(workspaceManager.getCurrentWorkspace()).toBeNull();
    });

    it('should throw error for non-existent workspace', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      
      await expect(
        workspaceManager.deleteWorkspace(fakeId)
      ).rejects.toThrow(WorkspaceNotFoundError);
    });
  });

  describe('getCurrentWorkspace', () => {
    it('should return null initially', () => {
      expect(workspaceManager.getCurrentWorkspace()).toBeNull();
    });

    it('should return current workspace after switching', async () => {
      const workspace = await workspaceManager.createWorkspace({
        name: 'Current Test',
        projectPath: '/test/path',
      });

      await workspaceManager.switchWorkspace(workspace.id);
      expect(workspaceManager.getCurrentWorkspace()).toEqual(workspace);
    });
  });

  describe('requireCurrentWorkspace', () => {
    it('should throw error when no workspace is set', () => {
      expect(() => {
        workspaceManager.requireCurrentWorkspace();
      }).toThrow();
    });

    it('should return current workspace when set', async () => {
      const workspace = await workspaceManager.createWorkspace({
        name: 'Required Test',
        projectPath: '/test/path',
      });

      await workspaceManager.switchWorkspace(workspace.id);
      
      const required = workspaceManager.requireCurrentWorkspace();
      expect(required).toEqual(workspace);
    });
  });
});