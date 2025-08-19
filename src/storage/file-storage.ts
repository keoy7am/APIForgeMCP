import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  IStorage, 
  Workspace, 
  ApiEndpoint, 
  RequestHistory, 
  Environment,
  HistoryFilter,
  Collection
} from '../types';
import { StorageError } from '../utils/errors';
import { Logger } from '../utils/logger';

/**
 * File-based storage implementation
 * 
 * Uses JSON files to persist data with the following structure:
 * - data/workspaces.json - All workspaces
 * - data/endpoints/{workspaceId}.json - Endpoints per workspace
 * - data/history/{workspaceId}.json - Request history per workspace
 * - data/environments/{workspaceId}.json - Environments per workspace
 */
export class FileStorage implements IStorage {
  private dataDir: string;
  private logger: Logger;
  private workspaces: Map<string, Workspace> = new Map();
  private endpoints: Map<string, Map<string, ApiEndpoint>> = new Map();
  private history: Map<string, RequestHistory[]> = new Map();
  private environments: Map<string, Map<string, Environment>> = new Map();
  private collections: Map<string, any> = new Map();

  constructor(dataDir: string = './data') {
    // Normalize path for cross-platform compatibility
    this.dataDir = path.normalize(path.resolve(dataDir));
    this.logger = new Logger('FileStorage');
  }

  /**
   * Initialize storage - create directories and load existing data
   */
  async initialize(): Promise<void> {
    try {
      // Create data directories
      await this.ensureDirectories();
      
      // Load existing data
      await this.loadWorkspaces();
      await this.loadEndpoints();
      await this.loadHistory();
      await this.loadEnvironments();
      await this.loadCollections();
      
      this.logger.info(`Storage initialized at ${this.dataDir}`);
    } catch (error) {
      throw new StorageError('Failed to initialize storage', error as Error);
    }
  }

  /**
   * Close storage and cleanup
   */
  async close(): Promise<void> {
    // Save all data before closing
    await this.saveAllData();
    this.logger.info('Storage closed');
  }

  // Workspace operations
  async saveWorkspace(workspace: Workspace): Promise<Workspace> {
    try {
      // Basic validation
      if (!workspace.id || !workspace.name || !workspace.projectPath) {
        throw new Error('Invalid workspace data');
      }
      this.workspaces.set(workspace.id, workspace);
      await this.saveWorkspaces();
      return workspace;
    } catch (error) {
      throw new StorageError('Failed to save workspace', error as Error);
    }
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    return this.workspaces.get(id) || null;
  }

  async findWorkspaceByName(name: string): Promise<Workspace | null> {
    for (const workspace of this.workspaces.values()) {
      if (workspace.name === name) {
        return workspace;
      }
    }
    return null;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return Array.from(this.workspaces.values());
  }

  async deleteWorkspace(id: string): Promise<void> {
    try {
      this.workspaces.delete(id);
      this.endpoints.delete(id);
      this.history.delete(id);
      this.environments.delete(id);
      
      await this.saveWorkspaces();
      await this.deleteWorkspaceFiles(id);
    } catch (error) {
      throw new StorageError('Failed to delete workspace', error as Error);
    }
  }

  // Endpoint operations
  async saveEndpoint(endpoint: ApiEndpoint): Promise<ApiEndpoint> {
    try {
      // Basic validation
      if (!endpoint.id || !endpoint.workspaceId || !endpoint.name) {
        throw new Error('Invalid endpoint data');
      }
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      if (endpoint.method && !validMethods.includes(endpoint.method)) {
        throw new Error('Invalid HTTP method');
      }
      if (!this.endpoints.has(endpoint.workspaceId)) {
        this.endpoints.set(endpoint.workspaceId, new Map());
      }
      
      this.endpoints.get(endpoint.workspaceId)!.set(endpoint.id, endpoint);
      await this.saveEndpoints(endpoint.workspaceId);
      return endpoint;
    } catch (error) {
      throw new StorageError('Failed to save endpoint', error as Error);
    }
  }

  async getEndpoint(id: string): Promise<ApiEndpoint | null> {
    for (const endpointMap of this.endpoints.values()) {
      const endpoint = endpointMap.get(id);
      if (endpoint) {
        return endpoint;
      }
    }
    return null;
  }

  async getEndpointsByWorkspace(workspaceId: string): Promise<ApiEndpoint[]> {
    const endpointMap = this.endpoints.get(workspaceId);
    if (!endpointMap) {
      return [];
    }
    return Array.from(endpointMap.values());
  }

  async updateEndpoint(id: string, updates: Partial<ApiEndpoint>): Promise<ApiEndpoint> {
    const endpoint = await this.getEndpoint(id);
    if (!endpoint) {
      throw new StorageError('Endpoint not found');
    }

    const updatedEndpoint = {
      ...endpoint,
      ...updates,
      id: endpoint.id, // Ensure ID doesn't change
      workspaceId: endpoint.workspaceId, // Ensure workspace ID doesn't change
      updatedAt: new Date(),
    };

    return await this.saveEndpoint(updatedEndpoint);
  }

  async deleteEndpoint(id: string): Promise<void> {
    for (const [workspaceId, endpointMap] of this.endpoints.entries()) {
      if (endpointMap.has(id)) {
        endpointMap.delete(id);
        await this.saveEndpoints(workspaceId);
        return;
      }
    }
    throw new StorageError('Endpoint not found');
  }

  // History operations
  async saveHistory(history: RequestHistory): Promise<void> {
    try {
      if (!this.history.has(history.workspaceId)) {
        this.history.set(history.workspaceId, []);
      }
      
      const historyList = this.history.get(history.workspaceId)!;
      historyList.unshift(history); // Add to beginning for newest first
      
      // Limit history size (keep last 1000 entries)
      if (historyList.length > 1000) {
        historyList.splice(1000);
      }
      
      await this.saveHistoryForWorkspace(history.workspaceId);
    } catch (error) {
      throw new StorageError('Failed to save request history', error as Error);
    }
  }

  async getHistoryOrig(filter: HistoryFilter): Promise<RequestHistory[]> {
    const allHistory: RequestHistory[] = [];
    
    if (filter.workspaceId) {
      const workspaceHistory = this.history.get(filter.workspaceId) || [];
      allHistory.push(...workspaceHistory);
    } else {
      // Get history from all workspaces
      for (const historyList of this.history.values()) {
        allHistory.push(...historyList);
      }
    }
    
    // Apply filters
    let filtered = allHistory;
    
    if (filter.endpointId) {
      filtered = filtered.filter(h => h.endpointId === filter.endpointId);
    }
    
    if (filter.status) {
      filtered = filtered.filter(h => h.status === filter.status);
    }
    
    if (filter.from) {
      filtered = filtered.filter(h => h.timestamp >= filter.from!);
    }
    
    if (filter.to) {
      filtered = filtered.filter(h => h.timestamp <= filter.to!);
    }
    
    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    
    return filtered.slice(offset, offset + limit);
  }

  async deleteHistory(idOrWorkspaceId: string): Promise<void> {
    try {
      // Check if it's a single history ID or workspace ID
      for (const [workspaceId, historyList] of this.history.entries()) {
        const index = historyList.findIndex(h => h.id === idOrWorkspaceId);
        if (index !== -1) {
          historyList.splice(index, 1);
          await this.saveHistoryForWorkspace(workspaceId);
          return;
        }
      }
      // If not found as individual ID, treat as workspace ID
      this.history.delete(idOrWorkspaceId);
      await this.deleteFile(this.getHistoryPath(idOrWorkspaceId));
    } catch (error) {
      throw new StorageError('Failed to delete history', error as Error);
    }
  }

  // Environment operations
  async saveEnvironment(environment: Environment): Promise<Environment> {
    try {
      if (!this.environments.has(environment.workspaceId)) {
        this.environments.set(environment.workspaceId, new Map());
      }
      
      this.environments.get(environment.workspaceId)!.set(environment.id, environment);
      await this.saveEnvironments(environment.workspaceId);
      return environment;
    } catch (error) {
      throw new StorageError('Failed to save environment', error as Error);
    }
  }

  async getEnvironment(id: string): Promise<Environment | null> {
    for (const envMap of this.environments.values()) {
      const environment = envMap.get(id);
      if (environment) {
        return environment;
      }
    }
    return null;
  }

  async getEnvironmentsByWorkspace(workspaceId: string): Promise<Environment[]> {
    const envMap = this.environments.get(workspaceId);
    if (!envMap) {
      return [];
    }
    return Array.from(envMap.values());
  }

  async deleteEnvironment(id: string): Promise<void> {
    for (const [workspaceId, envMap] of this.environments.entries()) {
      if (envMap.has(id)) {
        envMap.delete(id);
        await this.saveEnvironments(workspaceId);
        return;
      }
    }
    throw new StorageError('Environment not found');
  }

  // Collection operations
  async saveCollection(collection: Collection): Promise<Collection> {
    try {
      if (!collection.id) {
        throw new Error('Invalid collection data');
      }
      this.collections.set(collection.id, collection);
      await this.saveCollections();
      return collection;
    } catch (error) {
      throw new StorageError('Failed to save collection', error as Error);
    }
  }

  async getCollection(id: string): Promise<Collection | null> {
    return this.collections.get(id) || null;
  }

  async listCollections(): Promise<Collection[]> {
    return Array.from(this.collections.values());
  }

  async deleteCollection(id: string): Promise<void> {
    try {
      this.collections.delete(id);
      await this.saveCollections();
    } catch (error) {
      throw new StorageError('Failed to delete collection', error as Error);
    }
  }

  // History operations - implementing IStorage interface
  async getHistory(filter: HistoryFilter): Promise<RequestHistory[]> {
    const allHistory: RequestHistory[] = [];
    
    if (filter.workspaceId) {
      const workspaceHistory = this.history.get(filter.workspaceId) || [];
      allHistory.push(...workspaceHistory);
    } else {
      // Get history from all workspaces
      for (const historyList of this.history.values()) {
        allHistory.push(...historyList);
      }
    }
    
    // Apply filters
    let filtered = allHistory;
    
    if (filter.endpointId) {
      filtered = filtered.filter(h => h.endpointId === filter.endpointId);
    }
    
    if (filter.status) {
      filtered = filtered.filter(h => h.status === filter.status);
    }
    
    if (filter.from) {
      filtered = filtered.filter(h => h.timestamp >= filter.from!);
    }
    
    if (filter.to) {
      filtered = filtered.filter(h => h.timestamp <= filter.to!);
    }
    
    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    
    return filtered.slice(offset, offset + limit);
  }

  // Method to get individual history entry by ID
  async getHistoryById(id: string): Promise<RequestHistory | null> {
    for (const historyList of this.history.values()) {
      const entry = historyList.find(h => h.id === id);
      if (entry) {
        return entry;
      }
    }
    return null;
  }

  async getHistoryByFilter(filter: HistoryFilter): Promise<RequestHistory[]> {
    const allHistory: RequestHistory[] = [];
    
    if (filter.workspaceId) {
      const workspaceHistory = this.history.get(filter.workspaceId) || [];
      allHistory.push(...workspaceHistory);
    } else {
      // Get history from all workspaces
      for (const historyList of this.history.values()) {
        allHistory.push(...historyList);
      }
    }
    
    // Apply filters
    let filtered = allHistory;
    
    if (filter.endpointId) {
      filtered = filtered.filter(h => h.endpointId === filter.endpointId);
    }
    
    if (filter.status) {
      filtered = filtered.filter(h => h.status === filter.status);
    }
    
    if (filter.from) {
      filtered = filtered.filter(h => h.timestamp >= filter.from!);
    }
    
    if (filter.to) {
      filtered = filtered.filter(h => h.timestamp <= filter.to!);
    }
    
    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;
    
    return filtered.slice(offset, offset + limit);
  }

  // Private helper methods
  private async ensureDirectories(): Promise<void> {
    try {
      // Create main data directory
      await fs.mkdir(this.dataDir, { recursive: true });
      
      // Create subdirectories - no need for 'workspaces' as workspaces.json is in root
      const subdirs = ['endpoints', 'history', 'environments', 'collections'];
      
      for (const subdir of subdirs) {
        const dirPath = path.join(this.dataDir, subdir);
        await fs.mkdir(dirPath, { recursive: true });
      }
      
      this.logger.debug(`Ensured all directories exist at ${this.dataDir}`);
    } catch (error) {
      this.logger.error('Failed to create directories:', error);
      throw new StorageError(`Failed to create storage directories: ${(error as Error).message}`, error as Error);
    }
  }

  private async loadWorkspaces(): Promise<void> {
    try {
      const workspacesPath = path.join(this.dataDir, 'workspaces.json');
      const data = await fs.readFile(workspacesPath, 'utf-8');
      const workspaces: Workspace[] = JSON.parse(data, this.dateReviver);
      
      for (const workspace of workspaces) {
        this.workspaces.set(workspace.id, workspace);
      }
      
      this.logger.debug(`Loaded ${workspaces.length} workspaces`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // File doesn't exist yet, that's ok
        this.logger.debug('No existing workspaces file found');
      } else {
        throw error;
      }
    }
  }

  private async saveWorkspaces(): Promise<void> {
    try {
      const workspacesPath = path.join(this.dataDir, 'workspaces.json');
      const workspaces = Array.from(this.workspaces.values());
      await fs.writeFile(workspacesPath, JSON.stringify(workspaces, null, 2));
    } catch (error) {
      this.logger.error('Failed to save workspaces:', error);
      // Re-throw with more context
      throw new StorageError(`Failed to save workspaces: ${(error as Error).message}`, error as Error);
    }
  }

  private async loadEndpoints(): Promise<void> {
    try {
      const endpointsDir = path.join(this.dataDir, 'endpoints');
      const files = await fs.readdir(endpointsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const workspaceId = path.basename(file, '.json');
          const filePath = path.join(endpointsDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const endpoints: ApiEndpoint[] = JSON.parse(data, this.dateReviver);
          
          const endpointMap = new Map<string, ApiEndpoint>();
          for (const endpoint of endpoints) {
            endpointMap.set(endpoint.id, endpoint);
          }
          
          this.endpoints.set(workspaceId, endpointMap);
        }
      }
      
      this.logger.debug(`Loaded endpoints for ${this.endpoints.size} workspaces`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        this.logger.debug('No existing endpoints directory found');
      } else {
        throw error;
      }
    }
  }

  private async saveEndpoints(workspaceId: string): Promise<void> {
    try {
      const endpointMap = this.endpoints.get(workspaceId);
      if (!endpointMap) {
        return;
      }
      
      const endpoints = Array.from(endpointMap.values());
      const filePath = path.join(this.dataDir, 'endpoints', `${workspaceId}.json`);
      await fs.writeFile(filePath, JSON.stringify(endpoints, null, 2));
    } catch (error) {
      this.logger.error(`Failed to save endpoints for workspace ${workspaceId}:`, error);
      // Re-throw with more context
      throw new StorageError(`Failed to save endpoints for workspace ${workspaceId}: ${(error as Error).message}`, error as Error);
    }
  }

  private async loadHistory(): Promise<void> {
    try {
      const historyDir = path.join(this.dataDir, 'history');
      const files = await fs.readdir(historyDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const workspaceId = path.basename(file, '.json');
          const filePath = path.join(historyDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const history: RequestHistory[] = JSON.parse(data, this.dateReviver);
          
          this.history.set(workspaceId, history);
        }
      }
      
      this.logger.debug(`Loaded history for ${this.history.size} workspaces`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        this.logger.debug('No existing history directory found');
      } else {
        throw error;
      }
    }
  }

  private async saveHistoryForWorkspace(workspaceId: string): Promise<void> {
    const historyList = this.history.get(workspaceId);
    if (!historyList) {
      return;
    }
    
    const filePath = this.getHistoryPath(workspaceId);
    await fs.writeFile(filePath, JSON.stringify(historyList, null, 2));
  }

  private async loadEnvironments(): Promise<void> {
    try {
      const environmentsDir = path.join(this.dataDir, 'environments');
      const files = await fs.readdir(environmentsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const workspaceId = path.basename(file, '.json');
          const filePath = path.join(environmentsDir, file);
          const data = await fs.readFile(filePath, 'utf-8');
          const environments: Environment[] = JSON.parse(data, this.dateReviver);
          
          const envMap = new Map<string, Environment>();
          for (const environment of environments) {
            envMap.set(environment.id, environment);
          }
          
          this.environments.set(workspaceId, envMap);
        }
      }
      
      this.logger.debug(`Loaded environments for ${this.environments.size} workspaces`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        this.logger.debug('No existing environments directory found');
      } else {
        throw error;
      }
    }
  }

  private async saveEnvironments(workspaceId: string): Promise<void> {
    const envMap = this.environments.get(workspaceId);
    if (!envMap) {
      return;
    }
    
    const environments = Array.from(envMap.values());
    const filePath = path.join(this.dataDir, 'environments', `${workspaceId}.json`);
    await fs.writeFile(filePath, JSON.stringify(environments, null, 2));
  }

  private async saveAllData(): Promise<void> {
    await this.saveWorkspaces();
    
    for (const workspaceId of this.endpoints.keys()) {
      await this.saveEndpoints(workspaceId);
    }
    
    for (const workspaceId of this.history.keys()) {
      await this.saveHistoryForWorkspace(workspaceId);
    }
    
    for (const workspaceId of this.environments.keys()) {
      await this.saveEnvironments(workspaceId);
    }
  }

  private async deleteWorkspaceFiles(workspaceId: string): Promise<void> {
    await this.deleteFile(path.join(this.dataDir, 'endpoints', `${workspaceId}.json`));
    await this.deleteFile(path.join(this.dataDir, 'history', `${workspaceId}.json`));
    await this.deleteFile(path.join(this.dataDir, 'environments', `${workspaceId}.json`));
  }

  private async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private getHistoryPath(workspaceId: string): string {
    return path.join(this.dataDir, 'history', `${workspaceId}.json`);
  }

  /**
   * JSON reviver function to parse dates
   */
  private dateReviver(_key: string, value: any): any {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value)) {
      return new Date(value);
    }
    return value;
  }

  private async loadCollections(): Promise<void> {
    try {
      const collectionsPath = path.join(this.dataDir, 'collections.json');
      const data = await fs.readFile(collectionsPath, 'utf-8');
      const collections: any[] = JSON.parse(data, this.dateReviver);
      
      for (const collection of collections) {
        this.collections.set(collection.id, collection);
      }
      
      this.logger.debug(`Loaded ${collections.length} collections`);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        this.logger.debug('No existing collections file found');
      } else {
        throw error;
      }
    }
  }

  private async saveCollections(): Promise<void> {
    const collectionsPath = path.join(this.dataDir, 'collections.json');
    const collections = Array.from(this.collections.values());
    await fs.writeFile(collectionsPath, JSON.stringify(collections, null, 2));
  }

  /**
   * Read data from file
   */
  async readData<T>(filePath: string): Promise<T | null> {
    try {
      const fullPath = path.resolve(this.dataDir, filePath);
      const data = await fs.readFile(fullPath, 'utf-8');
      return JSON.parse(data, this.dateReviver);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }
      throw new StorageError('Failed to read data', error as Error);
    }
  }

  /**
   * Write data to file
   */
  async writeData<T>(filePath: string, data: T): Promise<void> {
    try {
      const fullPath = path.resolve(this.dataDir, filePath);
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, JSON.stringify(data, null, 2));
    } catch (error) {
      throw new StorageError('Failed to write data', error as Error);
    }
  }

  /**
   * Check if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    try {
      const fullPath = path.resolve(this.dataDir, filePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file
   */
  async delete(filePath: string): Promise<void> {
    try {
      const fullPath = path.resolve(this.dataDir, filePath);
      await fs.unlink(fullPath);
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        throw new StorageError('Failed to delete file', error as Error);
      }
    }
  }
}