/**
 * Tests for CollectionManager service
 */

import { jest } from '@jest/globals';
import { CollectionManager } from '../../src/services/collection.service';
import { TestDataFactory, MockFactory } from '../utils/test-utils';
import { Collection, ApiEndpoint, ValidationError } from '../../src/types';

describe('CollectionManager', () => {
  let collectionManager: CollectionManager;
  let mockStorage: any;
  let mockLogger: any;

  beforeEach(() => {
    mockStorage = MockFactory.createMockStorage();
    mockLogger = MockFactory.createMockLogger();
    collectionManager = new CollectionManager(mockStorage, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Collection CRUD Operations', () => {
    it('should create a new collection', async () => {
      const collection: Collection = {
        id: 'coll-1',
        name: 'My API Collection',
        description: 'A test collection',
        endpoints: [],
        folders: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockStorage.saveCollection = jest.fn().mockResolvedValue(collection);

      const result = await collectionManager.createCollection(collection);

      expect(result).toEqual(collection);
      expect(mockStorage.saveCollection).toHaveBeenCalledWith(collection);
      expect(mockLogger.debug).toHaveBeenCalledWith('Creating collection', { name: collection.name });
    });

    it('should get a collection by ID', async () => {
      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        name: 'Test Collection',
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);

      const result = await collectionManager.getCollection('coll-1');

      expect(result).toEqual(collection);
      expect(mockStorage.getCollection).toHaveBeenCalledWith('coll-1');
    });

    it('should update a collection', async () => {
      const originalCollection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        name: 'Original Name',
        description: 'Original description',
      });

      const updatedCollection = {
        ...originalCollection,
        name: 'Updated Name',
        description: 'Updated description',
        updatedAt: new Date(),
      };

      mockStorage.getCollection = jest.fn().mockResolvedValue(originalCollection);
      mockStorage.saveCollection = jest.fn().mockResolvedValue(updatedCollection);

      const result = await collectionManager.updateCollection('coll-1', {
        name: 'Updated Name',
        description: 'Updated description',
      });

      expect(result.name).toBe('Updated Name');
      expect(result.description).toBe('Updated description');
      expect(mockStorage.saveCollection).toHaveBeenCalled();
    });

    it('should delete a collection', async () => {
      mockStorage.deleteCollection = jest.fn().mockResolvedValue(true);

      const result = await collectionManager.deleteCollection('coll-1');

      expect(result).toBe(true);
      expect(mockStorage.deleteCollection).toHaveBeenCalledWith('coll-1');
      expect(mockLogger.info).toHaveBeenCalledWith('Collection deleted', { id: 'coll-1' });
    });

    it('should list all collections', async () => {
      const collections = [
        TestDataFactory.createMockCollection({ id: 'coll-1', name: 'Collection 1' }),
        TestDataFactory.createMockCollection({ id: 'coll-2', name: 'Collection 2' }),
        TestDataFactory.createMockCollection({ id: 'coll-3', name: 'Collection 3' }),
      ];

      mockStorage.listCollections = jest.fn().mockResolvedValue(collections);

      const result = await collectionManager.listCollections();

      expect(result).toEqual(collections);
      expect(result).toHaveLength(3);
      expect(mockStorage.listCollections).toHaveBeenCalled();
    });

    it('should handle collection not found error', async () => {
      mockStorage.getCollection = jest.fn().mockResolvedValue(null);

      await expect(collectionManager.getCollection('non-existent'))
        .rejects.toThrow('Collection not found');
    });
  });

  describe('Endpoint Management', () => {
    it('should add an endpoint to a collection', async () => {
      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        endpoints: [],
      });

      const endpoint = TestDataFactory.createMockEndpoint({
        id: 'endpoint-1',
        name: 'Get Users',
        method: 'GET',
        url: 'https://api.example.com/users',
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);
      mockStorage.saveCollection = jest.fn().mockImplementation(c => Promise.resolve(c));

      const result = await collectionManager.addEndpoint('coll-1', endpoint);

      expect(result.endpoints).toHaveLength(1);
      expect(result.endpoints[0]).toEqual(endpoint);
      expect(mockStorage.saveCollection).toHaveBeenCalled();
    });

    it('should remove an endpoint from a collection', async () => {
      const endpoint1 = TestDataFactory.createMockEndpoint({ id: 'endpoint-1' });
      const endpoint2 = TestDataFactory.createMockEndpoint({ id: 'endpoint-2' });

      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        endpoints: [endpoint1, endpoint2],
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);
      mockStorage.saveCollection = jest.fn().mockImplementation(c => Promise.resolve(c));

      const result = await collectionManager.removeEndpoint('coll-1', 'endpoint-1');

      expect(result.endpoints).toHaveLength(1);
      expect(result.endpoints[0].id).toBe('endpoint-2');
      expect(mockStorage.saveCollection).toHaveBeenCalled();
    });

    it('should update an endpoint in a collection', async () => {
      const endpoint = TestDataFactory.createMockEndpoint({
        id: 'endpoint-1',
        name: 'Original Name',
        url: 'https://api.example.com/v1',
      });

      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        endpoints: [endpoint],
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);
      mockStorage.saveCollection = jest.fn().mockImplementation(c => Promise.resolve(c));

      const result = await collectionManager.updateEndpoint('coll-1', 'endpoint-1', {
        name: 'Updated Name',
        url: 'https://api.example.com/v2',
      });

      expect(result.endpoints[0].name).toBe('Updated Name');
      expect(result.endpoints[0].url).toBe('https://api.example.com/v2');
      expect(mockStorage.saveCollection).toHaveBeenCalled();
    });

    it('should get endpoints by folder', async () => {
      const endpoint1 = TestDataFactory.createMockEndpoint({ id: 'e1', folder: 'Users' });
      const endpoint2 = TestDataFactory.createMockEndpoint({ id: 'e2', folder: 'Users' });
      const endpoint3 = TestDataFactory.createMockEndpoint({ id: 'e3', folder: 'Products' });

      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        endpoints: [endpoint1, endpoint2, endpoint3],
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);

      const result = await collectionManager.getEndpointsByFolder('coll-1', 'Users');

      expect(result).toHaveLength(2);
      expect(result[0].folder).toBe('Users');
      expect(result[1].folder).toBe('Users');
    });

    it('should handle endpoint not found error', async () => {
      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        endpoints: [],
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);

      await expect(collectionManager.removeEndpoint('coll-1', 'non-existent'))
        .rejects.toThrow('Endpoint not found');
    });
  });

  describe('Folder Management', () => {
    it('should create a folder in a collection', async () => {
      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        folders: [],
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);
      mockStorage.saveCollection = jest.fn().mockImplementation(c => Promise.resolve(c));

      const result = await collectionManager.createFolder('coll-1', 'User Management');

      expect(result.folders).toContain('User Management');
      expect(mockStorage.saveCollection).toHaveBeenCalled();
    });

    it('should rename a folder and update endpoints', async () => {
      const endpoint1 = TestDataFactory.createMockEndpoint({ id: 'e1', folder: 'Old Name' });
      const endpoint2 = TestDataFactory.createMockEndpoint({ id: 'e2', folder: 'Old Name' });
      const endpoint3 = TestDataFactory.createMockEndpoint({ id: 'e3', folder: 'Other' });

      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        folders: ['Old Name', 'Other'],
        endpoints: [endpoint1, endpoint2, endpoint3],
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);
      mockStorage.saveCollection = jest.fn().mockImplementation(c => Promise.resolve(c));

      const result = await collectionManager.renameFolder('coll-1', 'Old Name', 'New Name');

      expect(result.folders).toContain('New Name');
      expect(result.folders).not.toContain('Old Name');
      expect(result.endpoints[0].folder).toBe('New Name');
      expect(result.endpoints[1].folder).toBe('New Name');
      expect(result.endpoints[2].folder).toBe('Other');
    });

    it('should delete a folder and move endpoints to root', async () => {
      const endpoint1 = TestDataFactory.createMockEndpoint({ id: 'e1', folder: 'To Delete' });
      const endpoint2 = TestDataFactory.createMockEndpoint({ id: 'e2', folder: 'To Delete' });
      const endpoint3 = TestDataFactory.createMockEndpoint({ id: 'e3', folder: 'Keep' });

      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        folders: ['To Delete', 'Keep'],
        endpoints: [endpoint1, endpoint2, endpoint3],
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);
      mockStorage.saveCollection = jest.fn().mockImplementation(c => Promise.resolve(c));

      const result = await collectionManager.deleteFolder('coll-1', 'To Delete');

      expect(result.folders).not.toContain('To Delete');
      expect(result.folders).toContain('Keep');
      expect(result.endpoints[0].folder).toBeUndefined();
      expect(result.endpoints[1].folder).toBeUndefined();
      expect(result.endpoints[2].folder).toBe('Keep');
    });

    it('should handle folder not found error', async () => {
      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        folders: ['Existing'],
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);

      await expect(collectionManager.renameFolder('coll-1', 'Non-existent', 'New Name'))
        .rejects.toThrow('Folder not found');
    });

    it('should prevent duplicate folder names', async () => {
      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        folders: ['Existing'],
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);

      await expect(collectionManager.createFolder('coll-1', 'Existing'))
        .rejects.toThrow('Folder already exists');
    });
  });

  describe('Collection Validation', () => {
    it('should validate collection structure', async () => {
      const invalidCollection = {
        name: '', // Empty name
        endpoints: 'not-an-array', // Invalid type
      };

      await expect(collectionManager.createCollection(invalidCollection as any))
        .rejects.toThrow(ValidationError);
    });

    it('should validate endpoint structure', async () => {
      const collection = TestDataFactory.createMockCollection({ id: 'coll-1' });
      
      const invalidEndpoint = {
        name: '',
        method: 'INVALID',
        url: 'not-a-url',
      };

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);

      await expect(collectionManager.addEndpoint('coll-1', invalidEndpoint as any))
        .rejects.toThrow(ValidationError);
    });

    it('should enforce collection size limits', async () => {
      const endpoints = Array.from({ length: 1001 }, (_, i) =>
        TestDataFactory.createMockEndpoint({ id: `endpoint-${i}` })
      );

      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        endpoints,
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);

      await expect(collectionManager.addEndpoint('coll-1', TestDataFactory.createMockEndpoint()))
        .rejects.toThrow('Collection has reached maximum endpoint limit');
    });
  });

  describe('Collection Export/Import', () => {
    it('should export a collection to JSON', async () => {
      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        name: 'Export Test',
        endpoints: [
          TestDataFactory.createMockEndpoint({ id: 'e1' }),
          TestDataFactory.createMockEndpoint({ id: 'e2' }),
        ],
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);

      const exported = await collectionManager.exportCollection('coll-1');
      const parsed = JSON.parse(exported);

      expect(parsed.name).toBe('Export Test');
      expect(parsed.endpoints).toHaveLength(2);
      expect(parsed.version).toBe('1.0.0');
    });

    it('should import a collection from JSON', async () => {
      const collectionData = {
        name: 'Import Test',
        description: 'Imported collection',
        endpoints: [
          TestDataFactory.createMockEndpoint({ id: 'e1' }),
          TestDataFactory.createMockEndpoint({ id: 'e2' }),
        ],
        folders: ['Folder1', 'Folder2'],
        version: '1.0.0',
      };

      mockStorage.saveCollection = jest.fn().mockImplementation(c => Promise.resolve(c));

      const result = await collectionManager.importCollection(JSON.stringify(collectionData));

      expect(result.name).toBe('Import Test');
      expect(result.endpoints).toHaveLength(2);
      expect(result.folders).toHaveLength(2);
      expect(result.id).toBeDefined(); // New ID should be generated
    });

    it('should handle import errors', async () => {
      const invalidData = 'not-json';

      await expect(collectionManager.importCollection(invalidData))
        .rejects.toThrow('Invalid collection data');
    });
  });

  describe('Collection Search and Filtering', () => {
    it('should search endpoints by name', async () => {
      const endpoints = [
        TestDataFactory.createMockEndpoint({ id: 'e1', name: 'Get Users' }),
        TestDataFactory.createMockEndpoint({ id: 'e2', name: 'Create User' }),
        TestDataFactory.createMockEndpoint({ id: 'e3', name: 'Get Products' }),
      ];

      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        endpoints,
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);

      const result = await collectionManager.searchEndpoints('coll-1', 'User');

      expect(result).toHaveLength(2);
      expect(result[0].name).toContain('User');
      expect(result[1].name).toContain('User');
    });

    it('should filter endpoints by method', async () => {
      const endpoints = [
        TestDataFactory.createMockEndpoint({ id: 'e1', method: 'GET' }),
        TestDataFactory.createMockEndpoint({ id: 'e2', method: 'POST' }),
        TestDataFactory.createMockEndpoint({ id: 'e3', method: 'GET' }),
        TestDataFactory.createMockEndpoint({ id: 'e4', method: 'DELETE' }),
      ];

      const collection = TestDataFactory.createMockCollection({
        id: 'coll-1',
        endpoints,
      });

      mockStorage.getCollection = jest.fn().mockResolvedValue(collection);

      const result = await collectionManager.filterEndpointsByMethod('coll-1', 'GET');

      expect(result).toHaveLength(2);
      expect(result.every(e => e.method === 'GET')).toBe(true);
    });
  });
});