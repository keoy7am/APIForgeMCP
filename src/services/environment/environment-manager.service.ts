import { z } from 'zod';
import { Logger } from '../../utils/logger';
import { ValidationError } from '../../utils/errors';
import {
  Variables,
  EnvironmentVariable,
  EnvironmentVariableType,
  EnvironmentConfig,
  VariableReplacementOptions,
  VariableReplacementResult
} from '../../types';
import { EncryptionService } from './encryption.service';
import { VariableReplacementService } from './variable-replacement.service';

/**
 * Environment variable schemas for validation
 */
export const EnvironmentVariableSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.any(),
  type: z.enum(['string', 'number', 'boolean', 'secret']),
  encrypted: z.boolean(),
  description: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const EnvironmentConfigSchema = z.object({
  globalVariables: z.record(z.string(), EnvironmentVariableSchema),
  workspaceVariables: z.record(z.string(), EnvironmentVariableSchema),
  environmentVariables: z.record(z.string(), EnvironmentVariableSchema),
  encryptionEnabled: z.boolean(),
  encryptionKey: z.string().optional(),
});

/**
 * Environment Manager Service
 * 
 * Manages environment variables with support for:
 * - Multiple scopes (global, workspace, environment)
 * - Encryption for sensitive variables
 * - Variable replacement with {{variable}} syntax
 * - Type validation and conversion
 */
export class EnvironmentManager {
  private logger: Logger;
  private encryptionService: EncryptionService;
  private replacementService: VariableReplacementService;
  private config: EnvironmentConfig;

  constructor() {
    this.logger = new Logger('EnvironmentManager');
    this.encryptionService = new EncryptionService();
    this.replacementService = new VariableReplacementService();
    
    // Initialize with default config
    this.config = {
      globalVariables: {},
      workspaceVariables: {},
      environmentVariables: {},
      encryptionEnabled: false,
    };
  }

  /**
   * Initialize the environment manager
   */
  async initialize(config?: Partial<EnvironmentConfig>): Promise<void> {
    try {
      if (config) {
        this.config = { ...this.config, ...config };
      }

      this.logger.info('Environment manager initialized', {
        encryptionEnabled: this.config.encryptionEnabled,
        globalVariables: Object.keys(this.config.globalVariables).length,
        workspaceVariables: Object.keys(this.config.workspaceVariables).length,
      });
    } catch (error) {
      this.logger.error('Failed to initialize environment manager:', error);
      throw error;
    }
  }

  /**
   * Set a global variable
   */
  async setGlobalVariable(
    name: string,
    value: any,
    type: EnvironmentVariableType = 'string',
    options: { encrypt?: boolean; description?: string } = {}
  ): Promise<void> {
    await this.setVariable('global', name, value, type, options);
  }

  /**
   * Set a workspace variable
   */
  async setWorkspaceVariable(
    name: string,
    value: any,
    type: EnvironmentVariableType = 'string',
    options: { encrypt?: boolean; description?: string } = {}
  ): Promise<void> {
    await this.setVariable('workspace', name, value, type, options);
  }

  /**
   * Set an environment variable
   */
  async setEnvironmentVariable(
    name: string,
    value: any,
    type: EnvironmentVariableType = 'string',
    options: { encrypt?: boolean; description?: string } = {}
  ): Promise<void> {
    await this.setVariable('environment', name, value, type, options);
  }

  /**
   * Set a variable in the specified scope
   */
  private async setVariable(
    scope: 'global' | 'workspace' | 'environment',
    name: string,
    value: any,
    type: EnvironmentVariableType,
    options: { encrypt?: boolean; description?: string }
  ): Promise<void> {
    try {
      this.validateVariableName(name);
      
      let processedValue = this.convertValue(value, type);
      let encrypted = false;

      // Handle encryption for sensitive variables
      if ((options.encrypt || type === 'secret') && this.config.encryptionEnabled && this.config.encryptionKey) {
        const encryptionResult = await this.encryptionService.safeEncrypt(
          String(processedValue),
          this.config.encryptionKey
        );
        
        if (encryptionResult.success) {
          processedValue = encryptionResult.encrypted;
          encrypted = true;
          this.logger.debug(`Variable '${name}' encrypted successfully`);
        } else {
          this.logger.warn(`Failed to encrypt variable '${name}': ${encryptionResult.error}`);
        }
      }

      const environmentVariable: EnvironmentVariable = {
        name,
        value: processedValue,
        type,
        encrypted,
        description: options.description,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Validate the variable
      EnvironmentVariableSchema.parse(environmentVariable);

      // Store in appropriate scope
      const targetScope = this.getTargetScope(scope);
      targetScope[name] = environmentVariable;

      this.logger.debug(`Variable '${name}' set in ${scope} scope`, { type, encrypted });

    } catch (error) {
      this.logger.error(`Failed to set ${scope} variable '${name}':`, error);
      throw error;
    }
  }

  /**
   * Get a variable value with automatic decryption
   */
  async getVariable(name: string, scope?: 'global' | 'workspace' | 'environment'): Promise<any> {
    try {
      const variable = this.findVariable(name, scope);
      
      if (!variable) {
        return undefined;
      }

      let value = variable.value;

      // Decrypt if necessary
      if (variable.encrypted && this.config.encryptionKey) {
        const decryptionResult = await this.encryptionService.safeDecrypt(
          value,
          this.config.encryptionKey
        );
        
        if (decryptionResult.success) {
          value = decryptionResult.decrypted;
        } else {
          this.logger.warn(`Failed to decrypt variable '${name}': ${decryptionResult.error}`);
        }
      }

      // Convert back to original type
      return this.convertValue(value, variable.type);

    } catch (error) {
      this.logger.error(`Failed to get variable '${name}':`, error);
      return undefined;
    }
  }

  /**
   * Get all variables as a flat Variables object
   */
  async getAllVariables(options: { 
    includeSecrets?: boolean; 
    scope?: 'global' | 'workspace' | 'environment';
    workspaceId?: string;
    environmentName?: string;
  } = {}): Promise<Variables> {
    const variables: Variables = {};

    try {
      const scopes = options.scope ? [options.scope] : ['global', 'workspace', 'environment'];

      for (const scope of scopes) {
        const scopeVariables = this.getTargetScope(scope as any);
        
        for (const [name, envVar] of Object.entries(scopeVariables)) {
          // Skip secrets if not requested
          if (envVar.type === 'secret' && !options.includeSecrets) {
            continue;
          }

          const value = await this.getVariable(name, scope as any);
          variables[name] = value;
        }
      }

      this.logger.debug('Retrieved all variables', { 
        count: Object.keys(variables).length,
        scope: options.scope || 'all',
        includeSecrets: options.includeSecrets || false 
      });

      return variables;

    } catch (error) {
      this.logger.error('Failed to get all variables:', error);
      return {};
    }
  }

  /**
   * Replace variables in data using the replacement service
   */
  async replaceVariables(
    data: any,
    options: Partial<VariableReplacementOptions & {
      includeSecrets?: boolean;
      scope?: 'global' | 'workspace' | 'environment';
    }> = {}
  ): Promise<VariableReplacementResult> {
    try {
      const variables = await this.getAllVariables({
        includeSecrets: options.includeSecrets || false,
        scope: options.scope,
        workspaceId: options.workspaceId,
        environmentName: options.environmentName,
      });

      // Merge with custom variables if provided
      const allVariables = {
        ...variables,
        ...options.customVariables,
      };

      const result = await this.replacementService.replaceVariables(data, allVariables, options);

      this.logger.debug('Variable replacement completed', {
        replacements: result.replacements.length,
        errors: result.errors.length,
        warnings: result.warnings.length
      });

      return result;

    } catch (error) {
      this.logger.error('Failed to replace variables:', error);
      
      return {
        originalValue: data,
        processedValue: data,
        replacements: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        warnings: [],
      };
    }
  }

  /**
   * Delete a variable
   */
  deleteVariable(name: string, scope?: 'global' | 'workspace' | 'environment'): boolean {
    try {
      if (scope) {
        const targetScope = this.getTargetScope(scope);
        if (name in targetScope) {
          delete targetScope[name];
          this.logger.debug(`Variable '${name}' deleted from ${scope} scope`);
          return true;
        }
      } else {
        // Try all scopes
        let deleted = false;
        for (const scopeName of ['environment', 'workspace', 'global'] as const) {
          const targetScope = this.getTargetScope(scopeName);
          if (name in targetScope) {
            delete targetScope[name];
            this.logger.debug(`Variable '${name}' deleted from ${scopeName} scope`);
            deleted = true;
          }
        }
        return deleted;
      }

      return false;

    } catch (error) {
      this.logger.error(`Failed to delete variable '${name}':`, error);
      return false;
    }
  }

  /**
   * List all variable names in a scope
   */
  listVariables(scope?: 'global' | 'workspace' | 'environment'): { name: string; type: EnvironmentVariableType; encrypted: boolean; scope: string }[] {
    const result: { name: string; type: EnvironmentVariableType; encrypted: boolean; scope: string }[] = [];

    try {
      const scopes = scope ? [scope] : ['global', 'workspace', 'environment'];

      for (const scopeName of scopes) {
        const scopeVariables = this.getTargetScope(scopeName as any);
        
        for (const [name, envVar] of Object.entries(scopeVariables)) {
          result.push({
            name,
            type: envVar.type,
            encrypted: envVar.encrypted,
            scope: scopeName,
          });
        }
      }

      return result;

    } catch (error) {
      this.logger.error('Failed to list variables:', error);
      return [];
    }
  }

  /**
   * Validate variable syntax in data
   */
  validateVariableSyntax(data: any): { valid: boolean; errors: string[]; variables: string[] } {
    try {
      return this.replacementService.validateVariableSyntax(JSON.stringify(data));
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : 'Validation failed'],
        variables: [],
      };
    }
  }

  /**
   * Set encryption configuration
   */
  async setEncryptionConfig(enabled: boolean, encryptionKey?: string): Promise<void> {
    try {
      if (enabled && !encryptionKey) {
        encryptionKey = this.encryptionService.generateEncryptionKey();
        this.logger.info('Generated new encryption key');
      }

      if (encryptionKey && !this.encryptionService.validateEncryptionKey(encryptionKey)) {
        throw new ValidationError('Invalid encryption key format');
      }

      this.config.encryptionEnabled = enabled;
      this.config.encryptionKey = encryptionKey;

      this.logger.info('Encryption configuration updated', { enabled });

    } catch (error) {
      this.logger.error('Failed to set encryption config:', error);
      throw error;
    }
  }

  /**
   * Export environment configuration
   */
  exportConfig(): Partial<EnvironmentConfig> {
    // Return a copy without sensitive information
    return {
      ...this.config,
      encryptionKey: this.config.encryptionKey ? '[ENCRYPTED]' : undefined,
    };
  }

  /**
   * Import environment configuration
   */
  async importConfig(config: Partial<EnvironmentConfig>): Promise<void> {
    try {
      const validatedConfig = EnvironmentConfigSchema.partial().parse(config);
      this.config = { ...this.config, ...validatedConfig } as EnvironmentConfig;
      
      this.logger.info('Environment configuration imported');
    } catch (error) {
      this.logger.error('Failed to import config:', error);
      throw error;
    }
  }

  // Private helper methods

  private validateVariableName(name: string): void {
    if (!name || typeof name !== 'string') {
      throw new ValidationError('Variable name must be a non-empty string');
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
      throw new ValidationError('Variable name must start with a letter and contain only letters, numbers, and underscores');
    }

    if (name.length > 100) {
      throw new ValidationError('Variable name cannot exceed 100 characters');
    }
  }

  private convertValue(value: any, type: EnvironmentVariableType): any {
    switch (type) {
      case 'string':
      case 'secret':
        return String(value);
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new ValidationError(`Cannot convert '${value}' to number`);
        }
        return num;
      case 'boolean':
        if (typeof value === 'boolean') {
          return value;
        }
        const str = String(value).toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(str)) {
          return true;
        }
        if (['false', '0', 'no', 'off'].includes(str)) {
          return false;
        }
        throw new ValidationError(`Cannot convert '${value}' to boolean`);
      default:
        return value;
    }
  }

  private findVariable(name: string, scope?: 'global' | 'workspace' | 'environment'): EnvironmentVariable | undefined {
    if (scope) {
      const targetScope = this.getTargetScope(scope);
      return targetScope[name];
    }

    // Search in priority order: environment -> workspace -> global
    return this.config.environmentVariables[name] ||
           this.config.workspaceVariables[name] ||
           this.config.globalVariables[name];
  }

  private getTargetScope(scope: 'global' | 'workspace' | 'environment'): Record<string, EnvironmentVariable> {
    switch (scope) {
      case 'global':
        return this.config.globalVariables;
      case 'workspace':
        return this.config.workspaceVariables;
      case 'environment':
        return this.config.environmentVariables;
      default:
        throw new ValidationError(`Invalid scope: ${scope}`);
    }
  }
}