/**
 * Tests for FileStorage service
 */

import { jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FileStorage } from '../../src/storage/file-storage';
import { TestDataFactory } from '../utils/test-utils';
import { TestDataManager, testIsolationHelpers } from '../utils/test-isolation';
import { Workspace, ApiEndpoint, EnvironmentConfig, StorageError } from '../../src/types';

// Mock fs module
jest.mock('fs/promises');

describe('FileStorage', () => {
  let storage: FileStorage;
  let testDataManager: TestDataManager;
  const basePath = '/test/storage/path';

  beforeEach(async () => {
    testDataManager = await testIsolationHelpers.beforeEach();
    storage = new FileStorage(basePath);
    jest.clearAllMocks();
    
    // Setup default mocks
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    (fs.readFile as jest.Mock).mockRejectedValue({ code: 'ENOENT' }); // Default to no existing files
    (fs.readdir as jest.Mock).mockResolvedValue([]); // Default to empty directories
  });

  afterEach(async () => {
    await testIsolationHelpers.afterEach(testDataManager);
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await testIsolationHelpers.afterAll();
  });

  describe('Initialization', () => {
    it('should initialize storage with base path', async () => {
      await storage.initialize();

      expect(fs.mkdir).toHaveBeenCalledWith(
        basePath,
        { recursive: true }
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(basePath, 'workspaces'),
        { recursive: true }
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(basePath, 'endpoints'),
        { recursive: true }
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(basePath, 'environments'),
        { recursive: true }
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(basePath, 'history'),
        { recursive: true }
      );
      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(basePath, 'collections'),
        { recursive: true }
      );
    });

    it('should handle initialization errors', async () => {
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      await expect(storage.initialize()).rejects.toThrow(StorageError);
    });
  });

  describe('Workspace Operations', () => {
    it('should save a workspace', async () => {
      const workspace = TestDataFactory.createMockWorkspace({
        id: 'ws-123',
        name: 'Test Workspace',
      });

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.saveWorkspace(workspace);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'workspaces.json'),
        JSON.stringify([workspace], null, 2)
      );
    });

    it('should get a workspace by ID', async () => {
      const workspace = TestDataFactory.createMockWorkspace({
        id: 'ws-123',
        name: 'Test Workspace',
      });

      // Mock reading workspaces.json during initialization
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.endsWith('workspaces.json')) {
          return Promise.resolve(JSON.stringify([workspace]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });

      await storage.initialize();
      const result = await storage.getWorkspace('ws-123');

      expect(result).toEqual(workspace);
    });

    it('should return null for non-existent workspace', async () => {
      await storage.initialize();
      const result = await storage.getWorkspace('non-existent');

      expect(result).toBeNull();
    });

    it('should list all workspaces', async () => {
      const workspaces = [
        TestDataFactory.createMockWorkspace({ id: 'ws-1', name: 'Workspace 1' }),
        TestDataFactory.createMockWorkspace({ id: 'ws-2', name: 'Workspace 2' }),
      ];

      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.endsWith('workspaces.json')) {
          return Promise.resolve(JSON.stringify(workspaces));
        }
        return Promise.reject({ code: 'ENOENT' });
      });

      await storage.initialize();
      const result = await storage.listWorkspaces();

      expect(result).toHaveLength(2);
      expect(result).toEqual(workspaces);
    });

    it('should find workspace by name', async () => {
      const workspaces = [
        TestDataFactory.createMockWorkspace({ id: 'ws-1', name: 'Production' }),
        TestDataFactory.createMockWorkspace({ id: 'ws-2', name: 'Development' }),
      ];

      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.endsWith('workspaces.json')) {
          return Promise.resolve(JSON.stringify(workspaces));
        }
        return Promise.reject({ code: 'ENOENT' });
      });

      await storage.initialize();
      const result = await storage.findWorkspaceByName('Development');

      expect(result).toEqual(workspaces[1]);
    });

    it('should delete a workspace', async () => {
      const workspace = TestDataFactory.createMockWorkspace({ id: 'ws-123' });
      
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.endsWith('workspaces.json')) {
          return Promise.resolve(JSON.stringify([workspace]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.deleteWorkspace('ws-123');

      // Should write empty array after deletion
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'workspaces.json'),
        JSON.stringify([], null, 2)
      );
      
      // Should delete related files
      expect(fs.unlink).toHaveBeenCalledWith(
        path.join(basePath, 'endpoints', 'ws-123.json')
      );
    });

    it('should handle workspace deletion errors', async () => {
      (fs.unlink as jest.Mock).mockRejectedValue(new Error('File not found'));

      await storage.initialize();
      await expect(storage.deleteWorkspace('ws-123')).rejects.toThrow(StorageError);
    });
  });

  describe('Endpoint Operations', () => {
    it('should save an endpoint', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        id: 'ep-123',
        workspaceId: 'ws-123',
        name: 'Test Endpoint',
      });

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.saveEndpoint(endpoint);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'endpoints', 'ws-123.json'),
        JSON.stringify([endpoint], null, 2)
      );
    });

    it('should get an endpoint by ID', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        id: 'ep-123',
        workspaceId: 'ws-123',
        name: 'Test Endpoint',
      });

      (fs.readdir as jest.Mock).mockResolvedValue(['ws-123.json']);
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.endsWith('ws-123.json')) {
          return Promise.resolve(JSON.stringify([endpoint]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });

      await storage.initialize();
      const result = await storage.getEndpoint('ep-123');

      expect(result).toEqual(endpoint);
    });

    it('should get endpoints by workspace', async () => {
      const endpoints = [
        TestDataFactory.createMockEndpoint({ id: 'ep-1', workspaceId: 'ws-123' }),
        TestDataFactory.createMockEndpoint({ id: 'ep-2', workspaceId: 'ws-123' }),
        TestDataFactory.createMockEndpoint({ id: 'ep-3', workspaceId: 'ws-456' }),
      ];

      (fs.readdir as jest.Mock).mockResolvedValue(['ws-123.json', 'ws-456.json']);
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('ws-123.json')) {
          return Promise.resolve(JSON.stringify([endpoints[0], endpoints[1]]));
        }
        if (filePath.includes('ws-456.json')) {
          return Promise.resolve(JSON.stringify([endpoints[2]]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });

      await storage.initialize();
      const result = await storage.getEndpointsByWorkspace('ws-123');

      expect(result).toHaveLength(2);
      expect(result[0].workspaceId).toBe('ws-123');
      expect(result[1].workspaceId).toBe('ws-123');
    });

    it('should update an endpoint', async () => {
      const originalEndpoint = TestDataFactory.createMockEndpoint({
        id: 'ep-123',
        workspaceId: 'ws-123',
        name: 'Original Name',
      });

      const updatedEndpoint = {
        ...originalEndpoint,
        name: 'Updated Name',
        updatedAt: new Date(),
      };

      (fs.readdir as jest.Mock).mockResolvedValue(['ws-123.json']);
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('ws-123.json')) {
          return Promise.resolve(JSON.stringify([originalEndpoint]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.updateEndpoint('ep-123', { name: 'Updated Name' });

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'endpoints', 'ws-123.json'),
        expect.stringContaining('Updated Name')
      );
    });

    it('should delete an endpoint', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        id: 'ep-123',
        workspaceId: 'ws-123',
      });

      (fs.readdir as jest.Mock).mockResolvedValue(['ws-123.json']);
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('ws-123.json')) {
          return Promise.resolve(JSON.stringify([endpoint]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.deleteEndpoint('ep-123');

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'endpoints', 'ws-123.json'),
        JSON.stringify([], null, 2)
      );
    });
  });

  describe('Environment Operations', () => {
    it('should save an environment', async () => {
      const environment = TestDataFactory.createMockEnvironment({
        id: 'env-123',
        workspaceId: 'ws-123',
        name: 'Test Environment',
      });

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.saveEnvironment(environment);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'environments', 'ws-123.json'),
        JSON.stringify([environment], null, 2)
      );
    });

    it('should get an environment by ID', async () => {
      const environment = TestDataFactory.createMockEnvironment({
        id: 'env-123',
        workspaceId: 'ws-123',
        name: 'Test Environment',
      });

      (fs.readdir as jest.Mock).mockResolvedValue(['ws-123.json']);
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('ws-123.json')) {
          return Promise.resolve(JSON.stringify([environment]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });

      await storage.initialize();
      const result = await storage.getEnvironment('env-123');

      expect(result).toEqual(environment);
    });

    it('should list all environments', async () => {
      const environments = [
        TestDataFactory.createMockEnvironment({ id: 'env-1', workspaceId: 'ws-1', name: 'Production' }),
        TestDataFactory.createMockEnvironment({ id: 'env-2', workspaceId: 'ws-2', name: 'Development' }),
      ];

      (fs.readdir as jest.Mock).mockResolvedValue(['ws-1.json', 'ws-2.json']);
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('ws-1.json')) {
          return Promise.resolve(JSON.stringify([environments[0]]));
        }
        if (filePath.includes('ws-2.json')) {
          return Promise.resolve(JSON.stringify([environments[1]]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });

      await storage.initialize();
      const result = await storage.getEnvironmentsByWorkspace('ws-1');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(environments[0]);
    });

    it('should delete an environment', async () => {
      const environment = TestDataFactory.createMockEnvironment({
        id: 'env-123',
        workspaceId: 'ws-123',
      });

      (fs.readdir as jest.Mock).mockResolvedValue(['ws-123.json']);
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('ws-123.json')) {
          return Promise.resolve(JSON.stringify([environment]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.deleteEnvironment('env-123');

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'environments', 'ws-123.json'),
        JSON.stringify([], null, 2)
      );
    });
  });

  describe('Collection Operations', () => {
    it('should save a collection', async () => {
      const collection = TestDataFactory.createMockCollection({
        id: 'coll-123',
        name: 'Test Collection',
      });

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.saveCollection(collection);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'collections.json'),
        JSON.stringify([collection], null, 2)
      );
    });

    it('should get a collection by ID', async () => {
      const collection = TestDataFactory.createMockCollection({
        id: 'coll-123',
        name: 'Test Collection',
      });

      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.endsWith('collections.json')) {
          return Promise.resolve(JSON.stringify([collection]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });

      await storage.initialize();
      const result = await storage.getCollection('coll-123');

      expect(result).toEqual(collection);
    });

    it('should list all collections', async () => {
      const collections = [
        TestDataFactory.createMockCollection({ id: 'coll-1', name: 'Collection 1' }),
        TestDataFactory.createMockCollection({ id: 'coll-2', name: 'Collection 2' }),
      ];

      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.endsWith('collections.json')) {
          return Promise.resolve(JSON.stringify(collections));
        }
        return Promise.reject({ code: 'ENOENT' });
      });

      await storage.initialize();
      const result = await storage.listCollections();

      expect(result).toHaveLength(2);
      expect(result).toEqual(collections);
    });

    it('should delete a collection', async () => {
      const collection = TestDataFactory.createMockCollection({ id: 'coll-123' });

      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.endsWith('collections.json')) {
          return Promise.resolve(JSON.stringify([collection]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.deleteCollection('coll-123');

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'collections.json'),
        JSON.stringify([], null, 2)
      );
    });
  });

  describe('History Operations', () => {
    it('should save history entry', async () => {
      const history = {
        id: 'hist-123',
        workspaceId: 'ws-123',
        endpointId: 'ep-123',
        request: TestDataFactory.createMockRequest(),
        response: TestDataFactory.createMockResponse(),
        duration: 250,
        timestamp: new Date(),
        status: 'success' as const,
      };

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.saveHistory(history);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'history', 'ws-123.json'),
        expect.stringContaining('hist-123')
      );
    });

    it('should get history by ID', async () => {
      const history = {
        id: 'hist-123',
        workspaceId: 'ws-123',
        endpointId: 'ep-123',
        request: TestDataFactory.createMockRequest(),
        response: TestDataFactory.createMockResponse(),
        duration: 250,
        timestamp: new Date(),
        status: 'success' as const,
      };

      (fs.readdir as jest.Mock).mockResolvedValue(['ws-123.json']);
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('ws-123.json')) {
          return Promise.resolve(JSON.stringify([history]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });

      await storage.initialize();
      const result = await storage.getHistory('hist-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('hist-123');
    });

    it('should delete history entry', async () => {
      const history = {
        id: 'hist-123',
        workspaceId: 'ws-123',
        endpointId: 'ep-123',
        request: TestDataFactory.createMockRequest(),
        response: TestDataFactory.createMockResponse(),
        duration: 250,
        timestamp: new Date(),
        status: 'success' as const,
      };

      (fs.readdir as jest.Mock).mockResolvedValue(['ws-123.json']);
      (fs.readFile as jest.Mock).mockImplementation((filePath) => {
        if (filePath.includes('ws-123.json')) {
          return Promise.resolve(JSON.stringify([history]));
        }
        return Promise.reject({ code: 'ENOENT' });
      });
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.deleteHistory('hist-123');

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'history', 'ws-123.json'),
        JSON.stringify([], null, 2)
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parse errors', async () => {
      (fs.readFile as jest.Mock).mockResolvedValue('invalid json');

      await expect(storage.initialize()).rejects.toThrow(StorageError);
    });

    it('should handle file system errors', async () => {
      await storage.initialize();
      
      const workspace = TestDataFactory.createMockWorkspace();
      (fs.writeFile as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      await expect(storage.saveWorkspace(workspace)).rejects.toThrow(StorageError);
    });

    it('should handle missing directories', async () => {
      (fs.readdir as jest.Mock).mockRejectedValue({ code: 'ENOENT' });

      await storage.initialize();
      const result = await storage.listWorkspaces();
      expect(result).toEqual([]);
    });
  });

  describe('Data Validation', () => {
    it('should validate workspace data on save', async () => {
      const invalidWorkspace = {
        name: 'Test', // Missing required fields
      };

      await storage.initialize();
      await expect(storage.saveWorkspace(invalidWorkspace as any))
        .rejects.toThrow(StorageError);
    });

    it('should validate endpoint data on save', async () => {
      const invalidEndpoint = {
        name: 'Test',
        method: 'INVALID', // Invalid HTTP method
      };

      await storage.initialize();
      await expect(storage.saveEndpoint(invalidEndpoint as any))
        .rejects.toThrow(StorageError);
    });

    it('should sanitize file names', async () => {
      const workspace = TestDataFactory.createMockWorkspace({
        id: '../../../etc/passwd',
        name: 'Malicious',
      });

      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);

      await storage.initialize();
      await storage.saveWorkspace(workspace);

      // Should sanitize the ID to prevent path traversal
      expect(fs.writeFile).toHaveBeenCalledWith(
        path.join(basePath, 'workspaces.json'),
        expect.any(String)
      );
      expect(fs.writeFile).not.toHaveBeenCalledWith(
        expect.stringContaining('../'),
        expect.any(String)
      );
    });
  });
});