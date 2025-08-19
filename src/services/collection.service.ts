/**
 * Collection management service
 */

import { IStorage } from '../storage';
import { Collection, ApiEndpoint } from '../types';
import { Logger } from '../utils/logger';

export class CollectionManager {
  private logger: Logger;

  constructor(private storage: IStorage) {
    this.logger = new Logger('CollectionManager');
  }

  async createCollection(collection: Partial<Collection>): Promise<Collection> {
    this.logger.info('Creating collection', { name: collection.name });
    
    const newCollection: Collection = {
      id: collection.id || `col_${Date.now()}`,
      name: collection.name || 'New Collection',
      description: collection.description,
      workspaceId: collection.workspaceId || 'default',
      endpoints: collection.endpoints || [],
      folders: collection.folders || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.saveCollection(newCollection);
    return newCollection;
  }

  async getCollection(collectionId: string): Promise<Collection | undefined> {
    this.logger.info('Getting collection', { collectionId });
    const result = await this.storage.getCollection(collectionId);
    return result || undefined;
  }

  async listCollections(workspaceId?: string): Promise<Collection[]> {
    this.logger.info('Listing collections', { workspaceId });
    const collections = await this.storage.listCollections();
    
    if (workspaceId) {
      return collections.filter(c => c.workspaceId === workspaceId);
    }
    
    return collections;
  }

  async updateCollection(collectionId: string, updates: Partial<Collection>): Promise<Collection> {
    this.logger.info('Updating collection', { collectionId });
    
    const existing = await this.storage.getCollection(collectionId);
    if (!existing) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    const updated: Collection = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    await this.storage.saveCollection(updated);
    return updated;
  }

  async deleteCollection(collectionId: string): Promise<void> {
    this.logger.info('Deleting collection', { collectionId });
    await this.storage.deleteCollection(collectionId);
  }

  async addEndpoint(collectionId: string, endpoint: ApiEndpoint): Promise<void> {
    this.logger.info('Adding endpoint to collection', { collectionId, endpoint: endpoint.name });
    
    const collection = await this.storage.getCollection(collectionId);
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    collection.endpoints.push(endpoint);
    collection.updatedAt = new Date();
    
    await this.storage.saveCollection(collection);
  }

  async removeEndpoint(collectionId: string, endpointId: string): Promise<void> {
    this.logger.info('Removing endpoint from collection', { collectionId, endpointId });
    
    const collection = await this.storage.getCollection(collectionId);
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    collection.endpoints = collection.endpoints.filter(e => e.id !== endpointId);
    collection.updatedAt = new Date();
    
    await this.storage.saveCollection(collection);
  }

  async getEndpoint(endpointId: string): Promise<ApiEndpoint | undefined> {
    const collections = await this.storage.listCollections();
    
    for (const collection of collections) {
      const endpoint = collection.endpoints.find(e => e.id === endpointId);
      if (endpoint) {
        return endpoint;
      }
    }
    
    return undefined;
  }

  async duplicateCollection(collectionId: string, options?: { name?: string; workspaceId?: string }): Promise<Collection> {
    this.logger.info('Duplicating collection', { collectionId, options });
    
    const original = await this.storage.getCollection(collectionId);
    if (!original) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    const duplicate: Collection = {
      ...original,
      id: `col_${Date.now()}`,
      name: options?.name || `${original.name} (Copy)`,
      workspaceId: options?.workspaceId || original.workspaceId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.saveCollection(duplicate);
    return duplicate;
  }

  async exportCollection(collectionId: string): Promise<any> {
    this.logger.info('Exporting collection', { collectionId });
    
    const collection = await this.storage.getCollection(collectionId);
    if (!collection) {
      throw new Error(`Collection ${collectionId} not found`);
    }

    return {
      name: collection.name,
      description: collection.description,
      endpoints: collection.endpoints,
      folders: collection.folders,
    };
  }

  async importCollection(data: any, workspaceId: string): Promise<Collection> {
    this.logger.info('Importing collection', { workspaceId });
    
    const collection: Collection = {
      id: `col_${Date.now()}`,
      name: data.name || 'Imported Collection',
      description: data.description,
      workspaceId,
      endpoints: data.endpoints || [],
      folders: data.folders || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.storage.saveCollection(collection);
    return collection;
  }
}