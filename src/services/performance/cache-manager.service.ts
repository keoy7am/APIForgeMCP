/**
 * Cache Manager Service
 * Manages in-memory and persistent caching with various eviction policies
 */

import { createHash } from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import type {
  CacheEntry,
  CacheConfig,
  CacheStatistics,
  EvictionPolicy,
} from '../../types';
import { FileStorage } from '../../storage/file-storage';
import { Logger } from '../../utils/logger';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class CacheManager<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private accessOrder: string[] = [];
  private config: Required<CacheConfig>;
  private statistics: CacheStatistics;
  private storage?: FileStorage;
  private logger: Logger;
  private autoSaveTimer?: NodeJS.Timeout;

  constructor(
    config: CacheConfig = {},
    storage?: FileStorage,
    logger: Logger = new Logger('CacheManager')
  ) {
    this.config = {
      maxSize: config.maxSize || 100 * 1024 * 1024, // 100MB default
      maxEntries: config.maxEntries || 10000,
      defaultTTL: config.defaultTTL || 3600000, // 1 hour default
      evictionPolicy: config.evictionPolicy || 'lru',
      compression: config.compression || false,
      persistent: config.persistent || false,
      persistencePath: config.persistencePath || 'cache.json',
      autoSaveInterval: config.autoSaveInterval || 60000, // 1 minute
      collectStats: config.collectStats !== false,
    };
    
    this.storage = storage;
    this.logger = logger;
    
    this.statistics = {
      entries: 0,
      size: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      evictions: 0,
      avgAccessTime: 0,
      memoryUsage: {
        used: 0,
        limit: this.config.maxSize,
        percentage: 0,
      },
    };
    
    if (this.config.persistent && storage) {
      this.loadFromDisk();
      this.startAutoSave();
    }
  }

  /**
   * Get an item from cache
   */
  async get(key: string): Promise<T | undefined> {
    const startTime = Date.now();
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.recordMiss();
      return undefined;
    }
    
    // Check if expired
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.recordMiss();
      return undefined;
    }
    
    // Update access info
    entry.lastAccessedAt = new Date();
    entry.accessCount++;
    this.updateAccessOrder(key);
    
    // Decompress if needed
    let value = entry.value;
    if (this.config.compression && Buffer.isBuffer(value)) {
      try {
        const decompressed = await gunzip(value as any);
        value = JSON.parse(decompressed.toString());
      } catch (error) {
        this.logger.error('Failed to decompress cache entry', error);
        this.cache.delete(key);
        return undefined;
      }
    }
    
    this.recordHit(Date.now() - startTime);
    return value;
  }

  /**
   * Set an item in cache
   */
  async set(
    key: string,
    value: T,
    options: {
      ttl?: number;
      priority?: number;
      tags?: string[];
      metadata?: Record<string, any>;
    } = {}
  ): Promise<void> {
    // Calculate size
    let size = this.calculateSize(value);
    let storedValue: any = value;
    
    // Compress if enabled and beneficial
    if (this.config.compression && size > 1024) {
      try {
        const compressed = await gzip(JSON.stringify(value));
        if (compressed.length < size) {
          storedValue = compressed;
          size = compressed.length;
        }
      } catch (error) {
        this.logger.warn('Failed to compress value', error);
      }
    }
    
    // Check if we need to evict entries
    await this.ensureCapacity(size);
    
    const ttl = options.ttl || this.config.defaultTTL;
    const expiresAt = ttl > 0 ? new Date(Date.now() + ttl) : undefined;
    
    const entry: CacheEntry<T> = {
      key,
      value: storedValue,
      expiresAt,
      createdAt: new Date(),
      lastAccessedAt: new Date(),
      accessCount: 0,
      size,
      priority: options.priority,
      tags: options.tags,
      metadata: options.metadata,
    };
    
    // Remove old entry if exists
    if (this.cache.has(key)) {
      const oldEntry = this.cache.get(key)!;
      this.statistics.size -= oldEntry.size;
    }
    
    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    
    // Update statistics
    this.statistics.entries = this.cache.size;
    this.statistics.size += size;
    this.updateMemoryUsage();
  }

  /**
   * Delete an item from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    this.cache.delete(key);
    this.removeFromAccessOrder(key);
    
    this.statistics.entries--;
    this.statistics.size -= entry.size;
    this.updateMemoryUsage();
    
    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    
    this.statistics.entries = 0;
    this.statistics.size = 0;
    this.updateMemoryUsage();
    
    this.logger.info('Cache cleared');
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Check expiration
    if (entry.expiresAt && entry.expiresAt < new Date()) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return false;
    }
    
    return true;
  }

  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    return { ...this.statistics };
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get entries by tags
   */
  getByTags(tags: string[]): Array<CacheEntry<T>> {
    const entries: Array<CacheEntry<T>> = [];
    
    for (const entry of this.cache.values()) {
      if (entry.tags && tags.some(tag => entry.tags!.includes(tag))) {
        entries.push(entry);
      }
    }
    
    return entries;
  }

  /**
   * Delete entries by tags
   */
  deleteByTags(tags: string[]): number {
    let deleted = 0;
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags && tags.some(tag => entry.tags!.includes(tag))) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      if (this.delete(key)) {
        deleted++;
      }
    }
    
    return deleted;
  }

  /**
   * Warm up cache with frequently accessed items
   */
  async warmUp(items: Array<{ key: string; value: T; options?: any }>): Promise<void> {
    this.logger.info(`Warming up cache with ${items.length} items`);
    
    for (const item of items) {
      await this.set(item.key, item.value, item.options);
    }
  }

  /**
   * Ensure capacity for new entry
   */
  private async ensureCapacity(requiredSize: number): Promise<void> {
    // Check size constraint
    while (this.statistics.size + requiredSize > this.config.maxSize) {
      if (!this.evictOne()) break;
    }
    
    // Check entry count constraint
    while (this.cache.size >= this.config.maxEntries) {
      if (!this.evictOne()) break;
    }
  }

  /**
   * Evict one entry based on policy
   */
  private evictOne(): boolean {
    let keyToEvict: string | undefined;
    
    switch (this.config.evictionPolicy) {
      case 'lru':
        keyToEvict = this.findLRU();
        break;
      case 'lfu':
        keyToEvict = this.findLFU();
        break;
      case 'fifo':
        keyToEvict = this.findFIFO();
        break;
      case 'ttl':
        keyToEvict = this.findExpiringSoon();
        break;
      case 'size':
        keyToEvict = this.findLargest();
        break;
      case 'priority':
        keyToEvict = this.findLowestPriority();
        break;
    }
    
    if (keyToEvict) {
      this.delete(keyToEvict);
      this.statistics.evictions++;
      this.logger.debug(`Evicted cache entry: ${keyToEvict}`);
      return true;
    }
    
    return false;
  }

  /**
   * Find least recently used entry
   */
  private findLRU(): string | undefined {
    return this.accessOrder[0];
  }

  /**
   * Find least frequently used entry
   */
  private findLFU(): string | undefined {
    let minAccess = Infinity;
    let keyToEvict: string | undefined;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < minAccess) {
        minAccess = entry.accessCount;
        keyToEvict = key;
      }
    }
    
    return keyToEvict;
  }

  /**
   * Find first in (oldest) entry
   */
  private findFIFO(): string | undefined {
    let oldest: Date | undefined;
    let keyToEvict: string | undefined;
    
    for (const [key, entry] of this.cache.entries()) {
      if (!oldest || entry.createdAt < oldest) {
        oldest = entry.createdAt;
        keyToEvict = key;
      }
    }
    
    return keyToEvict;
  }

  /**
   * Find entry expiring soon
   */
  private findExpiringSoon(): string | undefined {
    let soonest: Date | undefined;
    let keyToEvict: string | undefined;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && (!soonest || entry.expiresAt < soonest)) {
        soonest = entry.expiresAt;
        keyToEvict = key;
      }
    }
    
    return keyToEvict || this.findLRU();
  }

  /**
   * Find largest entry
   */
  private findLargest(): string | undefined {
    let maxSize = 0;
    let keyToEvict: string | undefined;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.size > maxSize) {
        maxSize = entry.size;
        keyToEvict = key;
      }
    }
    
    return keyToEvict;
  }

  /**
   * Find lowest priority entry
   */
  private findLowestPriority(): string | undefined {
    let minPriority = Infinity;
    let keyToEvict: string | undefined;
    
    for (const [key, entry] of this.cache.entries()) {
      const priority = entry.priority || 0;
      if (priority < minPriority) {
        minPriority = priority;
        keyToEvict = key;
      }
    }
    
    return keyToEvict;
  }

  /**
   * Update access order for LRU
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Calculate size of value
   */
  private calculateSize(value: any): number {
    if (Buffer.isBuffer(value)) {
      return value.length;
    }
    
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    return Buffer.byteLength(str, 'utf8');
  }

  /**
   * Record cache hit
   */
  private recordHit(accessTime: number): void {
    if (!this.config.collectStats) return;
    
    this.statistics.hits++;
    this.updateHitRate();
    this.updateAvgAccessTime(accessTime);
  }

  /**
   * Record cache miss
   */
  private recordMiss(): void {
    if (!this.config.collectStats) return;
    
    this.statistics.misses++;
    this.updateHitRate();
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    const total = this.statistics.hits + this.statistics.misses;
    if (total > 0) {
      this.statistics.hitRate = (this.statistics.hits / total) * 100;
    }
  }

  /**
   * Update average access time
   */
  private updateAvgAccessTime(accessTime: number): void {
    const totalAccesses = this.statistics.hits;
    if (totalAccesses === 1) {
      this.statistics.avgAccessTime = accessTime;
    } else {
      this.statistics.avgAccessTime = 
        (this.statistics.avgAccessTime * (totalAccesses - 1) + accessTime) / totalAccesses;
    }
  }

  /**
   * Update memory usage statistics
   */
  private updateMemoryUsage(): void {
    this.statistics.memoryUsage = {
      used: this.statistics.size,
      limit: this.config.maxSize,
      percentage: (this.statistics.size / this.config.maxSize) * 100,
    };
  }

  /**
   * Load cache from disk
   */
  private async loadFromDisk(): Promise<void> {
    if (!this.storage) return;
    
    try {
      const data = await this.storage.readData<{
        entries: Array<CacheEntry<T>>;
        statistics: CacheStatistics;
      }>(this.config.persistencePath);
      
      if (data) {
        // Restore entries
        for (const entry of data.entries) {
          // Convert date strings back to Date objects
          entry.createdAt = new Date(entry.createdAt);
          entry.lastAccessedAt = new Date(entry.lastAccessedAt);
          if (entry.expiresAt) {
            entry.expiresAt = new Date(entry.expiresAt);
          }
          
          // Skip expired entries
          if (entry.expiresAt && entry.expiresAt < new Date()) {
            continue;
          }
          
          this.cache.set(entry.key, entry);
          this.accessOrder.push(entry.key);
        }
        
        // Restore statistics
        this.statistics = data.statistics;
        this.updateMemoryUsage();
        
        this.logger.info(`Loaded ${this.cache.size} cache entries from disk`);
      }
    } catch (error) {
      this.logger.warn('Failed to load cache from disk', error);
    }
  }

  /**
   * Save cache to disk
   */
  async saveToDisk(): Promise<void> {
    if (!this.storage || !this.config.persistent) return;
    
    try {
      const entries = Array.from(this.cache.values());
      
      await this.storage.writeData(this.config.persistencePath, {
        entries,
        statistics: this.statistics,
      });
      
      this.logger.debug(`Saved ${entries.length} cache entries to disk`);
    } catch (error) {
      this.logger.error('Failed to save cache to disk', error);
    }
  }

  /**
   * Start auto-save timer
   */
  private startAutoSave(): void {
    if (!this.config.persistent || !this.storage) return;
    
    this.autoSaveTimer = setInterval(() => {
      this.saveToDisk().catch(error => {
        this.logger.error('Auto-save failed', error);
      });
    }, this.config.autoSaveInterval);
  }

  /**
   * Stop auto-save timer
   */
  stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  /**
   * Clean up resources
   */
  async dispose(): Promise<void> {
    this.stopAutoSave();
    
    if (this.config.persistent) {
      await this.saveToDisk();
    }
    
    this.clear();
  }

  /**
   * Generate cache key from object
   */
  static generateKey(obj: any): string {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return createHash('sha256').update(str).digest('hex');
  }
}