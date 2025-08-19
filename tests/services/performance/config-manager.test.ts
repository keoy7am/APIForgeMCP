/**
 * Tests for Configuration Manager Service
 */

import { jest } from '@jest/globals';
import { readFile, writeFile, access } from 'fs/promises';
import { ConfigManager } from '../../../src/services/performance/config-manager.service';
import { MockFactory } from '../../utils/test-utils';

// Mock fs/promises
jest.mock('fs/promises');
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockAccess = access as jest.MockedFunction<typeof access>;

describe('Configuration Manager Service', () => {
  let configManager: ConfigManager;
  let mockLogger: any;
  
  const mockConfig = {
    version: '1.0.0',
    description: 'Test configuration',
    lastUpdated: '2025-08-18T00:00:00.000Z',
    cache: {
      production: {
        maxSize: 100 * 1024 * 1024,
        maxEntries: 10000,
        defaultTTL: 300000,
        evictionPolicy: 'lru',
        compression: true,
        persistent: true,
        collectStats: true,
      },
      development: {
        maxSize: 50 * 1024 * 1024,
        maxEntries: 5000,
        defaultTTL: 60000,
        evictionPolicy: 'lru',
        compression: false,
        persistent: false,
        collectStats: true,
      },
      testing: {
        maxSize: 10 * 1024 * 1024,
        maxEntries: 1000,
        defaultTTL: 30000,
        evictionPolicy: 'lru',
        compression: false,
        persistent: false,
        collectStats: false,
      },
    },
    connectionPool: {
      production: {
        maxConnections: 100,
        maxConnectionsPerHost: 10,
        connectionTimeout: 5000,
        idleTimeout: 30000,
        retryAttempts: 3,
        keepAlive: true,
      },
      development: {
        maxConnections: 20,
        maxConnectionsPerHost: 5,
        connectionTimeout: 3000,
        idleTimeout: 15000,
        retryAttempts: 2,
        keepAlive: true,
      },
      testing: {
        maxConnections: 5,
        maxConnectionsPerHost: 2,
        connectionTimeout: 1000,
        idleTimeout: 5000,
        retryAttempts: 1,
        keepAlive: false,
      },
    },
    rateLimiter: {
      production: {
        maxRequests: 1000,
        windowMs: 60000,
        keyGenerator: () => 'default',
      },
      development: {
        maxRequests: 100,
        windowMs: 60000,
        keyGenerator: () => 'default',
      },
      testing: {
        maxRequests: 1000,
        windowMs: 1000,
        keyGenerator: () => 'default',
      },
    },
    monitoring: {
      performance: {
        metricsCollection: {
          enabled: true,
          interval: 5000,
          historyLength: 720,
          exportFormat: 'json',
        },
        alerting: {
          enabled: true,
          channels: ['console'],
          thresholds: {
            memory: { warning: 70, critical: 85 },
            cpu: { warning: 70, critical: 90 },
            responseTime: { warning: 200, critical: 500 },
            errorRate: { warning: 5, critical: 10 },
            cacheHitRate: { warning: 80, critical: 60 },
          },
        },
        dashboard: {
          enabled: true,
          updateInterval: 5000,
          autoRecommendations: true,
          exportPath: './data/performance',
        },
      },
      healthChecks: {
        enabled: true,
        interval: 10000,
        timeout: 5000,
        endpoints: [],
      },
    },
    optimization: {
      autoTuning: {
        enabled: false,
        interval: 300000,
        aggressiveness: 'moderate',
        maxAdjustmentPercentage: 20,
        safeMode: true,
        backupSettings: true,
      },
      presets: {
        'high-performance': {
          description: 'High performance preset',
          cache: {
            maxSize: 200 * 1024 * 1024,
            evictionPolicy: 'lfu',
          },
          connectionPool: {
            maxConnections: 150,
          },
          rateLimiter: {
            maxRequests: 2000,
          },
        },
      },
      recommendations: {
        enabled: true,
        notificationThreshold: 3,
        autoApply: {
          enabled: false,
          safetyChecks: true,
          rollbackOnFailure: true,
        },
      },
    },
    security: {
      rateLimiting: {
        denyList: {
          enabled: true,
          maxEntries: 10000,
          duration: 3600000,
        },
        allowList: {
          enabled: true,
          entries: ['127.0.0.1'],
        },
      },
      encryption: {
        algorithm: 'aes-256-gcm',
        keyRotation: {
          enabled: true,
          interval: 86400000,
        },
      },
    },
    logging: {
      performance: {
        level: 'info',
        format: 'json',
        maxFileSize: '100MB',
        maxFiles: 5,
        logMetrics: true,
        logSlowQueries: true,
        slowQueryThreshold: 1000,
      },
    },
    testing: {
      loadTesting: {
        scenarios: [],
        thresholds: {
          errorRate: 5,
          responseTime: {
            p95: 500,
            p99: 1000,
          },
          memoryUsage: 200,
        },
      },
    },
  };

  beforeEach(() => {
    mockLogger = MockFactory.createMockLogger();
    configManager = new ConfigManager(mockLogger, 'development');
    
    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    configManager.dispose();
  });

  describe('Configuration Loading', () => {
    it('should load configuration successfully', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      
      const config = await configManager.loadConfig();
      
      expect(config).toEqual(mockConfig);
      expect(mockReadFile).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configuration loaded successfully',
        expect.objectContaining({
          version: mockConfig.version,
          environment: 'development',
        })
      );
    });

    it('should handle file read errors', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));
      
      await expect(configManager.loadConfig()).rejects.toThrow('File not found');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to load configuration',
        expect.objectContaining({
          error: 'File not found',
        })
      );
    });

    it('should handle invalid JSON', async () => {
      mockReadFile.mockResolvedValue('invalid json {');
      
      await expect(configManager.loadConfig()).rejects.toThrow();
    });

    it('should validate configuration on load', async () => {
      const invalidConfig = {
        ...mockConfig,
        version: '', // Invalid: empty version
      };
      mockReadFile.mockResolvedValue(JSON.stringify(invalidConfig));
      
      await expect(configManager.loadConfig()).rejects.toThrow('Invalid configuration');
    });

    it('should emit configLoaded event', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      
      const loadedSpy = jest.fn();
      configManager.on('configLoaded', loadedSpy);
      
      await configManager.loadConfig();
      
      expect(loadedSpy).toHaveBeenCalledWith(mockConfig);
    });
  });

  describe('Configuration Saving', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      await configManager.loadConfig();
    });

    it('should save configuration successfully', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      
      await configManager.saveConfig();
      
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Configuration saved successfully',
        expect.objectContaining({
          version: mockConfig.version,
        })
      );
    });

    it('should update lastUpdated timestamp on save', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      
      const originalTimestamp = mockConfig.lastUpdated;
      await configManager.saveConfig();
      
      const writeCall = mockWriteFile.mock.calls[0];
      const savedConfig = JSON.parse(writeCall[1] as string);
      expect(savedConfig.lastUpdated).not.toBe(originalTimestamp);
    });

    it('should create backup before saving', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      
      await configManager.saveConfig();
      
      const backups = configManager.getAvailableBackups();
      expect(backups.length).toBe(1);
      expect(backups[0].version).toBe(mockConfig.version);
    });

    it('should handle save errors', async () => {
      mockWriteFile.mockRejectedValue(new Error('Write failed'));
      
      await expect(configManager.saveConfig()).rejects.toThrow('Write failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save configuration',
        expect.objectContaining({
          error: 'Write failed',
        })
      );
    });

    it('should emit configSaved event', async () => {
      mockWriteFile.mockResolvedValue(undefined);
      
      const savedSpy = jest.fn();
      configManager.on('configSaved', savedSpy);
      
      await configManager.saveConfig();
      
      expect(savedSpy).toHaveBeenCalled();
    });
  });

  describe('Configuration Access', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      await configManager.loadConfig();
    });

    it('should get cache config for current environment', () => {
      const cacheConfig = configManager.getCacheConfig();
      expect(cacheConfig).toEqual(mockConfig.cache.development);
    });

    it('should get connection pool config for current environment', () => {
      const poolConfig = configManager.getConnectionPoolConfig();
      expect(poolConfig).toEqual(mockConfig.connectionPool.development);
    });

    it('should get rate limiter config for current environment', () => {
      const rateLimitConfig = configManager.getRateLimiterConfig();
      expect(rateLimitConfig).toEqual(mockConfig.rateLimiter.development);
    });

    it('should get monitoring config', () => {
      const monitoringConfig = configManager.getMonitoringConfig();
      expect(monitoringConfig).toEqual(mockConfig.monitoring);
    });

    it('should get optimization config', () => {
      const optimizationConfig = configManager.getOptimizationConfig();
      expect(optimizationConfig).toEqual(mockConfig.optimization);
    });

    it('should get security config', () => {
      const securityConfig = configManager.getSecurityConfig();
      expect(securityConfig).toEqual(mockConfig.security);
    });

    it('should get testing config', () => {
      const testingConfig = configManager.getTestingConfig();
      expect(testingConfig).toEqual(mockConfig.testing);
    });

    it('should throw error when accessing config before loading', () => {
      const freshManager = new ConfigManager(mockLogger);
      
      expect(() => freshManager.getCacheConfig()).toThrow('Configuration not loaded');
      
      freshManager.dispose();
    });
  });

  describe('Preset Management', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      mockWriteFile.mockResolvedValue(undefined);
      await configManager.loadConfig();
    });

    it('should apply preset successfully', async () => {
      await configManager.applyPreset('high-performance');
      
      const cacheConfig = configManager.getCacheConfig();
      expect(cacheConfig.maxSize).toBe(200 * 1024 * 1024); // From preset
      expect(cacheConfig.evictionPolicy).toBe('lfu'); // From preset
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Applied configuration preset',
        expect.objectContaining({
          preset: 'high-performance',
          environment: 'development',
        })
      );
    });

    it('should throw error for non-existent preset', async () => {
      await expect(configManager.applyPreset('non-existent'))
        .rejects.toThrow("Preset 'non-existent' not found");
    });

    it('should emit presetApplied event', async () => {
      const appliedSpy = jest.fn();
      configManager.on('presetApplied', appliedSpy);
      
      await configManager.applyPreset('high-performance');
      
      expect(appliedSpy).toHaveBeenCalledWith({
        presetName: 'high-performance',
        preset: mockConfig.optimization.presets['high-performance'],
      });
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      mockWriteFile.mockResolvedValue(undefined);
      await configManager.loadConfig();
    });

    it('should update cache configuration', async () => {
      const updates = {
        maxSize: 75 * 1024 * 1024,
        maxEntries: 7500,
      };
      
      await configManager.updateConfig('cache', updates);
      
      const cacheConfig = configManager.getCacheConfig();
      expect(cacheConfig.maxSize).toBe(updates.maxSize);
      expect(cacheConfig.maxEntries).toBe(updates.maxEntries);
    });

    it('should update global configuration sections', async () => {
      const updates = {
        enabled: false,
      };
      
      await configManager.updateConfig('monitoring', updates);
      
      const monitoringConfig = configManager.getMonitoringConfig();
      expect(monitoringConfig.enabled).toBe(false);
    });

    it('should emit configChanged event', async () => {
      const changedSpy = jest.fn();
      configManager.on('configChanged', changedSpy);
      
      await configManager.updateConfig('cache', { maxSize: 100 });
      
      expect(changedSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          section: 'cache',
          environment: 'development',
          oldValue: expect.any(Object),
          newValue: expect.any(Object),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should update configuration for specific environment', async () => {
      await configManager.updateConfig('cache', { maxSize: 999 }, 'production');
      
      // Current environment should not be affected
      const devConfig = configManager.getCacheConfig();
      expect(devConfig.maxSize).toBe(mockConfig.cache.development.maxSize);
      
      // Switch to production to verify update
      configManager.setEnvironment('production');
      const prodConfig = configManager.getCacheConfig();
      expect(prodConfig.maxSize).toBe(999);
    });
  });

  describe('Backup and Restore', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      mockWriteFile.mockResolvedValue(undefined);
      await configManager.loadConfig();
    });

    it('should create backups when saving', async () => {
      expect(configManager.getAvailableBackups().length).toBe(0);
      
      await configManager.saveConfig();
      
      const backups = configManager.getAvailableBackups();
      expect(backups.length).toBe(1);
      expect(backups[0].version).toBe(mockConfig.version);
    });

    it('should limit backup count', async () => {
      // Create many backups
      for (let i = 0; i < 15; i++) {
        await configManager.saveConfig();
        await new Promise(resolve => setTimeout(resolve, 1)); // Ensure different timestamps
      }
      
      const backups = configManager.getAvailableBackups();
      expect(backups.length).toBeLessThanOrEqual(10);
    });

    it('should restore latest backup', async () => {
      // Save initial state
      await configManager.saveConfig();
      
      // Make changes
      await configManager.updateConfig('cache', { maxSize: 999 });
      expect(configManager.getCacheConfig().maxSize).toBe(999);
      
      // Restore backup
      await configManager.restoreBackup();
      
      const restoredConfig = configManager.getCacheConfig();
      expect(restoredConfig.maxSize).toBe(mockConfig.cache.development.maxSize);
    });

    it('should restore specific backup', async () => {
      // Create first backup
      await configManager.saveConfig();
      const backups1 = configManager.getAvailableBackups();
      
      // Make changes and create second backup
      await configManager.updateConfig('cache', { maxSize: 111 });
      await configManager.saveConfig();
      
      // Make more changes
      await configManager.updateConfig('cache', { maxSize: 222 });
      
      // Restore first backup
      await configManager.restoreBackup(backups1[0].key);
      
      const restoredConfig = configManager.getCacheConfig();
      expect(restoredConfig.maxSize).toBe(mockConfig.cache.development.maxSize);
    });

    it('should throw error for non-existent backup', async () => {
      await expect(configManager.restoreBackup('non-existent'))
        .rejects.toThrow("Backup 'non-existent' not found");
    });

    it('should throw error when no backups available', async () => {
      await expect(configManager.restoreBackup())
        .rejects.toThrow('No backups available');
    });

    it('should emit configRestored event', async () => {
      const restoredSpy = jest.fn();
      configManager.on('configRestored', restoredSpy);
      
      await configManager.saveConfig();
      await configManager.restoreBackup();
      
      expect(restoredSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          backupKey: 'latest',
          config: expect.any(Object),
        })
      );
    });
  });

  describe('Environment Management', () => {
    beforeEach(async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      await configManager.loadConfig();
    });

    it('should switch environments', () => {
      expect(configManager.getCurrentEnvironment()).toBe('development');
      
      configManager.setEnvironment('production');
      expect(configManager.getCurrentEnvironment()).toBe('production');
      
      const cacheConfig = configManager.getCacheConfig();
      expect(cacheConfig).toEqual(mockConfig.cache.production);
    });

    it('should emit environmentChanged event', () => {
      const changedSpy = jest.fn();
      configManager.on('environmentChanged', changedSpy);
      
      configManager.setEnvironment('testing');
      
      expect(changedSpy).toHaveBeenCalledWith('testing');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const result = configManager.validateConfig(mockConfig);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing version', () => {
      const invalidConfig = { ...mockConfig, version: '' };
      const result = configManager.validateConfig(invalidConfig as any);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Configuration version is required');
    });

    it('should detect missing sections', () => {
      const invalidConfig = { ...mockConfig };
      delete (invalidConfig as any).cache;
      
      const result = configManager.validateConfig(invalidConfig as any);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required configuration sections');
    });

    it('should generate warnings for suspicious values', () => {
      const suspiciousConfig = {
        ...mockConfig,
        cache: {
          ...mockConfig.cache,
          development: {
            ...mockConfig.cache.development,
            maxSize: 500, // Very small cache
            defaultTTL: 500, // Very short TTL
          },
        },
        connectionPool: {
          ...mockConfig.connectionPool,
          development: {
            ...mockConfig.connectionPool.development,
            connectionTimeout: 50, // Very short timeout
          },
        },
        rateLimiter: {
          ...mockConfig.rateLimiter,
          development: {
            ...mockConfig.rateLimiter.development,
            windowMs: 500, // Very short window
          },
        },
      };
      
      const result = configManager.validateConfig(suspiciousConfig);
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes('very small'))).toBe(true);
      expect(result.warnings.some(w => w.includes('very short'))).toBe(true);
    });

    it('should validate threshold relationships', () => {
      const invalidConfig = {
        ...mockConfig,
        monitoring: {
          ...mockConfig.monitoring,
          performance: {
            ...mockConfig.monitoring.performance,
            alerting: {
              ...mockConfig.monitoring.performance.alerting,
              thresholds: {
                ...mockConfig.monitoring.performance.alerting.thresholds,
                memory: { warning: 90, critical: 80 }, // Warning > Critical
              },
            },
          },
        },
      };
      
      const result = configManager.validateConfig(invalidConfig);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Memory warning threshold must be less than critical threshold');
    });
  });

  describe('Configuration Reload', () => {
    it('should reload configuration from file', async () => {
      // Initial load
      mockReadFile.mockResolvedValueOnce(JSON.stringify(mockConfig));
      await configManager.loadConfig();
      
      // Modify mock to return different config
      const modifiedConfig = {
        ...mockConfig,
        version: '2.0.0',
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(modifiedConfig));
      
      const reloadedConfig = await configManager.reloadConfig();
      
      expect(reloadedConfig.version).toBe('2.0.0');
      expect(mockLogger.info).toHaveBeenCalledWith('Reloading configuration');
    });
  });

  describe('Error Handling', () => {
    it('should handle validation errors on save', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(mockConfig));
      await configManager.loadConfig();
      
      // Create invalid configuration
      const invalidConfig = { ...mockConfig, version: '' };
      
      await expect(configManager.saveConfig(invalidConfig as any))
        .rejects.toThrow('Configuration validation failed');
    });

    it('should handle file access errors', () => {
      // ConfigManager should handle missing config file gracefully
      // by using default path resolution
      expect(() => new ConfigManager(mockLogger)).not.toThrow();
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources on dispose', () => {
      configManager.dispose();
      
      expect(configManager['config']).toBeNull();
      expect(configManager['backupConfigs'].size).toBe(0);
    });
  });
});