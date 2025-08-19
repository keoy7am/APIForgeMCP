/**
 * Performance Configuration Manager Service
 * 性能配置管理服務
 */

import { readFile, writeFile, access } from 'fs/promises';
import { resolve, join } from 'path';
import { EventEmitter } from 'events';
import type { Logger, CacheConfig, ConnectionPoolConfig, RateLimiterConfig } from '../../types';

// 環境類型
type Environment = 'production' | 'development' | 'testing';

// 完整的性能配置結構
interface PerformanceConfig {
  version: string;
  description: string;
  lastUpdated: string;
  cache: Record<Environment, CacheConfig>;
  connectionPool: Record<Environment, ConnectionPoolConfig>;
  rateLimiter: Record<Environment, RateLimiterConfig>;
  monitoring: {
    performance: {
      metricsCollection: {
        enabled: boolean;
        interval: number;
        historyLength: number;
        exportFormat: string;
      };
      alerting: {
        enabled: boolean;
        channels: string[];
        thresholds: {
          memory: { warning: number; critical: number };
          cpu: { warning: number; critical: number };
          responseTime: { warning: number; critical: number };
          errorRate: { warning: number; critical: number };
          cacheHitRate: { warning: number; critical: number };
        };
      };
      dashboard: {
        enabled: boolean;
        updateInterval: number;
        autoRecommendations: boolean;
        exportPath: string;
      };
    };
    healthChecks: {
      enabled: boolean;
      interval: number;
      timeout: number;
      endpoints: Array<{
        name: string;
        type: string;
        critical: boolean;
        url?: string;
      }>;
    };
  };
  optimization: {
    autoTuning: {
      enabled: boolean;
      interval: number;
      aggressiveness: string;
      maxAdjustmentPercentage: number;
      safeMode: boolean;
      backupSettings: boolean;
    };
    presets: Record<string, {
      description: string;
      cache: Partial<CacheConfig>;
      connectionPool: Partial<ConnectionPoolConfig>;
      rateLimiter: Partial<RateLimiterConfig>;
    }>;
    recommendations: {
      enabled: boolean;
      notificationThreshold: number;
      autoApply: {
        enabled: boolean;
        safetyChecks: boolean;
        rollbackOnFailure: boolean;
      };
    };
  };
  security: {
    rateLimiting: {
      denyList: {
        enabled: boolean;
        maxEntries: number;
        duration: number;
      };
      allowList: {
        enabled: boolean;
        entries: string[];
      };
    };
    encryption: {
      algorithm: string;
      keyRotation: {
        enabled: boolean;
        interval: number;
      };
    };
  };
  logging: {
    performance: {
      level: string;
      format: string;
      maxFileSize: string;
      maxFiles: number;
      logMetrics: boolean;
      logSlowQueries: boolean;
      slowQueryThreshold: number;
    };
  };
  testing: {
    loadTesting: {
      scenarios: Array<{
        name: string;
        duration: number;
        targetRPS: number;
        maxConcurrency: number;
      }>;
      thresholds: {
        errorRate: number;
        responseTime: {
          p95: number;
          p99: number;
        };
        memoryUsage: number;
      };
    };
  };
}

// 配置更改事件
interface ConfigChangeEvent {
  section: string;
  environment: Environment;
  oldValue: any;
  newValue: any;
  timestamp: number;
}

// 配置驗證結果
interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ConfigManager extends EventEmitter {
  private config: PerformanceConfig | null = null;
  private configPath: string;
  private currentEnvironment: Environment;
  private logger: Logger;
  private backupConfigs: Map<string, PerformanceConfig> = new Map();
  private watchingChanges = false;

  constructor(logger: Logger, environment: Environment = 'development') {
    super();
    
    this.logger = logger;
    this.currentEnvironment = environment;
    this.configPath = this.resolveConfigPath();
  }

  /**
   * 載入配置
   */
  async loadConfig(): Promise<PerformanceConfig> {
    try {
      const configData = await readFile(this.configPath, 'utf-8');
      this.config = JSON.parse(configData);
      
      // 驗證配置
      const validation = this.validateConfig(this.config!);
      if (!validation.valid) {
        this.logger.error('Configuration validation failed', {
          errors: validation.errors,
          warnings: validation.warnings,
        });
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // 記錄警告
      if (validation.warnings.length > 0) {
        this.logger.warn('Configuration warnings', { warnings: validation.warnings });
      }

      if (this.config) {
        this.logger.info('Configuration loaded successfully', {
          version: this.config.version,
          environment: this.currentEnvironment,
          configPath: this.configPath,
        });

        this.emit('configLoaded', this.config);
        return this.config;
      } else {
        throw new Error('Configuration is null after loading');
      }
    } catch (error) {
      this.logger.error('Failed to load configuration', {
        configPath: this.configPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 保存配置
   */
  async saveConfig(config?: PerformanceConfig): Promise<void> {
    const configToSave = config || this.config;
    if (!configToSave) {
      throw new Error('No configuration to save');
    }

    // 創建備份
    if (this.config) {
      const backupKey = `${Date.now()}-${this.currentEnvironment}`;
      this.backupConfigs.set(backupKey, { ...this.config });
      
      // 保持備份數量在合理範圍內
      if (this.backupConfigs.size > 10) {
        const oldestKey = Array.from(this.backupConfigs.keys())[0];
        this.backupConfigs.delete(oldestKey);
      }
    }

    try {
      // 更新時間戳
      configToSave.lastUpdated = new Date().toISOString();
      
      // 驗證配置
      const validation = this.validateConfig(configToSave);
      if (!validation.valid) {
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }

      // 保存到文件
      await writeFile(this.configPath, JSON.stringify(configToSave, null, 2), 'utf-8');
      
      this.config = configToSave;
      
      this.logger.info('Configuration saved successfully', {
        configPath: this.configPath,
        version: configToSave.version,
      });

      this.emit('configSaved', configToSave);
    } catch (error) {
      this.logger.error('Failed to save configuration', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * 獲取當前環境的緩存配置
   */
  getCacheConfig(): CacheConfig {
    this.ensureConfigLoaded();
    return this.config!.cache[this.currentEnvironment];
  }

  /**
   * 獲取當前環境的連接池配置
   */
  getConnectionPoolConfig(): ConnectionPoolConfig {
    this.ensureConfigLoaded();
    return this.config!.connectionPool[this.currentEnvironment];
  }

  /**
   * 獲取當前環境的速率限制配置
   */
  getRateLimiterConfig(): RateLimiterConfig {
    this.ensureConfigLoaded();
    return this.config!.rateLimiter[this.currentEnvironment];
  }

  /**
   * 獲取監控配置
   */
  getMonitoringConfig() {
    this.ensureConfigLoaded();
    return this.config!.monitoring;
  }

  /**
   * 獲取優化配置
   */
  getOptimizationConfig() {
    this.ensureConfigLoaded();
    return this.config!.optimization;
  }

  /**
   * 獲取安全配置
   */
  getSecurityConfig() {
    this.ensureConfigLoaded();
    return this.config!.security;
  }

  /**
   * 獲取測試配置
   */
  getTestingConfig() {
    this.ensureConfigLoaded();
    return this.config!.testing;
  }

  /**
   * 應用預設配置
   */
  async applyPreset(presetName: string): Promise<void> {
    this.ensureConfigLoaded();
    
    const preset = this.config!.optimization.presets[presetName];
    if (!preset) {
      throw new Error(`Preset '${presetName}' not found`);
    }

    const currentConfig = { ...this.config! };
    
    // 應用預設到當前環境
    if (preset.cache) {
      Object.assign(currentConfig.cache[this.currentEnvironment], preset.cache);
    }
    
    if (preset.connectionPool) {
      Object.assign(currentConfig.connectionPool[this.currentEnvironment], preset.connectionPool);
    }
    
    if (preset.rateLimiter) {
      Object.assign(currentConfig.rateLimiter[this.currentEnvironment], preset.rateLimiter);
    }

    await this.saveConfig(currentConfig);
    
    this.logger.info('Applied configuration preset', {
      preset: presetName,
      environment: this.currentEnvironment,
      description: preset.description,
    });

    this.emit('presetApplied', { presetName, preset });
  }

  /**
   * 更新特定配置項
   */
  async updateConfig(
    section: keyof PerformanceConfig,
    updates: any,
    environment?: Environment
  ): Promise<void> {
    this.ensureConfigLoaded();
    
    const targetEnv = environment || this.currentEnvironment;
    const currentConfig = { ...this.config! };
    const oldValue = JSON.parse(JSON.stringify(currentConfig[section]));

    if (section === 'cache' || section === 'connectionPool' || section === 'rateLimiter') {
      // 環境特定的配置
      Object.assign(currentConfig[section][targetEnv], updates);
    } else {
      // 全局配置
      if (typeof currentConfig[section] === 'object') {
        Object.assign(currentConfig[section], updates);
      } else {
        currentConfig[section] = updates;
      }
    }

    await this.saveConfig(currentConfig);

    const changeEvent: ConfigChangeEvent = {
      section,
      environment: targetEnv,
      oldValue,
      newValue: currentConfig[section],
      timestamp: Date.now(),
    };

    this.emit('configChanged', changeEvent);
  }

  /**
   * 恢復配置備份
   */
  async restoreBackup(backupKey?: string): Promise<void> {
    let backupConfig: PerformanceConfig;

    if (backupKey) {
      const backup = this.backupConfigs.get(backupKey);
      if (!backup) {
        throw new Error(`Backup '${backupKey}' not found`);
      }
      backupConfig = backup;
    } else {
      // 恢復最新備份
      const keys = Array.from(this.backupConfigs.keys()).sort().reverse();
      if (keys.length === 0) {
        throw new Error('No backups available');
      }
      backupConfig = this.backupConfigs.get(keys[0])!;
    }

    await this.saveConfig(backupConfig);
    
    this.logger.info('Configuration restored from backup', {
      backupKey: backupKey || 'latest',
      version: backupConfig.version,
    });

    this.emit('configRestored', { backupKey, config: backupConfig });
  }

  /**
   * 獲取可用備份
   */
  getAvailableBackups(): Array<{ key: string; timestamp: number; version: string }> {
    return Array.from(this.backupConfigs.entries()).map(([key, config]) => ({
      key,
      timestamp: parseInt(key.split('-')[0]),
      version: config.version,
    }));
  }

  /**
   * 驗證配置
   */
  validateConfig(config: PerformanceConfig): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 基本結構驗證
    if (!config.version) {
      errors.push('Configuration version is required');
    }

    if (!config.cache || !config.connectionPool || !config.rateLimiter) {
      errors.push('Missing required configuration sections');
    }

    // 環境配置驗證
    const environments: Environment[] = ['production', 'development', 'testing'];
    
    environments.forEach(env => {
      // 緩存配置驗證
      if (config.cache?.[env]) {
        const cache = config.cache[env];
        if (cache.maxSize && cache.maxSize < 1024 * 1024) {
          warnings.push(`Cache size for ${env} is very small (< 1MB)`);
        }
        if (cache.defaultTTL && cache.defaultTTL < 1000) {
          warnings.push(`Default TTL for ${env} is very short (< 1s)`);
        }
      }

      // 連接池配置驗證
      if (config.connectionPool?.[env]) {
        const pool = config.connectionPool[env];
        if (pool.maxConnections && pool.maxConnections < 1) {
          errors.push(`Invalid maxConnections for ${env}`);
        }
        if (pool.connectionTimeout && pool.connectionTimeout < 100) {
          warnings.push(`Connection timeout for ${env} is very short`);
        }
      }

      // 速率限制配置驗證
      if (config.rateLimiter?.[env]) {
        const rateLimit = config.rateLimiter[env];
        if (rateLimit.maxRequests && rateLimit.maxRequests < 1) {
          errors.push(`Invalid maxRequests for ${env}`);
        }
        if (rateLimit.windowMs && rateLimit.windowMs < 1000) {
          warnings.push(`Rate limit window for ${env} is very short`);
        }
      }
    });

    // 性能閾值驗證
    if (config.monitoring?.performance?.alerting?.thresholds) {
      const thresholds = config.monitoring.performance.alerting.thresholds;
      
      if (thresholds.memory?.warning >= thresholds.memory?.critical) {
        errors.push('Memory warning threshold must be less than critical threshold');
      }
      
      if (thresholds.cpu?.warning >= thresholds.cpu?.critical) {
        errors.push('CPU warning threshold must be less than critical threshold');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 重新載入配置
   */
  async reloadConfig(): Promise<PerformanceConfig> {
    this.logger.info('Reloading configuration');
    return this.loadConfig();
  }

  /**
   * 切換環境
   */
  setEnvironment(environment: Environment): void {
    this.currentEnvironment = environment;
    this.logger.info('Environment changed', { environment });
    this.emit('environmentChanged', environment);
  }

  /**
   * 獲取當前環境
   */
  getCurrentEnvironment(): Environment {
    return this.currentEnvironment;
  }

  /**
   * 解析配置文件路徑
   */
  private resolveConfigPath(): string {
    // 依次檢查以下路徑
    const possiblePaths = [
      process.env.APIFORGE_CONFIG_PATH,
      './config/performance-config.json',
      '../config/performance-config.json',
      '../../config/performance-config.json',
      resolve(__dirname, '../../../config/performance-config.json'),
    ].filter(Boolean) as string[];

    for (const path of possiblePaths) {
      try {
        return resolve(path);
      } catch {
        continue;
      }
    }

    // 默認路徑
    return resolve(__dirname, '../../../config/performance-config.json');
  }

  /**
   * 確保配置已載入
   */
  private ensureConfigLoaded(): void {
    if (!this.config) {
      throw new Error('Configuration not loaded. Call loadConfig() first.');
    }
  }

  /**
   * 清理資源
   */
  dispose(): void {
    this.removeAllListeners();
    this.backupConfigs.clear();
    this.config = null;
  }
}