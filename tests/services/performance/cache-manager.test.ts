/**
 * Tests for Cache Manager Service
 */

import { jest } from '@jest/globals';
import { CacheManager } from '../../../src/services/performance/cache-manager.service';
import { MockFactory } from '../../utils/test-utils';
import type { CacheConfig } from '../../../src/types';

describe('Cache Manager Service', () => {
  let cacheManager: CacheManager;
  let mockStorage: any;
  let mockLogger: any;

  beforeEach(() => {
    mockStorage = MockFactory.createMockStorage();
    mockLogger = MockFactory.createMockLogger();
    
    const config: CacheConfig = {
      maxSize: 1024 * 1024, // 1MB
      maxEntries: 100,
      defaultTTL: 60000, // 1 minute
      evictionPolicy: 'lru',
      compression: false,
      persistent: false,
      collectStats: true,
    };
    
    cacheManager = new CacheManager(config, mockStorage, mockLogger);
  });

  afterEach(async () => {
    await cacheManager.dispose();
  });

  describe('Basic Operations', () => {
    it('should set and get values', async () => {
      const key = 'test-key';
      const value = { data: 'test-value' };
      
      await cacheManager.set(key, value);
      const retrieved = await cacheManager.get(key);
      
      expect(retrieved).toEqual(value);
    });

    it('should return undefined for non-existent keys', async () => {
      const result = await cacheManager.get('non-existent');
      expect(result).toBeUndefined();
    });

    it('should check if key exists', async () => {
      const key = 'test-key';
      const value = 'test-value';
      
      expect(cacheManager.has(key)).toBe(false);
      
      await cacheManager.set(key, value);
      expect(cacheManager.has(key)).toBe(true);
    });

    it('should delete values', async () => {
      const key = 'test-key';
      const value = 'test-value';
      
      await cacheManager.set(key, value);
      expect(cacheManager.has(key)).toBe(true);
      
      const deleted = cacheManager.delete(key);
      expect(deleted).toBe(true);
      expect(cacheManager.has(key)).toBe(false);
    });

    it('should clear all values', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      
      expect(cacheManager.keys()).toHaveLength(2);
      
      cacheManager.clear();
      expect(cacheManager.keys()).toHaveLength(0);
    });

    it('should return all keys', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      await cacheManager.set('key3', 'value3');
      
      const keys = cacheManager.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should expire entries after TTL', async () => {
      const key = 'ttl-test';
      const value = 'test-value';
      const ttl = 100; // 100ms
      
      await cacheManager.set(key, value, { ttl });
      expect(await cacheManager.get(key)).toBe(value);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(await cacheManager.get(key)).toBeUndefined();
      expect(cacheManager.has(key)).toBe(false);
    });

    it('should use default TTL when not specified', async () => {
      const key = 'default-ttl-test';
      const value = 'test-value';
      
      await cacheManager.set(key, value);
      
      const stats = cacheManager.getStatistics();
      expect(stats.entries).toBe(1);
    });
  });

  describe('Statistics', () => {
    it('should track cache statistics', async () => {
      // Initially empty
      let stats = cacheManager.getStatistics();
      expect(stats.entries).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      
      // Add some entries
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      
      stats = cacheManager.getStatistics();
      expect(stats.entries).toBe(2);
      
      // Test hits and misses
      await cacheManager.get('key1'); // hit
      await cacheManager.get('key1'); // hit
      await cacheManager.get('non-existent'); // miss
      
      stats = cacheManager.getStatistics();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should track memory usage', async () => {
      const value = 'x'.repeat(1000); // 1KB string
      
      await cacheManager.set('large-value', value);
      
      const stats = cacheManager.getStatistics();
      expect(stats.size).toBeGreaterThan(1000);
      expect(stats.memoryUsage.used).toBe(stats.size);
      expect(stats.memoryUsage.percentage).toBeGreaterThan(0);
    });
  });

  describe('Eviction Policies', () => {
    beforeEach(() => {
      const config: CacheConfig = {
        maxEntries: 3,
        evictionPolicy: 'lru',
        collectStats: true,
      };
      
      cacheManager = new CacheManager(config, mockStorage, mockLogger);
    });

    it('should evict LRU entries when capacity exceeded', async () => {
      // Fill cache to capacity
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      await cacheManager.set('key3', 'value3');
      
      expect(cacheManager.keys()).toHaveLength(3);
      
      // Access key1 to make it more recently used
      await cacheManager.get('key1');
      
      // Add new entry, should evict key2 (least recently used)
      await cacheManager.set('key4', 'value4');
      
      expect(cacheManager.keys()).toHaveLength(3);
      expect(cacheManager.has('key1')).toBe(true); // kept (recently accessed)
      expect(cacheManager.has('key2')).toBe(false); // evicted (LRU)
      expect(cacheManager.has('key3')).toBe(true); // kept
      expect(cacheManager.has('key4')).toBe(true); // new entry
    });

    it('should track eviction count', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      await cacheManager.set('key3', 'value3');
      await cacheManager.set('key4', 'value4'); // Triggers eviction
      
      const stats = cacheManager.getStatistics();
      expect(stats.evictions).toBe(1);
    });
  });

  describe('Tag Support', () => {
    it('should support tagging entries', async () => {
      await cacheManager.set('user:1', { name: 'Alice' }, { tags: ['user', 'profile'] });
      await cacheManager.set('user:2', { name: 'Bob' }, { tags: ['user', 'profile'] });
      await cacheManager.set('post:1', { title: 'Hello' }, { tags: ['post'] });
      
      const userEntries = cacheManager.getByTags(['user']);
      expect(userEntries).toHaveLength(2);
      
      const profileEntries = cacheManager.getByTags(['profile']);
      expect(profileEntries).toHaveLength(2);
      
      const postEntries = cacheManager.getByTags(['post']);
      expect(postEntries).toHaveLength(1);
    });

    it('should delete entries by tags', async () => {
      await cacheManager.set('user:1', { name: 'Alice' }, { tags: ['user'] });
      await cacheManager.set('user:2', { name: 'Bob' }, { tags: ['user'] });
      await cacheManager.set('post:1', { title: 'Hello' }, { tags: ['post'] });
      
      expect(cacheManager.keys()).toHaveLength(3);
      
      const deleted = cacheManager.deleteByTags(['user']);
      expect(deleted).toBe(2);
      expect(cacheManager.keys()).toHaveLength(1);
      expect(cacheManager.has('post:1')).toBe(true);
    });
  });

  describe('Compression', () => {
    beforeEach(() => {
      const config: CacheConfig = {
        compression: true,
        collectStats: true,
      };
      
      cacheManager = new CacheManager(config, mockStorage, mockLogger);
    });

    it('should compress large values', async () => {
      const largeValue = {
        data: 'x'.repeat(2000), // Large string that should benefit from compression
        numbers: Array.from({ length: 100 }, (_, i) => i),
      };
      
      await cacheManager.set('large-object', largeValue);
      const retrieved = await cacheManager.get('large-object');
      
      expect(retrieved).toEqual(largeValue);
    });

    it('should handle compression errors gracefully', async () => {
      const circularRef: any = { name: 'test' };
      circularRef.self = circularRef;
      
      // Should not throw, but warn about compression failure
      await expect(cacheManager.set('circular', circularRef)).resolves.not.toThrow();
    });
  });

  describe('Key Generation', () => {
    it('should generate consistent keys from objects', () => {
      const obj1 = { name: 'test', value: 123 };
      const obj2 = { name: 'test', value: 123 };
      const obj3 = { name: 'test', value: 456 };
      
      const key1 = CacheManager.generateKey(obj1);
      const key2 = CacheManager.generateKey(obj2);
      const key3 = CacheManager.generateKey(obj3);
      
      expect(key1).toBe(key2); // Same object should generate same key
      expect(key1).not.toBe(key3); // Different object should generate different key
      expect(key1).toMatch(/^[a-f0-9]{64}$/); // Should be SHA-256 hash
    });

    it('should generate keys from strings', () => {
      const key1 = CacheManager.generateKey('test-string');
      const key2 = CacheManager.generateKey('test-string');
      const key3 = CacheManager.generateKey('different-string');
      
      expect(key1).toBe(key2);
      expect(key1).not.toBe(key3);
    });
  });

  describe('Warm Up', () => {
    it('should warm up cache with provided items', async () => {
      const items = [
        { key: 'item1', value: 'value1' },
        { key: 'item2', value: 'value2', options: { priority: 10 } },
        { key: 'item3', value: 'value3', options: { ttl: 30000 } },
      ];
      
      await cacheManager.warmUp(items);
      
      expect(cacheManager.keys()).toHaveLength(3);
      expect(await cacheManager.get('item1')).toBe('value1');
      expect(await cacheManager.get('item2')).toBe('value2');
      expect(await cacheManager.get('item3')).toBe('value3');
    });
  });

  describe('Priority Support', () => {
    beforeEach(() => {
      const config: CacheConfig = {
        maxEntries: 2,
        evictionPolicy: 'priority',
        collectStats: true,
      };
      
      cacheManager = new CacheManager(config, mockStorage, mockLogger);
    });

    it('should evict lowest priority entries first', async () => {
      await cacheManager.set('high', 'value1', { priority: 10 });
      await cacheManager.set('low', 'value2', { priority: 1 });
      await cacheManager.set('medium', 'value3', { priority: 5 });
      
      expect(cacheManager.keys()).toHaveLength(2);
      expect(cacheManager.has('high')).toBe(true);
      expect(cacheManager.has('low')).toBe(false); // Should be evicted (lowest priority)
      expect(cacheManager.has('medium')).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid get operations gracefully', async () => {
      const result = await cacheManager.get('');
      expect(result).toBeUndefined();
    });

    it('should handle delete operations on non-existent keys', () => {
      const result = cacheManager.delete('non-existent');
      expect(result).toBe(false);
    });

    it('should handle clearing empty cache', () => {
      expect(() => cacheManager.clear()).not.toThrow();
    });
  });
});